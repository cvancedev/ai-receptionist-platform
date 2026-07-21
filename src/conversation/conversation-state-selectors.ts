import type {
  ConversationCorrection,
  ConversationState,
} from "../domain/conversation-state";
import type { EscalationState } from "../shared/constants";
import { ESCALATION_STATES } from "../shared/constants";

export function getConfirmedValue(
  state: ConversationState,
  field: string,
): string | undefined {
  return state.confirmedFacts[field]?.value;
}

export function getCurrentValue(
  state: ConversationState,
  field: string,
): string | undefined {
  const correction = getLatestCorrection(state, field);
  if (correction) return correction.correctedValue;

  const claim = [...state.customerClaims]
    .reverse()
    .find((candidate) => candidate.field === field);
  return state.confirmedFacts[field]?.value ?? claim?.value;
}

export function getUnresolvedFields(
  state: ConversationState,
): readonly string[] {
  return [...state.missingFields];
}

export function wasQuestionAsked(
  state: ConversationState,
  questionId: string,
): boolean {
  return state.askedQuestions.includes(questionId);
}

export function getLatestCorrection(
  state: ConversationState,
  field: string,
): ConversationCorrection | undefined {
  return [...state.corrections]
    .reverse()
    .find((correction) => correction.field === field);
}

export function escalationBlocksCompletion(state: ConversationState): boolean {
  const blockingStates: readonly EscalationState[] = [
    ESCALATION_STATES.REQUIRED,
    ESCALATION_STATES.REQUESTED_BY_CUSTOMER,
    ESCALATION_STATES.IN_PROGRESS,
  ];
  return blockingStates.includes(state.escalation.status);
}

export function isReadyForConfirmation(state: ConversationState): boolean {
  return state.missingFields.length === 0 && !escalationBlocksCompletion(state);
}
