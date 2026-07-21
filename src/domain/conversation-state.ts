import type {
  CompletionState,
  ConversationStage,
  EscalationState,
} from "../shared/constants";

export interface ConversationCorrection {
  field: string;
  previousValue: string;
  correctedValue: string;
  source: string;
  sequence: number;
  reason?: string;
}

export interface CustomerClaim {
  field: string;
  value: string;
  source: string;
  sequence: number;
}

export interface ConfirmedFact {
  field: string;
  value: string;
  source: string;
  sequence: number;
}

export interface ConversationEscalation {
  status: EscalationState;
  reason: string | null;
  triggerSource: string | null;
  destination: string | null;
}

export interface ConversationFinalSnapshot {
  stage: ConversationStage;
  confirmedFacts: Readonly<Record<string, ConfirmedFact>>;
  customerClaims: readonly CustomerClaim[];
  corrections: readonly ConversationCorrection[];
  missingFields: readonly string[];
  askedQuestions: readonly string[];
  escalationStatus: EscalationState;
  completionStatus: CompletionState;
  revision: number;
}

export interface ConversationState {
  conversationId: string;
  businessProfileId: string;
  businessProfileVersion: number;
  authorizedEscalationDestination: string | null;
  revision: number;
  stage: ConversationStage;
  confirmedFacts: Readonly<Record<string, ConfirmedFact>>;
  customerClaims: readonly CustomerClaim[];
  corrections: readonly ConversationCorrection[];
  missingFields: readonly string[];
  askedQuestions: readonly string[];
  escalation: ConversationEscalation;
  completionState: CompletionState;
  finalSnapshot: ConversationFinalSnapshot | null;
}
