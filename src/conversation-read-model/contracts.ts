import type {
  CompletionState,
  ConversationStage,
  EscalationState,
} from "../shared/constants";
import {
  CONVERSATION_PROGRESS_DECISIONS,
  type ConversationProgressPolicy,
  type ConversationProgressServiceStatus,
} from "../conversation-progress/contracts";

export const CONVERSATION_READ_MODEL_ACTIONS = {
  BEGIN_INTAKE: CONVERSATION_PROGRESS_DECISIONS.BEGIN_INTAKE,
  ASK_REQUIRED_FIELD: CONVERSATION_PROGRESS_DECISIONS.ASK_REQUIRED_FIELD,
  CLARIFY_SERVICE: CONVERSATION_PROGRESS_DECISIONS.CLARIFY_SERVICE,
  REVIEW_ESCALATION: CONVERSATION_PROGRESS_DECISIONS.REVIEW_ESCALATION,
  INTAKE_COMPLETE: CONVERSATION_PROGRESS_DECISIONS.INTAKE_COMPLETE,
  NONE: CONVERSATION_PROGRESS_DECISIONS.NONE,
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
  readonly serviceResolutionStatus: ConversationProgressServiceStatus;
  readonly reopenedRequiredFieldIds: readonly string[];
  readonly completionEligible: boolean;
  readonly progressPolicy: Readonly<ConversationProgressPolicy>;
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
