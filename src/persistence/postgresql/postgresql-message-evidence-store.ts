import { Pool } from "pg";
import { deepFreeze } from "../../ai/shared/immutable";
import type { ConversationStoreScope } from "../../conversation/conversation-store";
import {
  decodeDurableMessageEvidence,
  isValidMessageEvidenceScope,
  type DurableMessageEvidence,
  type DurableMessageEvidenceReadResult,
  type DurableMessageEvidenceStore,
} from "../../application/end-to-end/message-evidence";
import { quoteIdentifier, validatedSchema } from "./migration-runner";

export interface PostgresqlMessageEvidenceStoreOptions {
  readonly connectionString: string;
  readonly schema?: string;
}

export class PostgresqlMessageEvidenceStore implements DurableMessageEvidenceStore {
  private readonly pool: Pool;
  private readonly table: string;

  constructor(options: Readonly<PostgresqlMessageEvidenceStoreOptions>) {
    if (!options.connectionString.trim()) {
      throw new Error("A PostgreSQL connection string is required.");
    }
    const schema = validatedSchema(options.schema);
    this.pool = new Pool({ connectionString: options.connectionString });
    this.table = `${quoteIdentifier(schema)}.conversation_message_evidence`;
  }

  async snapshot(
    scope: Readonly<ConversationStoreScope>,
  ): Promise<DurableMessageEvidenceReadResult> {
    if (!isValidMessageEvidenceScope(scope)) {
      return deepFreeze({ status: "failure" as const, reason: "InvalidScope" as const });
    }
    try {
      const result = await this.pool.query(
        `SELECT message_id, turn_id, business_profile_id,
          business_profile_version, conversation_id, activation_revision, sequence, source, content,
          resulting_state_revision, recorded_at, evidence_schema_version
        FROM ${this.table}
        WHERE business_profile_id = $1
          AND business_profile_version = $2
          AND conversation_id = $3
        ORDER BY sequence ASC`,
        [scope.businessProfileId, scope.businessProfileVersion, scope.conversationId],
      );
      const entries: Readonly<DurableMessageEvidence>[] = [];
      for (const row of result.rows) {
        const decoded = decodeDurableMessageEvidence({
          messageId: row.message_id,
          turnId: row.turn_id,
          businessProfileId: row.business_profile_id,
          businessProfileVersion: row.business_profile_version,
          conversationId: row.conversation_id,
          activationRevision: row.activation_revision,
          sequence: row.sequence,
          source: row.source,
          content: row.content,
          resultingStateRevision: row.resulting_state_revision,
          recordedAt: row.recorded_at,
          evidenceSchemaVersion: row.evidence_schema_version,
        }, scope);
        if (decoded.status === "failure") {
          return deepFreeze({ status: "failure" as const, reason: "CorruptEvidence" as const });
        }
        entries.push(decoded.evidence);
      }
      return deepFreeze({
        status: "success",
        snapshot: { scope: { ...scope }, entries },
      });
    } catch {
      return deepFreeze({
        status: "failure" as const,
        reason: "InfrastructureFailure" as const,
      });
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
