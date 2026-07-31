import {
  STATE_EXECUTION_REASONS,
  type StateExecutionReason,
  type StateExecutionResult,
} from "../execution/contracts";
import { deepFreeze } from "../shared/immutable";
import {
  EXECUTION_JOURNAL_OUTCOMES,
  type ExecutionJournalAppendResult,
  type ExecutionJournalEntry,
  type ExecutionJournalOutcome,
  type ExecutionJournalStoreScope,
} from "./contracts";

export type ExecutionJournalEntryDraft = Omit<
  ExecutionJournalEntry,
  "journalEntryId" | "sequence"
>;

export type ExecutionJournalEntryDraftResult =
  | {
      readonly status: "success";
      readonly draft: Readonly<ExecutionJournalEntryDraft>;
    }
  | Extract<ExecutionJournalAppendResult, { readonly status: "failure" }>;

export type ExecutionJournalEntryDecodeResult =
  | {
      readonly status: "success";
      readonly entry: Readonly<ExecutionJournalEntry>;
    }
  | { readonly status: "failure" };

export function prepareExecutionJournalEntry(
  result: StateExecutionResult,
): ExecutionJournalEntryDraftResult {
  if (!isSafeExecutionResult(result)) return untrustedMetadataFailure();
  const metadata = result.executionMetadata;
  if (
    !isNonEmptyString(metadata.executionId)
    || !isNonEmptyString(metadata.requestId)
    || !isNonEmptyString(metadata.traceId)
    || !isNonEmptyString(metadata.taskIdentifier)
    || !isNonEmptyString(metadata.conversationId)
    || !isNonEmptyString(metadata.businessProfileId)
    || !isPositiveInteger(metadata.businessProfileVersion)
    || !isNonNegativeInteger(metadata.expectedStateRevision)
  ) {
    return untrustedMetadataFailure();
  }

  const outcome = outcomeForResult(result);
  if (!outcome) {
    return deepFreeze({
      status: "failure",
      reason: "UnknownExecutionOutcome",
    } satisfies ExecutionJournalAppendResult);
  }

  const draft: ExecutionJournalEntryDraft = {
      executionId: metadata.executionId,
      requestId: metadata.requestId,
      traceId: metadata.traceId,
      proposalId: metadata.proposalId,
      taskIdentifier: metadata.taskIdentifier,
      transitionId: result.transitionId,
      conversationId: metadata.conversationId,
      businessProfileId: metadata.businessProfileId,
      businessProfileVersion: metadata.businessProfileVersion,
      expectedStateRevision: metadata.expectedStateRevision,
      previousStateRevision: result.previousState?.revision ?? null,
      resultingStateRevision: result.newState?.revision ?? null,
      outcome,
      reason: result.reason,
      executionTimestamp: result.executionTimestamp,
      executionMetadata: {
        failures: [...metadata.failures],
      },
      journalMetadata: {
        schemaVersion: 1,
        source: "controlled-execution",
        recordedAt: "prototype-deterministic",
      },
  };
  return deepFreeze({ status: "success", draft });
}

export function createExecutionJournalEntry(
  draft: Readonly<ExecutionJournalEntryDraft>,
  sequence: number,
): Readonly<ExecutionJournalEntry> {
  if (!isPositiveInteger(sequence)) {
    throw new Error("Execution Journal sequence must be a positive integer.");
  }
  return deepFreeze({
    journalEntryId: `execution-journal-${sequence}-${draft.executionId}`,
    sequence,
    ...cloneDraft(draft),
  });
}

export function decodeExecutionJournalEntry(
  value: unknown,
  scope: Readonly<ExecutionJournalStoreScope>,
): ExecutionJournalEntryDecodeResult {
  if (!isExecutionJournalEntryShape(value) || !isValidJournalScope(scope)) {
    return { status: "failure" };
  }
  if (
    value.conversationId !== scope.conversationId
    || value.businessProfileId !== scope.businessProfileId
    || value.businessProfileVersion !== scope.businessProfileVersion
    || value.journalEntryId
      !== `execution-journal-${value.sequence}-${value.executionId}`
    || value.outcome !== outcomeForEntry(value)
    || !hasConsistentExecutionSemantics(value)
  ) {
    return { status: "failure" };
  }
  return {
    status: "success",
    entry: deepFreeze(cloneExecutionJournalEntry(value)),
  };
}

export function cloneExecutionJournalEntry(
  entry: Readonly<ExecutionJournalEntry>,
): ExecutionJournalEntry {
  return {
    ...entry,
    executionMetadata: {
      failures: [...entry.executionMetadata.failures],
    },
    journalMetadata: { ...entry.journalMetadata },
  };
}

export function isValidJournalScope(
  scope: unknown,
): scope is Readonly<ExecutionJournalStoreScope> {
  return isPlainRecord(scope)
    && hasExactKeys(scope, [
      "conversationId",
      "businessProfileId",
      "businessProfileVersion",
    ])
    && isNonEmptyString(scope.conversationId)
    && isNonEmptyString(scope.businessProfileId)
    && isPositiveInteger(scope.businessProfileVersion);
}

function cloneDraft(
  draft: Readonly<ExecutionJournalEntryDraft>,
): ExecutionJournalEntryDraft {
  return {
    ...draft,
    executionMetadata: {
      failures: [...draft.executionMetadata.failures],
    },
    journalMetadata: { ...draft.journalMetadata },
  };
}

function outcomeForResult(
  result: StateExecutionResult,
): ExecutionJournalOutcome | null {
  switch (result.reason) {
    case "TransitionApplied":
      return "applied";
    case "DuplicateExecution":
      return "duplicate";
    case "CurrentStateMismatch":
      return result.previousState
          && result.executionMetadata.expectedStateRevision !== null
          && result.previousState.revision
            !== result.executionMetadata.expectedStateRevision
        ? "stale"
        : "invalid_transition";
    case "UnknownTransition":
      return "invalid_transition";
    case "MalformedExecutionRequest":
      return "invalid_request";
    case "DecisionNotApproved":
    case "ProposalNotValidated":
    case "UnknownTask":
    case "UnknownProposalType":
    case "ScopeMismatch":
    case "PolicyViolation":
      return "policy_rejected";
    case "StateApplicationFailed":
      return "rejected";
    default:
      return null;
  }
}

function outcomeForEntry(
  entry: Readonly<ExecutionJournalEntry>,
): ExecutionJournalOutcome | null {
  switch (entry.reason) {
    case "TransitionApplied":
      return "applied";
    case "DuplicateExecution":
      return "duplicate";
    case "CurrentStateMismatch":
      return entry.previousStateRevision !== null
          && entry.previousStateRevision !== entry.expectedStateRevision
        ? "stale"
        : "invalid_transition";
    case "UnknownTransition":
      return "invalid_transition";
    case "MalformedExecutionRequest":
      return "invalid_request";
    case "DecisionNotApproved":
    case "ProposalNotValidated":
    case "UnknownTask":
    case "UnknownProposalType":
    case "ScopeMismatch":
    case "PolicyViolation":
      return "policy_rejected";
    case "StateApplicationFailed":
      return "rejected";
    default:
      return null;
  }
}

function hasConsistentExecutionSemantics(
  entry: Readonly<ExecutionJournalEntry>,
): boolean {
  if (entry.reason === "TransitionApplied") {
    return entry.previousStateRevision !== null
      && entry.resultingStateRevision !== null
      && entry.transitionId !== null
      && entry.expectedStateRevision === entry.previousStateRevision
      && entry.resultingStateRevision === entry.previousStateRevision + 1
      && entry.executionMetadata.failures.length === 0;
  }
  return entry.executionMetadata.failures[0] === entry.reason;
}

function isExecutionJournalEntryShape(
  value: unknown,
): value is ExecutionJournalEntry {
  return isPlainRecord(value)
    && hasExactKeys(value, [
      "journalEntryId",
      "sequence",
      "executionId",
      "requestId",
      "traceId",
      "proposalId",
      "taskIdentifier",
      "transitionId",
      "conversationId",
      "businessProfileId",
      "businessProfileVersion",
      "expectedStateRevision",
      "previousStateRevision",
      "resultingStateRevision",
      "outcome",
      "reason",
      "executionTimestamp",
      "executionMetadata",
      "journalMetadata",
    ])
    && isNonEmptyString(value.journalEntryId)
    && isPositiveInteger(value.sequence)
    && isNonEmptyString(value.executionId)
    && isNonEmptyString(value.requestId)
    && isNonEmptyString(value.traceId)
    && isNullableNonEmptyString(value.proposalId)
    && isNonEmptyString(value.taskIdentifier)
    && isNullableNonEmptyString(value.transitionId)
    && isNonEmptyString(value.conversationId)
    && isNonEmptyString(value.businessProfileId)
    && isPositiveInteger(value.businessProfileVersion)
    && isNonNegativeInteger(value.expectedStateRevision)
    && isNullableNonNegativeInteger(value.previousStateRevision)
    && isNullableNonNegativeInteger(value.resultingStateRevision)
    && isJournalOutcome(value.outcome)
    && isExecutionReason(value.reason)
    && isNonEmptyString(value.executionTimestamp)
    && isExecutionMetadata(value.executionMetadata)
    && isJournalMetadata(value.journalMetadata);
}

function isExecutionMetadata(
  value: unknown,
): value is ExecutionJournalEntry["executionMetadata"] {
  return isPlainRecord(value)
    && hasExactKeys(value, ["failures"])
    && Array.isArray(value.failures)
    && value.failures.every(isExecutionReason);
}

function isJournalMetadata(
  value: unknown,
): value is ExecutionJournalEntry["journalMetadata"] {
  return isPlainRecord(value)
    && hasExactKeys(value, ["schemaVersion", "source", "recordedAt"])
    && value.schemaVersion === 1
    && value.source === "controlled-execution"
    && value.recordedAt === "prototype-deterministic";
}

function isSafeExecutionResult(value: unknown): value is StateExecutionResult {
  if (
    !isPlainRecord(value)
    || !hasExactKeys(value, [
      "success",
      "reason",
      "previousState",
      "newState",
      "transitionId",
      "executionTimestamp",
      "executionMetadata",
    ])
  ) {
    return false;
  }
  const candidate = value as unknown as Partial<StateExecutionResult>;
  const metadata = candidate.executionMetadata;
  if (
    !isPlainRecord(metadata)
    || !hasExactKeys(metadata, [
      "executionId",
      "requestId",
      "traceId",
      "taskIdentifier",
      "proposalId",
      "conversationId",
      "businessProfileId",
      "businessProfileVersion",
      "expectedStateRevision",
      "appliedStateRevision",
      "failures",
      "details",
    ])
  ) {
    return false;
  }
  const structurallyValid = (
    typeof candidate.success === "boolean"
    && isNonEmptyString(candidate.reason)
    && (candidate.transitionId === null
      || isNonEmptyString(candidate.transitionId))
    && isNonEmptyString(candidate.executionTimestamp)
    && isNullableNonEmptyString(metadata.executionId)
    && isNullableNonEmptyString(metadata.requestId)
    && isNullableNonEmptyString(metadata.traceId)
    && isNullableNonEmptyString(metadata.taskIdentifier)
    && isNullableNonEmptyString(metadata.proposalId)
    && isNullableNonEmptyString(metadata.conversationId)
    && isNullableNonEmptyString(metadata.businessProfileId)
    && isNullablePositiveInteger(metadata.businessProfileVersion)
    && isNullableNonNegativeInteger(metadata.expectedStateRevision)
    && isNullableNonNegativeInteger(metadata.appliedStateRevision)
    && Array.isArray(metadata.failures)
    && metadata.failures.every(isExecutionReason)
    && Array.isArray(metadata.details)
    && metadata.details.every((detail) => typeof detail === "string")
    && hasSafeStateScope(candidate.previousState, metadata)
    && hasSafeStateScope(candidate.newState, metadata)
  );
  if (!structurallyValid || !isExecutionReason(candidate.reason)) {
    return structurallyValid;
  }
  const applied = candidate.reason === "TransitionApplied";
  if (candidate.success !== applied) return false;
  if (!applied) {
    return metadata.appliedStateRevision === null
      && metadata.failures[0] === candidate.reason;
  }
  const previousState = candidate.previousState;
  const newState = candidate.newState;
  return previousState !== null
    && previousState !== undefined
    && newState !== null
    && newState !== undefined
    && candidate.transitionId !== null
    && metadata.expectedStateRevision === previousState.revision
    && metadata.appliedStateRevision === newState.revision
    && newState.revision === previousState.revision + 1
    && metadata.failures.length === 0;
}

function hasSafeStateScope(
  value: StateExecutionResult["previousState"] | undefined,
  metadata: StateExecutionResult["executionMetadata"],
): boolean {
  return value === null
    || (
      isPlainRecord(value)
      && isNonNegativeInteger(value.revision)
      && value.conversationId === metadata.conversationId
      && value.businessProfileId === metadata.businessProfileId
      && value.businessProfileVersion === metadata.businessProfileVersion
    );
}

function isJournalOutcome(value: unknown): value is ExecutionJournalOutcome {
  return typeof value === "string"
    && (EXECUTION_JOURNAL_OUTCOMES as readonly string[]).includes(value);
}

function isExecutionReason(value: unknown): value is StateExecutionReason {
  return typeof value === "string"
    && (STATE_EXECUTION_REASONS as readonly string[]).includes(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return isNonNegativeInteger(value) && value > 0;
}

function isNullableNonEmptyString(value: unknown): value is string | null {
  return value === null || isNonEmptyString(value);
}

function isNullableNonNegativeInteger(value: unknown): value is number | null {
  return value === null || isNonNegativeInteger(value);
}

function isNullablePositiveInteger(value: unknown): value is number | null {
  return value === null || isPositiveInteger(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function hasExactKeys(
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): boolean {
  return Object.keys(value).every((key) => keys.includes(key))
    && keys.every((key) => key in value);
}

function untrustedMetadataFailure(): Extract<
  ExecutionJournalAppendResult,
  { readonly status: "failure" }
> {
  return deepFreeze({
    status: "failure",
    reason: "UntrustedExecutionMetadata",
  });
}
