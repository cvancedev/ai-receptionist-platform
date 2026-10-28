import type { ConversationState } from "../../domain/conversation-state";

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

export interface CommitTurnInput {
  readonly scope: ConversationPersistenceScope;
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
  | "conflict"
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

export function isPersistenceDigest(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
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
