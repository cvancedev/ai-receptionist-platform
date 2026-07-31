import { Pool, type PoolClient } from "pg";
import type {
  ExecutionJournalAppendResult,
  ExecutionJournalEntry,
  ExecutionJournalSnapshot,
  ExecutionJournalStore,
  ExecutionJournalStoreScope,
} from "../../ai/execution-journal/contracts";
import {
  createExecutionJournalEntry,
  decodeExecutionJournalEntry,
  isValidJournalScope,
  prepareExecutionJournalEntry,
} from "../../ai/execution-journal/entry-mapper";
import type { StateExecutionResult } from "../../ai/execution/contracts";
import { deepFreeze } from "../../ai/shared/immutable";
import {
  quoteIdentifier,
  validatedSchema,
} from "./migration-runner";

const EXECUTION_JOURNAL_FORMAT_VERSION = 1;

export interface PostgresqlExecutionJournalOptions {
  readonly connectionString: string;
  readonly schema?: string;
}

interface ExecutionJournalRow {
  readonly journal_entry_id: string;
  readonly sequence: number;
  readonly execution_id: string;
  readonly request_id: string;
  readonly trace_id: string;
  readonly proposal_id: string | null;
  readonly task_identifier: string;
  readonly transition_id: string | null;
  readonly conversation_id: string;
  readonly business_profile_id: string;
  readonly business_profile_version: number;
  readonly expected_state_revision: number;
  readonly previous_state_revision: number | null;
  readonly resulting_state_revision: number | null;
  readonly outcome: string;
  readonly reason: string;
  readonly execution_timestamp: string;
  readonly execution_metadata: unknown;
  readonly journal_schema_version: number;
  readonly journal_source: string;
  readonly journal_recorded_at: string;
}

/**
 * PostgreSQL storage adapter for bounded Execution Journal entries. It owns
 * durable append and scoped retrieval mechanics only.
 */
export class PostgresqlExecutionJournal
implements ExecutionJournalStore<"asynchronous"> {
  readonly operationMode = "asynchronous";
  private readonly pool: Pool;
  private readonly table: string;

  constructor(options: Readonly<PostgresqlExecutionJournalOptions>) {
    if (!options.connectionString.trim()) {
      throw new Error("A PostgreSQL connection string is required.");
    }
    this.pool = new Pool({ connectionString: options.connectionString });
    this.table = `${quoteIdentifier(validatedSchema(options.schema))}.execution_journal_entries`;
  }

  async append(
    result: StateExecutionResult,
  ): Promise<ExecutionJournalAppendResult> {
    const prepared = prepareExecutionJournalEntry(result);
    if (prepared.status === "failure") return prepared;

    let client: PoolClient | null = null;
    try {
      client = await this.pool.connect();
      await client.query("BEGIN");
      await client.query(`LOCK TABLE ${this.table} IN EXCLUSIVE MODE`);
      const sequenceResult = await client.query<{
        readonly next_sequence: number;
      }>(
        `SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence
        FROM ${this.table}
        WHERE business_profile_id = $1
          AND business_profile_version = $2
          AND conversation_id = $3`,
        [
          prepared.draft.businessProfileId,
          prepared.draft.businessProfileVersion,
          prepared.draft.conversationId,
        ],
      );
      const sequence = sequenceResult.rows[0]?.next_sequence;
      const entry = createExecutionJournalEntry(prepared.draft, sequence);
      await client.query(
        `INSERT INTO ${this.table} (
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
      await client.query("COMMIT");
      return deepFreeze({ status: "success", entry });
    } catch {
      await rollbackSafely(client);
      return appendFailure();
    } finally {
      client?.release();
    }
  }

  async snapshot(
    scope: Readonly<ExecutionJournalStoreScope>,
  ): Promise<ExecutionJournalSnapshot> {
    if (!isValidJournalScope(scope)) {
      return snapshotFailure("InvalidJournalScope");
    }
    try {
      const result = await this.pool.query<ExecutionJournalRow>(
        `SELECT
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
        FROM ${this.table}
        WHERE business_profile_id = $1
          AND business_profile_version = $2
          AND conversation_id = $3
        ORDER BY sequence ASC`,
        [
          scope.businessProfileId,
          scope.businessProfileVersion,
          scope.conversationId,
        ],
      );
      const entries: Readonly<ExecutionJournalEntry>[] = [];
      for (const row of result.rows) {
        if (row.journal_schema_version !== EXECUTION_JOURNAL_FORMAT_VERSION) {
          return snapshotFailure("IncompatibleStoredJournalEntry");
        }
        const decoded = decodeExecutionJournalEntry(entryFromRow(row), scope);
        if (decoded.status === "failure") {
          return snapshotFailure("InvalidStoredJournalEntry");
        }
        entries.push(decoded.entry);
      }
      return deepFreeze({ entries });
    } catch {
      return snapshotFailure("JournalReadFailed");
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

function entryFromRow(row: ExecutionJournalRow): unknown {
  return {
    journalEntryId: row.journal_entry_id,
    sequence: row.sequence,
    executionId: row.execution_id,
    requestId: row.request_id,
    traceId: row.trace_id,
    proposalId: row.proposal_id,
    taskIdentifier: row.task_identifier,
    transitionId: row.transition_id,
    conversationId: row.conversation_id,
    businessProfileId: row.business_profile_id,
    businessProfileVersion: row.business_profile_version,
    expectedStateRevision: row.expected_state_revision,
    previousStateRevision: row.previous_state_revision,
    resultingStateRevision: row.resulting_state_revision,
    outcome: row.outcome,
    reason: row.reason,
    executionTimestamp: row.execution_timestamp,
    executionMetadata: row.execution_metadata,
    journalMetadata: {
      schemaVersion: row.journal_schema_version,
      source: row.journal_source,
      recordedAt: row.journal_recorded_at,
    },
  };
}

async function rollbackSafely(client: PoolClient | null): Promise<void> {
  if (!client) return;
  try {
    await client.query("ROLLBACK");
  } catch {
    // The explicit append failure remains the only application-facing result.
  }
}

function appendFailure(): ExecutionJournalAppendResult {
  return deepFreeze({
    status: "failure",
    reason: "JournalAppendFailed",
  } satisfies ExecutionJournalAppendResult);
}

function snapshotFailure(
  failure: NonNullable<ExecutionJournalSnapshot["failure"]>,
): ExecutionJournalSnapshot {
  return deepFreeze({ entries: [], failure });
}
