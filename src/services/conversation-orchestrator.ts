import type { ConversationState } from "../domain/conversation-state";

export interface ConversationTurnRequest {
  conversationState: ConversationState;
  customerMessage: string;
}

export interface ConversationTurnResult {
  conversationState: ConversationState;
  customerResponse: string;
}

/** Coordinates validated services for one customer turn. */
export interface ConversationOrchestrator {
  // TODO: Coordinate the prototype layers after their behavior is implemented.
  processTurn(request: ConversationTurnRequest): Promise<ConversationTurnResult>;
}
