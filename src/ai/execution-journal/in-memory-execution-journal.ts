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
      || !isNonNegativeInteger(metadata.businessProfileVersion)
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
  return typeof value === "string" && value.length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= 0;
}

function isSafeExecutionResult(value: unknown): value is StateExecutionResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<StateExecutionResult>;
  const metadata = candidate.executionMetadata;
  return (
    typeof candidate.success === "boolean"
    && isNonEmptyString(candidate.reason)
    && (candidate.transitionId === null
      || typeof candidate.transitionId === "string")
    && isNonEmptyString(candidate.executionTimestamp)
    && hasSafeRevision(candidate.previousState)
    && hasSafeRevision(candidate.newState)
    && Boolean(metadata)
    && Array.isArray(metadata?.failures)
    && metadata.failures.every(isExecutionReason)
  );
}

function hasSafeRevision(
  value: StateExecutionResult["previousState"] | undefined,
): boolean {
  return value === null
    || (
      Boolean(value)
      && isNonNegativeInteger(value?.revision)
    );
}

function isExecutionReason(value: unknown): value is StateExecutionReason {
  return typeof value === "string"
    && (STATE_EXECUTION_REASONS as readonly string[]).includes(value);
}

function untrustedMetadataFailure(): ExecutionJournalAppendResult {
  return deepFreeze({
    status: "failure",
    reason: "UntrustedExecutionMetadata",
  } satisfies ExecutionJournalAppendResult);
}
