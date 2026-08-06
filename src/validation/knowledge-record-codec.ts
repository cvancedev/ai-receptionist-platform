import type { KnowledgeRevisionScope } from "../business-configuration/contracts";
import { detachKnowledgeRevisionSnapshot } from "../business-configuration/contract-support";
import type { KnowledgeRecord } from "../domain/knowledge-record";
import { LIFECYCLE_STATES } from "../shared/constants";
import { validateKnowledge } from "./knowledge-validation";

export type KnowledgeRecordDecodeResult =
  | { readonly status: "success"; readonly record: Readonly<KnowledgeRecord> }
  | { readonly status: "failure"; readonly errors: readonly string[] };

export function decodeKnowledgeRecord(
  value: unknown,
  scope: Readonly<KnowledgeRevisionScope>,
): KnowledgeRecordDecodeResult {
  if (!isKnowledgeRecord(value)) {
    return failure("Persisted Knowledge Record has an invalid structure.");
  }
  if (
    value.businessProfileId !== scope.businessProfileId
    || value.id !== scope.knowledgeRecordId
    || value.version !== scope.knowledgeRecordVersion
  ) {
    return failure("Persisted Knowledge Record scope is inconsistent.");
  }
  const validation = validateKnowledge([value], scope.businessProfileId);
  if (!validation.valid) {
    return { status: "failure", errors: validation.errors };
  }
  const snapshot = detachKnowledgeRevisionSnapshot({
    scope,
    revision: 0,
    lifecycleStatus: value.lifecycleState,
    record: value,
  });
  return { status: "success", record: snapshot.record };
}

function isKnowledgeRecord(value: unknown): value is KnowledgeRecord {
  if (
    !isRecord(value)
    || !hasExactKeys(value, [
      "id",
      "version",
      "businessProfileId",
      "title",
      "category",
      "content",
      "lifecycleState",
      "audience",
      "source",
      "effectiveDate",
    ])
  ) {
    return false;
  }
  return typeof value.id === "string"
    && Number.isInteger(value.version)
    && typeof value.businessProfileId === "string"
    && typeof value.title === "string"
    && typeof value.category === "string"
    && typeof value.content === "string"
    && typeof value.lifecycleState === "string"
    && Object.values(LIFECYCLE_STATES).includes(
      value.lifecycleState as KnowledgeRecord["lifecycleState"],
    )
    && (value.audience === "customer"
      || value.audience === "staff"
      || value.audience === "both")
    && typeof value.source === "string"
    && typeof value.effectiveDate === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return Object.keys(value).length === keys.length
    && keys.every((key) => key in value);
}

function failure(message: string): KnowledgeRecordDecodeResult {
  return { status: "failure", errors: [message] };
}
