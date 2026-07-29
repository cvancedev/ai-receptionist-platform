import {
  COMPLETION_STATES,
  CONVERSATION_STAGES,
  ESCALATION_STATES,
  type CompletionState,
  type ConversationStage,
  type EscalationState,
} from "../shared/constants";
import {
  CONVERSATION_PROGRESS_DECISIONS,
  CONVERSATION_PROGRESS_FAILURES,
  CONVERSATION_PROGRESS_REASONS,
  CONVERSATION_PROGRESS_SERVICE_STATUSES,
  type ConversationProgressDecision,
  type ConversationProgressDecisionType,
  type ConversationProgressFailure,
  type ConversationProgressInput,
  type ConversationProgressPolicy,
  type ConversationProgressReason,
  type ConversationProgressResult,
  type ConversationProgressServiceContext,
} from "./contracts";

const INPUT_KEYS = [
  "conversationId",
  "businessProfileId",
  "businessProfileVersion",
  "revision",
  "stage",
  "serviceResolution",
  "requiredFieldIds",
  "satisfiedRequiredFieldIds",
  "missingRequiredFieldIds",
  "reopenedRequiredFieldIds",
  "escalationState",
  "completionState",
  "completionEligible",
  "policy",
] as const;

const REVIEWABLE_ESCALATION_STATES: readonly EscalationState[] = [
  ESCALATION_STATES.RECOMMENDED,
  ESCALATION_STATES.REQUIRED,
  ESCALATION_STATES.REQUESTED_BY_CUSTOMER,
  ESCALATION_STATES.IN_PROGRESS,
];

const COMPLETION_READY_STATES: readonly CompletionState[] = [
  COMPLETION_STATES.READY_FOR_CONFIRMATION,
  COMPLETION_STATES.READY_FOR_HANDOFF,
  COMPLETION_STATES.COMPLETED,
];

export class DeterministicConversationProgressEngine {
  evaluate(input: unknown): ConversationProgressResult {
    const validation = validateProgressInput(input);
    if (validation.status === "failure") return validation.result;
    const trusted = validation.input;

    if (REVIEWABLE_ESCALATION_STATES.includes(trusted.escalationState)) {
      return success(
        trusted,
        CONVERSATION_PROGRESS_DECISIONS.REVIEW_ESCALATION,
        CONVERSATION_PROGRESS_REASONS.ESCALATION_REVIEW_REQUIRED,
      );
    }
    if (trusted.completionEligible) {
      return success(
        trusted,
        CONVERSATION_PROGRESS_DECISIONS.INTAKE_COMPLETE,
        CONVERSATION_PROGRESS_REASONS.INTAKE_REQUIREMENTS_SATISFIED,
      );
    }
    if (
      trusted.stage === CONVERSATION_STAGES.ABANDONED
      || trusted.completionState === COMPLETION_STATES.ABANDONED
    ) {
      return success(
        trusted,
        CONVERSATION_PROGRESS_DECISIONS.NONE,
        CONVERSATION_PROGRESS_REASONS.NO_APPLICABLE_PROGRESS,
      );
    }
    if (trusted.stage === CONVERSATION_STAGES.INITIALIZED) {
      return success(
        trusted,
        CONVERSATION_PROGRESS_DECISIONS.BEGIN_INTAKE,
        CONVERSATION_PROGRESS_REASONS.INITIALIZED_CONVERSATION,
      );
    }
    if (
      trusted.serviceResolution.status
        === CONVERSATION_PROGRESS_SERVICE_STATUSES.UNSUPPORTED
    ) {
      return trusted.policy.unsupportedServiceDecision
        === CONVERSATION_PROGRESS_DECISIONS.REVIEW_ESCALATION
        ? success(
            trusted,
            CONVERSATION_PROGRESS_DECISIONS.REVIEW_ESCALATION,
            CONVERSATION_PROGRESS_REASONS.ESCALATION_REVIEW_REQUIRED,
          )
        : success(
            trusted,
            CONVERSATION_PROGRESS_DECISIONS.NONE,
            CONVERSATION_PROGRESS_REASONS.NO_APPLICABLE_PROGRESS,
          );
    }
    if (
      trusted.serviceResolution.status
        === CONVERSATION_PROGRESS_SERVICE_STATUSES.UNRESOLVED
      || trusted.serviceResolution.status
        === CONVERSATION_PROGRESS_SERVICE_STATUSES.AMBIGUOUS
    ) {
      return success(
        trusted,
        CONVERSATION_PROGRESS_DECISIONS.CLARIFY_SERVICE,
        CONVERSATION_PROGRESS_REASONS.SERVICE_CLARIFICATION_REQUIRED,
      );
    }
    if (
      trusted.missingRequiredFieldIds.length > 0
      || trusted.reopenedRequiredFieldIds.length > 0
    ) {
      return success(
        trusted,
        CONVERSATION_PROGRESS_DECISIONS.ASK_REQUIRED_FIELD,
        CONVERSATION_PROGRESS_REASONS.REQUIRED_FIELD_UNRESOLVED,
      );
    }
    return success(
      trusted,
      CONVERSATION_PROGRESS_DECISIONS.NONE,
      CONVERSATION_PROGRESS_REASONS.NO_APPLICABLE_PROGRESS,
    );
  }
}

type ProgressInputValidation =
  | { status: "success"; input: ConversationProgressInput }
  | { status: "failure"; result: ConversationProgressResult };

function validateProgressInput(input: unknown): ProgressInputValidation {
  if (
    !isPlainRecord(input)
    || !hasOnlyKeys(input, INPUT_KEYS)
    || !isNonEmptyString(input.conversationId)
    || !isNonEmptyString(input.businessProfileId)
    || !isPositiveInteger(input.businessProfileVersion)
    || !isNonNegativeInteger(input.revision)
    || !isConversationStage(input.stage)
    || !isStringArray(input.requiredFieldIds)
    || !isStringArray(input.satisfiedRequiredFieldIds)
    || !isStringArray(input.missingRequiredFieldIds)
    || !isStringArray(input.reopenedRequiredFieldIds)
    || !isEscalationState(input.escalationState)
    || !isCompletionState(input.completionState)
    || typeof input.completionEligible !== "boolean"
  ) {
    return failure(
      CONVERSATION_PROGRESS_FAILURES.MALFORMED_INPUT,
      "Progress input does not match the trusted application contract.",
    );
  }

  if (!isProgressPolicy(input.policy)) {
    return failure(
      CONVERSATION_PROGRESS_FAILURES.INVALID_POLICY,
      "Progress policy is unsupported or malformed.",
    );
  }
  if (!isServiceContext(input.serviceResolution)) {
    return failure(
      CONVERSATION_PROGRESS_FAILURES.INVALID_SERVICE_RESOLUTION,
      "Service-resolution context is contradictory or malformed.",
    );
  }

  const required = input.requiredFieldIds;
  const satisfied = input.satisfiedRequiredFieldIds;
  const missing = input.missingRequiredFieldIds;
  const reopened = input.reopenedRequiredFieldIds;
  if (
    hasInvalidIdentifiers(required)
    || hasInvalidIdentifiers(satisfied)
    || hasInvalidIdentifiers(missing)
    || hasInvalidIdentifiers(reopened)
    || !isExactPartition(required, satisfied, missing)
    || !isSubset(reopened, missing)
  ) {
    return failure(
      CONVERSATION_PROGRESS_FAILURES.CONTRADICTORY_REQUIRED_FIELDS,
      "Required-field context is duplicated, incomplete, or contradictory.",
    );
  }

  const inputValue: ConversationProgressInput = {
    conversationId: input.conversationId,
    businessProfileId: input.businessProfileId,
    businessProfileVersion: input.businessProfileVersion,
    revision: input.revision,
    stage: input.stage,
    serviceResolution: input.serviceResolution,
    requiredFieldIds: required,
    satisfiedRequiredFieldIds: satisfied,
    missingRequiredFieldIds: missing,
    reopenedRequiredFieldIds: reopened,
    escalationState: input.escalationState,
    completionState: input.completionState,
    completionEligible: input.completionEligible,
    policy: input.policy,
  };
  if (!isCompletionConsistent(inputValue)) {
    return failure(
      CONVERSATION_PROGRESS_FAILURES.INVALID_COMPLETION_ELIGIBILITY,
      "Completion eligibility contradicts stage, service, escalation, or required fields.",
    );
  }
  return { status: "success", input: inputValue };
}

function isCompletionConsistent(input: ConversationProgressInput): boolean {
  const completionReady = COMPLETION_READY_STATES.includes(
    input.completionState,
  );
  if (completionReady && !input.completionEligible) return false;
  if (
    input.completionEligible
    && (
      input.serviceResolution.status
        !== CONVERSATION_PROGRESS_SERVICE_STATUSES.RESOLVED
      || input.missingRequiredFieldIds.length > 0
      || input.reopenedRequiredFieldIds.length > 0
      || input.escalationState === ESCALATION_STATES.REQUIRED
      || input.escalationState === ESCALATION_STATES.REQUESTED_BY_CUSTOMER
      || input.escalationState === ESCALATION_STATES.IN_PROGRESS
    )
  ) {
    return false;
  }
  if (
    input.stage === CONVERSATION_STAGES.COMPLETED
    && input.completionState !== COMPLETION_STATES.COMPLETED
  ) {
    return false;
  }
  if (
    input.completionState === COMPLETION_STATES.COMPLETED
    && input.stage !== CONVERSATION_STAGES.COMPLETED
  ) {
    return false;
  }
  if (
    input.stage === CONVERSATION_STAGES.ABANDONED
    && input.completionState !== COMPLETION_STATES.ABANDONED
  ) {
    return false;
  }
  if (
    input.completionState === COMPLETION_STATES.ABANDONED
    && input.stage !== CONVERSATION_STAGES.ABANDONED
  ) {
    return false;
  }
  return true;
}

function success(
  input: ConversationProgressInput,
  decision: ConversationProgressDecisionType,
  reason: ConversationProgressReason,
): ConversationProgressResult {
  const value: ConversationProgressDecision = {
    decision,
    reason,
    stateMutationAuthorized: false,
    transitionExecutionAuthorized: false,
    customerReleaseAuthorized: false,
    metadata: {
      policyVersion: input.policy.policyVersion,
      sourceRevision: input.revision,
      evaluationMode: "deterministic",
    },
  };
  return deepFreeze({ status: "success", value });
}

function failure(
  failureCode: ConversationProgressFailure,
  error: string,
): ProgressInputValidation {
  return {
    status: "failure",
    result: deepFreeze({
      status: "failure",
      failures: [failureCode],
      errors: [error],
    }),
  };
}

function isProgressPolicy(value: unknown): value is ConversationProgressPolicy {
  if (
    !isPlainRecord(value)
    || !hasOnlyKeys(value, ["policyVersion", "unsupportedServiceDecision"])
  ) {
    return false;
  }
  return (
    value.policyVersion === 1
    && (
      value.unsupportedServiceDecision
        === CONVERSATION_PROGRESS_DECISIONS.REVIEW_ESCALATION
      || value.unsupportedServiceDecision
        === CONVERSATION_PROGRESS_DECISIONS.NONE
    )
  );
}

function isServiceContext(
  value: unknown,
): value is ConversationProgressServiceContext {
  if (
    !isPlainRecord(value)
    || !hasOnlyKeys(value, ["status", "resolvedServiceId"])
    || !Object.values(CONVERSATION_PROGRESS_SERVICE_STATUSES).includes(
      value.status as ConversationProgressServiceContext["status"],
    )
  ) {
    return false;
  }
  return value.status === CONVERSATION_PROGRESS_SERVICE_STATUSES.RESOLVED
    ? isNonEmptyString(value.resolvedServiceId)
    : value.resolvedServiceId === null;
}

function hasInvalidIdentifiers(values: readonly string[]): boolean {
  return values.some((value) => !value.trim())
    || new Set(values).size !== values.length;
}

function isExactPartition(
  required: readonly string[],
  satisfied: readonly string[],
  missing: readonly string[],
): boolean {
  const requiredSet = new Set(required);
  const satisfiedSet = new Set(satisfied);
  const missingSet = new Set(missing);
  if (
    satisfied.some((field) => !requiredSet.has(field))
    || missing.some((field) => !requiredSet.has(field))
    || satisfied.some((field) => missingSet.has(field))
  ) {
    return false;
  }
  return required.every(
    (field) => satisfiedSet.has(field) || missingSet.has(field),
  );
}

function isSubset(
  subset: readonly string[],
  superset: readonly string[],
): boolean {
  const allowed = new Set(superset);
  return subset.every((value) => allowed.has(value));
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function hasOnlyKeys(
  value: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowed.includes(key))
    && allowed.every((key) => key in value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function isConversationStage(value: unknown): value is ConversationStage {
  return Object.values(CONVERSATION_STAGES).includes(
    value as ConversationStage,
  );
}

function isEscalationState(value: unknown): value is EscalationState {
  return Object.values(ESCALATION_STATES).includes(value as EscalationState);
}

function isCompletionState(value: unknown): value is CompletionState {
  return Object.values(COMPLETION_STATES).includes(value as CompletionState);
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}
