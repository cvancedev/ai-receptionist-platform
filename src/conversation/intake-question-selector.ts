import type { IntakeFieldDefinition } from "../domain/business-profile";
import type { ConversationState } from "../domain/conversation-state";
import type { QuestionSelectionResult } from "../domain/intake";
import { escalationBlocksCompletion } from "./conversation-state-selectors";

export function selectNextIntakeQuestion(
  state: ConversationState,
  requiredFields: readonly IntakeFieldDefinition[],
): QuestionSelectionResult {
  if (escalationBlocksCompletion(state)) return { status: "blocked", errors: ["A required escalation blocks routine questions."] };
  const unresolved = requiredFields.filter((field) => !state.confirmedFacts[field.id]);
  const unasked = unresolved.find((field) => !state.askedQuestions.includes(field.questionId));
  if (unasked) return selected(unasked, unasked.questionId, unasked.question, "unasked-required");
  for (const field of unresolved) {
    const correction = [...state.corrections].reverse().find((item) => item.field === field.id);
    if (correction) {
      const questionId = `${field.questionId}:correction:${correction.sequence}`;
      if (!state.askedQuestions.includes(questionId)) {
        return selected(field, questionId, field.clarificationQuestion ?? field.question, "reopened-correction");
      }
    }
  }
  if (unresolved.length) return { status: "clarification-required", field: unresolved[0], reason: "Required information remains unresolved after its approved question was asked." };
  const conflicting = requiredFields.find((field) => {
    const fact = state.confirmedFacts[field.id];
    if (!fact) return false;
    const latestClaim = [...state.customerClaims].reverse().find((claim) => claim.field === field.id);
    return Boolean(latestClaim && latestClaim.sequence > fact.sequence && latestClaim.value !== fact.value);
  });
  if (conflicting) {
    return {
      status: "clarification-required",
      field: conflicting,
      questionId: `${conflicting.questionId}:clarification`,
      question: conflicting.clarificationQuestion ?? conflicting.question,
      reason: "A newer customer claim conflicts with the confirmed value.",
    };
  }
  return { status: "none", reason: "All required intake fields are confirmed." };
}

function selected(field: IntakeFieldDefinition, questionId: string, question: string, reason: "unasked-required" | "reopened-correction"): QuestionSelectionResult {
  return { status: "selected", field, questionId, question, reason };
}
