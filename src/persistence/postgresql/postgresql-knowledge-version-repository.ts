import { Pool, type PoolClient } from "pg";
import type {
  ConfigurationRepositoryFailureReason,
  ConfigurationRepositoryResult,
  CreateKnowledgeDraftInput,
  KnowledgeRevisionScope,
  KnowledgeRevisionSnapshot,
  KnowledgeVersionRepository,
  TransitionKnowledgeLifecycleInput,
} from "../../business-configuration/contracts";
import {
  detachKnowledgeRevisionSnapshot,
  validateKnowledgeRevisionScope,
} from "../../business-configuration/contract-support";
import { decodeKnowledgeRecord } from "../../validation/knowledge-record-codec";
import { quoteIdentifier, validatedSchema } from "./migration-runner";

const RECORD_FORMAT_VERSION = 1;

interface KnowledgeRecordRow {
  readonly business_profile_id: string;
  readonly business_profile_version: number;
  readonly knowledge_record_id: string;
  readonly knowledge_record_version: number;
  readonly revision: number;
  readonly lifecycle_state: string;
  readonly audience: string;
  readonly source_identity: string;
  readonly effective_date: string;
  readonly record_format_version: number;
  readonly record_document: unknown;
}

export interface PostgresqlKnowledgeVersionRepositoryOptions {
  readonly connectionString: string;
  readonly schema?: string;
}

export class PostgresqlKnowledgeVersionRepository
implements KnowledgeVersionRepository<"asynchronous"> {
  readonly operationMode = "asynchronous";
  private readonly pool: Pool;
  private readonly table: string;
  private readonly transitions: string;

  constructor(
    options: Readonly<PostgresqlKnowledgeVersionRepositoryOptions>,
  ) {
    if (!options.connectionString.trim()) {
      throw new Error("A PostgreSQL connection string is required.");
    }
    this.pool = new Pool({ connectionString: options.connectionString });
    const schema = quoteIdentifier(validatedSchema(options.schema));
    this.table = `${schema}.knowledge_record_versions`;
    this.transitions = `${schema}.knowledge_record_lifecycle_transitions`;
  }

  async createDraft(
    input: Readonly<CreateKnowledgeDraftInput>,
  ): Promise<ConfigurationRepositoryResult<KnowledgeRevisionSnapshot>> {
    const scope = validateKnowledgeRevisionScope(input.scope);
    if (scope.status === "invalid") {
      return failure("InvalidScope", ["Knowledge revision scope is invalid."]);
    }
    if (
      input.context.expectedRevision !== 0
      || input.record.lifecycleState !== "draft"
    ) {
      return failure("RejectedInput", [
        "Only an application-authorized initial knowledge draft may be created.",
      ]);
    }
    const decoded = decodeKnowledgeRecord(input.record, scope.scope);
    if (decoded.status === "failure") {
      return failure("RejectedInput", decoded.errors);
    }

    try {
      const result = await this.pool.query<KnowledgeRecordRow>(
        `INSERT INTO ${this.table} (
          business_profile_id, business_profile_version,
          knowledge_record_id, knowledge_record_version, revision,
          lifecycle_state, audience, source_identity, effective_date,
          record_format_version, record_document, request_id, actor_id,
          authorization_decision_id, authorization_decision, audit_event_id,
          audit_operation, audit_subject, audit_reason
        ) VALUES (
          $1, $2, $3, $4, 0, $5, $6, $7, $8, $9, $10::jsonb,
          $11, $12, $13, $14, $15, $16, $17, $18
        ) RETURNING
          business_profile_id, business_profile_version,
          knowledge_record_id, knowledge_record_version, revision,
          lifecycle_state, audience, source_identity, effective_date,
          record_format_version, record_document`,
        [
          scope.scope.businessProfileId,
          scope.scope.businessProfileVersion,
          scope.scope.knowledgeRecordId,
          scope.scope.knowledgeRecordVersion,
          decoded.record.lifecycleState,
          decoded.record.audience,
          decoded.record.source,
          decoded.record.effectiveDate,
          RECORD_FORMAT_VERSION,
          JSON.stringify(decoded.record),
          input.context.requestId,
          input.context.authorization.actorId,
          input.context.authorization.decisionId,
          input.context.authorization.decision,
          input.context.audit.auditEventId,
          input.context.audit.operation,
          input.context.audit.subject,
          input.context.audit.reason,
        ],
      );
      return rowResult(result.rows[0], scope.scope);
    } catch (error) {
      return isUniqueViolation(error)
        ? failure("RevisionAlreadyExists", [
          "Knowledge revision already exists in the requested scope.",
        ])
        : persistenceFailure();
    }
  }

  async readRevision(
    scopeInput: Readonly<KnowledgeRevisionScope>,
  ): Promise<ConfigurationRepositoryResult<KnowledgeRevisionSnapshot>> {
    const scope = validateKnowledgeRevisionScope(scopeInput);
    if (scope.status === "invalid") {
      return failure("InvalidScope", ["Knowledge revision scope is invalid."]);
    }
    try {
      const result = await this.pool.query<KnowledgeRecordRow>(
        `SELECT
          business_profile_id, business_profile_version,
          knowledge_record_id, knowledge_record_version, revision,
          lifecycle_state, audience, source_identity, effective_date,
          record_format_version, record_document
        FROM ${this.table}
        WHERE business_profile_id = $1
          AND business_profile_version = $2
          AND knowledge_record_id = $3
          AND knowledge_record_version = $4`,
        [
          scope.scope.businessProfileId,
          scope.scope.businessProfileVersion,
          scope.scope.knowledgeRecordId,
          scope.scope.knowledgeRecordVersion,
        ],
      );
      return result.rows.length === 1
        ? rowResult(result.rows[0], scope.scope)
        : failure("RevisionNotFound", [
          "Knowledge revision was not found in the requested scope.",
        ]);
    } catch {
      return persistenceFailure();
    }
  }

  async recordLifecycleTransition(
    input: Readonly<TransitionKnowledgeLifecycleInput>,
  ): Promise<ConfigurationRepositoryResult<KnowledgeRevisionSnapshot>> {
    const scope = validateKnowledgeRevisionScope(input.scope);
    if (scope.status === "invalid" || !validTransitionContext(input)) {
      return failure("RejectedInput", ["Knowledge lifecycle input is invalid."]);
    }
    let client: PoolClient | null = null;
    try {
      client = await this.pool.connect();
      await client.query("BEGIN");
      const currentResult = await client.query<KnowledgeRecordRow>(
        `SELECT business_profile_id, business_profile_version,
          knowledge_record_id, knowledge_record_version, revision,
          lifecycle_state, audience, source_identity, effective_date,
          record_format_version, record_document
        FROM ${this.table}
        WHERE business_profile_id=$1 AND business_profile_version=$2
          AND knowledge_record_id=$3 AND knowledge_record_version=$4
        FOR UPDATE`,
        [
          scope.scope.businessProfileId,
          scope.scope.businessProfileVersion,
          scope.scope.knowledgeRecordId,
          scope.scope.knowledgeRecordVersion,
        ],
      );
      const current = currentResult.rows[0];
      if (!current) {
        return rollbackFailure(client, "RevisionNotFound", [
          "Knowledge revision was not found in the requested scope.",
        ]);
      }
      if (current.revision !== input.context.expectedRevision) {
        return rollbackFailure(client, "RevisionConflict", [
          "Knowledge lifecycle revision is stale.",
        ]);
      }
      const resultingRevision = current.revision + 1;
      const updated = await client.query<KnowledgeRecordRow>(
        `UPDATE ${this.table}
        SET lifecycle_state=$5, revision=$6
        WHERE business_profile_id=$1 AND business_profile_version=$2
          AND knowledge_record_id=$3 AND knowledge_record_version=$4
          AND revision=$7
        RETURNING business_profile_id, business_profile_version,
          knowledge_record_id, knowledge_record_version, revision,
          lifecycle_state, audience, source_identity, effective_date,
          record_format_version, record_document`,
        [
          scope.scope.businessProfileId,
          scope.scope.businessProfileVersion,
          scope.scope.knowledgeRecordId,
          scope.scope.knowledgeRecordVersion,
          input.targetStatus,
          resultingRevision,
          input.context.expectedRevision,
        ],
      );
      if (updated.rows.length !== 1) {
        return rollbackFailure(client, "RevisionConflict", [
          "Knowledge lifecycle revision is stale.",
        ]);
      }
      await client.query(
        `INSERT INTO ${this.transitions} (
          business_profile_id, business_profile_version,
          knowledge_record_id, knowledge_record_version,
          expected_revision, resulting_revision, prior_lifecycle_state,
          resulting_lifecycle_state, request_id, actor_id,
          authorization_decision_id, authorization_decision, audit_event_id,
          audit_operation, audit_subject, audit_reason
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          scope.scope.businessProfileId,
          scope.scope.businessProfileVersion,
          scope.scope.knowledgeRecordId,
          scope.scope.knowledgeRecordVersion,
          input.context.expectedRevision,
          resultingRevision,
          current.lifecycle_state,
          input.targetStatus,
          input.context.requestId,
          input.context.authorization.actorId,
          input.context.authorization.decisionId,
          input.context.authorization.decision,
          input.context.audit.auditEventId,
          input.context.audit.operation,
          input.context.audit.subject,
          input.context.audit.reason,
        ],
      );
      await client.query("COMMIT");
      return rowResult(updated.rows[0], scope.scope);
    } catch (error) {
      if (client) await rollbackSafely(client);
      return isUniqueViolation(error)
        ? failure("RevisionAlreadyExists", [
          "Knowledge lifecycle request was already recorded.",
        ])
        : persistenceFailure();
    } finally {
      client?.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

function rowResult(
  row: KnowledgeRecordRow | undefined,
  scope: Readonly<KnowledgeRevisionScope>,
): ConfigurationRepositoryResult<KnowledgeRevisionSnapshot> {
  if (!row) return persistenceFailure();
  if (row.record_format_version !== RECORD_FORMAT_VERSION) {
    return failure("IncompatibleStoredRecord", [
      "Persisted Knowledge Record uses an unsupported format version.",
    ]);
  }
  if (
    row.business_profile_id !== scope.businessProfileId
    || row.business_profile_version !== scope.businessProfileVersion
    || row.knowledge_record_id !== scope.knowledgeRecordId
    || row.knowledge_record_version !== scope.knowledgeRecordVersion
    || row.revision < 0
  ) {
    return failure("InvalidStoredRecord", [
      "Persisted Knowledge Record envelope is inconsistent.",
    ]);
  }
  const decoded = decodeKnowledgeRecord(row.record_document, scope);
  if (decoded.status === "failure") {
    return failure("InvalidStoredRecord", decoded.errors);
  }
  if (
    decoded.record.audience !== row.audience
    || decoded.record.source !== row.source_identity
    || decoded.record.effectiveDate !== row.effective_date
  ) {
    return failure("InvalidStoredRecord", [
      "Persisted Knowledge Record metadata is inconsistent.",
    ]);
  }
  if (!isKnowledgeLifecycle(row.lifecycle_state)) {
    return failure("InvalidStoredRecord", [
      "Persisted Knowledge Record lifecycle is invalid.",
    ]);
  }
  return {
    status: "success",
    value: detachKnowledgeRevisionSnapshot({
      scope,
      revision: row.revision,
      lifecycleStatus: row.lifecycle_state,
      record: decoded.record,
    }),
  };
}

function failure(
  reason: ConfigurationRepositoryFailureReason,
  errors: readonly string[],
): ConfigurationRepositoryResult<KnowledgeRevisionSnapshot> {
  return { status: "failure", reason, errors };
}

function persistenceFailure(): ConfigurationRepositoryResult<KnowledgeRevisionSnapshot> {
  return failure("PersistenceFailure", [
    "Knowledge persistence is unavailable.",
  ]);
}

function isUniqueViolation(error: unknown): boolean {
  return error !== null
    && typeof error === "object"
    && "code" in error
    && error.code === "23505";
}

function validTransitionContext(
  input: Readonly<TransitionKnowledgeLifecycleInput>,
): boolean {
  return input.context.authorization.decision === "authorized"
    && input.context.audit.subject === "knowledge-record"
    && Number.isInteger(input.context.expectedRevision)
    && input.context.expectedRevision >= 0
    && canonical(input.context.requestId)
    && canonical(input.context.authorization.actorId)
    && canonical(input.context.authorization.decisionId)
    && canonical(input.context.audit.auditEventId)
    && input.context.audit.reason.trim().length > 0;
}

function isKnowledgeLifecycle(
  value: string,
): value is KnowledgeRevisionSnapshot["lifecycleStatus"] {
  return [
    "draft", "under-review", "approved", "active", "expired",
    "superseded", "suspended", "archived", "rejected",
  ].includes(value);
}

async function rollbackFailure(
  client: PoolClient,
  reason: ConfigurationRepositoryFailureReason,
  errors: readonly string[],
): Promise<ConfigurationRepositoryResult<KnowledgeRevisionSnapshot>> {
  await rollbackSafely(client);
  return failure(reason, errors);
}

async function rollbackSafely(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // The bounded operation remains a failure without exposing driver detail.
  }
}

function canonical(value: string): boolean {
  return value.length > 0 && value === value.trim();
}
