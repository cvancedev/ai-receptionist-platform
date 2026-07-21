import type {
  CompletionState,
  ConversationStage,
  EscalationState,
} from "../shared/constants";

export interface ConversationCorrection {
  field: string;
  previousValue: string;
  correctedValue: string;
}

export interface ConversationState {
  conversationId: string;
  businessProfileId: string;
  businessProfileVersion: number;
  stage: ConversationStage;
  confirmedFacts: Readonly<Record<string, string>>;
  customerClaims: Readonly<Record<string, string>>;
  corrections: readonly ConversationCorrection[];
  missingFields: readonly string[];
  askedQuestions: readonly string[];
  escalationState: EscalationState;
  completionState: CompletionState;
}
