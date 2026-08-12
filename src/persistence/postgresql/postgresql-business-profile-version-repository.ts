import { Pool, type PoolClient } from "pg";
import type {
  BusinessProfileRevisionScope,
  BusinessProfileRevisionSnapshot,
  BusinessProfileVersionRepository,
  ConfigurationRepositoryFailureReason,
  ConfigurationRepositoryResult,
  CreateBusinessProfileDraftInput,
  TransitionBusinessProfileLifecycleInput,
} from "../../business-configuration/contracts";
import {
  detachBusinessProfileRevisionSnapshot,
  validateBusinessProfileRevisionScope,
} from "../../business-configuration/contract-support";
import { decodeBusinessProfile } from "../../validation/business-profile-codec";
import { quoteIdentifier, validatedSchema } from "./migration-runner";

const RECORD_FORMAT_VERSION = 1;

interface BusinessProfileRow {
  readonly business_profile_id: string;
  readonly business_profile_version: number;
  readonly revision: number;
  readonly lifecycle_status: string;
  readonly record_format_version: number;
  readonly profile_document: unknown;
}

export interface PostgresqlBusinessProfileVersionRepositoryOptions {
  readonly connectionString: string;
  readonly schema?: string;
}

export class PostgresqlBusinessProfileVersionRepository
implements BusinessProfileVersionRepository<"asynchronous"> {
  readonly operationMode = "asynchronous";
  private readonly pool: Pool;
  private readonly table: string;
  private readonly transitions: string;

  constructor(
    options: Readonly<PostgresqlBusinessProfileVersionRepositoryOptions>,
  ) {
    if (!options.connectionString.trim()) {
      throw new Error("A PostgreSQL connection string is required.");
    }
    const schema = quoteIdentifier(validatedSchema(options.schema));
    this.pool = new Pool({ connectionString: options.connectionString });
    this.table = `${schema}.business_profile_versions`;
    this.transitions = `${schema}.business_profile_lifecycle_transitions`;
  }

  async createDraft(
    input: Readonly<CreateBusinessProfileDraftInput>,
  ): Promise<ConfigurationRepositoryResult<BusinessProfileRevisionSnapshot>> {
    const scope = validateBusinessProfileRevisionScope(input.scope);
    if (scope.status === "invalid") {
      return failure("InvalidScope", ["Business Profile revision scope is invalid."]);
    }
    if (input.context.expectedRevision !== 0 || input.profile.status !== "draft") {
      return failure("RejectedInput", [
        "Only an application-authorized initial draft revision may be created.",
      ]);
    }
    const decoded = decodeBusinessProfile(input.profile, scope.scope);
    if (decoded.status === "failure") return failure("RejectedInput", decoded.errors);
    try {
      const result = await this.pool.query<BusinessProfileRow>(
        `INSERT INTO ${this.table} (
          business_profile_id, business_profile_version, revision,
          lifecycle_status, record_format_version, profile_document,
          request_id, actor_id, authorization_decision_id,
          authorization_decision, audit_event_id, audit_operation,
          audit_subject, audit_reason
        ) VALUES ($1,$2,0,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13)
        RETURNING business_profile_id, business_profile_version, revision,
          lifecycle_status, record_format_version, profile_document`,
        [
          scope.scope.businessProfileId,
          scope.scope.businessProfileVersion,
          decoded.profile.status,
          RECORD_FORMAT_VERSION,
          JSON.stringify(decoded.profile),
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
          "Business Profile revision already exists in the requested scope.",
        ])
        : persistenceFailure();
    }
  }

  async readRevision(
    scopeInput: Readonly<BusinessProfileRevisionScope>,
  ): Promise<ConfigurationRepositoryResult<BusinessProfileRevisionSnapshot>> {
    const scope = validateBusinessProfileRevisionScope(scopeInput);
    if (scope.status === "invalid") {
      return failure("InvalidScope", ["Business Profile revision scope is invalid."]);
    }
    try {
      const result = await this.pool.query<BusinessProfileRow>(
        `SELECT business_profile_id, business_profile_version, revision,
          lifecycle_status, record_format_version, profile_document
        FROM ${this.table}
        WHERE business_profile_id=$1 AND business_profile_version=$2`,
        [scope.scope.businessProfileId, scope.scope.businessProfileVersion],
      );
      return result.rows.length === 1
        ? rowResult(result.rows[0], scope.scope)
        : failure("RevisionNotFound", [
          "Business Profile revision was not found in the requested scope.",
        ]);
    } catch {
      return persistenceFailure();
    }
  }

  async recordLifecycleTransition(
    input: Readonly<TransitionBusinessProfileLifecycleInput>,
  ): Promise<ConfigurationRepositoryResult<BusinessProfileRevisionSnapshot>> {
    const scope = validateBusinessProfileRevisionScope(input.scope);
    if (scope.status === "invalid" || !validTransitionContext(input)) {
      return failure("RejectedInput", ["Business Profile lifecycle input is invalid."]);
    }
    let client: PoolClient | null = null;
    try {
      client = await this.pool.connect();
      await client.query("BEGIN");
      const currentResult = await client.query<BusinessProfileRow>(
        `SELECT business_profile_id, business_profile_version, revision,
          lifecycle_status, record_format_version, profile_document
        FROM ${this.table}
        WHERE business_profile_id=$1 AND business_profile_version=$2
        FOR UPDATE`,
        [scope.scope.businessProfileId, scope.scope.businessProfileVersion],
      );
      const current = currentResult.rows[0];
      if (!current) return rollbackFailure(client, "RevisionNotFound", ["Business Profile revision was not found in the requested scope."]);
      if (current.revision !== input.context.expectedRevision) {
        return rollbackFailure(client, "RevisionConflict", ["Business Profile lifecycle revision is stale."]);
      }
      const resultingRevision = current.revision + 1;
      const updated = await client.query<BusinessProfileRow>(
        `UPDATE ${this.table}
        SET lifecycle_status=$3, revision=$4
        WHERE business_profile_id=$1 AND business_profile_version=$2
          AND revision=$5
        RETURNING business_profile_id, business_profile_version, revision,
          lifecycle_status, record_format_version, profile_document`,
        [
          scope.scope.businessProfileId,
          scope.scope.businessProfileVersion,
          input.targetStatus,
          resultingRevision,
          input.context.expectedRevision,
        ],
      );
      if (updated.rows.length !== 1) {
        return rollbackFailure(client, "RevisionConflict", ["Business Profile lifecycle revision is stale."]);
      }
      await client.query(
        `INSERT INTO ${this.transitions} (
          business_profile_id, business_profile_version, expected_revision,
          resulting_revision, prior_lifecycle_status,
          resulting_lifecycle_status, request_id, actor_id,
          authorization_decision_id, authorization_decision, audit_event_id,
          audit_operation, audit_subject, audit_reason
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          scope.scope.businessProfileId,
          scope.scope.businessProfileVersion,
          input.context.expectedRevision,
          resultingRevision,
          current.lifecycle_status,
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
        ? failure("RevisionAlreadyExists", ["Business Profile lifecycle request was already recorded."])
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
  row: BusinessProfileRow | undefined,
  scope: Readonly<BusinessProfileRevisionScope>,
): ConfigurationRepositoryResult<BusinessProfileRevisionSnapshot> {
  if (!row) return persistenceFailure();
  if (row.record_format_version !== RECORD_FORMAT_VERSION) {
    return failure("IncompatibleStoredRecord", [
      "Persisted Business Profile uses an unsupported format version.",
    ]);
  }
  if (
    row.business_profile_id !== scope.businessProfileId
    || row.business_profile_version !== scope.businessProfileVersion
    || row.revision < 0
  ) {
    return failure("InvalidStoredRecord", [
      "Persisted Business Profile envelope is inconsistent.",
    ]);
  }
  const decoded = decodeBusinessProfile(row.profile_document, scope);
  if (decoded.status === "failure") {
    return failure("InvalidStoredRecord", decoded.errors);
  }
  if (!isBusinessProfileLifecycle(row.lifecycle_status)) {
    return failure("InvalidStoredRecord", [
      "Persisted Business Profile lifecycle is invalid.",
    ]);
  }
  return {
    status: "success",
    value: detachBusinessProfileRevisionSnapshot({
      scope,
      revision: row.revision,
      lifecycleStatus: row.lifecycle_status,
      profile: decoded.profile,
    }),
  };
}

function validTransitionContext(
  input: Readonly<TransitionBusinessProfileLifecycleInput>,
): boolean {
  return input.context.authorization.decision === "authorized"
    && input.context.audit.subject === "business-profile"
    && input.context.expectedRevision >= 0
    && Number.isInteger(input.context.expectedRevision)
    && canonical(input.context.requestId)
    && canonical(input.context.authorization.actorId)
    && canonical(input.context.authorization.decisionId)
    && canonical(input.context.audit.auditEventId)
    && input.context.audit.reason.trim().length > 0;
}

function isBusinessProfileLifecycle(value: string): value is BusinessProfileRevisionSnapshot["lifecycleStatus"] {
  return ["draft", "incomplete", "ready-for-review", "active", "suspended", "archived"].includes(value);
}

async function rollbackFailure(
  client: PoolClient,
  reason: ConfigurationRepositoryFailureReason,
  errors: readonly string[],
): Promise<ConfigurationRepositoryResult<BusinessProfileRevisionSnapshot>> {
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

function failure(
  reason: ConfigurationRepositoryFailureReason,
  errors: readonly string[],
): ConfigurationRepositoryResult<BusinessProfileRevisionSnapshot> {
  return { status: "failure", reason, errors };
}

function persistenceFailure(): ConfigurationRepositoryResult<BusinessProfileRevisionSnapshot> {
  return failure("PersistenceFailure", ["Business Profile persistence is unavailable."]);
}

function isUniqueViolation(error: unknown): boolean {
  return error !== null && typeof error === "object" && "code" in error && error.code === "23505";
}

function canonical(value: string): boolean {
  return value.length > 0 && value === value.trim();
}
