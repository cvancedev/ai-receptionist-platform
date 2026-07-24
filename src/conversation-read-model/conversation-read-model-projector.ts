import type {
  ConfirmedFact,
  ConversationCorrection,
  ConversationFinalSnapshot,
  ConversationState,
  CustomerClaim,
} from "../domain/conversation-state";
import type {
  CompletionState,
  ConversationStage,
  EscalationState,
} from "../shared/constants";
import {
  COMPLETION_STATES,
  CONVERSATION_STAGES,
  ESCALATION_STATES,
} from "../shared/constants";
import { validateConversationState } from "../validation/conversation-state-validation";
import {
  CONVERSATION_READ_MODEL_ACTIONS,
  type ConversationCompletionProgress,
  type ConversationReadModel,
  type ConversationReadModelAction,
  type ConversationReadModelProjectionContext,
  type ConversationReadModelProjectionResult,
} from "./contracts";

const ACTIVE_ESCALATION_STATES: readonly EscalationState[] = [
  ESCALATION_STATES.REQUIRED,
  ESCALATION_STATES.REQUESTED_BY_CUSTOMER,
  ESCALATION_STATES.IN_PROGRESS,
  ESCALATION_STATES.HANDED_OFF,
];

const REVIEWABLE_ESCALATION_STATES: readonly EscalationState[] = [
  ESCALATION_STATES.RECOMMENDED,
  ESCALATION_STATES.REQUIRED,
  ESCALATION_STATES.REQUESTED_BY_CUSTOMER,
  ESCALATION_STATES.IN_PROGRESS,
];

export class ConversationReadModelProjector {
  project(
    stateInput: unknown,
    contextInput: unknown,
  ): ConversationReadModelProjectionResult {
    const inputErrors = validateProjectionInput(stateInput, contextInput);
    if (inputErrors.length > 0) {
      return deepFreeze({
        status: "failure",
        errors: [...inputErrors],
      });
    }

    const state = stateInput as ConversationState;
    const context = contextInput as ConversationReadModelProjectionContext;
    const stateValidation = validateConversationState(state);
    const projectionErrors = validateProjectionConsistency(
      state,
      context,
    );
    const errors = [...stateValidation.errors, ...projectionErrors];
    if (errors.length > 0) {
      return deepFreeze({ status: "failure", errors });
    }

    const readModel: ConversationReadModel = {
      identity: {
        conversationId: state.conversationId,
        businessProfileId: state.businessProfileId,
        businessProfileVersion: state.businessProfileVersion,
      },
      stage: state.stage,
      revision: state.revision,
      resolvedServiceId: context.resolvedServiceId,
      collectedFacts: Object.values(state.confirmedFacts)
        .map((fact) => ({ ...fact }))
        .sort(compareSequencedFields),
      corrections: state.corrections
        .map((correction) => ({
          field: correction.field,
          previousValue: correction.previousValue,
          correctedValue: correction.correctedValue,
          source: correction.source,
          sequence: correction.sequence,
          reason: correction.reason ?? null,
        }))
        .sort(compareSequencedFields),
      missingRequiredFields: [...state.missingFields],
      askedQuestions: [...state.askedQuestions],
      escalation: {
        status: state.escalation.status,
        reason: state.escalation.reason,
      },
      completionStatus: state.completionState,
      status: {
        isEscalated: ACTIVE_ESCALATION_STATES.includes(
          state.escalation.status,
        ),
        isComplete: state.completionState === COMPLETION_STATES.COMPLETED,
        canReleaseToCustomer: false,
      },
      recommendedNextAction: deriveRecommendedNextAction(
        state,
        context.resolvedServiceId,
      ),
      completionProgress: deriveCompletionProgress(
        state,
        context.requiredFieldIds,
      ),
      metadata: {
        schemaVersion: 1,
        sourceRevision: state.revision,
        projectionMode: "deterministic",
      },
    };

    return deepFreeze({ status: "success", readModel });
  }
}

function validateProjectionInput(
  state: unknown,
  context: unknown,
): readonly string[] {
  const errors: string[] = [];
  if (!isConversationState(state)) {
    errors.push("Conversation state snapshot is malformed.");
  }
  if (
    !isRecord(context)
    || !isStringArray(context.requiredFieldIds)
    || context.requiredFieldIds.some((field) => !field.trim())
    || new Set(context.requiredFieldIds).size !== context.requiredFieldIds.length
    || (
      context.resolvedServiceId !== null
      && !isNonEmptyString(context.resolvedServiceId)
    )
  ) {
    errors.push("Conversation read-model projection context is malformed.");
  }
  return errors;
}

function validateProjectionConsistency(
  state: ConversationState,
  context: ConversationReadModelProjectionContext,
): readonly string[] {
  const { requiredFieldIds, resolvedServiceId } = context;
  const required = new Set(requiredFieldIds);
  const errors: string[] = [];
  const unknownMissing = state.missingFields.filter(
    (field) => !required.has(field),
  );
  if (unknownMissing.length > 0) {
    errors.push("Missing required fields are outside the projection context.");
  }
  const contradictory = requiredFieldIds.filter(
    (field) =>
      Boolean(state.confirmedFacts[field])
      && state.missingFields.includes(field),
  );
  if (contradictory.length > 0) {
    errors.push("A required field cannot be both confirmed and missing.");
  }
  const unrepresentedRequired = requiredFieldIds.filter(
    (field) =>
      !state.confirmedFacts[field]
      && !state.missingFields.includes(field),
  );
  if (unrepresentedRequired.length > 0) {
    errors.push("A required field is neither confirmed nor missing.");
  }
  const requestedService = state.confirmedFacts["requested-service"]?.value;
  if (
    resolvedServiceId !== null
    && requestedService !== resolvedServiceId
  ) {
    errors.push("Resolved service does not match confirmed conversation state.");
  }
  return errors;
}

function deriveCompletionProgress(
  state: ConversationState,
  requiredFieldIds: readonly string[],
): ConversationCompletionProgress {
  if (requiredFieldIds.length === 0) {
    return {
      status: "not-applicable",
      satisfiedRequiredFields: 0,
      totalRequiredFields: 0,
      percentage: null,
    };
  }
  const satisfiedRequiredFields = requiredFieldIds.filter(
    (field) => Boolean(state.confirmedFacts[field]),
  ).length;
  const percentage = Math.max(
    0,
    Math.min(
      100,
      Math.trunc((satisfiedRequiredFields * 100) / requiredFieldIds.length),
    ),
  );
  return {
    status: "tracked",
    satisfiedRequiredFields,
    totalRequiredFields: requiredFieldIds.length,
    percentage,
  };
}

function deriveRecommendedNextAction(
  state: ConversationState,
  resolvedServiceId: string | null,
): ConversationReadModelAction {
  if (REVIEWABLE_ESCALATION_STATES.includes(state.escalation.status)) {
    return CONVERSATION_READ_MODEL_ACTIONS.REVIEW_ESCALATION;
  }
  if (
    state.completionState === COMPLETION_STATES.COMPLETED
    || state.completionState === COMPLETION_STATES.READY_FOR_CONFIRMATION
    || state.completionState === COMPLETION_STATES.READY_FOR_HANDOFF
    || state.stage === CONVERSATION_STAGES.HANDOFF
  ) {
    return CONVERSATION_READ_MODEL_ACTIONS.INTAKE_COMPLETE;
  }
  if (
    state.stage === CONVERSATION_STAGES.ABANDONED
    || state.completionState === COMPLETION_STATES.ABANDONED
  ) {
    return CONVERSATION_READ_MODEL_ACTIONS.NONE;
  }
  if (state.stage === CONVERSATION_STAGES.INITIALIZED) {
    return CONVERSATION_READ_MODEL_ACTIONS.BEGIN_INTAKE;
  }
  if (
    state.stage === CONVERSATION_STAGES.CLARIFICATION
    && !resolvedServiceId
  ) {
    return CONVERSATION_READ_MODEL_ACTIONS.CLARIFY_SERVICE;
  }
  if (state.missingFields.length > 0) {
    return CONVERSATION_READ_MODEL_ACTIONS.ASK_REQUIRED_FIELD;
  }
  return CONVERSATION_READ_MODEL_ACTIONS.NONE;
}

function compareSequencedFields(
  first: { readonly sequence: number; readonly field: string },
  second: { readonly sequence: number; readonly field: string },
) {
  if (first.sequence !== second.sequence) {
    return first.sequence - second.sequence;
  }
  if (first.field === second.field) return 0;
  return first.field < second.field ? -1 : 1;
}

function isConversationState(value: unknown): value is ConversationState {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.conversationId)
    && isNonEmptyString(value.businessProfileId)
    && isPositiveInteger(value.businessProfileVersion)
    && (value.authorizedEscalationDestination === null
      || isNonEmptyString(value.authorizedEscalationDestination))
    && isNonNegativeInteger(value.revision)
    && isConversationStage(value.stage)
    && isConfirmedFactRecord(value.confirmedFacts)
    && Array.isArray(value.customerClaims)
    && value.customerClaims.every(isCustomerClaim)
    && Array.isArray(value.corrections)
    && value.corrections.every(isConversationCorrection)
    && isStringArray(value.missingFields)
    && isStringArray(value.askedQuestions)
    && isConversationEscalation(value.escalation)
    && isCompletionState(value.completionState)
    && (value.finalSnapshot === null
      || isConversationFinalSnapshot(value.finalSnapshot))
  );
}

function isConfirmedFactRecord(
  value: unknown,
): value is Readonly<Record<string, ConfirmedFact>> {
  return (
    isRecord(value)
    && Object.entries(value).every(
      ([field, fact]) => isConfirmedFact(fact) && fact.field === field,
    )
  );
}

function isConfirmedFact(value: unknown): value is ConfirmedFact {
  return (
    isRecord(value)
    && isNonEmptyString(value.field)
    && isNonEmptyString(value.value)
    && isNonEmptyString(value.source)
    && isNonNegativeInteger(value.sequence)
  );
}

function isCustomerClaim(value: unknown): value is CustomerClaim {
  return (
    isRecord(value)
    && isNonEmptyString(value.field)
    && isNonEmptyString(value.value)
    && isNonEmptyString(value.source)
    && isNonNegativeInteger(value.sequence)
  );
}

function isConversationCorrection(
  value: unknown,
): value is ConversationCorrection {
  return (
    isRecord(value)
    && isNonEmptyString(value.field)
    && isNonEmptyString(value.previousValue)
    && isNonEmptyString(value.correctedValue)
    && isNonEmptyString(value.source)
    && isNonNegativeInteger(value.sequence)
    && (value.reason === undefined || typeof value.reason === "string")
  );
}

function isConversationEscalation(value: unknown): boolean {
  return (
    isRecord(value)
    && isEscalationState(value.status)
    && isNullableString(value.reason)
    && isNullableString(value.triggerSource)
    && isNullableString(value.destination)
  );
}

function isConversationFinalSnapshot(
  value: unknown,
): value is ConversationFinalSnapshot {
  return (
    isRecord(value)
    && isConversationStage(value.stage)
    && isConfirmedFactRecord(value.confirmedFacts)
    && Array.isArray(value.customerClaims)
    && value.customerClaims.every(isCustomerClaim)
    && Array.isArray(value.corrections)
    && value.corrections.every(isConversationCorrection)
    && isStringArray(value.missingFields)
    && isStringArray(value.askedQuestions)
    && isEscalationState(value.escalationStatus)
    && isCompletionState(value.completionStatus)
    && isNonNegativeInteger(value.revision)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
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
