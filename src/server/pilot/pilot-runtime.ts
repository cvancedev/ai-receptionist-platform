import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { OfflineTransport } from "../../ai/providers/transport-model-provider-adapter";
import type { IssuedSession } from "../auth/session-authority";
import { PersistentSessionAuthority } from "../auth/persistent-session-authority";
import {
  DurableReceptionistConversationService,
} from "../conversation/durable-receptionist-conversation-service";
import {
  MAXIMUM_MESSAGE_LENGTH,
  type ReceptionistBusiness,
} from "../conversation/receptionist-conversation-service";
import type { ReceptionistPersistence } from "../persistence/receptionist-persistence";
import {
  DEFAULT_IP_RATE_LIMIT,
  DEFAULT_MAXIMUM_REQUEST_BYTES,
  DEFAULT_SESSION_RATE_LIMIT,
  MAXIMUM_REQUEST_BYTES,
  MINIMUM_REQUEST_BYTES,
  OFFLINE_PROVIDER_DESCRIPTOR,
  type ReceptionistTurnRuntime,
} from "../runtime/receptionist-runtime";
import {
  FixedWindowRateLimiter,
  type RateLimitPolicy,
} from "../security/request-rate-limiter";
import {
  normalizePilotOrigin,
  resolvePilotRuntimeConfiguration,
  type PilotRuntimeConfigurationRejection,
  type ValidatedPilotRuntimeConfiguration,
} from "./pilot-runtime-configuration";

if (typeof window !== "undefined") {
  throw new Error("The pilot receptionist runtime is server-only.");
}

/**
 * Pilot composition root.
 *
 * A pilot runtime exists only if an explicit, fully specified configuration
 * validates, and only if the composition supplies the durable persistence port
 * named by that configuration. Sessions and conversation state live in that
 * port, so a restart does not invalidate a live session or lose a conversation.
 *
 * There is no arbitrary session-issuance method: the only ways to obtain a
 * session are a customer issuance bound to a configured widget and permitted
 * origin, or an operator issuance verified against a server-held credential
 * digest. B2.3.2A still performs no provider network work.
 */
export const PILOT_RUNTIME_VERSION = "b2.3.2b-pilot-runtime/v1" as const;

const OPERATOR_ID_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;
const WIDGET_ID_PATTERN = /^[A-Za-z0-9._-]{8,64}$/;
const MAXIMUM_CREDENTIAL_LENGTH = 512;
const MAXIMUM_ORIGIN_LENGTH = 512;

export type PilotSessionIssueResult =
  | { readonly status: "issued"; readonly session: IssuedSession }
  | { readonly status: "denied" };

export interface PilotReceptionistRuntime extends ReceptionistTurnRuntime {
  readonly version: typeof PILOT_RUNTIME_VERSION;
  readonly mode: "pilot";
  readonly simulated: true;
  readonly pilotConfiguration: ValidatedPilotRuntimeConfiguration;
  readonly sessions: PersistentSessionAuthority;
  readonly conversations: DurableReceptionistConversationService;
  readonly issueCustomerSession: (input: unknown) => Promise<PilotSessionIssueResult>;
  readonly issueOperatorSession: (input: unknown) => Promise<PilotSessionIssueResult>;
}

export type PilotRuntimeCreationRejection =
  | PilotRuntimeConfigurationRejection
  | "InvalidInput"
  | "InvalidBusinesses"
  | "BusinessNotConfigured"
  | "ConfiguredBusinessUnavailable"
  | "PersistenceUnavailable"
  | "DatabaseNotAuthorized";

export type PilotRuntimeCreationResult =
  | { readonly status: "created"; readonly runtime: PilotReceptionistRuntime }
  | { readonly status: "rejected"; readonly reason: PilotRuntimeCreationRejection };

export interface CreatePilotReceptionistRuntimeInput {
  readonly configuration: unknown;
  readonly businesses: readonly ReceptionistBusiness[];
  readonly persistence?: ReceptionistPersistence;
  /**
   * Must equal the credential reference named by the configuration. Requiring
   * it twice makes durable-database authorization a deliberate composition
   * decision rather than a default.
   */
  readonly databaseCredentialReference?: string;
  readonly transport?: OfflineTransport;
  readonly now?: () => number;
  readonly conversationIdFactory?: (businessId: string) => string;
  readonly ipRateLimit?: RateLimitPolicy;
  readonly sessionRateLimit?: RateLimitPolicy;
  readonly maximumRequestBytes?: number;
  readonly maximumMessageLength?: number;
  readonly maximumConversations?: number;
}

export function createPilotReceptionistRuntime(
  input: unknown,
): PilotRuntimeCreationResult {
  if (!isPlainRecord(input)) return rejected("InvalidInput");

  const configurationResult = resolvePilotRuntimeConfiguration(input.configuration);
  if (configurationResult.status === "rejected") {
    return rejected(configurationResult.reason);
  }
  const configuration = configurationResult.value;

  if (!isPersistencePort(input.persistence)) return rejected("PersistenceUnavailable");
  if (input.databaseCredentialReference !== configuration.persistence.credentialReference) {
    return rejected("DatabaseNotAuthorized");
  }

  const businesses = input.businesses;
  if (!Array.isArray(businesses) || businesses.length === 0) {
    return rejected("InvalidBusinesses");
  }

  const suppliedIds = new Set<string>();
  for (const business of businesses) {
    if (!isPlainRecord(business)
      || !isPlainRecord(business.profile)
      || typeof business.profile.id !== "string") {
      return rejected("InvalidBusinesses");
    }
    if (suppliedIds.has(business.profile.id)) return rejected("InvalidBusinesses");
    suppliedIds.add(business.profile.id);
  }

  const configuredIds = new Set(configuration.businesses.map((entry) => entry.businessId));
  if (configuredIds.size !== suppliedIds.size) {
    for (const businessId of configuredIds) {
      if (!suppliedIds.has(businessId)) return rejected("ConfiguredBusinessUnavailable");
    }
    return rejected("BusinessNotConfigured");
  }
  for (const businessId of configuredIds) {
    if (!suppliedIds.has(businessId)) return rejected("ConfiguredBusinessUnavailable");
  }
  for (const businessId of suppliedIds) {
    if (!configuredIds.has(businessId)) return rejected("BusinessNotConfigured");
  }

  const businessById = new Map<string, ReceptionistBusiness>();
  for (const business of businesses as ReceptionistBusiness[]) {
    businessById.set(business.profile.id, business);
  }

  const now = typeof input.now === "function" ? (input.now as () => number) : Date.now;
  const persistence = input.persistence;
  const sessions = new PersistentSessionAuthority({
    persistence,
    now,
    ttlMs: configuration.sessionTtlMs,
  });
  const limiter = new FixedWindowRateLimiter({ now });

  const monthlyBudgetMicrosByBusiness: Record<string, number> = {};
  for (const registration of configuration.businesses) {
    monthlyBudgetMicrosByBusiness[registration.businessId] = registration.monthlyBudgetMicros;
  }

  let conversations: DurableReceptionistConversationService;
  try {
    conversations = new DurableReceptionistConversationService(
      businesses as ReceptionistBusiness[],
      {
        persistence,
        transport: typeof input.transport === "function"
          ? (input.transport as OfflineTransport)
          : undefined,
        maximumConversations: boundedInteger(input.maximumConversations, 1, 2_000) ?? undefined,
        now,
        monthlyBudgetMicrosByBusiness,
        usageProviderIdentifier: OFFLINE_PROVIDER_DESCRIPTOR.identifier,
      },
    );
  } catch {
    return rejected("InvalidBusinesses");
  }

  const ipRateLimit = normalizePolicy(input.ipRateLimit, DEFAULT_IP_RATE_LIMIT);
  const sessionRateLimit = normalizePolicy(
    input.sessionRateLimit,
    DEFAULT_SESSION_RATE_LIMIT,
  );
  const maximumRequestBytes = boundedInteger(
    input.maximumRequestBytes ?? DEFAULT_MAXIMUM_REQUEST_BYTES,
    MINIMUM_REQUEST_BYTES,
    MAXIMUM_REQUEST_BYTES,
  ) ?? DEFAULT_MAXIMUM_REQUEST_BYTES;
  const maximumMessageLength = Math.min(
    boundedInteger(
      input.maximumMessageLength ?? MAXIMUM_MESSAGE_LENGTH,
      1,
      MAXIMUM_MESSAGE_LENGTH,
    ) ?? MAXIMUM_MESSAGE_LENGTH,
    MAXIMUM_MESSAGE_LENGTH,
  );
  const conversationIdFactory = typeof input.conversationIdFactory === "function"
    ? (input.conversationIdFactory as (businessId: string) => string)
    : () => `conversation-${randomBytes(16).toString("hex")}`;

  const registrationByWidget = new Map(
    configuration.businesses.map((entry) => [entry.widgetId, entry] as const),
  );

  const startConversation = async (
    businessId: string,
    actorId: string,
  ): Promise<PilotSessionIssueResult> => {
    const business = businessById.get(businessId);
    if (!business || !conversations.hasBusiness(businessId)) {
      return Object.freeze({ status: "denied" as const });
    }
    const conversationId = conversationIdFactory(businessId);
    const conversationHandle = await conversations.begin(businessId, conversationId);
    if (!conversationHandle) return Object.freeze({ status: "denied" as const });
    try {
      return Object.freeze({
        status: "issued" as const,
        session: await sessions.issue({
          businessId,
          conversationId,
          conversationHandle,
          businessProfileVersion: business.profile.version,
          actorId,
        }, true),
      });
    } catch {
      return Object.freeze({ status: "denied" as const });
    }
  };

  const issueCustomerSession = async (
    request: unknown,
  ): Promise<PilotSessionIssueResult> => {
    if (!isPlainRecord(request)) return Object.freeze({ status: "denied" as const });
    const keys = Object.keys(request);
    if (keys.length !== 2 || !keys.includes("widgetId") || !keys.includes("origin")) {
      return Object.freeze({ status: "denied" as const });
    }
    if (typeof request.widgetId !== "string"
      || !WIDGET_ID_PATTERN.test(request.widgetId)) {
      return Object.freeze({ status: "denied" as const });
    }
    if (typeof request.origin !== "string"
      || request.origin.length === 0
      || request.origin.length > MAXIMUM_ORIGIN_LENGTH) {
      return Object.freeze({ status: "denied" as const });
    }
    const registration = registrationByWidget.get(request.widgetId);
    if (!registration) return Object.freeze({ status: "denied" as const });

    const origin = normalizePilotOrigin(request.origin);
    if (origin === null || !registration.allowedOrigins.includes(origin)) {
      return Object.freeze({ status: "denied" as const });
    }

    // A public widget identifier selects a configured business; it grants no
    // identity beyond a scoped, anonymous conversation.
    return startConversation(registration.businessId, "customer:anonymous");
  };

  const issueOperatorSession = async (
    request: unknown,
  ): Promise<PilotSessionIssueResult> => {
    const denied = Object.freeze({ status: "denied" as const });
    if (!isPlainRecord(request)) return denied;
    const keys = Object.keys(request);
    if (keys.length !== 3
      || !keys.includes("credential")
      || !keys.includes("businessId")
      || !keys.includes("operatorId")) return denied;
    if (configuration.operatorCredentialDigest === null) return denied;
    if (typeof request.credential !== "string"
      || request.credential.length === 0
      || request.credential.length > MAXIMUM_CREDENTIAL_LENGTH) return denied;

    // Verify the server-held credential before considering any business, so a
    // failure does not distinguish "wrong secret" from "unknown business".
    const presented = createHash("sha256").update(request.credential, "utf8").digest("hex");
    if (!safeEqualHex(configuration.operatorCredentialDigest, presented)) return denied;

    if (typeof request.businessId !== "string") return denied;
    if (!configuredIds.has(request.businessId)) return denied;
    if (typeof request.operatorId !== "string"
      || !OPERATOR_ID_PATTERN.test(request.operatorId)) return denied;

    return startConversation(request.businessId, `operator:${request.operatorId}`);
  };

  const runtime: PilotReceptionistRuntime = Object.freeze({
    version: PILOT_RUNTIME_VERSION,
    mode: "pilot" as const,
    simulated: true as const,
    pilotConfiguration: configuration,
    sessions,
    limiter,
    conversations,
    ipRateLimit,
    sessionRateLimit,
    maximumRequestBytes,
    maximumMessageLength,
    provider: OFFLINE_PROVIDER_DESCRIPTOR,
    hasBusiness: (businessId: unknown) => conversations.hasBusiness(businessId),
    issueCustomerSession,
    issueOperatorSession,
  });

  return Object.freeze({ status: "created" as const, runtime });
}

function isPersistencePort(value: unknown): value is ReceptionistPersistence {
  if (!isPlainRecord(value)) return false;
  if (value.kind !== "postgresql" && value.kind !== "in-memory") return false;
  for (const method of [
    "createConversation",
    "loadConversation",
    "findScopeByHandleHash",
    "commitTurn",
    "loadTurnReceipt",
    "monthlyUsageMicros",
    "reserveUsage",
    "releaseReservation",
    "reconcileStaleReservations",
    "readSchemaVersion",
    "createSession",
    "findSession",
    "revokeSession",
    "countSessions",
    "pruneSessions",
    "close",
  ]) {
    if (typeof value[method] !== "function") return false;
  }
  return true;
}

function safeEqualHex(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  const leftBytes = Buffer.from(left, "hex");
  const rightBytes = Buffer.from(right, "hex");
  if (leftBytes.byteLength !== rightBytes.byteLength) return false;
  return timingSafeEqual(leftBytes, rightBytes);
}

function rejected(reason: PilotRuntimeCreationRejection): PilotRuntimeCreationResult {
  return Object.freeze({ status: "rejected" as const, reason });
}

function normalizePolicy(policy: unknown, fallback: RateLimitPolicy): RateLimitPolicy {
  if (!isPlainRecord(policy)) return fallback;
  const limit = boundedInteger(policy.limit, 1, 10_000);
  const windowMs = boundedInteger(policy.windowMs, 1_000, 60 * 60 * 1_000);
  if (limit === null || windowMs === null) return fallback;
  return Object.freeze({ limit, windowMs });
}

function boundedInteger(value: unknown, minimum: number, maximum: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < minimum || value > maximum) return null;
  return value;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
