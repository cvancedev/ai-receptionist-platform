import { randomBytes } from "node:crypto";
import type { OfflineTransport } from "../../ai/providers/transport-model-provider-adapter";
import { fictionalBusinessProfile } from "../../fixtures/business-profile";
import { fictionalKnowledgeRecords } from "../../fixtures/knowledge";
import {
  SessionAuthority,
  type IssuedSession,
  type SessionAuthenticationSource,
} from "../auth/session-authority";
import {
  ReceptionistConversationService,
  MAXIMUM_MESSAGE_LENGTH,
  type ReceptionistBusiness,
  type ReceptionistTurnOutcome,
} from "../conversation/receptionist-conversation-service";
import {
  FixedWindowRateLimiter,
  type RateLimitPolicy,
} from "../security/request-rate-limiter";

if (typeof window !== "undefined") {
  throw new Error("The receptionist runtime is server-only.");
}

/**
 * Server composition root for the B2.2 receptionist endpoint.
 *
 * The runtime owns one active fictional business, its knowledge, the session
 * authority, the request limiter, and the conversation service. It reads no
 * environment variable, provider credential, or database. No HTTP route creates
 * a session: trusted server composition issues sessions explicitly, and the
 * endpoint only authenticates them. That limitation is deliberate until an
 * approved identity source exists.
 */
export const RECEPTIONIST_RUNTIME_VERSION = "b2.2-receptionist-runtime/v1" as const;
export const DEFAULT_IP_RATE_LIMIT: RateLimitPolicy = Object.freeze({
  limit: 60,
  windowMs: 60_000,
});
export const DEFAULT_SESSION_RATE_LIMIT: RateLimitPolicy = Object.freeze({
  limit: 20,
  windowMs: 60_000,
});
export const DEFAULT_MAXIMUM_REQUEST_BYTES = 8_192;
export const MINIMUM_REQUEST_BYTES = 512;
export const MAXIMUM_REQUEST_BYTES = 65_536;

/**
 * Truthful provider description for the composed runtime. B2.3.1 still runs
 * only the offline simulator, so the endpoint must not imply a real call.
 */
export const OFFLINE_PROVIDER_DESCRIPTOR = Object.freeze({
  identifier: "simulated-offline-model-transport/v1",
  networkAccessed: false,
});

/**
 * Everything a turn endpoint needs, and nothing that mints identity. The pilot
 * runtime implements this without exposing arbitrary session issuance, so a
 * route cannot accidentally acquire a second, untrusted issuance path.
 */
export interface ReceptionistTurnRuntime {
  readonly version: string;
  readonly sessions: SessionAuthenticationSource;
  readonly limiter: FixedWindowRateLimiter;
  readonly conversations: {
    submit(input: unknown): Promise<ReceptionistTurnOutcome>;
    hasBusiness(businessId: unknown): boolean;
  };
  readonly ipRateLimit: RateLimitPolicy;
  readonly sessionRateLimit: RateLimitPolicy;
  readonly maximumRequestBytes: number;
  readonly maximumMessageLength: number;
  readonly provider: { readonly identifier: string; readonly networkAccessed: boolean };
  readonly hasBusiness: (businessId: unknown) => boolean;
}

/** Local/demo composition. `issueSession` is trusted server composition only. */
export interface ReceptionistRuntime extends ReceptionistTurnRuntime {
  readonly version: typeof RECEPTIONIST_RUNTIME_VERSION;
  readonly sessions: SessionAuthority;
  readonly conversations: ReceptionistConversationService;
  readonly issueSession: (businessId: unknown, actorId: unknown) => IssuedSession;
}

export interface ReceptionistRuntimeOptions {
  readonly businesses?: readonly ReceptionistBusiness[];
  readonly transport?: OfflineTransport;
  readonly now?: () => number;
  readonly sessionTtlMs?: number;
  readonly ipRateLimit?: RateLimitPolicy;
  readonly sessionRateLimit?: RateLimitPolicy;
  readonly maximumRequestBytes?: number;
  readonly maximumMessageLength?: number;
  readonly maximumConversations?: number;
  readonly conversationIdFactory?: (businessId: string) => string;
}

const DEFAULT_BUSINESSES: readonly ReceptionistBusiness[] = Object.freeze([
  Object.freeze({
    profile: fictionalBusinessProfile,
    knowledge: fictionalKnowledgeRecords,
  }),
]);

type RuntimeGlobal = typeof globalThis & {
  __aiReceptionistB22Runtime?: ReceptionistRuntime;
};

export function createReceptionistRuntime(
  options: ReceptionistRuntimeOptions = {},
): ReceptionistRuntime {
  const now = options.now ?? Date.now;
  const businesses = options.businesses ?? DEFAULT_BUSINESSES;
  const sessions = new SessionAuthority({
    now,
    ttlMs: options.sessionTtlMs,
  });
  const limiter = new FixedWindowRateLimiter({ now });
  const conversations = new ReceptionistConversationService(businesses, {
    transport: options.transport,
    maximumConversations: options.maximumConversations,
  });
  const ipRateLimit = normalizePolicy(options.ipRateLimit, DEFAULT_IP_RATE_LIMIT);
  const sessionRateLimit = normalizePolicy(
    options.sessionRateLimit,
    DEFAULT_SESSION_RATE_LIMIT,
  );
  const maximumRequestBytes = boundedInteger(
    options.maximumRequestBytes ?? DEFAULT_MAXIMUM_REQUEST_BYTES,
    MINIMUM_REQUEST_BYTES,
    MAXIMUM_REQUEST_BYTES,
  ) ?? DEFAULT_MAXIMUM_REQUEST_BYTES;
  const maximumMessageLength = Math.min(
    boundedInteger(options.maximumMessageLength ?? MAXIMUM_MESSAGE_LENGTH, 1, MAXIMUM_MESSAGE_LENGTH)
      ?? MAXIMUM_MESSAGE_LENGTH,
    MAXIMUM_MESSAGE_LENGTH,
  );
  const conversationIdFactory = options.conversationIdFactory
    ?? (() => `conversation-${randomBytes(16).toString("hex")}`);

  const issueSession = (businessId: unknown, actorId: unknown): IssuedSession => {
    if (typeof businessId !== "string" || !conversations.hasBusiness(businessId)) {
      throw new Error("The requested receptionist business is unavailable.");
    }
    if (typeof actorId !== "string") {
      throw new Error("A server-validated actor is required.");
    }
    const conversationId = conversationIdFactory(businessId);
    const conversationHandle = conversations.begin(businessId, conversationId);
    if (!conversationHandle) {
      throw new Error("The receptionist conversation could not be created.");
    }
    return sessions.issue({
      businessId,
      conversationId,
      conversationHandle,
      actorId,
    });
  };

  return Object.freeze({
    version: RECEPTIONIST_RUNTIME_VERSION as typeof RECEPTIONIST_RUNTIME_VERSION,
    sessions,
    limiter,
    conversations,
    ipRateLimit,
    sessionRateLimit,
    maximumRequestBytes,
    maximumMessageLength,
    provider: OFFLINE_PROVIDER_DESCRIPTOR,
    hasBusiness: (businessId: unknown) => conversations.hasBusiness(businessId),
    issueSession,
  });
}

export function getReceptionistRuntime(): ReceptionistRuntime {
  const runtimeGlobal = globalThis as RuntimeGlobal;
  runtimeGlobal.__aiReceptionistB22Runtime ??= createReceptionistRuntime();
  return runtimeGlobal.__aiReceptionistB22Runtime;
}

function normalizePolicy(
  policy: RateLimitPolicy | undefined,
  fallback: RateLimitPolicy,
): RateLimitPolicy {
  if (!policy) return fallback;
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
