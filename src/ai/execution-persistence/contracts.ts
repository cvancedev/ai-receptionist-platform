import type { ExecutionJournalEntry } from "../execution-journal/contracts";
import type { StateExecutionResult } from "../execution/contracts";
import type { ConversationStoreScope } from "../../conversation/conversation-store";
import type { ConversationState } from "../../domain/conversation-state";
import type { DurableMessageEvidence } from "../../application/end-to-end/message-evidence";

export interface TransactionalExecutionPersistenceInput {
  readonly scope: Readonly<ConversationStoreScope>;
  readonly execution: StateExecutionResult;
  /** Required by the Sprint 8.4 durable-turn path; omitted by certified legacy callers. */
  readonly messageEvidence?: Readonly<DurableMessageEvidence>;
}

export type TransactionalExecutionPersistenceFailureReason =
  | "InvalidPersistenceInput"
  | "ConversationNotFound"
  | "RevisionConflict"
  | "JournalRejected"
  | "DuplicateConflict"
  | "MessageEvidenceRejected"
  | "InfrastructureFailure"
  | "TransactionCommitFailed";

export type TransactionalExecutionPersistenceResult =
  | {
      readonly status: "success";
      readonly state: Readonly<ConversationState>;
      readonly journalEntry: Readonly<ExecutionJournalEntry>;
    }
  | {
      readonly status: "failure";
      readonly reason: TransactionalExecutionPersistenceFailureReason;
    };

/**
 * Application-owned coordination boundary for persisting one already-approved
 * state-changing execution. Implementations coordinate storage only; they do
 * not validate proposals, choose or execute transitions, retry, replay,
 * release customer responses, or dispatch external actions.
 */
export interface TransactionalExecutionPersistenceCoordinator {
  persist(
    input: Readonly<TransactionalExecutionPersistenceInput>,
  ): Promise<TransactionalExecutionPersistenceResult>;
}
