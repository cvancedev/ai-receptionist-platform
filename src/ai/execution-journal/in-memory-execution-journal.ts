import {
  STATE_EXECUTION_REASONS,
  type StateExecutionReason,
  type StateExecutionResult,
} from "../execution/contracts";
import { deepFreeze } from "../shared/immutable";
import type {
  ExecutionJournalAppendResult,
  ExecutionJournalEntry,
  ExecutionJournalOutcome,
  ExecutionJournalSnapshot,
  ExecutionJournalWriter,
} from "./contracts";

export class InMemoryExecutionJournal implements ExecutionJournalWriter {
  private readonly entries: Readonly<ExecutionJournalEntry>[] = [];

  append(result: StateExecutionResult): ExecutionJournalAppendResult {
    if (!isSafeExecutionResult(result)) {
      return untrustedMetadataFailure();
    }
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

    const outcome = outcomeFor(result);
    if (!outcome) {
      return deepFreeze({
        status: "failure",
        reason: "UnknownExecutionOutcome",
      } satisfies ExecutionJournalAppendResult);
    }

    const sequence = this.entries.length + 1;
    const entry: ExecutionJournalEntry = {
      journalEntryId: `execution-journal-${sequence}-${metadata.executionId}`,
      sequence,
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
    const frozen = deepFreeze(entry);
    this.entries.push(frozen);
    return deepFreeze({ status: "success", entry: frozen });
  }

  snapshot(): ExecutionJournalSnapshot {
    return deepFreeze({
      entries: this.entries.map(cloneEntry),
    });
  }
}

function outcomeFor(
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

function cloneEntry(entry: Readonly<ExecutionJournalEntry>) {
  return {
    ...entry,
    executionMetadata: {
      failures: [...entry.executionMetadata.failures],
    },
    journalMetadata: { ...entry.journalMetadata },
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return isNonNegativeInteger(value) && value > 0;
}

function isSafeExecutionResult(value: unknown): value is StateExecutionResult {
  if (
    !isPlainRecord(value)
    || !hasOnlyKeys(value, [
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
    || !hasOnlyKeys(metadata, [
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

function isNullableNonEmptyString(value: unknown): value is string | null {
  return value === null || isNonEmptyString(value);
}

function isNullableNonNegativeInteger(value: unknown): value is number | null {
  return value === null || isNonNegativeInteger(value);
}

function isNullablePositiveInteger(value: unknown): value is number | null {
  return value === null || isPositiveInteger(value);
}

function isExecutionReason(value: unknown): value is StateExecutionReason {
  return typeof value === "string"
    && (STATE_EXECUTION_REASONS as readonly string[]).includes(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function hasOnlyKeys(
  value: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowed.includes(key))
    && allowed.every((key) => key in value);
}

function untrustedMetadataFailure(): ExecutionJournalAppendResult {
  return deepFreeze({
    status: "failure",
    reason: "UntrustedExecutionMetadata",
  } satisfies ExecutionJournalAppendResult);
}
