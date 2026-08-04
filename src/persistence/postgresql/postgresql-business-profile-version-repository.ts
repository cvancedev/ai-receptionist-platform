import { Pool } from "pg";
import type {
  BusinessProfileRevisionScope,
  BusinessProfileRevisionSnapshot,
  BusinessProfileVersionRepository,
  ConfigurationRepositoryResult,
  CreateBusinessProfileDraftInput,
  TransitionBusinessProfileLifecycleInput,
} from "../../business-configuration/contracts";
import { detachBusinessProfileRevisionSnapshot, validateBusinessProfileRevisionScope } from "../../business-configuration/contract-support";
import { decodeBusinessProfile } from "../../validation/business-profile-codec";
import { quoteIdentifier, validatedSchema } from "./migration-runner";

const RECORD_FORMAT_VERSION = 1;
interface Row { business_profile_id: string; business_profile_version: number; revision: number; lifecycle_status: string; record_format_version: number; profile_document: unknown; }
export interface PostgresqlBusinessProfileVersionRepositoryOptions { readonly connectionString: string; readonly schema?: string; }

export class PostgresqlBusinessProfileVersionRepository implements BusinessProfileVersionRepository<"asynchronous"> {
  readonly operationMode = "asynchronous";
  private readonly pool: Pool;
  private readonly table: string;
  constructor(options: Readonly<PostgresqlBusinessProfileVersionRepositoryOptions>) {
    if (!options.connectionString.trim()) throw new Error("A PostgreSQL connection string is required.");
    this.pool = new Pool({ connectionString: options.connectionString });
    this.table = `${quoteIdentifier(validatedSchema(options.schema))}.business_profile_versions`;
  }
  async createDraft(input: Readonly<CreateBusinessProfileDraftInput>): Promise<ConfigurationRepositoryResult<BusinessProfileRevisionSnapshot>> {
    const scope = validateBusinessProfileRevisionScope(input.scope);
    if (scope.status === "invalid") return failure("InvalidScope", ["Business Profile revision scope is invalid."]);
    if (input.context.expectedRevision !== 0 || input.profile.status !== "draft") return failure("RejectedInput", ["Only an application-authorized initial draft revision may be created."]);
    const decoded = decodeBusinessProfile(input.profile, scope.scope);
    if (decoded.status === "failure") return failure("RejectedInput", decoded.errors);
    try {
      const result = await this.pool.query<Row>(`INSERT INTO ${this.table} (business_profile_id,business_profile_version,revision,lifecycle_status,record_format_version,profile_document,request_id,actor_id,authorization_decision_id,authorization_decision,audit_event_id,audit_operation,audit_subject,audit_reason) VALUES ($1,$2,0,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING business_profile_id,business_profile_version,revision,lifecycle_status,record_format_version,profile_document`, [scope.scope.businessProfileId, scope.scope.businessProfileVersion, decoded.profile.status, RECORD_FORMAT_VERSION, JSON.stringify(decoded.profile), input.context.requestId, input.context.authorization.actorId, input.context.authorization.decisionId, input.context.authorization.decision, input.context.audit.auditEventId, input.context.audit.operation, input.context.audit.subject, input.context.audit.reason]);
      return rowResult(result.rows[0], scope.scope);
    } catch (error) { return isUniqueViolation(error) ? failure("RevisionAlreadyExists", ["Business Profile revision already exists in the requested scope."]) : persistenceFailure(); }
  }
  async readRevision(scopeInput: Readonly<BusinessProfileRevisionScope>): Promise<ConfigurationRepositoryResult<BusinessProfileRevisionSnapshot>> {
    const scope = validateBusinessProfileRevisionScope(scopeInput);
    if (scope.status === "invalid") return failure("InvalidScope", ["Business Profile revision scope is invalid."]);
    try {
      const result = await this.pool.query<Row>(`SELECT business_profile_id,business_profile_version,revision,lifecycle_status,record_format_version,profile_document FROM ${this.table} WHERE business_profile_id=$1 AND business_profile_version=$2`, [scope.scope.businessProfileId, scope.scope.businessProfileVersion]);
      return result.rows.length === 1 ? rowResult(result.rows[0], scope.scope) : failure("RevisionNotFound", ["Business Profile revision was not found in the requested scope."]);
    } catch { return persistenceFailure(); }
  }
  async recordLifecycleTransition(_input: Readonly<TransitionBusinessProfileLifecycleInput>): Promise<ConfigurationRepositoryResult<BusinessProfileRevisionSnapshot>> {
    void _input;
    return failure("RejectedInput", ["Lifecycle transitions are not implemented in Milestone 7.2."]);
  }
  async close() { await this.pool.end(); }
}

function rowResult(row: Row | undefined, scope: Readonly<BusinessProfileRevisionScope>): ConfigurationRepositoryResult<BusinessProfileRevisionSnapshot> {
  if (!row) return persistenceFailure();
  if (row.record_format_version !== RECORD_FORMAT_VERSION) return failure("IncompatibleStoredRecord", ["Persisted Business Profile uses an unsupported format version."]);
  if (row.business_profile_id !== scope.businessProfileId || row.business_profile_version !== scope.businessProfileVersion || row.revision < 0) return failure("InvalidStoredRecord", ["Persisted Business Profile envelope is inconsistent."]);
  const decoded = decodeBusinessProfile(row.profile_document, scope);
  if (decoded.status === "failure" || decoded.profile.status !== row.lifecycle_status) return failure("InvalidStoredRecord", decoded.status === "failure" ? decoded.errors : ["Persisted Business Profile lifecycle is inconsistent."]);
  return { status: "success", value: detachBusinessProfileRevisionSnapshot({ scope, revision: row.revision, lifecycleStatus: decoded.profile.status, profile: decoded.profile }) };
}
function failure(reason: "InvalidScope"|"RevisionNotFound"|"RevisionAlreadyExists"|"RevisionConflict"|"RejectedInput"|"InvalidStoredRecord"|"IncompatibleStoredRecord"|"PersistenceFailure", errors: readonly string[]): ConfigurationRepositoryResult<BusinessProfileRevisionSnapshot> { return { status: "failure", reason, errors }; }
function persistenceFailure() { return failure("PersistenceFailure", ["Business Profile persistence is unavailable."]); }
function isUniqueViolation(error: unknown) { return error !== null && typeof error === "object" && "code" in error && error.code === "23505"; }
