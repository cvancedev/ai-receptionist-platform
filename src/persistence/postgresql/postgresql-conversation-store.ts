import { Pool } from "pg";
import type {
  ConversationStore,
  ConversationStoreFailureReason,
  ConversationStoreReplaceInput,
  ConversationStoreResult,
  ConversationStoreScope,
} from "../../conversation/conversation-store";
import type { ConversationState } from "../../domain/conversation-state";
import { decodeConversationState } from "../../validation/conversation-state-codec";
import {
  quoteIdentifier,
  validatedSchema,
} from "./migration-runner";

const CONVERSATION_STATE_FORMAT_VERSION = 1;

export interface PostgresqlConversationStoreOptions {
  readonly connectionString: string;
  readonly schema?: string;
}

interface ConversationStateRow {
  readonly business_profile_id: string;
  readonly business_profile_version: number;
  readonly conversation_id: string;
  readonly revision: number;
  readonly state_format_version: number;
  readonly state_document: unknown;
}

/**
 * PostgreSQL storage adapter for complete Conversation State snapshots.
 * It supplies durability and concurrency mechanics only.
 */
export class PostgresqlConversationStore
implements ConversationStore<"asynchronous"> {
  readonly operationMode = "asynchronous";
  private readonly pool: Pool;
  private readonly table: string;

  constructor(options: Readonly<PostgresqlConversationStoreOptions>) {
    if (!options.connectionString.trim()) {
      throw new Error("A PostgreSQL connection string is required.");
    }
    this.pool = new Pool({ connectionString: options.connectionString });
    this.table = `${quoteIdentifier(validatedSchema(options.schema))}.conversation_states`;
  }

  async create(
    state: Readonly<ConversationState>,
  ): Promise<ConversationStoreResult> {
    const decoded = decodeConversationState(state, scopeFromState(state));
    if (decoded.status === "failure") {
      return failure("InvalidConversationState", decoded.errors);
    }
    const candidate = decoded.state;

    try {
      const result = await this.pool.query<ConversationStateRow>(
        `INSERT INTO ${this.table} (
          business_profile_id,
          business_profile_version,
          conversation_id,
          revision,
          state_format_version,
          state_document
        ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
        RETURNING
          business_profile_id,
          business_profile_version,
          conversation_id,
          revision,
          state_format_version,
          state_document`,
        [
          candidate.businessProfileId,
          candidate.businessProfileVersion,
          candidate.conversationId,
          candidate.revision,
          CONVERSATION_STATE_FORMAT_VERSION,
          JSON.stringify(candidate),
        ],
      );
      return rowResult(result.rows[0], scopeFromState(candidate));
    } catch (error) {
      return isUniqueViolation(error)
        ? failure(
          "ConversationAlreadyExists",
          ["Conversation already exists in the requested business scope."],
        )
        : persistenceFailure();
    }
  }

  async read(
    scope: Readonly<ConversationStoreScope>,
  ): Promise<ConversationStoreResult> {
    try {
      const result = await this.pool.query<ConversationStateRow>(
        `SELECT
          business_profile_id,
          business_profile_version,
          conversation_id,
          revision,
          state_format_version,
          state_document
        FROM ${this.table}
        WHERE business_profile_id = $1
          AND business_profile_version = $2
          AND conversation_id = $3`,
        [
          scope.businessProfileId,
          scope.businessProfileVersion,
          scope.conversationId,
        ],
      );
      return result.rows.length === 1
        ? rowResult(result.rows[0], scope)
        : failure(
          "ConversationNotFound",
          ["Conversation was not found in the requested business scope."],
        );
    } catch {
      return persistenceFailure();
    }
  }

  async replace(
    input: Readonly<ConversationStoreReplaceInput>,
  ): Promise<ConversationStoreResult> {
    if (!matchesScope(input.state, input.scope)) {
      return failure(
        "ScopeMismatch",
        ["Replacement state does not match the requested business scope."],
      );
    }
    if (
      !Number.isInteger(input.expectedRevision)
      || input.expectedRevision < 0
      || input.state.revision !== input.expectedRevision + 1
    ) {
      return failure(
        "InvalidRevisionIncrement",
        ["Replacement state must advance the expected revision exactly once."],
      );
    }
    const decoded = decodeConversationState(input.state, input.scope);
    if (decoded.status === "failure") {
      return failure("InvalidConversationState", decoded.errors);
    }
    const candidate = decoded.state;

    try {
      const result = await this.pool.query<ConversationStateRow>(
        `UPDATE ${this.table}
        SET
          revision = $4,
          state_format_version = $5,
          state_document = $6::jsonb,
          updated_at = CURRENT_TIMESTAMP
        WHERE business_profile_id = $1
          AND business_profile_version = $2
          AND conversation_id = $3
          AND revision = $7
        RETURNING
          business_profile_id,
          business_profile_version,
          conversation_id,
          revision,
          state_format_version,
          state_document`,
        [
          input.scope.businessProfileId,
          input.scope.businessProfileVersion,
          input.scope.conversationId,
          candidate.revision,
          CONVERSATION_STATE_FORMAT_VERSION,
          JSON.stringify(candidate),
          input.expectedRevision,
        ],
      );
      if (result.rows.length === 1) {
        return rowResult(result.rows[0], input.scope);
      }

      const current = await this.pool.query<{ readonly revision: number }>(
        `SELECT revision
        FROM ${this.table}
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
        ? failure(
          "ConversationNotFound",
          ["Conversation cannot be replaced in the requested business scope."],
        )
        : failure(
          "RevisionConflict",
          ["Conversation revision does not match the expected revision."],
        );
    } catch {
      return persistenceFailure();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

function rowResult(
  row: ConversationStateRow | undefined,
  scope: Readonly<ConversationStoreScope>,
): ConversationStoreResult {
  if (!row) return persistenceFailure();
  if (row.state_format_version !== CONVERSATION_STATE_FORMAT_VERSION) {
    return failure(
      "IncompatibleStoredState",
      ["Persisted Conversation State uses an unsupported format version."],
    );
  }
  if (
    row.business_profile_id !== scope.businessProfileId
    || row.business_profile_version !== scope.businessProfileVersion
    || row.conversation_id !== scope.conversationId
  ) {
    return failure(
      "InvalidStoredState",
      ["Persisted Conversation State identity is inconsistent."],
    );
  }

  const decoded = decodeConversationState(row.state_document, scope);
  if (
    decoded.status === "failure"
    || decoded.state.revision !== row.revision
  ) {
    return failure(
      "InvalidStoredState",
      decoded.status === "failure"
        ? decoded.errors
        : ["Persisted Conversation State revision is inconsistent."],
    );
  }
  return { status: "success", state: decoded.state };
}

function scopeFromState(
  state: Readonly<ConversationState>,
): ConversationStoreScope {
  return {
    conversationId: state.conversationId,
    businessProfileId: state.businessProfileId,
    businessProfileVersion: state.businessProfileVersion,
  };
}

function matchesScope(
  state: Readonly<ConversationState>,
  scope: Readonly<ConversationStoreScope>,
): boolean {
  return state.conversationId === scope.conversationId
    && state.businessProfileId === scope.businessProfileId
    && state.businessProfileVersion === scope.businessProfileVersion;
}

function isUniqueViolation(error: unknown): boolean {
  return error !== null
    && typeof error === "object"
    && "code" in error
    && error.code === "23505";
}

function persistenceFailure(): ConversationStoreResult {
  return failure(
    "PersistenceFailure",
    ["Conversation persistence is unavailable."],
  );
}

function failure(
  reason: ConversationStoreFailureReason,
  errors: readonly string[],
): ConversationStoreResult {
  return { status: "failure", reason, errors };
}
