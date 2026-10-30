import type { KnowledgeRecord } from "../../domain/knowledge-record";

/**
 * Selection of approved business knowledge for one model request.
 *
 * Only knowledge that belongs to the authenticated business, is part of the
 * active configuration, is approved for customer-facing use, and is already
 * effective may be selected. The selection is deterministic and bounded, and it
 * reports why each rejected record was excluded so a verification can prove the
 * boundaries rather than trusting the model.
 */
export const KNOWLEDGE_SELECTION_VERSION = "approved-knowledge-selection/v1" as const;

export const DEFAULT_KNOWLEDGE_LIMITS = Object.freeze({
  /** Maximum characters of one record's content shown to a model. */
  perRecordCharacters: 600,
  /** Maximum characters of content across all selected records. */
  totalCharacters: 3_000,
  /** Maximum number of selected records. */
  maximumRecords: 8,
});

export interface KnowledgeSelectionLimits {
  readonly perRecordCharacters: number;
  readonly totalCharacters: number;
  readonly maximumRecords: number;
}

export type KnowledgeExclusionReason =
  | "other-business"
  | "inactive"
  | "staff-only"
  | "future-effective-date"
  | "duplicate-id"
  | "invalid-record"
  | "over-limit";

export interface ApprovedKnowledgeExcerpt {
  readonly id: string;
  readonly version: number;
  readonly businessId: string;
  readonly title: string;
  readonly category: string;
  readonly source: string;
  readonly effectiveDate: string;
  readonly content: string;
}

export interface ExcludedKnowledgeRecord {
  readonly id: string;
  readonly reason: KnowledgeExclusionReason;
}

export interface KnowledgeSelection {
  readonly version: typeof KNOWLEDGE_SELECTION_VERSION;
  readonly selected: readonly ApprovedKnowledgeExcerpt[];
  readonly excluded: readonly ExcludedKnowledgeRecord[];
  readonly limits: KnowledgeSelectionLimits;
  readonly totalCharacters: number;
}

/** Categories shown first when the size budget is tight. */
const CATEGORY_PRIORITY: Readonly<Record<string, number>> = Object.freeze({
  hours: 0,
  "service-description": 1,
  "payment-policy": 2,
  "appointment-expectations": 3,
});

export function selectApprovedKnowledge(input: {
  readonly businessId: string;
  readonly knowledge: readonly KnowledgeRecord[];
  readonly asOfDate?: string | null;
  readonly limits?: Partial<KnowledgeSelectionLimits>;
}): KnowledgeSelection {
  const limits = normalizeLimits(input.limits);
  const asOfDate = isIsoDate(input.asOfDate) ? input.asOfDate : null;
  const excluded: ExcludedKnowledgeRecord[] = [];
  const seen = new Set<string>();
  const candidates: ApprovedKnowledgeExcerpt[] = [];

  for (const record of input.knowledge) {
    if (!isUsableRecord(record)) {
      excluded.push({ id: safeId(record), reason: "invalid-record" });
      continue;
    }
    if (record.businessProfileId !== input.businessId) {
      excluded.push({ id: record.id, reason: "other-business" });
      continue;
    }
    if (record.lifecycleState !== "active") {
      excluded.push({ id: record.id, reason: "inactive" });
      continue;
    }
    if (record.audience !== "customer" && record.audience !== "both") {
      excluded.push({ id: record.id, reason: "staff-only" });
      continue;
    }
    if (asOfDate && isIsoDate(record.effectiveDate) && record.effectiveDate > asOfDate) {
      excluded.push({ id: record.id, reason: "future-effective-date" });
      continue;
    }
    if (seen.has(record.id)) {
      excluded.push({ id: record.id, reason: "duplicate-id" });
      continue;
    }
    seen.add(record.id);
    candidates.push(Object.freeze({
      id: record.id,
      version: record.version,
      businessId: record.businessProfileId,
      title: record.title,
      category: record.category,
      source: record.source,
      effectiveDate: record.effectiveDate,
      content: record.content,
    }));
  }

  candidates.sort(compareRecords);

  const selected: ApprovedKnowledgeExcerpt[] = [];
  let totalCharacters = 0;
  for (const record of candidates) {
    if (selected.length >= limits.maximumRecords) {
      excluded.push({ id: record.id, reason: "over-limit" });
      continue;
    }
    const content = record.content.trim();
    if (content.length === 0 || content.length > limits.perRecordCharacters) {
      // A record is shown in full or not at all: a truncated record could
      // support a claim its source does not make.
      excluded.push({ id: record.id, reason: "over-limit" });
      continue;
    }
    if (totalCharacters + content.length > limits.totalCharacters) {
      excluded.push({ id: record.id, reason: "over-limit" });
      continue;
    }
    totalCharacters += content.length;
    selected.push(Object.freeze({ ...record, content }));
  }

  return Object.freeze({
    version: KNOWLEDGE_SELECTION_VERSION,
    selected: Object.freeze(selected),
    excluded: Object.freeze(excluded),
    limits,
    totalCharacters,
  });
}

function compareRecords(left: ApprovedKnowledgeExcerpt, right: ApprovedKnowledgeExcerpt): number {
  const leftPriority = CATEGORY_PRIORITY[left.category] ?? 9;
  const rightPriority = CATEGORY_PRIORITY[right.category] ?? 9;
  if (leftPriority !== rightPriority) return leftPriority - rightPriority;
  if (left.category !== right.category) return left.category < right.category ? -1 : 1;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function normalizeLimits(limits?: Partial<KnowledgeSelectionLimits>): KnowledgeSelectionLimits {
  return Object.freeze({
    perRecordCharacters: bounded(
      limits?.perRecordCharacters,
      DEFAULT_KNOWLEDGE_LIMITS.perRecordCharacters,
      80,
      4_000,
    ),
    totalCharacters: bounded(
      limits?.totalCharacters,
      DEFAULT_KNOWLEDGE_LIMITS.totalCharacters,
      200,
      12_000,
    ),
    maximumRecords: bounded(
      limits?.maximumRecords,
      DEFAULT_KNOWLEDGE_LIMITS.maximumRecords,
      1,
      24,
    ),
  });
}

function bounded(value: unknown, fallback: number, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isInteger(value)) return fallback;
  if (value < minimum || value > maximum) return fallback;
  return value;
}

function isUsableRecord(value: unknown): value is KnowledgeRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as KnowledgeRecord;
  return typeof record.id === "string"
    && record.id.length > 0
    && record.id.length <= 200
    && typeof record.version === "number"
    && Number.isInteger(record.version)
    && record.version >= 1
    && typeof record.businessProfileId === "string"
    && typeof record.title === "string"
    && typeof record.category === "string"
    && typeof record.content === "string"
    && typeof record.source === "string"
    && typeof record.effectiveDate === "string"
    && typeof record.lifecycleState === "string"
    && typeof record.audience === "string";
}

function safeId(value: unknown): string {
  if (value !== null && typeof value === "object") {
    const id = (value as { id?: unknown }).id;
    if (typeof id === "string" && id.length > 0 && id.length <= 200) return id;
  }
  return "unidentified-record";
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
