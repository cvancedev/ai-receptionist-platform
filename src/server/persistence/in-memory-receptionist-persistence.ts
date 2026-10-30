import { decodeConversationState } from "../../validation/conversation-state-codec";
import type { ConversationState } from "../../domain/conversation-state";
import {
  MAXIMUM_STORED_MESSAGES,
  RECEPTIONIST_SCHEMA_VERSION,
  isConversationPersistenceScope,
  isPersistenceDigest,
  isReserveUsageInput,
  isStoredMessage,
  isTurnId,
  isTurnUsage,
  sameScope,
  scopeKey,
  type CommitTurnInput,
  type CommitTurnResult,
  type ConversationPersistenceScope,
  type ConversationSeed,
  type CreateConversationResult,
  type FindSessionResult,
  type LoadConversationResult,
  type LoadTurnReceiptResult,
  type MonthlyUsageSummary,
  type PersistedSessionRecord,
  type ReceptionistPersistence,
  type ReconcileReservationsInput,
  type ReconcileReservationsResult,
  type ReleaseReservationResult,
  type ReserveUsageInput,
  type ReserveUsageResult,
  type ScopeLookupResult,
  type StoredMessage,
  type TurnReceipt,
} from "./receptionist-persistence";
import { isBillingMonth } from "../billing/provider-pricing";

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

interface StoredTurnReceipt {
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
  readonly firstMessageId: number;
  readonly lastMessageId: number;
  readonly createdAt: number;
}

interface UsageRecord {
  readonly businessProfileId: string;
  /** UTC month shared by the reservation and its settlement. */
  readonly billingMonth: string;
  readonly state: "reserved" | "settled";
  readonly reservedMicros: number;
  readonly costMicros: number;
  readonly createdAt: number;
  readonly settledAt: number | null;
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
  private readonly receipts = new Map<string, StoredTurnReceipt>();
  private readonly usage = new Map<string, UsageRecord>();
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
    if (!isTurnId(input.turnId)) return "failure";
    if (!isPersistenceDigest(input.requestDigest)) return "failure";
    if (!isTurnUsage(input.usage)) return "failure";
    if (!isBoundedInteger(input.durationMs, 0, 600_000)) return "failure";
    if (!isBoundedInteger(input.monthlyBudgetMicros, 0, Number.MAX_SAFE_INTEGER)) {
      return "failure";
    }
    if (!isBillingMonth(input.billingMonth)) return "failure";
    if (typeof input.outcomeCode !== "string"
      || input.outcomeCode.length === 0
      || input.outcomeCode.length > 64) return "failure";
    if (typeof input.stage !== "string" || input.stage.length === 0 || input.stage.length > 64) {
      return "failure";
    }
    if (typeof input.readiness !== "string"
      || input.readiness.length === 0
      || input.readiness.length > 64) return "failure";
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) {
      return "failure";
    }
    if (!Number.isInteger(input.expectedTurnNumber) || input.expectedTurnNumber < 0) {
      return "failure";
    }
    if (input.messages.length > MAXIMUM_STORED_MESSAGES) return "failure";
    if (input.messages.length === 0) return "failure";
    if (input.messages.some((message) => !isStoredMessage(message))) return "failure";

    const record = this.conversations.get(scopeKey(input.scope));
    if (!record) return "not-found";

    const receiptKey = `${scopeKey(input.scope)}|${input.turnId}`;
    const existingReceipt = this.receipts.get(receiptKey);
    if (existingReceipt) {
      if (existingReceipt.requestDigest !== input.requestDigest) return "turn-mismatch";
      return this.replayReceipt(record, existingReceipt) === null ? "failure" : "replayed";
    }

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

    const spent = this.usageTotal(input.scope.businessProfileId, input.billingMonth, receiptKey);
    if (spent + input.usage.costMicros > input.monthlyBudgetMicros) {
      return "budget-exhausted";
    }

    const ordered = [...input.messages].sort((left, right) => left.messageId - right.messageId);
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    if (!first || !last) return "failure";

    record.state = cloneState(decoded.state);
    record.pendingFieldId = input.pendingFieldId;
    record.handoffAvailable = input.handoffAvailable;
    record.turnNumber = input.turnNumber;
    record.nextMessageId = input.nextMessageId;
    record.messages.push(...input.messages.map((message) => ({ ...message })));
    if (record.messages.length > MAXIMUM_STORED_MESSAGES) {
      record.messages.splice(0, record.messages.length - MAXIMUM_STORED_MESSAGES);
    }

    const createdAt = Date.now();
    this.receipts.set(receiptKey, Object.freeze({
      scope: { ...input.scope },
      turnId: input.turnId,
      requestDigest: input.requestDigest,
      turnNumber: input.turnNumber,
      expectedRevision: input.expectedRevision,
      resultingRevision: decoded.state.revision,
      outcomeCode: input.outcomeCode,
      stage: input.stage,
      readiness: input.readiness,
      pendingFieldId: input.pendingFieldId,
      handoffAvailable: input.handoffAvailable,
      providerIdentifier: input.usage.providerIdentifier,
      modelIdentifier: input.usage.modelIdentifier,
      durationMs: input.durationMs,
      firstMessageId: first.messageId,
      lastMessageId: last.messageId,
      createdAt,
    }));
    this.usage.set(receiptKey, Object.freeze({
      businessProfileId: input.scope.businessProfileId,
      billingMonth: input.billingMonth,
      state: "settled" as const,
      reservedMicros: 0,
      costMicros: input.usage.costMicros,
      createdAt,
      settledAt: createdAt,
    }));
    return "committed";
  }

  async loadTurnReceipt(
    scope: ConversationPersistenceScope,
    turnId: string,
  ): Promise<LoadTurnReceiptResult> {
    if (this.closed) return { status: "failure" };
    if (!isConversationPersistenceScope(scope) || !isTurnId(turnId)) {
      return { status: "not-found" };
    }
    const receipt = this.receipts.get(`${scopeKey(scope)}|${turnId}`);
    if (!receipt) return { status: "not-found" };
    const record = this.conversations.get(scopeKey(scope));
    if (!record) return { status: "failure" };
    const resolved = this.replayReceipt(record, receipt);
    return resolved ? { status: "found", receipt: resolved } : { status: "failure" };
  }

  async monthlyUsageMicros(
    businessProfileId: string,
    billingMonth: string | null,
  ): Promise<MonthlyUsageSummary | null> {
    if (this.closed) return null;
    if (typeof businessProfileId !== "string" || businessProfileId.length === 0) return null;
    if (billingMonth !== null && !isBillingMonth(billingMonth)) return null;
    let settledMicros = 0;
    let reservedMicros = 0;
    for (const usage of this.usage.values()) {
      if (usage.businessProfileId !== businessProfileId) continue;
      if (billingMonth !== null && usage.billingMonth !== billingMonth) continue;
      if (usage.state === "settled") settledMicros += usage.costMicros;
      else reservedMicros += usage.reservedMicros;
    }
    return Object.freeze({ settledMicros, reservedMicros });
  }

  async reserveUsage(input: ReserveUsageInput): Promise<ReserveUsageResult> {
    if (this.closed) return "failure";
    if (!isReserveUsageInput(input)) return "invalid";
    const key = `${scopeKey(input.scope)}|${input.turnId}`;
    // A repeated identifier never reserves a second time; the turn commit
    // settles the single row that was reserved before provider execution.
    if (this.usage.has(key)) return "already-reserved";

    const spent = this.usageTotal(
      input.scope.businessProfileId,
      input.billingMonth,
      key,
    );
    if (spent + input.estimatedCostMicros > input.monthlyBudgetMicros) {
      return "budget-exhausted";
    }

    const createdAt = Date.now();
    this.usage.set(key, Object.freeze({
      businessProfileId: input.scope.businessProfileId,
      billingMonth: input.billingMonth,
      state: "reserved" as const,
      reservedMicros: input.estimatedCostMicros,
      costMicros: 0,
      createdAt,
      settledAt: null,
    }));
    return "reserved";
  }

  async releaseReservation(
    scope: ConversationPersistenceScope,
    turnId: string,
  ): Promise<ReleaseReservationResult> {
    if (this.closed) return "failure";
    if (!isConversationPersistenceScope(scope) || !isTurnId(turnId)) return "not-found";
    const key = `${scopeKey(scope)}|${turnId}`;
    const usage = this.usage.get(key);
    // A settled row is a real charge and is never released.
    if (!usage || usage.state !== "reserved") return "not-found";
    this.usage.delete(key);
    return "released";
  }

  async reconcileStaleReservations(
    input: ReconcileReservationsInput,
  ): Promise<ReconcileReservationsResult | null> {
    if (this.closed) return null;
    if (!isBoundedInteger(input?.olderThanMs, 0, 24 * 60 * 60 * 1_000)) return null;
    if (!isBoundedInteger(input.now, 0, Number.MAX_SAFE_INTEGER)) return null;
    const cutoff = input.now - input.olderThanMs;
    let released = 0;
    for (const [key, usage] of this.usage) {
      if (usage.state !== "reserved") continue;
      if (usage.createdAt > cutoff) continue;
      this.usage.delete(key);
      released += 1;
    }
    return Object.freeze({ released });
  }

  async readSchemaVersion(): Promise<number | null> {
    return this.closed ? null : RECEPTIONIST_SCHEMA_VERSION;
  }

  private replayReceipt(
    record: ConversationRecord,
    receipt: StoredTurnReceipt,
  ): TurnReceipt | null {
    const messages: StoredMessage[] = [];
    for (let id = receipt.firstMessageId; id <= receipt.lastMessageId; id += 1) {
      const message = record.messages.find((entry) => entry.messageId === id);
      // A trimmed history cannot reproduce the recorded turn. Fail closed rather
      // than return a partial or fabricated result.
      if (!message) return null;
      messages.push(Object.freeze({ ...message }));
    }
    return Object.freeze({
      scope: { ...receipt.scope },
      turnId: receipt.turnId,
      requestDigest: receipt.requestDigest,
      turnNumber: receipt.turnNumber,
      expectedRevision: receipt.expectedRevision,
      resultingRevision: receipt.resultingRevision,
      outcomeCode: receipt.outcomeCode,
      stage: receipt.stage,
      readiness: receipt.readiness,
      pendingFieldId: receipt.pendingFieldId,
      handoffAvailable: receipt.handoffAvailable,
      providerIdentifier: receipt.providerIdentifier,
      modelIdentifier: receipt.modelIdentifier,
      durationMs: receipt.durationMs,
      createdAt: receipt.createdAt,
      messages: Object.freeze(messages),
    });
  }

  private usageTotal(
    businessProfileId: string,
    billingMonth: string,
    excludedKey: string,
  ): number {
    let total = 0;
    for (const [key, usage] of this.usage) {
      if (key === excludedKey) continue;
      if (usage.businessProfileId !== businessProfileId) continue;
      if (usage.billingMonth !== billingMonth) continue;
      total += usage.state === "settled" ? usage.costMicros : usage.reservedMicros;
    }
    return total;
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
    this.receipts.clear();
    this.usage.clear();
  }
}

function isBoundedInteger(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= minimum
    && value <= maximum;
}

function cloneState(state: ConversationState): ConversationState {
  return JSON.parse(JSON.stringify(state)) as ConversationState;
}
