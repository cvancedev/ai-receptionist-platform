import { Pool, type PoolClient } from "pg";
import type {
  ExecutionJournalEntry,
  ExecutionJournalStoreScope,
} from "../../ai/execution-journal/contracts";
import {
  createExecutionJournalEntry,
  isValidJournalScope,
  prepareExecutionJournalEntry,
  type ExecutionJournalEntryDraft,
} from "../../ai/execution-journal/entry-mapper";
import type {
  TransactionalExecutionPersistenceCoordinator,
  TransactionalExecutionPersistenceFailureReason,
  TransactionalExecutionPersistenceInput,
  TransactionalExecutionPersistenceResult,
} from "../../ai/execution-persistence/contracts";
import { deepFreeze } from "../../ai/shared/immutable";
import type { ConversationState } from "../../domain/conversation-state";
import { decodeConversationState } from "../../validation/conversation-state-codec";
import { quoteIdentifier, validatedSchema } from "./migration-runner";

const CONVERSATION_STATE_FORMAT_VERSION = 1;

export interface PostgresqlTransactionalExecutionCoordinatorOptions {
  readonly connectionString: string;
  readonly schema?: string;
}

interface PreparedPersistenceInput {
  readonly scope: Readonly<ExecutionJournalStoreScope>;
  readonly expectedRevision: number;
  readonly state: Readonly<ConversationState>;
  readonly journalDraft: Readonly<ExecutionJournalEntryDraft>;
}

/**
 * PostgreSQL transaction coordinator for one already-approved state replacement
 * and its required Execution Journal entry. All SQL and transaction ownership
 * remain isolated inside persistence infrastructure.
 */
export class PostgresqlTransactionalExecutionCoordinator
implements TransactionalExecutionPersistenceCoordinator {
  private readonly pool: Pool;
  private readonly stateTable: string;
  private readonly journalTable: string;

  constructor(
    options: Readonly<PostgresqlTransactionalExecutionCoordinatorOptions>,
  ) {
    if (!options.connectionString.trim()) {
      throw new Error("A PostgreSQL connection string is required.");
    }
    const schema = validatedSchema(options.schema);
    this.pool = new Pool({ connectionString: options.connectionString });
    this.stateTable = `${quoteIdentifier(schema)}.conversation_states`;
    this.journalTable = `${quoteIdentifier(schema)}.execution_journal_entries`;
  }

  async persist(
    input: Readonly<TransactionalExecutionPersistenceInput>,
  ): Promise<TransactionalExecutionPersistenceResult> {
    const prepared = preparePersistenceInput(input);
    if (prepared.status === "failure") return prepared.result;

    let client: PoolClient | null = null;
    let commitAttempted = false;
    try {
      client = await this.pool.connect();
      await client.query("BEGIN");
      await client.query(`LOCK TABLE ${this.journalTable} IN EXCLUSIVE MODE`);

      if (
        await hasPersistedExecutionIdentity(
          client,
          this.journalTable,
          prepared.value,
        )
      ) {
        await rollbackSafely(client);
        return failure("DuplicateConflict");
      }

      const stateResult = await replaceState(
        client,
        this.stateTable,
        prepared.value,
      );
      if (stateResult.status === "failure") {
        await rollbackSafely(client);
        return failure(stateResult.reason);
      }

      const journalEntry = await appendJournalEntry(
        client,
        this.journalTable,
        prepared.value.journalDraft,
      );

      commitAttempted = true;
      await client.query("COMMIT");
      return deepFreeze({
        status: "success",
        state: stateResult.state,
        journalEntry,
      });
    } catch (error) {
      await rollbackSafely(client);
      if (commitAttempted) return failure("TransactionCommitFailed");
      if (isUniqueViolation(error)) return failure("DuplicateConflict");
      return failure("InfrastructureFailure");
    } finally {
      client?.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

function preparePersistenceInput(
  input: Readonly<TransactionalExecutionPersistenceInput>,
):
  | { readonly status: "success"; readonly value: PreparedPersistenceInput }
  | { readonly status: "failure"; readonly result: TransactionalExecutionPersistenceResult } {
  if (!isValidJournalScope(input.scope)) {
    return invalidInput();
  }

  const execution = input.execution;
  const journal = prepareExecutionJournalEntry(execution);
  if (journal.status === "failure") {
    return {
      status: "failure",
      result: failure("JournalRejected"),
    };
  }

  const metadata = execution.executionMetadata;
  const previousState = execution.previousState;
  const newState = execution.newState;
  if (
    !execution.success
    || execution.reason !== "TransitionApplied"
    || journal.draft.outcome !== "applied"
    || previousState === null
    || newState === null
    || metadata.expectedStateRevision === null
    || metadata.appliedStateRevision === null
    || !matchesScope(input.scope, metadata)
    || !matchesScope(input.scope, previousState)
    || !matchesScope(input.scope, newState)
    || previousState.revision !== metadata.expectedStateRevision
    || newState.revision !== metadata.expectedStateRevision + 1
    || metadata.appliedStateRevision !== newState.revision
  ) {
    return invalidInput();
  }

  const decodedPrevious = decodeConversationState(previousState, input.scope);
  const decodedNew = decodeConversationState(newState, input.scope);
  if (decodedPrevious.status === "failure" || decodedNew.status === "failure") {
    return invalidInput();
  }

  return {
    status: "success",
    value: {
      scope: { ...input.scope },
      expectedRevision: metadata.expectedStateRevision,
      state: decodedNew.state,
      journalDraft: journal.draft,
    },
  };
}

async function replaceState(
  client: PoolClient,
  table: string,
  input: Readonly<PreparedPersistenceInput>,
): Promise<
  | { readonly status: "success"; readonly state: Readonly<ConversationState> }
  | {
      readonly status: "failure";
      readonly reason: "ConversationNotFound" | "RevisionConflict";
    }
> {
  const result = await client.query(
    `UPDATE ${table}
    SET
      revision = $4,
      state_format_version = $5,
      state_document = $6::jsonb,
      updated_at = CURRENT_TIMESTAMP
    WHERE business_profile_id = $1
      AND business_profile_version = $2
      AND conversation_id = $3
      AND revision = $7`,
    [
      input.scope.businessProfileId,
      input.scope.businessProfileVersion,
      input.scope.conversationId,
      input.state.revision,
      CONVERSATION_STATE_FORMAT_VERSION,
      JSON.stringify(input.state),
      input.expectedRevision,
    ],
  );
  if (result.rowCount === 1) {
    return { status: "success", state: input.state };
  }

  const current = await client.query(
    `SELECT revision
    FROM ${table}
    WHERE business_profile_id = $1
      AND business_profile_version = $2
      AND conversation_id = $3`,
    [
      input.scope.businessProfileId,
      input.scope.businessProfileVersion,
      input.scope.conversationId,
    ],
  );
  return current.rows.length === 0
    ? { status: "failure", reason: "ConversationNotFound" }
    : { status: "failure", reason: "RevisionConflict" };
}

async function appendJournalEntry(
  client: PoolClient,
  table: string,
  draft: Readonly<ExecutionJournalEntryDraft>,
): Promise<Readonly<ExecutionJournalEntry>> {
  const sequenceResult = await client.query<{
    readonly next_sequence: number;
  }>(
    `SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence
    FROM ${table}
    WHERE business_profile_id = $1
      AND business_profile_version = $2
      AND conversation_id = $3`,
    [
      draft.businessProfileId,
      draft.businessProfileVersion,
      draft.conversationId,
    ],
  );
  const entry = createExecutionJournalEntry(
    draft,
    sequenceResult.rows[0]?.next_sequence,
  );
  await client.query(
    `INSERT INTO ${table} (
      journal_entry_id,
      sequence,
      execution_id,
      request_id,
      trace_id,
      proposal_id,
      task_identifier,
      transition_id,
      conversation_id,
      business_profile_id,
      business_profile_version,
      expected_state_revision,
      previous_state_revision,
      resulting_state_revision,
      outcome,
      reason,
      execution_timestamp,
      execution_metadata,
      journal_schema_version,
      journal_source,
      journal_recorded_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
      $12, $13, $14, $15, $16, $17, $18::jsonb, $19, $20, $21
    )`,
    [
      entry.journalEntryId,
      entry.sequence,
      entry.executionId,
      entry.requestId,
      entry.traceId,
      entry.proposalId,
      entry.taskIdentifier,
      entry.transitionId,
      entry.conversationId,
      entry.businessProfileId,
      entry.businessProfileVersion,
      entry.expectedStateRevision,
      entry.previousStateRevision,
      entry.resultingStateRevision,
      entry.outcome,
      entry.reason,
      entry.executionTimestamp,
      JSON.stringify(entry.executionMetadata),
      entry.journalMetadata.schemaVersion,
      entry.journalMetadata.source,
      entry.journalMetadata.recordedAt,
    ],
  );
  return entry;
}

async function hasPersistedExecutionIdentity(
  client: PoolClient,
  table: string,
  input: Readonly<PreparedPersistenceInput>,
): Promise<boolean> {
  const result = await client.query(
    `SELECT 1
    FROM ${table}
    WHERE business_profile_id = $1
      AND business_profile_version = $2
      AND conversation_id = $3
      AND execution_id = $4
    LIMIT 1`,
    [
      input.scope.businessProfileId,
      input.scope.businessProfileVersion,
      input.scope.conversationId,
      input.journalDraft.executionId,
    ],
  );
  return result.rows.length > 0;
}

function matchesScope(
  scope: Readonly<ExecutionJournalStoreScope>,
  value: {
    readonly conversationId: string | null;
    readonly businessProfileId: string | null;
    readonly businessProfileVersion: number | null;
  },
): boolean {
  return value.conversationId === scope.conversationId
    && value.businessProfileId === scope.businessProfileId
    && value.businessProfileVersion === scope.businessProfileVersion;
}

function invalidInput(): {
  readonly status: "failure";
  readonly result: TransactionalExecutionPersistenceResult;
} {
  return { status: "failure", result: failure("InvalidPersistenceInput") };
}

function isUniqueViolation(error: unknown): boolean {
  return error !== null
    && typeof error === "object"
    && "code" in error
    && error.code === "23505";
}

async function rollbackSafely(client: PoolClient | null): Promise<void> {
  if (!client) return;
  try {
    await client.query("ROLLBACK");
  } catch {
    // The technology-neutral failure result remains authoritative.
  }
}

function failure(
  reason: TransactionalExecutionPersistenceFailureReason,
): TransactionalExecutionPersistenceResult {
  return deepFreeze({ status: "failure", reason });
}
