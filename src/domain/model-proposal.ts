export type ProposedAction =
  | "ask-question"
  | "provide-answer"
  | "clarify"
  | "confirm"
  | "escalate"
  | "summarize"
  | "close"
  | "wait";

export interface ProposedStateUpdate {
  field: string;
  value: unknown;
}

export interface EscalationRecommendation {
  recommended: boolean;
  reason?: string;
}

export interface CompletionRecommendation {
  recommended: boolean;
  missingFields: readonly string[];
}

/** Untrusted model output that requires application validation before use. */
export interface ModelProposal {
  customerResponse: string;
  proposedStateUpdates: readonly ProposedStateUpdate[];
  proposedAction: ProposedAction;
  escalationRecommendation: EscalationRecommendation;
  completionRecommendation: CompletionRecommendation;
}
