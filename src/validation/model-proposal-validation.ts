import type { ModelProposal } from "../domain/model-proposal";
import { createPlaceholderValidationResult } from "./types";

export function validateModelProposal(modelProposal: ModelProposal) {
  // TODO: Validate model proposals before any response or state change is used.
  void modelProposal;
  return createPlaceholderValidationResult();
}
