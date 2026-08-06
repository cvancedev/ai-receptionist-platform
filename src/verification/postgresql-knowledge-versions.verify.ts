import { isDeepStrictEqual } from "node:util";
import { Pool } from "pg";
import type {
  CreateBusinessProfileDraftInput,
  CreateKnowledgeDraftInput,
} from "../business-configuration/contracts";
import { fictionalBusinessProfile } from "../fixtures/business-profile";
import { fictionalKnowledgeRecords } from "../fixtures/knowledge";
import { applyPostgresqlMigrations } from "../persistence/postgresql/migration-runner";
import { PostgresqlBusinessProfileVersionRepository } from "../persistence/postgresql/postgresql-business-profile-version-repository";
import { PostgresqlKnowledgeVersionRepository } from "../persistence/postgresql/postgresql-knowledge-version-repository";

const connectionString = requiredUrl();
const schema = `sprint_7_3_${Date.now()}_${process.pid}`;
const admin = new Pool({ connectionString });

run()
  .then(() => console.log("Sprint 7.3 PostgreSQL Knowledge verification passed."))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

async function run(): Promise<void> {
  await admin.query(`CREATE SCHEMA "${schema}"`);
  try {
    await verifyMigration();
    await verifyCreateReadAndRestart();
    await verifyStoredRecordFailures();
    await verifyAuthorityBoundary();
    await verifyIncompatibleMigrationHistories();
  } finally {
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
}

async function verifyMigration(): Promise<void> {
  await applyPostgresqlMigrations({ connectionString, schema });
  await applyPostgresqlMigrations({ connectionString, schema });
  const history = await admin.query(
    `SELECT version, name
    FROM "${schema}".app_schema_migrations
    ORDER BY version`,
  );
  assertEquivalent(history.rows, [
    { version: 1, name: "conversation_states" },
    { version: 2, name: "execution_journal" },
    { version: 3, name: "business_profile_versions" },
    { version: 4, name: "knowledge_record_versions" },
  ], "ordered migrations 001-004 are compatible and idempotent");
}

async function verifyCreateReadAndRestart(): Promise<void> {
  await persistProfile(fictionalBusinessProfile.id);
  let store = new PostgresqlKnowledgeVersionRepository({
    connectionString,
    schema,
  });
  const input = knowledgeDraftInput();
  const created = await store.createDraft(input);
  assert(created.status === "success", "valid knowledge draft persists");
  if (created.status !== "success") return;
  assertDeeplyFrozen(created.value, "created knowledge snapshot");
  assert(
    isDeepStrictEqual(created.value.record, input.record),
    "complete Knowledge Record round trips exactly",
  );

  const duplicate = await store.createDraft(input);
  assert(
    duplicate.status === "failure"
      && duplicate.reason === "RevisionAlreadyExists",
    "duplicate exact revision fails explicitly",
  );
  const original = await store.readRevision(input.scope);
  assert(
    original.status === "success"
      && original.value.record.content === input.record.content,
    "duplicate does not overwrite the original",
  );

  const invalidRecord = knowledgeDraftInput(
    fictionalBusinessProfile.id,
    "invalid-knowledge",
  );
  const invalid = await store.createDraft({
    ...invalidRecord,
    record: { ...invalidRecord.record, content: "" },
  });
  assert(
    invalid.status === "failure" && invalid.reason === "RejectedInput",
    "structurally invalid knowledge is rejected",
  );

  const audit = await admin.query(
    `SELECT authorization_decision, audit_operation, audit_subject, audit_reason,
      lifecycle_state, audience, source_identity, effective_date
    FROM "${schema}".knowledge_record_versions
    WHERE business_profile_id = $1 AND knowledge_record_id = $2`,
    [input.scope.businessProfileId, input.scope.knowledgeRecordId],
  );
  assert(
    audit.rows[0]?.authorization_decision === "authorized"
      && audit.rows[0]?.audit_operation === "create-draft"
      && audit.rows[0]?.audit_subject === "knowledge-record"
      && audit.rows[0]?.lifecycle_state === input.record.lifecycleState
      && audit.rows[0]?.audience === input.record.audience
      && audit.rows[0]?.source_identity === input.record.source
      && audit.rows[0]?.effective_date === input.record.effectiveDate,
    "audit, lifecycle, audience, source, and effective-date evidence persists",
  );

  const otherBusiness = "another-fictional-business";
  assertNotFound(
    await store.readRevision({
      ...input.scope,
      businessProfileId: otherBusiness,
    }),
    "wrong business fails safely",
  );
  await persistProfile(otherBusiness);
  const equivalent = knowledgeDraftInput(
    otherBusiness,
    input.scope.knowledgeRecordId,
  );
  assert(
    (await store.createDraft(equivalent)).status === "success",
    "another business may use the same record identity and numeric version",
  );
  assertNotFound(
    await store.readRevision({
      ...input.scope,
      knowledgeRecordId: "wrong-record",
    }),
    "wrong record identity fails safely",
  );
  assertNotFound(
    await store.readRevision({
      ...input.scope,
      knowledgeRecordVersion: 99,
    }),
    "wrong or missing revision fails safely",
  );
  const invalidScope = await store.readRevision({
    ...input.scope,
    knowledgeRecordId: " ",
  });
  assert(
    invalidScope.status === "failure" && invalidScope.reason === "InvalidScope",
    "invalid scope fails before persistence",
  );

  await store.close();
  store = new PostgresqlKnowledgeVersionRepository({ connectionString, schema });
  const restarted = await store.readRevision(input.scope);
  assert(restarted.status === "success", "new repository instance reloads revision");
  if (restarted.status === "success") {
    assertDeeplyFrozen(restarted.value, "restarted knowledge snapshot");
    assert(
      isDeepStrictEqual(restarted.value.record, input.record),
      "restart preserves complete source traceability and metadata",
    );
  }
  await store.close();
}

async function verifyStoredRecordFailures(): Promise<void> {
  const input = knowledgeDraftInput();
  const store = new PostgresqlKnowledgeVersionRepository({
    connectionString,
    schema,
  });
  const where = "business_profile_id = $1 AND business_profile_version = $2 AND knowledge_record_id = $3 AND knowledge_record_version = $4";
  const values = [
    input.scope.businessProfileId,
    input.scope.businessProfileVersion,
    input.scope.knowledgeRecordId,
    input.scope.knowledgeRecordVersion,
  ];
  try {
    await assertConstraintRejects(
      `UPDATE "${schema}".knowledge_record_versions SET lifecycle_state = 'unknown' WHERE ${where}`,
      values,
      "unknown lifecycle is rejected by storage integrity",
    );
    await assertConstraintRejects(
      `UPDATE "${schema}".knowledge_record_versions SET audience = 'unknown' WHERE ${where}`,
      values,
      "unknown audience is rejected by storage integrity",
    );
    await assertConstraintRejects(
      `UPDATE "${schema}".knowledge_record_versions SET source_identity = '' WHERE ${where}`,
      values,
      "missing source traceability is rejected by storage integrity",
    );
    await assertConstraintRejects(
      `UPDATE "${schema}".knowledge_record_versions SET record_document = jsonb_set(record_document, '{id}', '"wrong-record"'::jsonb) WHERE ${where}`,
      values,
      "envelope/document identity mismatch is rejected",
    );

    await admin.query(
      `UPDATE "${schema}".knowledge_record_versions
      SET record_document = jsonb_set(record_document, '{title}', '42'::jsonb)
      WHERE ${where}`,
      values,
    );
    const malformed = await store.readRevision(input.scope);
    assertFailure(malformed, "InvalidStoredRecord", "malformed JSON fails closed");
    await restoreDocument(input);

    await admin.query(
      `UPDATE "${schema}".knowledge_record_versions
      SET effective_date = 'not-a-date',
        record_document = jsonb_set(record_document, '{effectiveDate}', '"not-a-date"'::jsonb)
      WHERE ${where}`,
      values,
    );
    const invalidDate = await store.readRevision(input.scope);
    assertFailure(
      invalidDate,
      "InvalidStoredRecord",
      "invalid effective date fails closed without defaulting",
    );
    await restoreDocument(input);

    await admin.query(
      `UPDATE "${schema}".knowledge_record_versions
      SET record_format_version = 99 WHERE ${where}`,
      values,
    );
    const incompatible = await store.readRevision(input.scope);
    assertFailure(
      incompatible,
      "IncompatibleStoredRecord",
      "unsupported record format fails closed",
    );
    await admin.query(
      `UPDATE "${schema}".knowledge_record_versions
      SET record_format_version = 1 WHERE ${where}`,
      values,
    );
  } finally {
    await store.close();
  }
}

async function verifyAuthorityBoundary(): Promise<void> {
  const store = new PostgresqlKnowledgeVersionRepository({
    connectionString,
    schema,
  });
  const input = knowledgeDraftInput();
  const transition = await store.recordLifecycleTransition({
    scope: input.scope,
    targetStatus: "active",
    context: input.context,
  });
  assert(
    transition.status === "failure" && transition.reason === "RejectedInput",
    "repository cannot approve or activate knowledge",
  );
  const capabilities = store as unknown as Record<string, unknown>;
  for (const name of [
    "approve",
    "activate",
    "selectEligible",
    "resolveConflict",
    "activateBusinessProfile",
    "mutateConversation",
    "selectProvider",
    "release",
    "dispatch",
    "update",
    "delete",
  ]) {
    assert(capabilities[name] === undefined, `repository exposes no ${name} capability`);
  }
  await store.close();
}

async function verifyIncompatibleMigrationHistories(): Promise<void> {
  await assertIncompatibleHistory(
    "renamed",
    [{ version: 1, name: "renamed_conversation_states" }],
  );
  await assertIncompatibleHistory(
    "missing",
    [
      { version: 1, name: "conversation_states" },
      { version: 3, name: "business_profile_versions" },
    ],
  );
  await assertIncompatibleHistory(
    "out_of_order",
    [{ version: 2, name: "execution_journal" }],
  );

  const newerSchema = `${schema}_newer`;
  await admin.query(`CREATE SCHEMA "${newerSchema}"`);
  try {
    await applyPostgresqlMigrations({ connectionString, schema: newerSchema });
    await admin.query(
      `INSERT INTO "${newerSchema}".app_schema_migrations (version, name)
      VALUES (99, 'fictional_newer_migration')`,
    );
    await expectMigrationFailure(newerSchema, "newer history fails safely");
  } finally {
    await admin.query(`DROP SCHEMA IF EXISTS "${newerSchema}" CASCADE`);
  }
}

async function assertIncompatibleHistory(
  suffix: string,
  records: readonly { readonly version: number; readonly name: string }[],
): Promise<void> {
  const incompatibleSchema = `${schema}_${suffix}`;
  await admin.query(`CREATE SCHEMA "${incompatibleSchema}"`);
  try {
    await admin.query(
      `CREATE TABLE "${incompatibleSchema}".app_schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    );
    for (const record of records) {
      await admin.query(
        `INSERT INTO "${incompatibleSchema}".app_schema_migrations (version, name)
        VALUES ($1, $2)`,
        [record.version, record.name],
      );
    }
    await expectMigrationFailure(
      incompatibleSchema,
      `${suffix.replaceAll("_", "-")} history fails safely`,
    );
    const tables = await admin.query(
      `SELECT table_name FROM information_schema.tables
      WHERE table_schema = $1 ORDER BY table_name`,
      [incompatibleSchema],
    );
    assertEquivalent(
      tables.rows,
      [{ table_name: "app_schema_migrations" }],
      "incompatible history is not repaired or partially migrated",
    );
  } finally {
    await admin.query(`DROP SCHEMA IF EXISTS "${incompatibleSchema}" CASCADE`);
  }
}

async function expectMigrationFailure(
  migrationSchema: string,
  label: string,
): Promise<void> {
  let failure: unknown;
  try {
    await applyPostgresqlMigrations({
      connectionString,
      schema: migrationSchema,
    });
  } catch (error) {
    failure = error;
  }
  assert(
    failure instanceof Error
      && failure.message === "PostgreSQL migration history is incompatible.",
    label,
  );
}

async function persistProfile(businessProfileId: string): Promise<void> {
  const store = new PostgresqlBusinessProfileVersionRepository({
    connectionString,
    schema,
  });
  try {
    const result = await store.createDraft(profileDraftInput(businessProfileId));
    assert(result.status === "success", "owning Business Profile revision persists");
  } finally {
    await store.close();
  }
}

function profileDraftInput(
  businessProfileId: string,
): CreateBusinessProfileDraftInput {
  const profile = {
    ...structuredClone(fictionalBusinessProfile),
    id: businessProfileId,
    status: "draft" as const,
  };
  return {
    scope: {
      businessProfileId,
      businessProfileVersion: profile.version,
    },
    profile,
    context: changeContext(`profile-${businessProfileId}`, "business-profile"),
  };
}

function knowledgeDraftInput(
  businessProfileId = fictionalBusinessProfile.id,
  knowledgeRecordId = fictionalKnowledgeRecords[0]?.id ?? "fictional-knowledge",
): CreateKnowledgeDraftInput {
  const record = {
    ...structuredClone(fictionalKnowledgeRecords[0]),
    id: knowledgeRecordId,
    businessProfileId,
    lifecycleState: "draft" as const,
  };
  return {
    scope: {
      businessProfileId,
      businessProfileVersion: fictionalBusinessProfile.version,
      knowledgeRecordId,
      knowledgeRecordVersion: record.version,
    },
    record,
    context: changeContext(`knowledge-${businessProfileId}-${knowledgeRecordId}`, "knowledge-record"),
  };
}

function changeContext(
  identity: string,
  subject: "business-profile" | "knowledge-record",
): CreateKnowledgeDraftInput["context"] {
  return {
    requestId: `request-${identity}`,
    expectedRevision: 0,
    authorization: {
      actorId: "fictional-owner",
      decisionId: `decision-${identity}`,
      decision: "authorized",
    },
    audit: {
      auditEventId: `audit-${identity}`,
      operation: "create-draft",
      subject,
      reason: "Fictional Sprint 7.3 verification.",
    },
  };
}

async function restoreDocument(input: CreateKnowledgeDraftInput): Promise<void> {
  await admin.query(
    `UPDATE "${schema}".knowledge_record_versions
    SET record_document = $5::jsonb,
      lifecycle_state = $6,
      audience = $7,
      source_identity = $8,
      effective_date = $9
    WHERE business_profile_id = $1
      AND business_profile_version = $2
      AND knowledge_record_id = $3
      AND knowledge_record_version = $4`,
    [
      input.scope.businessProfileId,
      input.scope.businessProfileVersion,
      input.scope.knowledgeRecordId,
      input.scope.knowledgeRecordVersion,
      JSON.stringify(input.record),
      input.record.lifecycleState,
      input.record.audience,
      input.record.source,
      input.record.effectiveDate,
    ],
  );
}

async function assertConstraintRejects(
  query: string,
  values: unknown[],
  label: string,
): Promise<void> {
  try {
    await admin.query(query, values);
    throw new Error(`Expected constraint rejection: ${label}`);
  } catch (error) {
    assert(
      error !== null
        && typeof error === "object"
        && "code" in error
        && error.code === "23514",
      label,
    );
  }
}

function assertNotFound(
  result: Awaited<ReturnType<PostgresqlKnowledgeVersionRepository["readRevision"]>>,
  label: string,
): void {
  assert(
    result.status === "failure" && result.reason === "RevisionNotFound",
    label,
  );
}

function assertFailure(
  result: Awaited<ReturnType<PostgresqlKnowledgeVersionRepository["readRevision"]>>,
  reason: string,
  label: string,
): void {
  assert(result.status === "failure" && result.reason === reason, label);
}

function assertDeeplyFrozen(value: unknown, label: string): void {
  if (!value || typeof value !== "object") return;
  assert(Object.isFrozen(value), `${label} is deeply immutable`);
  for (const child of Object.values(value)) assertDeeplyFrozen(child, label);
}

function assertEquivalent(actual: unknown, expected: unknown, label: string): void {
  assert(isDeepStrictEqual(actual, expected), label);
}

function assert(condition: unknown, label: string): asserts condition {
  if (!condition) {
    throw new Error(`PostgreSQL Knowledge verification failed: ${label}`);
  }
}

function requiredUrl(): string {
  const value = process.env.TEST_DATABASE_URL?.trim();
  if (!value) {
    throw new Error(
      "TEST_DATABASE_URL is required for PostgreSQL integration verification.",
    );
  }
  return value;
}
