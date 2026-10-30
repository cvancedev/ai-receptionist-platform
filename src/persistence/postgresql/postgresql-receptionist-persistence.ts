import { Pool, type PoolClient } from "pg";
import {
  MAXIMUM_STORED_MESSAGES,
  isConversationPersistenceScope,
  isPersistenceDigest,
  isStoredMessage,
  isTurnId,
  isTurnUsage,
  sameScope,
  type CommitTurnInput,
  type CommitTurnResult,
  type ConversationPersistenceScope,
  type ConversationSeed,
  type CreateConversationResult,
  type FindSessionResult,
  type LoadConversationResult,
  type LoadTurnReceiptResult,
  type MonthlyUsageSummary,
  type PersistedSessionRecord,
  type ReceptionistPersistence,
  type ScopeLookupResult,
  type StoredMessage,
  type TurnReceipt,
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

interface ReceiptRow {
  readonly turn_id: string;
  readonly request_digest: string;
  readonly turn_number: number;
  readonly expected_revision: number;
  readonly resulting_revision: number;
  readonly outcome_code: string;
  readonly provider_identifier: string | null;
  readonly model_identifier: string | null;
  readonly stage: string;
  readonly readiness: string;
  readonly pending_field_id: string | null;
  readonly handoff_available: boolean;
  readonly first_message_id: number;
  readonly last_message_id: number;
  readonly duration_ms: number;
  readonly created_at: Date;
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
  private readonly receiptTable: string;
  private readonly usageTable: string;
  private readonly migrationTable: string;

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
    this.receiptTable = `${quoteIdentifier(schema)}.receptionist_turn_receipts`;
    this.usageTable = `${quoteIdentifier(schema)}.receptionist_usage_events`;
    this.migrationTable = `${quoteIdentifier(schema)}.app_schema_migrations`;
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
    if (!isTurnId(input.turnId)) return "failure";
    if (!isPersistenceDigest(input.requestDigest)) return "failure";
    if (!isTurnUsage(input.usage)) return "failure";
    if (!boundedNonNegative(input.durationMs, 600_000)) return "failure";
    if (!boundedNonNegative(input.monthlyBudgetMicros, Number.MAX_SAFE_INTEGER)) {
      return "failure";
    }
    if (!boundedNonNegative(input.monthStartMs, Number.MAX_SAFE_INTEGER)) return "failure";
    if (!boundedText(input.outcomeCode, 64)
      || !boundedText(input.stage, 64)
      || !boundedText(input.readiness, 64)) return "failure";
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) {
      return "failure";
    }
    if (!Number.isInteger(input.expectedTurnNumber) || input.expectedTurnNumber < 0) {
      return "failure";
    }
    if (input.messages.length > MAXIMUM_STORED_MESSAGES) return "failure";
    if (input.messages.length === 0) return "failure";
    if (input.messages.some((message) => !isStoredMessage(message))) return "failure";
    if (!sameScope(input.state, input.scope)) return "failure";
    if (input.state.revision < input.expectedRevision) return "failure";
    const decoded = decodeConversationState(input.state, input.scope);
    if (decoded.status === "failure") return "failure";

    const orderedMessages = [...input.messages].sort(
      (left, right) => left.messageId - right.messageId,
    );
    const firstMessage = orderedMessages[0];
    const lastMessage = orderedMessages[orderedMessages.length - 1];
    if (!firstMessage || !lastMessage) return "failure";

    let client: PoolClient | null = null;
    try {
      client = await this.pool.connect();
      await client.query("BEGIN");
      // Serialize duplicate turn identifiers, then budget accounting for the
      // business. The second lock is always acquired after the first, so two
      // different turns cannot deadlock on the pair.
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [turnLockKey(input.scope, input.turnId)],
      );
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [budgetLockKey(input.scope.businessProfileId)],
      );

      const existing = await client.query<{ readonly request_digest: string }>(
        `SELECT request_digest FROM ${this.receiptTable}
        WHERE business_profile_id = $1
          AND business_profile_version = $2
          AND conversation_id = $3
          AND turn_id = $4`,
        [
          input.scope.businessProfileId,
          input.scope.businessProfileVersion,
          input.scope.conversationId,
          input.turnId,
        ],
      );
      const prior = existing.rows[0];
      if (prior) {
        await rollbackSafely(client);
        return prior.request_digest === input.requestDigest ? "replayed" : "turn-mismatch";
      }

      const spent = await this.usageTotal(client, input);
      if (spent === null) {
        await rollbackSafely(client);
        return "failure";
      }
      if (spent + input.usage.costMicros > input.monthlyBudgetMicros) {
        await rollbackSafely(client);
        return "budget-exhausted";
      }

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

      await this.insertMessages(client, input.scope, orderedMessages);

      await client.query(
        `INSERT INTO ${this.receiptTable} (
          business_profile_id, business_profile_version, conversation_id,
          turn_id, request_digest, turn_number, expected_revision,
          resulting_revision, outcome_code, execution_mode,
          provider_identifier, model_identifier, stage, readiness,
          pending_field_id, handoff_available, first_message_id,
          last_message_id, duration_ms
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, 'pilot',
          $10, $11, $12, $13, $14, $15, $16, $17, $18
        )`,
        [
          input.scope.businessProfileId,
          input.scope.businessProfileVersion,
          input.scope.conversationId,
          input.turnId,
          input.requestDigest,
          input.turnNumber,
          input.expectedRevision,
          decoded.state.revision,
          input.outcomeCode,
          input.usage.providerIdentifier,
          input.usage.modelIdentifier,
          input.stage,
          input.readiness,
          input.pendingFieldId,
          input.handoffAvailable,
          firstMessage.messageId,
          lastMessage.messageId,
          input.durationMs,
        ],
      );

      // Settle a reservation placed before a paid provider call, or record a
      // settled zero-cost row for the disabled provider. A pre-existing settled
      // row for this turn is impossible here because the receipt was absent.
      const settled = await client.query(
        `INSERT INTO ${this.usageTable} (
          business_profile_id, business_profile_version, conversation_id,
          turn_id, state, provider_identifier, model_identifier,
          input_tokens, output_tokens, reserved_cost_micros, cost_micros,
          currency, settled_at
        ) VALUES (
          $1, $2, $3, $4, 'settled', $5, $6, $7, $8, NULL, $9, 'USD',
          CURRENT_TIMESTAMP
        )
        ON CONFLICT (
          business_profile_id, business_profile_version, conversation_id, turn_id
        ) DO UPDATE SET
          state = 'settled',
          provider_identifier = EXCLUDED.provider_identifier,
          model_identifier = EXCLUDED.model_identifier,
          input_tokens = EXCLUDED.input_tokens,
          output_tokens = EXCLUDED.output_tokens,
          reserved_cost_micros = NULL,
          cost_micros = EXCLUDED.cost_micros,
          settled_at = CURRENT_TIMESTAMP
        WHERE receptionist_usage_events.state = 'reserved'`,
        [
          input.scope.businessProfileId,
          input.scope.businessProfileVersion,
          input.scope.conversationId,
          input.turnId,
          input.usage.providerIdentifier,
          input.usage.modelIdentifier,
          input.usage.inputTokens,
          input.usage.outputTokens,
          input.usage.costMicros,
        ],
      );
      if (settled.rowCount !== 1) {
        await rollbackSafely(client);
        return "failure";
      }

      await client.query("COMMIT");
      return "committed";
    } catch (error) {
      await rollbackSafely(client);
      return isUniqueViolation(error) ? "conflict" : "failure";
    } finally {
      client?.release();
    }
  }

  async loadTurnReceipt(
    scope: ConversationPersistenceScope,
    turnId: string,
  ): Promise<LoadTurnReceiptResult> {
    if (!isConversationPersistenceScope(scope) || !isTurnId(turnId)) {
      return { status: "not-found" };
    }
    try {
      const result = await this.pool.query<ReceiptRow>(
        `SELECT turn_id, request_digest, turn_number, expected_revision,
          resulting_revision, outcome_code, provider_identifier, model_identifier,
          stage, readiness, pending_field_id, handoff_available,
          first_message_id, last_message_id, duration_ms, created_at
        FROM ${this.receiptTable}
        WHERE business_profile_id = $1
          AND business_profile_version = $2
          AND conversation_id = $3
          AND turn_id = $4`,
        [scope.businessProfileId, scope.businessProfileVersion, scope.conversationId, turnId],
      );
      const row = result.rows[0];
      if (!row) return { status: "not-found" };

      const messages = await this.pool.query<MessageRow>(
        `SELECT message_id, role, content
        FROM ${this.messageTable}
        WHERE business_profile_id = $1
          AND business_profile_version = $2
          AND conversation_id = $3
          AND message_id BETWEEN $4 AND $5
        ORDER BY message_id`,
        [
          scope.businessProfileId,
          scope.businessProfileVersion,
          scope.conversationId,
          row.first_message_id,
          row.last_message_id,
        ],
      );
      if (messages.rows.length !== row.last_message_id - row.first_message_id + 1) {
        return { status: "failure" };
      }
      const ordered: StoredMessage[] = messages.rows.map((message) => {
        if ((message.role !== "customer" && message.role !== "assistant")
          || typeof message.content !== "string"
          || !Number.isInteger(message.message_id)) {
          throw new Error("stored message is invalid");
        }
        return Object.freeze({
          messageId: message.message_id,
          role: message.role as "customer" | "assistant",
          content: message.content,
        });
      });

      const receipt: TurnReceipt = Object.freeze({
        scope: { ...scope },
        turnId: row.turn_id,
        requestDigest: row.request_digest,
        turnNumber: row.turn_number,
        expectedRevision: row.expected_revision,
        resultingRevision: row.resulting_revision,
        outcomeCode: row.outcome_code,
        stage: row.stage,
        readiness: row.readiness,
        pendingFieldId: row.pending_field_id,
        handoffAvailable: row.handoff_available,
        providerIdentifier: row.provider_identifier,
        modelIdentifier: row.model_identifier,
        durationMs: row.duration_ms,
        createdAt: row.created_at.getTime(),
        messages: Object.freeze(ordered),
      });
      return { status: "found", receipt };
    } catch {
      return { status: "failure" };
    }
  }

  async monthlyUsageMicros(
    businessProfileId: string,
    monthStartMs: number,
  ): Promise<MonthlyUsageSummary | null> {
    if (typeof businessProfileId !== "string" || businessProfileId.length === 0) return null;
    if (!boundedNonNegative(monthStartMs, Number.MAX_SAFE_INTEGER)) return null;
    try {
      const result = await this.pool.query<{
        readonly settled: string;
        readonly reserved: string;
      }>(
        `SELECT
          COALESCE(SUM(CASE WHEN state = 'settled' THEN cost_micros ELSE 0 END), 0)::text
            AS settled,
          COALESCE(SUM(CASE WHEN state = 'reserved' THEN reserved_cost_micros ELSE 0 END), 0)::text
            AS reserved
        FROM ${this.usageTable}
        WHERE business_profile_id = $1
          AND created_at >= to_timestamp($2 / 1000.0)`,
        [businessProfileId, monthStartMs],
      );
      const row = result.rows[0];
      const settled = Number(row?.settled ?? "0");
      const reserved = Number(row?.reserved ?? "0");
      if (!Number.isSafeInteger(settled) || !Number.isSafeInteger(reserved)) return null;
      return Object.freeze({ settledMicros: settled, reservedMicros: reserved });
    } catch {
      return null;
    }
  }

  async readSchemaVersion(): Promise<number | null> {
    try {
      const result = await this.pool.query<{ readonly version: number | null }>(
        `SELECT MAX(version)::int AS version FROM ${this.migrationTable}`,
      );
      const version = result.rows[0]?.version;
      return typeof version === "number" && Number.isInteger(version) ? version : null;
    } catch {
      return null;
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

  private async usageTotal(
    client: PoolClient,
    input: CommitTurnInput,
  ): Promise<number | null> {
    const result = await client.query<{ readonly total: string }>(
      `SELECT COALESCE(SUM(
          CASE WHEN state = 'settled' THEN cost_micros ELSE reserved_cost_micros END
        ), 0)::text AS total
      FROM ${this.usageTable}
      WHERE business_profile_id = $1
        AND created_at >= to_timestamp($2 / 1000.0)
        AND NOT (
          business_profile_version = $3
          AND conversation_id = $4
          AND turn_id = $5
        )`,
      [
        input.scope.businessProfileId,
        input.monthStartMs,
        input.scope.businessProfileVersion,
        input.scope.conversationId,
        input.turnId,
      ],
    );
    const total = Number(result.rows[0]?.total ?? "0");
    return Number.isSafeInteger(total) ? total : null;
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

function turnLockKey(scope: ConversationPersistenceScope, turnId: string): string {
  return `receptionist-turn:${scope.businessProfileId}:${scope.businessProfileVersion}:`
    + `${scope.conversationId}:${turnId}`;
}

function budgetLockKey(businessProfileId: string): string {
  return `receptionist-budget:${businessProfileId}`;
}

function boundedNonNegative(value: unknown, maximum: number): value is number {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= 0
    && value <= maximum;
}

function boundedText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum;
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

