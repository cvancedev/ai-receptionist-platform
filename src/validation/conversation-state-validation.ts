import type { ConversationState } from "../domain/conversation-state";
import { createPlaceholderValidationResult } from "./types";

export function validateConversationState(conversationState: ConversationState) {
  // TODO: Enforce state and evidence invariants in a later milestone.
  void conversationState;
  return createPlaceholderValidationResult();
}
