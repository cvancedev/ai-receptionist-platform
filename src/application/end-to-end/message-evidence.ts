import { deepFreeze } from "../../ai/shared/immutable";
import type { ConversationStoreScope } from "../../conversation/conversation-store";

const MAX_IDENTIFIER_LENGTH = 160;
const MAX_MESSAGE_LENGTH = 4_000;

export interface DurableMessageEvidence {
  readonly messageId: string;
  readonly turnId: string;
  readonly businessProfileId: string;
  readonly businessProfileVersion: number;
  readonly conversationId: string;
  readonly activationRevision: number;
  readonly sequence: number;
  readonly source: "customer";
  readonly content: string;
  readonly resultingStateRevision: number;
  readonly recordedAt: string;
  readonly evidenceSchemaVersion: 1;
}

export type DurableMessageEvidenceResult =
  | { readonly status: "success"; readonly evidence: Readonly<DurableMessageEvidence> }
  | { readonly status: "failure"; readonly reason: "InvalidMessageEvidence" };

export interface DurableMessageEvidenceSnapshot {
  readonly scope: Readonly<ConversationStoreScope>;
  readonly entries: readonly Readonly<DurableMessageEvidence>[];
}

export type DurableMessageEvidenceReadResult =
  | { readonly status: "success"; readonly snapshot: Readonly<DurableMessageEvidenceSnapshot> }
  | { readonly status: "failure"; readonly reason: "InvalidScope" | "CorruptEvidence" | "InfrastructureFailure" };

export interface DurableMessageEvidenceStore {
  snapshot(scope: Readonly<ConversationStoreScope>): Promise<DurableMessageEvidenceReadResult>;
}

export function decodeDurableMessageEvidence(
  value: unknown,
  scope: Readonly<ConversationStoreScope>,
): DurableMessageEvidenceResult {
  if (!isPlainRecord(value) || !hasExactKeys(value, [
    "messageId", "turnId", "businessProfileId", "businessProfileVersion",
    "conversationId", "activationRevision", "sequence", "source", "content",
    "resultingStateRevision", "recordedAt", "evidenceSchemaVersion",
  ])) return failure();
  const candidate = value as unknown as DurableMessageEvidence;
  if (
    !isIdentifier(candidate.messageId)
    || !isIdentifier(candidate.turnId)
    || candidate.businessProfileId !== scope.businessProfileId
    || candidate.businessProfileVersion !== scope.businessProfileVersion
    || candidate.conversationId !== scope.conversationId
    || !Number.isInteger(candidate.activationRevision) || candidate.activationRevision <= 0
    || !Number.isInteger(candidate.sequence) || candidate.sequence <= 0
    || candidate.source !== "customer"
    || typeof candidate.content !== "string"
    || candidate.content !== candidate.content.trim()
    || candidate.content.length === 0 || candidate.content.length > MAX_MESSAGE_LENGTH
    || !Number.isInteger(candidate.resultingStateRevision)
    || candidate.resultingStateRevision < 0
    || !isBoundedTimestamp(candidate.recordedAt)
    || candidate.evidenceSchemaVersion !== 1
  ) return failure();
  return deepFreeze({ status: "success", evidence: structuredClone(candidate) });
}

export function isValidMessageEvidenceScope(value: unknown): value is ConversationStoreScope {
  return isPlainRecord(value)
    && isIdentifier(value.businessProfileId)
    && Number.isInteger(value.businessProfileVersion)
    && Number(value.businessProfileVersion) > 0
    && isIdentifier(value.conversationId);
}

function failure(): DurableMessageEvidenceResult {
  return deepFreeze({
    status: "failure" as const,
    reason: "InvalidMessageEvidence" as const,
  });
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && value === value.trim()
    && value.length > 0 && value.length <= MAX_IDENTIFIER_LENGTH;
}

function isBoundedTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 80;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}
