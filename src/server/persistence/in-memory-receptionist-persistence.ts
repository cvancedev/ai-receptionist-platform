import { decodeConversationState } from "../../validation/conversation-state-codec";
import type { ConversationState } from "../../domain/conversation-state";
import {
  MAXIMUM_STORED_MESSAGES,
  isConversationPersistenceScope,
  isPersistenceDigest,
  isStoredMessage,
  sameScope,
  scopeKey,
  type CommitTurnInput,
  type CommitTurnResult,
  type ConversationPersistenceScope,
  type ConversationSeed,
  type CreateConversationResult,
  type FindSessionResult,
  type LoadConversationResult,
  type PersistedSessionRecord,
  type ReceptionistPersistence,
  type ScopeLookupResult,
} from "./receptionist-persistence";

if (typeof window !== "undefined") {
  throw new Error("Receptionist persistence is server-only.");
}

interface ConversationRecord {
  readonly scope: ConversationPersistenceScope;
  readonly handleHash: string;
  state: ConversationState;
  messages: { messageId: number; role: "customer" | "assistant"; content: string }[];
  pendingFieldId: string | null;
  handoffAvailable: boolean;
  turnNumber: number;
  nextMessageId: number;
}

/**
 * Deterministic, process-local implementation of the durable persistence port.
 *
 * It exists so the durable conversation and session components can be exercised
 * without a database, and so an explicitly offline composition can run. It is
 * not a substitute for PostgreSQL durability and is never used by a pilot
 * runtime configured for `postgresql`.
 */
export class InMemoryReceptionistPersistence implements ReceptionistPersistence {
  readonly kind = "in-memory" as const;
  private readonly conversations = new Map<string, ConversationRecord>();
  private readonly sessions = new Map<string, PersistedSessionRecord>();
  private closed = false;

  async createConversation(seed: ConversationSeed): Promise<CreateConversationResult> {
    if (this.closed) return "failure";
    if (!isConversationPersistenceScope(seed?.scope)) return "failure";
    if (!isPersistenceDigest(seed.handleHash)) return "failure";
    if (!isStoredMessage(seed.greeting) || seed.greeting.messageId !== 1) return "failure";
    const decoded = decodeConversationState(seed.state, seed.scope);
    if (decoded.status === "failure") return "failure";
    if (decoded.state.revision !== 0) return "failure";

    const key = scopeKey(seed.scope);
    if (this.conversations.has(key)) return "already-exists";
    for (const record of this.conversations.values()) {
      if (record.handleHash === seed.handleHash) return "already-exists";
    }

    this.conversations.set(key, {
      scope: { ...seed.scope },
      handleHash: seed.handleHash,
      state: cloneState(decoded.state),
      messages: [{
        messageId: seed.greeting.messageId,
        role: seed.greeting.role,
        content: seed.greeting.content,
      }],
      pendingFieldId: null,
      handoffAvailable: false,
      turnNumber: 0,
      nextMessageId: 2,
    });
    return "created";
  }

  async loadConversation(
    scope: ConversationPersistenceScope,
  ): Promise<LoadConversationResult> {
    if (this.closed) return { status: "failure" };
    if (!isConversationPersistenceScope(scope)) return { status: "failure" };
    const record = this.conversations.get(scopeKey(scope));
    if (!record) return { status: "not-found" };
    return {
      status: "found",
      conversation: Object.freeze({
        scope: { ...record.scope },
        handleHash: record.handleHash,
        state: cloneState(record.state),
        messages: Object.freeze(record.messages.map((message) => Object.freeze({ ...message }))),
        pendingFieldId: record.pendingFieldId,
        handoffAvailable: record.handoffAvailable,
        turnNumber: record.turnNumber,
        nextMessageId: record.nextMessageId,
      }),
    };
  }

  async findScopeByHandleHash(handleHash: string): Promise<ScopeLookupResult> {
    if (this.closed) return { status: "failure" };
    if (!isPersistenceDigest(handleHash)) return { status: "not-found" };
    for (const record of this.conversations.values()) {
      if (record.handleHash === handleHash) {
        return { status: "found", scope: { ...record.scope } };
      }
    }
    return { status: "not-found" };
  }

  async commitTurn(input: CommitTurnInput): Promise<CommitTurnResult> {
    if (this.closed) return "failure";
    if (!isConversationPersistenceScope(input?.scope)) return "failure";
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) {
      return "failure";
    }
    if (!Number.isInteger(input.expectedTurnNumber) || input.expectedTurnNumber < 0) {
      return "failure";
    }
    if (input.messages.length > MAXIMUM_STORED_MESSAGES) return "failure";
    if (input.messages.some((message) => !isStoredMessage(message))) return "failure";

    const record = this.conversations.get(scopeKey(input.scope));
    if (!record) return "not-found";
    if (record.state.revision !== input.expectedRevision) return "conflict";
    if (record.turnNumber !== input.expectedTurnNumber) return "conflict";
    if (!sameScope(input.state, input.scope)) return "failure";
    if (input.state.revision < input.expectedRevision) return "failure";

    const decoded = decodeConversationState(input.state, input.scope);
    if (decoded.status === "failure") return "failure";

    const existingIds = new Set(record.messages.map((message) => message.messageId));
    for (const message of input.messages) {
      if (existingIds.has(message.messageId)) return "conflict";
      existingIds.add(message.messageId);
    }

    record.state = cloneState(decoded.state);
    record.pendingFieldId = input.pendingFieldId;
    record.handoffAvailable = input.handoffAvailable;
    record.turnNumber = input.turnNumber;
    record.nextMessageId = input.nextMessageId;
    record.messages.push(...input.messages.map((message) => ({ ...message })));
    if (record.messages.length > MAXIMUM_STORED_MESSAGES) {
      record.messages.splice(0, record.messages.length - MAXIMUM_STORED_MESSAGES);
    }
    return "committed";
  }

  async createSession(record: PersistedSessionRecord): Promise<"created" | "failure"> {
    if (this.closed) return "failure";
    if (!isPersistenceDigest(record?.tokenHash)) return "failure";
    if (!isPersistenceDigest(record.csrfTokenHash)) return "failure";
    if (this.sessions.has(record.tokenHash)) return "failure";
    this.sessions.set(record.tokenHash, Object.freeze({ ...record }));
    return "created";
  }

  async findSession(tokenHash: string): Promise<FindSessionResult> {
    if (this.closed) return { status: "failure" };
    if (!isPersistenceDigest(tokenHash)) return { status: "not-found" };
    const session = this.sessions.get(tokenHash);
    return session
      ? { status: "found", session: Object.freeze({ ...session }) }
      : { status: "not-found" };
  }

  async revokeSession(
    tokenHash: string,
    revokedAt: number,
  ): Promise<"revoked" | "not-found" | "failure"> {
    if (this.closed) return "failure";
    if (!isPersistenceDigest(tokenHash)) return "not-found";
    const session = this.sessions.get(tokenHash);
    if (!session) return "not-found";
    this.sessions.set(tokenHash, Object.freeze({
      ...session,
      revokedAt: session.revokedAt ?? revokedAt,
    }));
    return "revoked";
  }

  async countSessions(): Promise<number> {
    return this.sessions.size;
  }

  async pruneSessions(now: number): Promise<number> {
    let removed = 0;
    for (const [tokenHash, session] of this.sessions) {
      if (session.expiresAt <= now || session.revokedAt !== null) {
        this.sessions.delete(tokenHash);
        removed += 1;
      }
    }
    return removed;
  }

  async close(): Promise<void> {
    this.closed = true;
    this.conversations.clear();
    this.sessions.clear();
  }
}

function cloneState(state: ConversationState): ConversationState {
  return JSON.parse(JSON.stringify(state)) as ConversationState;
}
