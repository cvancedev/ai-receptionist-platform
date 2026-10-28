import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { OfflineTransport } from "../../ai/providers/transport-model-provider-adapter";
import {
  SessionAuthority,
  type IssuedSession,
} from "../auth/session-authority";
import {
  ReceptionistConversationService,
  MAXIMUM_MESSAGE_LENGTH,
  type ReceptionistBusiness,
} from "../conversation/receptionist-conversation-service";
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
 * validates. It has no arbitrary session-issuance method: the only ways to
 * obtain a session are a customer issuance bound to a configured widget and its
 * permitted origin, or an operator issuance verified against a server-held
 * credential digest. Both are server-side calls, which is what a future
 * telephony edge needs and what a browser cannot forge.
 *
 * B2.3.1 still performs no provider network work: the provider descriptor is
 * the offline simulator, and the configuration module refuses any provider
 * network authorization.
 */
export const PILOT_RUNTIME_VERSION = "b2.3.1-pilot-runtime/v1" as const;

const OPERATOR_ID_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;
const WIDGET_ID_PATTERN = /^[A-Za-z0-9._-]{8,64}$/;
const MAXIMUM_CREDENTIAL_LENGTH = 512;
const MAXIMUM_ORIGIN_LENGTH = 512;

export type PilotSessionIssueResult =
  | { readonly status: "issued"; readonly session: IssuedSession }
  | { readonly status: "denied" };

export interface PilotReceptionistRuntime extends ReceptionistTurnRuntime {
  readonly version: typeof PILOT_RUNTIME_VERSION;
  readonly pilotConfiguration: ValidatedPilotRuntimeConfiguration;
  readonly issueCustomerSession: (input: unknown) => PilotSessionIssueResult;
  readonly issueOperatorSession: (input: unknown) => PilotSessionIssueResult;
}

export type PilotRuntimeCreationRejection =
  | PilotRuntimeConfigurationRejection
  | "InvalidInput"
  | "InvalidBusinesses"
  | "BusinessNotConfigured"
  | "ConfiguredBusinessUnavailable";

export type PilotRuntimeCreationResult =
  | { readonly status: "created"; readonly runtime: PilotReceptionistRuntime }
  | { readonly status: "rejected"; readonly reason: PilotRuntimeCreationRejection };

export interface CreatePilotReceptionistRuntimeInput {
  readonly configuration: unknown;
  readonly businesses: readonly ReceptionistBusiness[];
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

  const now = typeof input.now === "function" ? (input.now as () => number) : Date.now;
  const sessions = new SessionAuthority({
    now,
    ttlMs: configuration.sessionTtlMs,
  });
  const limiter = new FixedWindowRateLimiter({ now });

  let conversations: ReceptionistConversationService;
  try {
    conversations = new ReceptionistConversationService(businesses as ReceptionistBusiness[], {
      transport: typeof input.transport === "function"
        ? (input.transport as OfflineTransport)
        : undefined,
      maximumConversations: boundedInteger(input.maximumConversations, 1, 2_000) ?? undefined,
    });
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

  const startConversation = (
    businessId: string,
    actorId: string,
  ): PilotSessionIssueResult => {
    if (!conversations.hasBusiness(businessId)) {
      return Object.freeze({ status: "denied" as const });
    }
    const conversationId = conversationIdFactory(businessId);
    const conversationHandle = conversations.begin(businessId, conversationId);
    if (!conversationHandle) return Object.freeze({ status: "denied" as const });
    return Object.freeze({
      status: "issued" as const,
      session: sessions.issue({
        businessId,
        conversationId,
        conversationHandle,
        actorId,
      }, true),
    });
  };

  const issueCustomerSession = (request: unknown): PilotSessionIssueResult => {
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

  const issueOperatorSession = (request: unknown): PilotSessionIssueResult => {
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
