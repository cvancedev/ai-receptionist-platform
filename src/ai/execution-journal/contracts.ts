import type { StateExecutionReason, StateExecutionResult } from "../execution/contracts";

export const EXECUTION_JOURNAL_OUTCOMES = [
  "applied",
  "rejected",
  "duplicate",
  "stale",
  "invalid_transition",
  "invalid_request",
  "policy_rejected",
] as const;

export type ExecutionJournalOutcome =
  (typeof EXECUTION_JOURNAL_OUTCOMES)[number];

export interface ExecutionJournalMetadata {
  readonly schemaVersion: 1;
  readonly source: "controlled-execution";
  readonly recordedAt: "prototype-deterministic";
}

export interface ExecutionJournalEntry {
  readonly journalEntryId: string;
  readonly sequence: number;
  readonly executionId: string;
  readonly requestId: string;
  readonly traceId: string;
  readonly proposalId: string | null;
  readonly taskIdentifier: string;
  readonly transitionId: string | null;
  readonly conversationId: string;
  readonly businessProfileId: string;
  readonly businessProfileVersion: number;
  readonly expectedStateRevision: number;
  readonly previousStateRevision: number | null;
  readonly resultingStateRevision: number | null;
  readonly outcome: ExecutionJournalOutcome;
  readonly reason: StateExecutionReason;
  readonly executionTimestamp: string;
  readonly executionMetadata: Readonly<{
    failures: readonly StateExecutionReason[];
  }>;
  readonly journalMetadata: Readonly<ExecutionJournalMetadata>;
}

export interface ExecutionJournalSnapshot {
  readonly entries: readonly Readonly<ExecutionJournalEntry>[];
  readonly failure?: ExecutionJournalSnapshotFailureReason;
}

export interface ExecutionJournalStoreScope {
  readonly conversationId: string;
  readonly businessProfileId: string;
  readonly businessProfileVersion: number;
}

export type ExecutionJournalAppendFailureReason =
  | "UntrustedExecutionMetadata"
  | "UnknownExecutionOutcome"
  | "JournalAppendFailed";

export type ExecutionJournalSnapshotFailureReason =
  | "InvalidJournalScope"
  | "InvalidStoredJournalEntry"
  | "IncompatibleStoredJournalEntry"
  | "JournalReadFailed";

export type ExecutionJournalAppendResult =
  | {
      readonly status: "success";
      readonly entry: Readonly<ExecutionJournalEntry>;
    }
  | {
      readonly status: "failure";
      readonly reason: ExecutionJournalAppendFailureReason;
    };

export type ExecutionJournalOperationMode = "synchronous" | "asynchronous";

export type ExecutionJournalOperation<
  Mode extends ExecutionJournalOperationMode,
  Result,
> = Mode extends "asynchronous" ? Promise<Result> : Result;

/**
 * Application-owned append-only persistence boundary. Implementations observe
 * trusted execution results and expose detached history; they own no execution
 * or state authority.
 */
export interface ExecutionJournalStore<
  Mode extends ExecutionJournalOperationMode = "synchronous",
> {
  readonly operationMode: Mode;
  append(
    result: StateExecutionResult,
  ): ExecutionJournalOperation<Mode, ExecutionJournalAppendResult>;
  snapshot(
    scope: Readonly<ExecutionJournalStoreScope>,
  ): ExecutionJournalOperation<Mode, ExecutionJournalSnapshot>;
}
