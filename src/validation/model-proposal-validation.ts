import type { ModelProposal, ProposedAction } from "../domain/model-proposal";
import type { ValidationResult } from "./types";

const allowedActions: readonly ProposedAction[] = [
  "ask-question",
  "provide-answer",
  "clarify",
  "confirm",
  "escalate",
  "summarize",
  "close",
  "wait",
];

export function validateModelProposal(modelProposal: ModelProposal): ValidationResult {
  const errors: string[] = [];
  if (!modelProposal.customerResponse.trim()) errors.push("A customer response is required.");
  if (!allowedActions.includes(modelProposal.proposedAction)) errors.push("The proposed action is invalid.");
  if (modelProposal.proposedStateUpdates.some((update) => !update.field.trim())) {
    errors.push("Every proposed state update requires a field identifier.");
  }
  if (modelProposal.escalationRecommendation.recommended && !modelProposal.escalationRecommendation.reason?.trim()) {
    errors.push("A recommended escalation requires a reason.");
  }
  const missingFields = modelProposal.completionRecommendation.missingFields;
  if (missingFields.some((field) => !field.trim()) || new Set(missingFields).size !== missingFields.length) {
    errors.push("Completion missing fields must be non-empty and unique.");
  }
  if (modelProposal.completionRecommendation.recommended && missingFields.length > 0) {
    errors.push("Completion cannot be recommended while required fields are missing.");
  }
  return { valid: errors.length === 0, errors, warnings: [] };
}
