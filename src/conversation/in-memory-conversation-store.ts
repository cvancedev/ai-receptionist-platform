import type { ConversationState } from "../domain/conversation-state";
import type {
  ConversationStore,
  ConversationStoreFailureReason,
  ConversationStoreReplaceInput,
  ConversationStoreResult,
  ConversationStoreScope,
} from "./conversation-store";
import { cloneConversationState } from "./conversation-state-updates";
import { decodeConversationState } from "../validation/conversation-state-codec";

/** Prototype-only in-memory storage. It performs no persistence or network work. */
export class InMemoryConversationStore implements ConversationStore<"synchronous"> {
  readonly operationMode = "synchronous";
  private readonly states = new Map<string, ConversationState>();

  create(state: Readonly<ConversationState>): ConversationStoreResult {
    const decoded = decodeConversationState(state, state);
    if (decoded.status === "failure") {
      return {
        status: "failure",
        reason: "InvalidConversationState",
        errors: decoded.errors,
      };
    }
    const candidate = decoded.state;
    const key = scopeKey(candidate);
    if (this.states.has(key)) {
      return failure(
        "ConversationAlreadyExists",
        "Conversation already exists.",
      );
    }
    const stored = cloneConversationState(candidate);
    this.states.set(key, stored);
    return { status: "success", state: cloneConversationState(stored) };
  }

  read(
    scope: Readonly<ConversationStoreScope>,
  ): ConversationStoreResult {
    const state = this.states.get(scopeKey(scope));
    if (!state) {
      return failure(
        "ConversationNotFound",
        "Conversation was not found in the requested business scope.",
      );
    }
    return { status: "success", state: cloneConversationState(state) };
  }

  replace(
    input: Readonly<ConversationStoreReplaceInput>,
  ): ConversationStoreResult {
    const key = scopeKey(input.scope);
    const existing = this.states.get(key);
    if (!existing) {
      return failure(
        "ConversationNotFound",
        "Conversation cannot be replaced in the requested business scope.",
      );
    }
    if (!matchesScope(input.state, input.scope)) {
      return failure(
        "ScopeMismatch",
        "Replacement state does not match the requested business scope.",
      );
    }
    if (
      !Number.isInteger(input.expectedRevision)
      || input.expectedRevision < 0
      || input.state.revision !== input.expectedRevision + 1
    ) {
      return failure(
        "InvalidRevisionIncrement",
        "Replacement state must advance the expected revision exactly once.",
      );
    }
    if (existing.revision !== input.expectedRevision) {
      return failure(
        "RevisionConflict",
        "Conversation revision does not match the expected revision.",
      );
    }
    const decoded = decodeConversationState(input.state, input.scope);
    if (decoded.status === "failure") {
      return {
        status: "failure",
        reason: "InvalidConversationState",
        errors: decoded.errors,
      };
    }
    const stored = cloneConversationState(decoded.state);
    this.states.set(key, stored);
    return { status: "success", state: cloneConversationState(stored) };
  }
}

function scopeKey(scope: Readonly<ConversationStoreScope>): string {
  return JSON.stringify([
    scope.businessProfileId,
    scope.businessProfileVersion,
    scope.conversationId,
  ]);
}

function matchesScope(
  state: Readonly<ConversationState>,
  scope: Readonly<ConversationStoreScope>,
): boolean {
  return state.conversationId === scope.conversationId
    && state.businessProfileId === scope.businessProfileId
    && state.businessProfileVersion === scope.businessProfileVersion;
}

function failure(
  reason: ConversationStoreFailureReason,
  error: string,
): ConversationStoreResult {
  return { status: "failure", reason, errors: [error] };
}
