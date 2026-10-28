import { Pool, type PoolClient } from "pg";
import {
  MAXIMUM_STORED_MESSAGES,
  isConversationPersistenceScope,
  isPersistenceDigest,
  isStoredMessage,
  sameScope,
  type CommitTurnInput,
  type CommitTurnResult,
  type ConversationPersistenceScope,
  type ConversationSeed,
  type CreateConversationResult,
  type FindSessionResult,
  type LoadConversationResult,
  type PersistedSessionRecord,
  type ReceptionistPersistence,
  type ScopeLookupResult,
  type StoredMessage,
} from "../../server/persistence/receptionist-persistence";
import { decodeConversationState } from "../../validation/conversation-state-codec";
import { quoteIdentifier, validatedSchema } from "./migration-runner";

const CONVERSATION_STATE_FORMAT_VERSION = 1;

export interface PostgresqlReceptionistPersistenceOptions {
  readonly connectionString: string;
  readonly schema?: string;
}

interface ConversationRow {
  readonly business_profile_id: string;
  readonly business_profile_version: number;
  readonly conversation_id: string;
  readonly handle_hash: string;
  readonly pending_field_id: string | null;
  readonly handoff_available: boolean;
  readonly turn_number: number;
  readonly next_message_id: number;
  readonly revision: number;
  readonly state_document: unknown;
}

interface MessageRow {
  readonly message_id: number;
  readonly role: string;
  readonly content: string;
}

interface SessionRow {
  readonly token_hash: string;
  readonly csrf_token_hash: string;
  readonly session_key: string;
  readonly business_profile_id: string;
  readonly business_profile_version: number;
  readonly conversation_id: string;
  readonly conversation_handle_hash: string | null;
  readonly actor_id: string;
  readonly created_at: Date;
  readonly expires_at: Date;
  readonly revoked_at: Date | null;
}

/**
 * PostgreSQL storage for the pilot receptionist.
 *
 * State snapshots reuse the certified `conversation_states` shape and decoder.
 * The turn commit is a single transaction that compares the expected revision,
 * writes the final snapshot, updates conversation metadata, and appends the
 * turn's messages. Any failure rolls back the entire turn, so a partial update
 * is never observable.
 */
export class PostgresqlReceptionistPersistence implements ReceptionistPersistence {
  readonly kind = "postgresql" as const;
  private readonly pool: Pool;
  private readonly stateTable: string;
  private readonly conversationTable: string;
  private readonly messageTable: string;
  private readonly sessionTable: string;

  constructor(options: Readonly<PostgresqlReceptionistPersistenceOptions>) {
    if (!options.connectionString.trim()) {
      throw new Error("A PostgreSQL connection string is required.");
    }
    const schema = validatedSchema(options.schema);
    this.pool = new Pool({ connectionString: options.connectionString });
    this.stateTable = `${quoteIdentifier(schema)}.conversation_states`;
    this.conversationTable = `${quoteIdentifier(schema)}.receptionist_conversations`;
    this.messageTable = `${quoteIdentifier(schema)}.receptionist_messages`;
    this.sessionTable = `${quoteIdentifier(schema)}.receptionist_sessions`;
  }

  async createConversation(seed: ConversationSeed): Promise<CreateConversationResult> {
    if (!isConversationPersistenceScope(seed?.scope)) return "failure";
    if (!isPersistenceDigest(seed.handleHash)) return "failure";
    if (!isStoredMessage(seed.greeting) || seed.greeting.messageId !== 1) return "failure";
    const decoded = decodeConversationState(seed.state, seed.scope);
    if (decoded.status === "failure" || decoded.state.revision !== 0) return "failure";

    let client: PoolClient | null = null;
    try {
      client = await this.pool.connect();
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO ${this.stateTable} (
          business_profile_id, business_profile_version, conversation_id,
          revision, state_format_version, state_document
        ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          seed.scope.businessProfileId,
          seed.scope.businessProfileVersion,
          seed.scope.conversationId,
          0,
          CONVERSATION_STATE_FORMAT_VERSION,
          JSON.stringify(decoded.state),
        ],
      );
      await client.query(
        `INSERT INTO ${this.conversationTable} (
          business_profile_id, business_profile_version, conversation_id,
          handle_hash, pending_field_id, handoff_available, turn_number,
          next_message_id
        ) VALUES ($1, $2, $3, $4, NULL, false, 0, $5)`,
        [
          seed.scope.businessProfileId,
          seed.scope.businessProfileVersion,
          seed.scope.conversationId,
          seed.handleHash,
          2,
        ],
      );
      await this.insertMessages(client, seed.scope, [seed.greeting]);
      await client.query("COMMIT");
      return "created";
    } catch (error) {
      await rollbackSafely(client);
      return isUniqueViolation(error) ? "already-exists" : "failure";
    } finally {
      client?.release();
    }
  }

  async loadConversation(
    scope: ConversationPersistenceScope,
  ): Promise<LoadConversationResult> {
    if (!isConversationPersistenceScope(scope)) return { status: "failure" };
    try {
      const result = await this.pool.query<ConversationRow>(
        `SELECT
          c.business_profile_id,
          c.business_profile_version,
          c.conversation_id,
          c.handle_hash,
          c.pending_field_id,
          c.handoff_available,
          c.turn_number,
          c.next_message_id,
          s.revision,
          s.state_document
        FROM ${this.conversationTable} c
        INNER JOIN ${this.stateTable} s
          ON s.business_profile_id = c.business_profile_id
          AND s.business_profile_version = c.business_profile_version
          AND s.conversation_id = c.conversation_id
        WHERE c.business_profile_id = $1
          AND c.business_profile_version = $2
          AND c.conversation_id = $3`,
        [scope.businessProfileId, scope.businessProfileVersion, scope.conversationId],
      );
      const row = result.rows[0];
      if (!row) return { status: "not-found" };

      const decoded = decodeConversationState(row.state_document, scope);
      if (
        decoded.status === "failure"
        || decoded.state.revision !== row.revision
        || row.next_message_id < 2
      ) {
        return { status: "failure" };
      }

      const messages = await this.pool.query<MessageRow>(
        `SELECT message_id, role, content
        FROM ${this.messageTable}
        WHERE business_profile_id = $1
          AND business_profile_version = $2
          AND conversation_id = $3
        ORDER BY message_id DESC
        LIMIT $4`,
        [
          scope.businessProfileId,
          scope.businessProfileVersion,
          scope.conversationId,
          MAXIMUM_STORED_MESSAGES,
        ],
      );
      const ordered = [...messages.rows].reverse().map((message) => {
        if (
          (message.role !== "customer" && message.role !== "assistant")
          || typeof message.content !== "string"
          || !Number.isInteger(message.message_id)
        ) {
          throw new Error("stored message is invalid");
        }
        return Object.freeze({
          messageId: message.message_id,
          role: message.role as "customer" | "assistant",
          content: message.content,
        });
      });

      return {
        status: "found",
        conversation: Object.freeze({
          scope: { ...scope },
          handleHash: row.handle_hash,
          state: decoded.state,
          messages: Object.freeze(ordered),
          pendingFieldId: row.pending_field_id,
          handoffAvailable: row.handoff_available,
          turnNumber: row.turn_number,
          nextMessageId: row.next_message_id,
        }),
      };
    } catch {
      return { status: "failure" };
    }
  }

  async findScopeByHandleHash(handleHash: string): Promise<ScopeLookupResult> {
    if (!isPersistenceDigest(handleHash)) return { status: "not-found" };
    try {
      const result = await this.pool.query<{
        readonly business_profile_id: string;
        readonly business_profile_version: number;
        readonly conversation_id: string;
      }>(
        `SELECT business_profile_id, business_profile_version, conversation_id
        FROM ${this.conversationTable}
        WHERE handle_hash = $1`,
        [handleHash],
      );
      const row = result.rows[0];
      return row
        ? {
          status: "found",
          scope: {
            businessProfileId: row.business_profile_id,
            businessProfileVersion: row.business_profile_version,
            conversationId: row.conversation_id,
          },
        }
        : { status: "not-found" };
    } catch {
      return { status: "failure" };
    }
  }

  async commitTurn(input: CommitTurnInput): Promise<CommitTurnResult> {
    if (!isConversationPersistenceScope(input?.scope)) return "failure";
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) {
      return "failure";
    }
    if (!Number.isInteger(input.expectedTurnNumber) || input.expectedTurnNumber < 0) {
      return "failure";
    }
    if (input.messages.length > MAXIMUM_STORED_MESSAGES) return "failure";
    if (input.messages.some((message) => !isStoredMessage(message))) return "failure";
    if (!sameScope(input.state, input.scope)) return "failure";
    if (input.state.revision < input.expectedRevision) return "failure";
    const decoded = decodeConversationState(input.state, input.scope);
    if (decoded.status === "failure") return "failure";

    let client: PoolClient | null = null;
    try {
      client = await this.pool.connect();
      await client.query("BEGIN");
      const updated = await client.query(
        `UPDATE ${this.stateTable}
        SET revision = $4,
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
          decoded.state.revision,
          CONVERSATION_STATE_FORMAT_VERSION,
          JSON.stringify(decoded.state),
          input.expectedRevision,
        ],
      );
      if (updated.rowCount !== 1) {
        await rollbackSafely(client);
        return this.classifyMissingCommit(input.scope);
      }

      const metadata = await client.query(
        `UPDATE ${this.conversationTable}
        SET pending_field_id = $4,
          handoff_available = $5,
          turn_number = $6,
          next_message_id = $7,
          updated_at = CURRENT_TIMESTAMP
        WHERE business_profile_id = $1
          AND business_profile_version = $2
          AND conversation_id = $3
          AND turn_number = $8`,
        [
          input.scope.businessProfileId,
          input.scope.businessProfileVersion,
          input.scope.conversationId,
          input.pendingFieldId,
          input.handoffAvailable,
          input.turnNumber,
          input.nextMessageId,
          input.expectedTurnNumber,
        ],
      );
      if (metadata.rowCount !== 1) {
        await rollbackSafely(client);
        return this.classifyMissingCommit(input.scope);
      }

      await this.insertMessages(client, input.scope, input.messages);
      await client.query("COMMIT");
      return "committed";
    } catch (error) {
      await rollbackSafely(client);
      return isUniqueViolation(error) ? "conflict" : "failure";
    } finally {
      client?.release();
    }
  }

  async createSession(record: PersistedSessionRecord): Promise<"created" | "failure"> {
    if (!isPersistenceDigest(record?.tokenHash)
      || !isPersistenceDigest(record.csrfTokenHash)
      || !Number.isInteger(record.businessProfileVersion)
      || record.businessProfileVersion < 1
      || record.expiresAt <= record.createdAt) {
      return "failure";
    }
    try {
      await this.pool.query(
        `INSERT INTO ${this.sessionTable} (
          token_hash, csrf_token_hash, session_key,
          business_profile_id, business_profile_version, conversation_id,
          conversation_handle_hash, actor_id, created_at, expires_at, revoked_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          to_timestamp($9 / 1000.0), to_timestamp($10 / 1000.0), NULL
        )`,
        [
          record.tokenHash,
          record.csrfTokenHash,
          record.sessionKey,
          record.businessProfileId,
          record.businessProfileVersion,
          record.conversationId,
          record.conversationHandleHash,
          record.actorId,
          record.createdAt,
          record.expiresAt,
        ],
      );
      return "created";
    } catch {
      return "failure";
    }
  }

  async findSession(tokenHash: string): Promise<FindSessionResult> {
    if (!isPersistenceDigest(tokenHash)) return { status: "not-found" };
    try {
      const result = await this.pool.query<SessionRow>(
        `SELECT
          token_hash, csrf_token_hash, session_key,
          business_profile_id, business_profile_version, conversation_id,
          conversation_handle_hash, actor_id, created_at, expires_at, revoked_at
        FROM ${this.sessionTable}
        WHERE token_hash = $1`,
        [tokenHash],
      );
      const row = result.rows[0];
      if (!row) return { status: "not-found" };
      return {
        status: "found",
        session: Object.freeze({
          tokenHash: row.token_hash,
          csrfTokenHash: row.csrf_token_hash,
          sessionKey: row.session_key,
          businessProfileId: row.business_profile_id,
          businessProfileVersion: row.business_profile_version,
          conversationId: row.conversation_id,
          conversationHandleHash: row.conversation_handle_hash,
          actorId: row.actor_id,
          createdAt: row.created_at.getTime(),
          expiresAt: row.expires_at.getTime(),
          revokedAt: row.revoked_at ? row.revoked_at.getTime() : null,
        }),
      };
    } catch {
      return { status: "failure" };
    }
  }

  async revokeSession(
    tokenHash: string,
    revokedAt: number,
  ): Promise<"revoked" | "not-found" | "failure"> {
    if (!isPersistenceDigest(tokenHash)) return "not-found";
    try {
      const result = await this.pool.query(
        `UPDATE ${this.sessionTable}
        SET revoked_at = COALESCE(revoked_at, to_timestamp($2 / 1000.0))
        WHERE token_hash = $1`,
        [tokenHash, revokedAt],
      );
      return result.rowCount === 1 ? "revoked" : "not-found";
    } catch {
      return "failure";
    }
  }

  async countSessions(): Promise<number> {
    try {
      const result = await this.pool.query<{ readonly count: string }>(
        `SELECT COUNT(*)::text AS count FROM ${this.sessionTable}`,
      );
      return Number(result.rows[0]?.count ?? "0");
    } catch {
      return 0;
    }
  }

  async pruneSessions(now: number): Promise<number> {
    try {
      const result = await this.pool.query(
        `DELETE FROM ${this.sessionTable}
        WHERE expires_at <= to_timestamp($1 / 1000.0)
          OR revoked_at IS NOT NULL`,
        [now],
      );
      return result.rowCount ?? 0;
    } catch {
      return 0;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async classifyMissingCommit(
    scope: ConversationPersistenceScope,
  ): Promise<"conflict" | "not-found"> {
    try {
      const current = await this.pool.query<{ readonly revision: number }>(
        `SELECT revision FROM ${this.stateTable}
        WHERE business_profile_id = $1
          AND business_profile_version = $2
          AND conversation_id = $3`,
        [scope.businessProfileId, scope.businessProfileVersion, scope.conversationId],
      );
      return current.rows.length === 0 ? "not-found" : "conflict";
    } catch {
      return "conflict";
    }
  }

  private async insertMessages(
    client: PoolClient,
    scope: ConversationPersistenceScope,
    messages: readonly StoredMessage[],
  ): Promise<void> {
    for (const message of messages) {
      await client.query(
        `INSERT INTO ${this.messageTable} (
          business_profile_id, business_profile_version, conversation_id,
          message_id, role, content
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          scope.businessProfileId,
          scope.businessProfileVersion,
          scope.conversationId,
          message.messageId,
          message.role,
          message.content,
        ],
      );
    }
  }
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
    // The sanitized failure result remains authoritative.
  }
}

