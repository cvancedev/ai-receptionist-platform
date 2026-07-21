import type { ConversationState } from "../domain/conversation-state";
import type { ConversationScope } from "../conversation/conversation-state-updates";
import type { CompletionState, EscalationState } from "../shared/constants";
import {
  COMPLETION_STATES,
  CONVERSATION_STAGES,
  ESCALATION_STATES,
} from "../shared/constants";
import type { ValidationResult } from "./types";

export function validateConversationState(
  state: ConversationState,
  expectedScope?: ConversationScope,
): ValidationResult {
  const errors: string[] = [];

  if (!state.conversationId.trim()) errors.push("Conversation identifier is required.");
  if (!state.businessProfileId.trim()) errors.push("Business identifier is required.");
  if (!Number.isInteger(state.businessProfileVersion) || state.businessProfileVersion < 1) {
    errors.push("Business Profile version must be a positive integer.");
  }
  if (!Number.isInteger(state.revision) || state.revision < 0) {
    errors.push("Revision must be a non-negative integer.");
  }
  if (!Object.values(CONVERSATION_STAGES).includes(state.stage)) {
    errors.push("Conversation stage is invalid.");
  }
  if (!Object.values(ESCALATION_STATES).includes(state.escalation.status)) {
    errors.push("Escalation state is invalid.");
  }
  if (!Object.values(COMPLETION_STATES).includes(state.completionState)) {
    errors.push("Completion state is invalid.");
  }
  if (expectedScope) {
    if (state.conversationId !== expectedScope.conversationId) errors.push("Conversation scope does not match.");
    if (state.businessProfileId !== expectedScope.businessProfileId) errors.push("Business scope does not match.");
    if (state.businessProfileVersion !== expectedScope.businessProfileVersion) errors.push("Business Profile version does not match.");
  }
  addDuplicateErrors(state.missingFields, "missing field", errors);
  addDuplicateErrors(state.askedQuestions, "question identifier", errors);

  for (const [field, fact] of Object.entries(state.confirmedFacts)) {
    if (!field.trim() || fact.field !== field || !fact.value.trim() || !fact.source.trim()) {
      errors.push(`Confirmed fact '${field}' is structurally invalid.`);
    }
  }
  const latestCorrections = new Map<string, (typeof state.corrections)[number]>();
  for (const correction of state.corrections) {
    if (
      !correction.field.trim() ||
      !correction.previousValue.trim() ||
      !correction.correctedValue.trim() ||
      !correction.source.trim() ||
      correction.previousValue === correction.correctedValue
    ) {
      errors.push("Correction history contains an invalid entry.");
    } else {
      latestCorrections.set(correction.field, correction);
    }
  }
  for (const correction of latestCorrections.values()) {
    const currentFact = state.confirmedFacts[correction.field]?.value;
    const correctedClaimExists = state.customerClaims.some(
      (claim) =>
        claim.field === correction.field &&
        claim.value === correction.correctedValue &&
        claim.sequence >= correction.sequence,
    );
    if (
      (currentFact && currentFact !== correction.correctedValue) ||
      (!currentFact && !correctedClaimExists)
    ) {
      errors.push(`The latest value for '${correction.field}' does not reflect its correction.`);
    }
  }
  const completionRequiresNoMissing = ([
    COMPLETION_STATES.READY_FOR_CONFIRMATION,
    COMPLETION_STATES.READY_FOR_HANDOFF,
    COMPLETION_STATES.COMPLETED,
  ] as readonly CompletionState[]).includes(state.completionState);
  if (completionRequiresNoMissing && state.missingFields.length > 0) {
    errors.push("Completion readiness contradicts unresolved required fields.");
  }
  const unresolvedEscalation = ([
    ESCALATION_STATES.REQUIRED,
    ESCALATION_STATES.REQUESTED_BY_CUSTOMER,
    ESCALATION_STATES.IN_PROGRESS,
  ] as readonly EscalationState[]).includes(state.escalation.status);
  if (unresolvedEscalation && completionRequiresNoMissing) {
    errors.push("Completion readiness contradicts unresolved escalation.");
  }
  if (state.completionState === COMPLETION_STATES.COMPLETED && state.stage !== CONVERSATION_STAGES.COMPLETED) {
    errors.push("Completed state requires the completed stage.");
  }
  if (state.stage === CONVERSATION_STAGES.COMPLETED && state.completionState !== COMPLETION_STATES.COMPLETED) {
    errors.push("The completed stage requires completed state.");
  }
  if (state.completionState === COMPLETION_STATES.ABANDONED && state.stage !== CONVERSATION_STAGES.ABANDONED) {
    errors.push("Abandoned state requires the abandoned stage.");
  }
  if (state.stage === CONVERSATION_STAGES.ABANDONED && state.completionState !== COMPLETION_STATES.ABANDONED) {
    errors.push("The abandoned stage requires abandoned state.");
  }
  if (
    state.stage === CONVERSATION_STAGES.ESCALATION &&
    !unresolvedEscalation
  ) {
    errors.push("The escalation stage requires an active escalation.");
  }
  if (
    ([COMPLETION_STATES.COMPLETED, COMPLETION_STATES.ABANDONED] as readonly CompletionState[]).includes(state.completionState) &&
    !state.finalSnapshot
  ) {
    errors.push("A terminal conversation requires a final snapshot.");
  }
  if (state.escalation.destination && state.escalation.destination !== state.authorizedEscalationDestination) {
    errors.push("Escalation destination is not authorized for this conversation.");
  }

  return { valid: errors.length === 0, errors, warnings: [] };
}

function addDuplicateErrors(
  values: readonly string[],
  label: string,
  errors: string[],
) {
  if (values.some((value) => !value.trim())) errors.push(`A ${label} is empty.`);
  if (new Set(values).size !== values.length) errors.push(`Duplicate ${label}s are not allowed.`);
}
