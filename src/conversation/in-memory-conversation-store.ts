import type { ConversationState } from "../domain/conversation-state";
import type {
  ConversationStore,
  ConversationStoreFailureReason,
  ConversationStoreReplaceInput,
  ConversationStoreResult,
  ConversationStoreScope,
} from "./conversation-store";
import { cloneConversationState } from "./conversation-state-updates";

/** Prototype-only in-memory storage. It performs no persistence or network work. */
export class InMemoryConversationStore implements ConversationStore {
  private readonly states = new Map<string, ConversationState>();

  create(state: Readonly<ConversationState>): ConversationStoreResult {
    if (this.states.has(state.conversationId)) {
      return failure(
        "ConversationAlreadyExists",
        "Conversation already exists.",
      );
    }
    const stored = cloneConversationState(state);
    this.states.set(state.conversationId, stored);
    return { status: "success", state: cloneConversationState(stored) };
  }

  read(
    scope: Readonly<ConversationStoreScope>,
  ): ConversationStoreResult {
    const state = this.states.get(scope.conversationId);
    if (!state || !matchesScope(state, scope)) {
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
    const existing = this.states.get(input.scope.conversationId);
    if (!existing || !matchesScope(existing, input.scope)) {
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
    const stored = cloneConversationState(input.state);
    this.states.set(input.scope.conversationId, stored);
    return { status: "success", state: cloneConversationState(stored) };
  }
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
