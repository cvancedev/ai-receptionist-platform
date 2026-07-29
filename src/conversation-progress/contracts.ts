import type {
  CompletionState,
  ConversationStage,
  EscalationState,
} from "../shared/constants";

export const CONVERSATION_PROGRESS_DECISIONS = {
  BEGIN_INTAKE: "begin_intake",
  ASK_REQUIRED_FIELD: "ask_required_field",
  CLARIFY_SERVICE: "clarify_service",
  REVIEW_ESCALATION: "review_escalation",
  INTAKE_COMPLETE: "intake_complete",
  NONE: "none",
} as const;

export type ConversationProgressDecisionType =
  (typeof CONVERSATION_PROGRESS_DECISIONS)[keyof typeof CONVERSATION_PROGRESS_DECISIONS];

export const CONVERSATION_PROGRESS_SERVICE_STATUSES = {
  UNRESOLVED: "unresolved",
  AMBIGUOUS: "ambiguous",
  RESOLVED: "resolved",
  UNSUPPORTED: "unsupported",
} as const;

export type ConversationProgressServiceStatus =
  (typeof CONVERSATION_PROGRESS_SERVICE_STATUSES)[keyof typeof CONVERSATION_PROGRESS_SERVICE_STATUSES];

export type ConversationProgressServiceContext =
  | {
      readonly status: "resolved";
      readonly resolvedServiceId: string;
    }
  | {
      readonly status: "unresolved" | "ambiguous" | "unsupported";
      readonly resolvedServiceId: null;
    };

export type UnsupportedServiceProgressDecision =
  | "review_escalation"
  | "none";

export interface ConversationProgressPolicy {
  readonly policyVersion: 1;
  readonly unsupportedServiceDecision: UnsupportedServiceProgressDecision;
}

export const DEFAULT_CONVERSATION_PROGRESS_POLICY:
Readonly<ConversationProgressPolicy> = Object.freeze({
  policyVersion: 1,
  unsupportedServiceDecision:
    CONVERSATION_PROGRESS_DECISIONS.REVIEW_ESCALATION,
});

export interface ConversationProgressInput {
  readonly conversationId: string;
  readonly businessProfileId: string;
  readonly businessProfileVersion: number;
  readonly revision: number;
  readonly stage: ConversationStage;
  readonly serviceResolution: ConversationProgressServiceContext;
  readonly requiredFieldIds: readonly string[];
  readonly satisfiedRequiredFieldIds: readonly string[];
  readonly missingRequiredFieldIds: readonly string[];
  readonly reopenedRequiredFieldIds: readonly string[];
  readonly escalationState: EscalationState;
  readonly completionState: CompletionState;
  readonly completionEligible: boolean;
  readonly policy: Readonly<ConversationProgressPolicy>;
}

export const CONVERSATION_PROGRESS_REASONS = {
  INITIALIZED_CONVERSATION: "initialized-conversation",
  REQUIRED_FIELD_UNRESOLVED: "required-field-unresolved",
  SERVICE_CLARIFICATION_REQUIRED: "service-clarification-required",
  ESCALATION_REVIEW_REQUIRED: "escalation-review-required",
  INTAKE_REQUIREMENTS_SATISFIED: "intake-requirements-satisfied",
  NO_APPLICABLE_PROGRESS: "no-applicable-progress",
} as const;

export type ConversationProgressReason =
  (typeof CONVERSATION_PROGRESS_REASONS)[keyof typeof CONVERSATION_PROGRESS_REASONS];

export interface ConversationProgressDecision {
  readonly decision: ConversationProgressDecisionType;
  readonly reason: ConversationProgressReason;
  readonly stateMutationAuthorized: false;
  readonly transitionExecutionAuthorized: false;
  readonly customerReleaseAuthorized: false;
  readonly metadata: Readonly<{
    policyVersion: 1;
    sourceRevision: number;
    evaluationMode: "deterministic";
  }>;
}

export const CONVERSATION_PROGRESS_FAILURES = {
  MALFORMED_INPUT: "MalformedProgressInput",
  INVALID_POLICY: "InvalidProgressPolicy",
  CONTRADICTORY_REQUIRED_FIELDS: "ContradictoryRequiredFields",
  INVALID_SERVICE_RESOLUTION: "InvalidServiceResolution",
  INVALID_COMPLETION_ELIGIBILITY: "InvalidCompletionEligibility",
} as const;

export type ConversationProgressFailure =
  (typeof CONVERSATION_PROGRESS_FAILURES)[keyof typeof CONVERSATION_PROGRESS_FAILURES];

export type ConversationProgressResult =
  | {
      readonly status: "success";
      readonly value: Readonly<ConversationProgressDecision>;
    }
  | {
      readonly status: "failure";
      readonly failures: readonly ConversationProgressFailure[];
      readonly errors: readonly string[];
    };
