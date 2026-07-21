import type { KnowledgeRecord } from "../domain/knowledge-record";
import { createPlaceholderValidationResult } from "./types";

export function validateKnowledge(knowledgeRecords: readonly KnowledgeRecord[]) {
  // TODO: Enforce lifecycle, scope, audience, and traceability rules later.
  void knowledgeRecords;
  return createPlaceholderValidationResult();
}
