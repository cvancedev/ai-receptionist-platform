import type { ConversationState } from "../../domain/conversation-state";
import { isBillingMonth } from "../billing/provider-pricing";

if (typeof window !== "undefined") {
  throw new Error("Receptionist persistence is server-only.");
}

/**
 * Durable persistence boundary for the pilot receptionist.
 *
 * The port stores complete Conversation State snapshots, the bounded message
 * history the turn engine needs, and hashed session records. It performs no
 * decision-making: the deterministic engine remains authoritative, and every
 * operation is scoped by business profile, profile version, and conversation.
 *
 * Handles and session tokens are represented only by SHA-256 digests here.
 * Neither a raw handle nor a raw token can be recovered from storage.
 */
export type StoredMessageRole = "customer" | "assistant";

export interface StoredMessage {
  readonly messageId: number;
  readonly role: StoredMessageRole;
  readonly content: string;
}

export interface ConversationPersistenceScope {
  readonly businessProfileId: string;
  readonly businessProfileVersion: number;
  readonly conversationId: string;
}

export interface PersistedConversation {
  readonly scope: ConversationPersistenceScope;
  readonly handleHash: string;
  readonly state: ConversationState;
  readonly messages: readonly StoredMessage[];
  readonly pendingFieldId: string | null;
  readonly handoffAvailable: boolean;
  readonly turnNumber: number;
  readonly nextMessageId: number;
}

export interface ConversationSeed {
  readonly scope: ConversationPersistenceScope;
  readonly handleHash: string;
  readonly state: ConversationState;
  readonly greeting: StoredMessage;
}

export type CreateConversationResult =
  | "created"
  | "already-exists"
  | "failure";

export type LoadConversationResult =
  | { readonly status: "found"; readonly conversation: PersistedConversation }
  | { readonly status: "not-found" }
  | { readonly status: "failure" };

export type ScopeLookupResult =
  | { readonly status: "found"; readonly scope: ConversationPersistenceScope }
  | { readonly status: "not-found" }
  | { readonly status: "failure" };

/** Current required pilot schema version, including billing-month accounting. */
export const RECEPTIONIST_SCHEMA_VERSION = 10;
export const MICROS_PER_USD = 1_000_000;
export const DEFAULT_MONTHLY_BUDGET_MICROS = 10 * MICROS_PER_USD;
export const MAXIMUM_MONTHLY_BUDGET_MICROS = 1_000 * MICROS_PER_USD;
export const TURN_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Provider-reported or estimated usage for one committed turn.
 *
 * Money is an integer number of micro-units of USD (1 USD = 1,000,000). Integer
 * accounting avoids floating-point drift in budget comparisons. B2.3.3 records
 * zero-valued usage because provider execution remains disabled.
 */
export interface TurnUsage {
  readonly providerIdentifier: string | null;
  readonly modelIdentifier: string | null;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costMicros: number;
}

/**
 * Durable operational metadata for one committed turn. It intentionally holds
 * no conversation text, prompt, credential, session token, handle, or raw error.
 */
export interface TurnReceipt {
  readonly scope: ConversationPersistenceScope;
  readonly turnId: string;
  readonly requestDigest: string;
  readonly turnNumber: number;
  readonly expectedRevision: number;
  readonly resultingRevision: number;
  readonly outcomeCode: string;
  readonly stage: string;
  readonly readiness: string;
  readonly pendingFieldId: string | null;
  readonly handoffAvailable: boolean;
  readonly providerIdentifier: string | null;
  readonly modelIdentifier: string | null;
  readonly durationMs: number;
  readonly createdAt: number;
  /** Messages appended by the recorded turn, used to replay the same result. */
  readonly messages: readonly StoredMessage[];
}

export type LoadTurnReceiptResult =
  | { readonly status: "found"; readonly receipt: TurnReceipt }
  | { readonly status: "not-found" }
  | { readonly status: "failure" };

export interface MonthlyUsageSummary {
  readonly settledMicros: number;
  readonly reservedMicros: number;
}

/**
 * A pre-call spending reservation for one scoped turn.
 *
 * The reservation is keyed by the same tuple as the turn receipt, so a repeated
 * `turnId` can never reserve twice and a committed turn settles the row that was
 * reserved before the provider call.
 */
export interface ReserveUsageInput {
  readonly scope: ConversationPersistenceScope;
  readonly turnId: string;
  /** UTC billing month in `YYYY-MM` form; reservations and settlements share it. */
  readonly billingMonth: string;
  readonly providerIdentifier: string | null;
  readonly modelIdentifier: string | null;
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** Conservative micro-unit estimate reserved before provider execution. */
  readonly estimatedCostMicros: number;
  /** Monthly cap in micro-units of USD, re-checked inside the transaction. */
  readonly monthlyBudgetMicros: number;
}

export type ReserveUsageResult =
  | "reserved"
  | "already-reserved"
  | "budget-exhausted"
  | "invalid"
  | "failure";

export type ReleaseReservationResult = "released" | "not-found" | "failure";

export interface ReconcileReservationsInput {
  /** Reservations older than this are considered abandoned. */
  readonly olderThanMs: number;
  /** Trusted server time in epoch milliseconds. */
  readonly now: number;
}

export interface ReconcileReservationsResult {
  readonly released: number;
}

export interface CommitTurnInput {
  readonly scope: ConversationPersistenceScope;
  /** Client-generated, opaque, bounded identifier for this utterance. */
  readonly turnId: string;
  /** SHA-256 of the scoped request, used to detect identifier reuse. */
  readonly requestDigest: string;
  /** Deterministic outcome code recorded with the receipt. */
  readonly outcomeCode: string;
  readonly stage: string;
  readonly readiness: string;
  readonly durationMs: number;
  readonly usage: TurnUsage;
  /** Monthly spend cap in micro-units of USD, checked inside the transaction. */
  readonly monthlyBudgetMicros: number;
  /** UTC billing month in `YYYY-MM` form, shared with the reservation. */
  readonly billingMonth: string;
  /** Revision of the snapshot this turn started from. */
  readonly expectedRevision: number;
  /**
   * Committed turn number this turn started from. It is the concurrency token
   * for turns that legitimately leave the state revision unchanged (a rejected
   * interpretation still records its messages).
   */
  readonly expectedTurnNumber: number;
  readonly state: ConversationState;
  readonly pendingFieldId: string | null;
  readonly handoffAvailable: boolean;
  readonly turnNumber: number;
  readonly nextMessageId: number;
  /** Only messages appended by this turn. Existing ids are never rewritten. */
  readonly messages: readonly StoredMessage[];
}

export type CommitTurnResult =
  | "committed"
  | "replayed"
  | "conflict"
  | "turn-mismatch"
  | "budget-exhausted"
  | "not-found"
  | "failure";

export interface PersistedSessionRecord {
  readonly tokenHash: string;
  readonly csrfTokenHash: string;
  readonly sessionKey: string;
  readonly businessProfileId: string;
  readonly businessProfileVersion: number;
  readonly conversationId: string;
  readonly conversationHandleHash: string | null;
  readonly actorId: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly revokedAt: number | null;
}

export type FindSessionResult =
  | { readonly status: "found"; readonly session: PersistedSessionRecord }
  | { readonly status: "not-found" }
  | { readonly status: "failure" };

export interface ReceptionistPersistence {
  readonly kind: "postgresql" | "in-memory";
  createConversation(seed: ConversationSeed): Promise<CreateConversationResult>;
  loadConversation(
    scope: ConversationPersistenceScope,
  ): Promise<LoadConversationResult>;
  findScopeByHandleHash(handleHash: string): Promise<ScopeLookupResult>;
  commitTurn(input: CommitTurnInput): Promise<CommitTurnResult>;
  loadTurnReceipt(
    scope: ConversationPersistenceScope,
    turnId: string,
  ): Promise<LoadTurnReceiptResult>;
  monthlyUsageMicros(
    businessProfileId: string,
    billingMonth: string | null,
  ): Promise<MonthlyUsageSummary | null>;
  /** Reserve estimated spending for one scoped turn before provider execution. */
  reserveUsage(input: ReserveUsageInput): Promise<ReserveUsageResult>;
  /** Release a reservation that provably incurred no provider charge. */
  releaseReservation(
    scope: ConversationPersistenceScope,
    turnId: string,
  ): Promise<ReleaseReservationResult>;
  /**
   * Release reservations abandoned longer than the bounded window. Used for
   * interrupted requests whose provider outcome is unknown.
   */
  reconcileStaleReservations(
    input: ReconcileReservationsInput,
  ): Promise<ReconcileReservationsResult | null>;
  /** Required schema version present in the store, or null when unavailable. */
  readSchemaVersion(): Promise<number | null>;
  createSession(record: PersistedSessionRecord): Promise<"created" | "failure">;
  findSession(tokenHash: string): Promise<FindSessionResult>;
  revokeSession(tokenHash: string, revokedAt: number): Promise<"revoked" | "not-found" | "failure">;
  countSessions(): Promise<number>;
  pruneSessions(now: number): Promise<number>;
  close(): Promise<void>;
}

export const MAXIMUM_STORED_MESSAGES = 100;
export const MAXIMUM_STORED_MESSAGE_LENGTH = 4_000;

export function isConversationPersistenceScope(
  value: unknown,
): value is ConversationPersistenceScope {
  if (!isPlainRecord(value)) return false;
  return typeof value.businessProfileId === "string"
    && value.businessProfileId.length > 0
    && value.businessProfileId.length <= 128
    && Number.isInteger(value.businessProfileVersion)
    && (value.businessProfileVersion as number) >= 1
    && typeof value.conversationId === "string"
    && value.conversationId.length > 0
    && value.conversationId.length <= 128;
}

export function isStoredMessage(value: unknown): value is StoredMessage {
  if (!isPlainRecord(value)) return false;
  return Number.isInteger(value.messageId)
    && (value.messageId as number) >= 1
    && (value.role === "customer" || value.role === "assistant")
    && typeof value.content === "string"
    && value.content.length > 0
    && value.content.length <= MAXIMUM_STORED_MESSAGE_LENGTH;
}

export function isReserveUsageInput(value: unknown): value is ReserveUsageInput {
  if (!isPlainRecord(value)) return false;
  if (!isConversationPersistenceScope(value.scope)) return false;
  if (!isTurnId(value.turnId)) return false;
  if (!isBillingMonth(value.billingMonth)) return false;
  if (value.providerIdentifier !== null
    && (typeof value.providerIdentifier !== "string"
      || value.providerIdentifier.length === 0
      || value.providerIdentifier.length > 128)) return false;
  if (value.modelIdentifier !== null
    && (typeof value.modelIdentifier !== "string"
      || value.modelIdentifier.length === 0
      || value.modelIdentifier.length > 128)) return false;
  for (const field of ["inputTokens", "outputTokens", "estimatedCostMicros", "monthlyBudgetMicros"] as const) {
    const candidate = value[field];
    if (typeof candidate !== "number" || !Number.isInteger(candidate) || candidate < 0) {
      return false;
    }
  }
  return true;
}

export function isPersistenceDigest(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

export function isTurnId(value: unknown): value is string {
  return typeof value === "string" && TURN_ID_PATTERN.test(value);
}

export function isTurnUsage(value: unknown): value is TurnUsage {
  if (!isPlainRecord(value)) return false;
  if (value.providerIdentifier !== null
    && (typeof value.providerIdentifier !== "string"
      || value.providerIdentifier.length === 0
      || value.providerIdentifier.length > 128)) return false;
  if (value.modelIdentifier !== null
    && (typeof value.modelIdentifier !== "string"
      || value.modelIdentifier.length === 0
      || value.modelIdentifier.length > 128)) return false;
  for (const field of ["inputTokens", "outputTokens", "costMicros"] as const) {
    const candidate = value[field];
    if (typeof candidate !== "number" || !Number.isInteger(candidate) || candidate < 0) {
      return false;
    }
  }
  return true;
}

export function utcMonthStart(epochMs: number): number {
  const date = new Date(epochMs);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0);
}

export function sameScope(
  left: ConversationPersistenceScope,
  right: ConversationPersistenceScope,
): boolean {
  return left.businessProfileId === right.businessProfileId
    && left.businessProfileVersion === right.businessProfileVersion
    && left.conversationId === right.conversationId;
}

export function scopeKey(scope: ConversationPersistenceScope): string {
  return JSON.stringify([
    scope.businessProfileId,
    scope.businessProfileVersion,
    scope.conversationId,
  ]);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
