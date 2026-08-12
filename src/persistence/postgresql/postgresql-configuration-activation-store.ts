import { createHash } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import type {
  ActiveConfigurationReadResult,
  ActiveConfigurationSnapshot,
  ApprovedConfigurationActivation,
  AtomicConfigurationActivationStore,
  ConfigurationActivationFailureReason,
  ConfigurationActivationResult,
} from "../../business-configuration/activation-contracts";
import { quoteIdentifier, validatedSchema } from "./migration-runner";

const RECORD_FORMAT_VERSION = 1;

interface CurrentActivationRow {
  readonly activation_revision: number;
  readonly business_profile_version: number;
  readonly request_id: string;
}

interface VersionRow {
  readonly revision: number;
  readonly lifecycle: string;
}

interface ExistingRequestRow {
  readonly request_fingerprint: string;
}

interface ActiveConfigurationRow {
  readonly business_profile_id: string;
  readonly activation_revision: number;
  readonly business_profile_version: number;
  readonly request_id: string;
  readonly active_record_format_version: number;
  readonly activation_record_format_version: number;
  readonly activated_at: Date | string;
  readonly prior_activation_revision: number | null;
  readonly prior_business_profile_version: number | null;
  readonly knowledge_selection: unknown;
}

interface KnowledgeAssociationRow {
  readonly business_profile_version: number;
  readonly knowledge_record_id: string;
  readonly knowledge_record_version: number;
  readonly expected_knowledge_revision: number;
  readonly resulting_lifecycle_state: string;
}

interface KnowledgeSelectionDocument {
  readonly knowledgeRecordId: string;
  readonly knowledgeRecordVersion: number;
  readonly expectedRevision: number;
}

export interface PostgresqlConfigurationActivationStoreOptions {
  readonly connectionString: string;
  readonly schema?: string;
}

export class PostgresqlConfigurationActivationStore
implements AtomicConfigurationActivationStore {
  private readonly pool: Pool;
  private readonly activations: string;
  private readonly associations: string;
  private readonly active: string;
  private readonly profiles: string;
  private readonly knowledge: string;

  constructor(
    options: Readonly<PostgresqlConfigurationActivationStoreOptions>,
  ) {
    if (!options.connectionString.trim()) {
      throw new Error("A PostgreSQL connection string is required.");
    }
    const schema = quoteIdentifier(validatedSchema(options.schema));
    this.pool = new Pool({ connectionString: options.connectionString });
    this.activations = `${schema}.configuration_activations`;
    this.associations = `${schema}.configuration_activation_knowledge`;
    this.active = `${schema}.active_configurations`;
    this.profiles = `${schema}.business_profile_versions`;
    this.knowledge = `${schema}.knowledge_record_versions`;
  }

  async activateApproved(
    activation: Readonly<ApprovedConfigurationActivation>,
  ): Promise<ConfigurationActivationResult> {
    if (!isApprovedInputWellFormed(activation)) {
      return activationFailure("InvalidInput", [
        "Approved configuration activation input is invalid.",
      ]);
    }

    let client: PoolClient | null = null;
    let commitAttempted = false;
    try {
      client = await this.pool.connect();
      await client.query("BEGIN");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [activation.profileScope.businessProfileId],
      );

      const fingerprint = requestFingerprint(activation);
      const duplicate = await client.query<ExistingRequestRow>(
        `SELECT request_fingerprint
        FROM ${this.activations}
        WHERE business_profile_id = $1 AND request_id = $2`,
        [activation.profileScope.businessProfileId, activation.context.requestId],
      );
      if (duplicate.rows[0]) {
        return rollbackResult(
          client,
          duplicate.rows[0].request_fingerprint === fingerprint
            ? "DuplicateActivationRequest"
            : "ConflictingActivationRequest",
          ["Configuration activation request was already recorded."],
        );
      }

      const currentResult = await client.query<CurrentActivationRow>(
        `SELECT activation_revision, business_profile_version, request_id
        FROM ${this.active}
        WHERE business_profile_id = $1
        FOR UPDATE`,
        [activation.profileScope.businessProfileId],
      );
      const current = currentResult.rows[0];
      const currentRevision = current?.activation_revision ?? 0;
      if (currentRevision !== activation.expectedActiveRevision) {
        return rollbackResult(client, "StaleRevision", [
          "Active configuration revision is stale.",
        ]);
      }

      const profileResult = await client.query<VersionRow>(
        `SELECT revision, lifecycle_status AS lifecycle
        FROM ${this.profiles}
        WHERE business_profile_id = $1 AND business_profile_version = $2
        FOR UPDATE`,
        [
          activation.profileScope.businessProfileId,
          activation.profileScope.businessProfileVersion,
        ],
      );
      const profile = profileResult.rows[0];
      if (!profile) {
        return rollbackResult(client, "ProfileUnavailable", [
          "Business Profile revision is unavailable for activation.",
        ]);
      }
      if (profile.revision !== activation.expectedProfileRevision) {
        return rollbackResult(client, "StaleRevision", [
          "Business Profile revision is stale.",
        ]);
      }
      if (profile.lifecycle !== activation.expectedProfileLifecycleStatus) {
        return rollbackResult(client, "LifecycleConflict", [
          "Business Profile lifecycle changed before activation.",
        ]);
      }

      const selection = canonicalSelection(activation);
      for (const item of activation.knowledge) {
        const result = await client.query<VersionRow>(
          `SELECT revision, lifecycle_state AS lifecycle
          FROM ${this.knowledge}
          WHERE business_profile_id = $1
            AND business_profile_version = $2
            AND knowledge_record_id = $3
            AND knowledge_record_version = $4
          FOR UPDATE`,
          [
            item.scope.businessProfileId,
            item.scope.businessProfileVersion,
            item.scope.knowledgeRecordId,
            item.scope.knowledgeRecordVersion,
          ],
        );
        const record = result.rows[0];
        if (!record) {
          return rollbackResult(client, "KnowledgeUnavailable", [
            "Knowledge revision is unavailable for activation.",
          ]);
        }
        if (record.revision !== item.expectedRevision) {
          return rollbackResult(client, "StaleRevision", [
            "Knowledge revision is stale.",
          ]);
        }
        if (record.lifecycle !== item.expectedLifecycleState) {
          return rollbackResult(client, "LifecycleConflict", [
            "Knowledge lifecycle changed before activation.",
          ]);
        }
      }

      const activationRevision = currentRevision + 1;
      await client.query(
        `INSERT INTO ${this.activations} (
          business_profile_id, activation_revision, request_id,
          request_fingerprint, business_profile_version,
          expected_profile_revision, previous_profile_lifecycle_status,
          resulting_profile_lifecycle_status, expected_active_revision,
          prior_activation_revision, prior_business_profile_version,
          knowledge_selection, record_format_version, actor_id,
          authorization_decision_id, authorization_decision, audit_event_id,
          audit_operation, audit_subject, audit_reason,
          eligibility_validated_at, activated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
          $12::jsonb, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
        )`,
        [
          activation.profileScope.businessProfileId,
          activationRevision,
          activation.context.requestId,
          fingerprint,
          activation.profileScope.businessProfileVersion,
          activation.expectedProfileRevision,
          activation.expectedProfileLifecycleStatus,
          activation.resultingProfileLifecycleStatus,
          activation.expectedActiveRevision,
          current?.activation_revision ?? null,
          current?.business_profile_version ?? null,
          JSON.stringify(selection),
          RECORD_FORMAT_VERSION,
          activation.context.authorization.actorId,
          activation.context.authorization.decisionId,
          activation.context.authorization.decision,
          activation.context.audit.auditEventId,
          activation.context.audit.operation,
          activation.context.audit.subject,
          activation.context.audit.reason,
          activation.eligibility.validatedAt,
          activation.activatedAt,
        ],
      );

      for (const item of activation.knowledge) {
        await client.query(
          `INSERT INTO ${this.associations} (
            business_profile_id, activation_revision,
            business_profile_version, knowledge_record_id,
            knowledge_record_version, expected_knowledge_revision,
            previous_lifecycle_state, resulting_lifecycle_state
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            activation.profileScope.businessProfileId,
            activationRevision,
            activation.profileScope.businessProfileVersion,
            item.scope.knowledgeRecordId,
            item.scope.knowledgeRecordVersion,
            item.expectedRevision,
            item.expectedLifecycleState,
            item.resultingLifecycleState,
          ],
        );
      }

      await client.query(
        `INSERT INTO ${this.active} (
          business_profile_id, activation_revision,
          business_profile_version, request_id,
          record_format_version, activated_at
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (business_profile_id) DO UPDATE SET
          activation_revision = EXCLUDED.activation_revision,
          business_profile_version = EXCLUDED.business_profile_version,
          request_id = EXCLUDED.request_id,
          record_format_version = EXCLUDED.record_format_version,
          activated_at = EXCLUDED.activated_at,
          updated_at = CURRENT_TIMESTAMP`,
        [
          activation.profileScope.businessProfileId,
          activationRevision,
          activation.profileScope.businessProfileVersion,
          activation.context.requestId,
          RECORD_FORMAT_VERSION,
          activation.activatedAt,
        ],
      );

      commitAttempted = true;
      await client.query("COMMIT");
      return {
        status: "success",
        value: detachSnapshot({
          businessProfileId: activation.profileScope.businessProfileId,
          businessProfileVersion: activation.profileScope.businessProfileVersion,
          activationRevision,
          requestId: activation.context.requestId,
          activatedAt: new Date(activation.activatedAt).toISOString(),
          priorActivationRevision: current?.activation_revision ?? null,
          priorBusinessProfileVersion: current?.business_profile_version ?? null,
          knowledge: selection.map((item) => ({
            businessProfileId: activation.profileScope.businessProfileId,
            businessProfileVersion: activation.profileScope.businessProfileVersion,
            knowledgeRecordId: item.knowledgeRecordId,
            knowledgeRecordVersion: item.knowledgeRecordVersion,
          })),
        }),
      };
    } catch {
      if (client) await rollbackSafely(client);
      return activationFailure(
        commitAttempted ? "CommitFailure" : client ? "TransactionFailure" : "InfrastructureFailure",
        [commitAttempted
          ? "Configuration activation commit could not be confirmed."
          : "Configuration activation persistence is unavailable."],
      );
    } finally {
      client?.release();
    }
  }

  async readActive(
    businessProfileId: string,
  ): Promise<ActiveConfigurationReadResult> {
    if (!isCanonicalIdentifier(businessProfileId)) {
      return readFailure("InvalidScope", [
        "Active configuration business scope is invalid.",
      ]);
    }
    try {
      const result = await this.pool.query<ActiveConfigurationRow>(
        `SELECT
          active.business_profile_id, active.activation_revision,
          active.business_profile_version, active.request_id,
          active.record_format_version AS active_record_format_version,
          activation.record_format_version AS activation_record_format_version,
          active.activated_at,
          activation.prior_activation_revision,
          activation.prior_business_profile_version,
          activation.knowledge_selection
        FROM ${this.active} AS active
        JOIN ${this.activations} AS activation
          ON activation.business_profile_id = active.business_profile_id
          AND activation.activation_revision = active.activation_revision
          AND activation.business_profile_version = active.business_profile_version
          AND activation.request_id = active.request_id
        WHERE active.business_profile_id = $1`,
        [businessProfileId],
      );
      const row = result.rows[0];
      if (!row) {
        return readFailure("NotFound", [
          "Active configuration was not found in the requested scope.",
        ]);
      }
      return this.decodeReadRow(row, businessProfileId);
    } catch {
      return readFailure("InfrastructureFailure", [
        "Active configuration persistence is unavailable.",
      ]);
    }
  }

  async readForProfileVersion(
    businessProfileId: string,
    businessProfileVersion: number,
  ): Promise<ActiveConfigurationReadResult> {
    if (
      !isCanonicalIdentifier(businessProfileId)
      || !isPositiveInteger(businessProfileVersion)
    ) {
      return readFailure("InvalidScope", [
        "Activated configuration scope is invalid.",
      ]);
    }
    try {
      const result = await this.pool.query<ActiveConfigurationRow>(
        `SELECT
          activation.business_profile_id, activation.activation_revision,
          activation.business_profile_version, activation.request_id,
          activation.record_format_version AS active_record_format_version,
          activation.record_format_version AS activation_record_format_version,
          activation.activated_at,
          activation.prior_activation_revision,
          activation.prior_business_profile_version,
          activation.knowledge_selection
        FROM ${this.activations} AS activation
        WHERE activation.business_profile_id = $1
          AND activation.business_profile_version = $2
        ORDER BY activation.activation_revision
        LIMIT 2`,
        [businessProfileId, businessProfileVersion],
      );
      if (result.rows.length === 0) {
        return readFailure("NotFound", [
          "Activated configuration was not found in the requested scope.",
        ]);
      }
      if (result.rows.length !== 1) {
        return readFailure("InvalidStoredRecord", [
          "Activated configuration history is ambiguous for the requested scope.",
        ]);
      }
      return this.decodeReadRow(
        result.rows[0],
        businessProfileId,
        businessProfileVersion,
      );
    } catch {
      return readFailure("InfrastructureFailure", [
        "Activated configuration persistence is unavailable.",
      ]);
    }
  }

  private async decodeReadRow(
    row: ActiveConfigurationRow,
    businessProfileId: string,
    expectedBusinessProfileVersion?: number,
  ): Promise<ActiveConfigurationReadResult> {
    if (
      row.active_record_format_version !== RECORD_FORMAT_VERSION
      || row.activation_record_format_version !== RECORD_FORMAT_VERSION
    ) {
      return readFailure("IncompatibleStoredRecord", [
        "Activated configuration uses an unsupported format version.",
      ]);
    }
    if (
      row.business_profile_id !== businessProfileId
      || (expectedBusinessProfileVersion !== undefined
        && row.business_profile_version !== expectedBusinessProfileVersion)
      || !isPositiveInteger(row.activation_revision)
      || !isPositiveInteger(row.business_profile_version)
      || !isCanonicalIdentifier(row.request_id)
      || Number.isNaN(Date.parse(String(row.activated_at)))
      || (row.prior_activation_revision === null)
        !== (row.prior_business_profile_version === null)
      || (row.prior_activation_revision !== null
        && !isPositiveInteger(row.prior_activation_revision))
      || (row.prior_business_profile_version !== null
        && !isPositiveInteger(row.prior_business_profile_version))
    ) {
      return readFailure("InvalidStoredRecord", [
        "Activated configuration envelope is invalid.",
      ]);
    }
    const selection = decodeSelection(row.knowledge_selection);
    if (!selection) {
      return readFailure("InvalidStoredRecord", [
        "Activated configuration selection is invalid.",
      ]);
    }
    const associations = await this.pool.query<KnowledgeAssociationRow>(
      `SELECT business_profile_version, knowledge_record_id, knowledge_record_version,
        expected_knowledge_revision, resulting_lifecycle_state
      FROM ${this.associations}
      WHERE business_profile_id = $1 AND activation_revision = $2
      ORDER BY knowledge_record_id, knowledge_record_version`,
      [row.business_profile_id, row.activation_revision],
    );
    if (!associationMatches(
      selection,
      associations.rows,
      row.business_profile_version,
    )) {
      return readFailure("InvalidStoredRecord", [
        "Activated configuration knowledge evidence is inconsistent.",
      ]);
    }
    return {
      status: "success",
      value: detachSnapshot({
        businessProfileId: row.business_profile_id,
        businessProfileVersion: row.business_profile_version,
        activationRevision: row.activation_revision,
        requestId: row.request_id,
        activatedAt: new Date(row.activated_at).toISOString(),
        priorActivationRevision: row.prior_activation_revision,
        priorBusinessProfileVersion: row.prior_business_profile_version,
        knowledge: selection.map((item) => ({
          businessProfileId: row.business_profile_id,
          businessProfileVersion: row.business_profile_version,
          knowledgeRecordId: item.knowledgeRecordId,
          knowledgeRecordVersion: item.knowledgeRecordVersion,
        })),
      }),
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

async function rollbackResult(
  client: PoolClient,
  reason: ConfigurationActivationFailureReason,
  errors: readonly string[],
): Promise<ConfigurationActivationResult> {
  await rollbackSafely(client);
  return activationFailure(reason, errors);
}

async function rollbackSafely(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // The bounded result remains failure; rollback errors expose no new detail.
  }
}

function canonicalSelection(
  activation: Readonly<ApprovedConfigurationActivation>,
): KnowledgeSelectionDocument[] {
  return activation.knowledge
    .map((item) => ({
      knowledgeRecordId: item.scope.knowledgeRecordId,
      knowledgeRecordVersion: item.scope.knowledgeRecordVersion,
      expectedRevision: item.expectedRevision,
    }))
    .sort((left, right) => left.knowledgeRecordId.localeCompare(right.knowledgeRecordId)
      || left.knowledgeRecordVersion - right.knowledgeRecordVersion);
}

function requestFingerprint(
  activation: Readonly<ApprovedConfigurationActivation>,
): string {
  return createHash("sha256").update(JSON.stringify({
    businessProfileId: activation.profileScope.businessProfileId,
    businessProfileVersion: activation.profileScope.businessProfileVersion,
    expectedProfileRevision: activation.expectedProfileRevision,
    expectedActiveRevision: activation.expectedActiveRevision,
    activatedAt: new Date(activation.activatedAt).toISOString(),
    knowledge: canonicalSelection(activation),
    actorId: activation.context.authorization.actorId,
    authorizationDecisionId: activation.context.authorization.decisionId,
    auditEventId: activation.context.audit.auditEventId,
  })).digest("hex");
}

function decodeSelection(value: unknown): KnowledgeSelectionDocument[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const identities = new Set<string>();
  const result: KnowledgeSelectionDocument[] = [];
  for (const item of value) {
    if (
      !isRecord(item)
      || !hasExactKeys(item, [
        "knowledgeRecordId",
        "knowledgeRecordVersion",
        "expectedRevision",
      ])
      || !isCanonicalIdentifier(item.knowledgeRecordId)
      || !isPositiveInteger(item.knowledgeRecordVersion)
      || !isNonnegativeInteger(item.expectedRevision)
    ) return null;
    const identity = `${item.knowledgeRecordId}:${item.knowledgeRecordVersion}`;
    if (identities.has(identity)) return null;
    identities.add(identity);
    result.push({
      knowledgeRecordId: item.knowledgeRecordId,
      knowledgeRecordVersion: item.knowledgeRecordVersion,
      expectedRevision: item.expectedRevision,
    });
  }
  return result.sort((left, right) => left.knowledgeRecordId.localeCompare(right.knowledgeRecordId)
    || left.knowledgeRecordVersion - right.knowledgeRecordVersion);
}

function associationMatches(
  selection: readonly KnowledgeSelectionDocument[],
  rows: readonly KnowledgeAssociationRow[],
  businessProfileVersion: number,
): boolean {
  return rows.length === selection.length && rows.every((row, index) => {
    const expected = selection[index];
    return expected !== undefined
      && row.business_profile_version === businessProfileVersion
      && row.knowledge_record_id === expected.knowledgeRecordId
      && row.knowledge_record_version === expected.knowledgeRecordVersion
      && row.expected_knowledge_revision === expected.expectedRevision
      && row.resulting_lifecycle_state === "active";
  });
}

function isApprovedInputWellFormed(
  activation: Readonly<ApprovedConfigurationActivation>,
): boolean {
  return isCanonicalIdentifier(activation.profileScope.businessProfileId)
    && isPositiveInteger(activation.profileScope.businessProfileVersion)
    && isNonnegativeInteger(activation.expectedProfileRevision)
    && isNonnegativeInteger(activation.expectedActiveRevision)
    && activation.context.expectedRevision === activation.expectedProfileRevision
    && activation.expectedProfileLifecycleStatus === "ready-for-review"
    && activation.resultingProfileLifecycleStatus === "active"
    && activation.knowledge.length > 0
    && !Number.isNaN(Date.parse(activation.activatedAt))
    && !Number.isNaN(Date.parse(activation.eligibility.validatedAt))
    && activation.eligibility.status === "eligible"
    && activation.context.authorization.decision === "authorized"
    && activation.context.audit.operation === "activate"
    && activation.context.audit.subject === "business-profile"
    && isCanonicalIdentifier(activation.context.requestId)
    && isCanonicalIdentifier(activation.context.authorization.actorId)
    && isCanonicalIdentifier(activation.context.authorization.decisionId)
    && isCanonicalIdentifier(activation.context.audit.auditEventId)
    && activation.context.audit.reason.trim().length > 0
    && activation.knowledge.every((item) =>
      item.scope.businessProfileId === activation.profileScope.businessProfileId
      && item.scope.businessProfileVersion
        === activation.profileScope.businessProfileVersion
      && isCanonicalIdentifier(item.scope.knowledgeRecordId)
      && isPositiveInteger(item.scope.knowledgeRecordVersion)
      && isNonnegativeInteger(item.expectedRevision)
      && item.expectedLifecycleState === "approved"
      && item.resultingLifecycleState === "active"
    )
    && new Set(activation.knowledge.map((item) =>
      `${item.scope.knowledgeRecordId}:${item.scope.knowledgeRecordVersion}`
    )).size === activation.knowledge.length;
}

function detachSnapshot(
  value: Readonly<ActiveConfigurationSnapshot>,
): Readonly<ActiveConfigurationSnapshot> {
  return deepFreeze({
    ...value,
    knowledge: value.knowledge.map((scope) => ({ ...scope })),
  });
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

function activationFailure(
  reason: ConfigurationActivationFailureReason,
  errors: readonly string[],
): ConfigurationActivationResult {
  return { status: "failure", reason, errors };
}

function readFailure(
  reason: "InvalidScope" | "NotFound" | "InvalidStoredRecord" | "IncompatibleStoredRecord" | "InfrastructureFailure",
  errors: readonly string[],
): ActiveConfigurationReadResult {
  return { status: "failure", reason, errors };
}

function isCanonicalIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim();
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isNonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return Object.keys(value).length === keys.length
    && keys.every((key) => key in value);
}
