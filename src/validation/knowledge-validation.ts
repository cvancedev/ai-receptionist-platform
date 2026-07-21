import type { KnowledgeRecord } from "../domain/knowledge-record";
import { LIFECYCLE_STATES } from "../shared/constants";
import type { ValidationResult } from "./types";

export function validateKnowledge(
  knowledgeRecords: readonly KnowledgeRecord[],
  expectedBusinessProfileId?: string,
): ValidationResult {
  const errors: string[] = [];
  const identities = new Set<string>();

  for (const record of knowledgeRecords) {
    const identity = `${record.id}:${record.version}`;
    if (identities.has(identity)) errors.push(`Duplicate knowledge record '${identity}' is not allowed.`);
    identities.add(identity);

    if (!record.id.trim() || !record.businessProfileId.trim() || !record.title.trim()) {
      errors.push("Knowledge identity, business scope, and title are required.");
    }
    if (!record.category.trim() || !record.content.trim() || !record.source.trim()) {
      errors.push(`Knowledge record '${record.id}' requires category, content, and source traceability.`);
    }
    if (!Number.isInteger(record.version) || record.version < 1) {
      errors.push(`Knowledge record '${record.id}' requires a positive version.`);
    }
    if (!Object.values(LIFECYCLE_STATES).includes(record.lifecycleState)) {
      errors.push(`Knowledge record '${record.id}' has an invalid lifecycle state.`);
    }
    if (!(["customer", "staff", "both"] as const).includes(record.audience)) {
      errors.push(`Knowledge record '${record.id}' has an invalid audience.`);
    }
    if (!record.effectiveDate.trim() || Number.isNaN(Date.parse(record.effectiveDate))) {
      errors.push(`Knowledge record '${record.id}' requires a valid effective date.`);
    }
    if (expectedBusinessProfileId && record.businessProfileId !== expectedBusinessProfileId) {
      errors.push(`Knowledge record '${record.id}' does not match the expected business scope.`);
    }
  }

  return { valid: errors.length === 0, errors, warnings: [] };
}
