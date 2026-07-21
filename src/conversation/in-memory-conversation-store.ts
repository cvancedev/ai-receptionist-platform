import type { ConversationState } from "../domain/conversation-state";
import { cloneConversationState } from "./conversation-state-updates";

export type StoreResult =
  | { status: "success"; state: ConversationState }
  | { status: "failure"; errors: readonly string[] };

/** Prototype-only in-memory storage. It performs no persistence or network work. */
export class InMemoryConversationStore {
  private readonly states = new Map<string, ConversationState>();

  create(state: ConversationState): StoreResult {
    if (this.states.has(state.conversationId)) {
      return { status: "failure", errors: ["Conversation already exists."] };
    }
    const stored = cloneConversationState(state);
    this.states.set(state.conversationId, stored);
    return { status: "success", state: cloneConversationState(stored) };
  }

  read(conversationId: string, businessProfileId: string): StoreResult {
    const state = this.states.get(conversationId);
    if (!state || state.businessProfileId !== businessProfileId) {
      return { status: "failure", errors: ["Conversation was not found in the requested business scope."] };
    }
    return { status: "success", state: cloneConversationState(state) };
  }

  replace(state: ConversationState, businessProfileId: string): StoreResult {
    const existing = this.states.get(state.conversationId);
    if (!existing || existing.businessProfileId !== businessProfileId) {
      return { status: "failure", errors: ["Conversation cannot be replaced in the requested business scope."] };
    }
    const stored = cloneConversationState(state);
    this.states.set(state.conversationId, stored);
    return { status: "success", state: cloneConversationState(stored) };
  }

  exists(conversationId: string): boolean {
    return this.states.has(conversationId);
  }

  clear(): void {
    this.states.clear();
  }
}
