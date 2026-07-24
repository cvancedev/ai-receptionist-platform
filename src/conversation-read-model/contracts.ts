import type {
  CompletionState,
  ConversationStage,
  EscalationState,
} from "../shared/constants";

export const CONVERSATION_READ_MODEL_ACTIONS = {
  BEGIN_INTAKE: "begin_intake",
  ASK_REQUIRED_FIELD: "ask_required_field",
  CLARIFY_SERVICE: "clarify_service",
  REVIEW_ESCALATION: "review_escalation",
  INTAKE_COMPLETE: "intake_complete",
  NONE: "none",
} as const;

export type ConversationReadModelAction =
  (typeof CONVERSATION_READ_MODEL_ACTIONS)[keyof typeof CONVERSATION_READ_MODEL_ACTIONS];

export interface ConversationReadModelIdentity {
  readonly conversationId: string;
  readonly businessProfileId: string;
  readonly businessProfileVersion: number;
}

export interface ConversationReadModelFact {
  readonly field: string;
  readonly value: string;
  readonly source: string;
  readonly sequence: number;
}

export interface ConversationReadModelCorrection {
  readonly field: string;
  readonly previousValue: string;
  readonly correctedValue: string;
  readonly source: string;
  readonly sequence: number;
  readonly reason: string | null;
}

export interface ConversationReadModelEscalation {
  readonly status: EscalationState;
  readonly reason: string | null;
}

export type ConversationCompletionProgress =
  | {
      readonly status: "not-applicable";
      readonly satisfiedRequiredFields: 0;
      readonly totalRequiredFields: 0;
      readonly percentage: null;
    }
  | {
      readonly status: "tracked";
      readonly satisfiedRequiredFields: number;
      readonly totalRequiredFields: number;
      readonly percentage: number;
    };

export interface ConversationReadModelStatus {
  readonly isEscalated: boolean;
  readonly isComplete: boolean;
  readonly canReleaseToCustomer: false;
}

export interface ConversationReadModelMetadata {
  readonly schemaVersion: 1;
  readonly sourceRevision: number;
  readonly projectionMode: "deterministic";
}

export interface ConversationReadModel {
  readonly identity: ConversationReadModelIdentity;
  readonly stage: ConversationStage;
  readonly revision: number;
  readonly resolvedServiceId: string | null;
  readonly collectedFacts: readonly ConversationReadModelFact[];
  readonly corrections: readonly ConversationReadModelCorrection[];
  readonly missingRequiredFields: readonly string[];
  readonly askedQuestions: readonly string[];
  readonly escalation: ConversationReadModelEscalation;
  readonly completionStatus: CompletionState;
  readonly status: ConversationReadModelStatus;
  readonly recommendedNextAction: ConversationReadModelAction;
  readonly completionProgress: ConversationCompletionProgress;
  readonly metadata: ConversationReadModelMetadata;
}

export interface ConversationReadModelProjectionContext {
  readonly requiredFieldIds: readonly string[];
  readonly resolvedServiceId: string | null;
}

export type ConversationReadModelProjectionResult =
  | {
      readonly status: "success";
      readonly readModel: ConversationReadModel;
    }
  | {
      readonly status: "failure";
      readonly errors: readonly string[];
    };
