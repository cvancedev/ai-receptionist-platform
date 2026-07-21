import type { ConversationState } from "../domain/conversation-state";
import type { ModelProposal } from "../domain/model-proposal";
import type { ValidationResult } from "./types";

/** Authorizes or rejects proposed output before it can affect a conversation. */
export interface OutputValidator {
  // TODO: Implement output contract enforcement in a later milestone.
  validate(
    proposal: ModelProposal,
    conversationState: ConversationState,
  ): ValidationResult;
}
