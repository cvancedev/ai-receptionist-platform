import type { ConversationState } from "../domain/conversation-state";
import type { HandoffSummary } from "../domain/handoff-summary";

/** Creates a concise staff handoff from validated conversation state. */
export interface HandoffBuilder {
  // TODO: Implement deterministic handoff construction in a later milestone.
  build(conversationState: ConversationState): HandoffSummary;
}
