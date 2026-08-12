import { Pool } from "pg";
import { isDeepStrictEqual } from "node:util";
import type { CreateBusinessProfileDraftInput } from "../business-configuration/contracts";
import { fictionalBusinessProfile } from "../fixtures/business-profile";
import { applyPostgresqlMigrations } from "../persistence/postgresql/migration-runner";
import { PostgresqlBusinessProfileVersionRepository } from "../persistence/postgresql/postgresql-business-profile-version-repository";

const connectionString = requiredUrl();
const schema = `sprint_7_2_${Date.now()}_${process.pid}`;
const admin = new Pool({ connectionString });

run().then(() => console.log("Sprint 7.2 PostgreSQL Business Profile verification passed.")).catch((error) => { console.error(error); process.exitCode = 1; });

async function run() {
  await admin.query(`CREATE SCHEMA "${schema}"`);
  try {
    await verifyMigration();
    await verifyCreateReadRestart();
    await verifyStoredRecordFailures();
    await verifyAuthorityBoundary();
  } finally {
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
}

async function verifyMigration() {
  await applyPostgresqlMigrations({ connectionString, schema });
  await applyPostgresqlMigrations({ connectionString, schema });
  const history = await admin.query(`SELECT version,name FROM "${schema}".app_schema_migrations ORDER BY version`);
  assert(JSON.stringify(history.rows) === JSON.stringify([{ version: 1, name: "conversation_states" }, { version: 2, name: "execution_journal" }, { version: 3, name: "business_profile_versions" }, { version: 4, name: "knowledge_record_versions" }, { version: 5, name: "configuration_activations" }, { version: 6, name: "configuration_lifecycle_transitions" }]), "ordered migrations 001-006 are compatible and idempotent");
}

async function verifyCreateReadRestart() {
  let store = new PostgresqlBusinessProfileVersionRepository({ connectionString, schema });
  const input = draftInput();
  const created = await store.createDraft(input);
  assert(created.status === "success", "valid draft revision persists");
  if (created.status !== "success") return;
  assertDeeplyFrozen(created.value, "created snapshot");
  assert(isDeepStrictEqual(created.value.profile, input.profile), "complete nested profile round trips");
  const duplicate = await store.createDraft(input);
  assert(duplicate.status === "failure" && duplicate.reason === "RevisionAlreadyExists", "duplicate exact revision fails explicitly");
  const original = await store.readRevision(input.scope);
  assert(original.status === "success", "duplicate does not overwrite original");
  const invalid = await store.createDraft({ ...draftInput("invalid-fictional-business"), profile: { ...draftInput("invalid-fictional-business").profile, services: [] } });
  assert(invalid.status === "failure" && invalid.reason === "RejectedInput", "structurally invalid profile is rejected before persistence");
  const audit = await admin.query(`SELECT authorization_decision,audit_operation,audit_subject,audit_reason FROM "${schema}".business_profile_versions WHERE business_profile_id=$1`, [input.scope.businessProfileId]);
  assert(audit.rows[0]?.authorization_decision === "authorized" && audit.rows[0]?.audit_operation === "create-draft" && audit.rows[0]?.audit_subject === "business-profile", "required audit and authorization evidence persists");
  const other = draftInput("another-fictional-business");
  assert((await store.createDraft(other)).status === "success", "another business may use the same numeric version");
  assert((await store.readRevision({ ...input.scope, businessProfileId: "wrong-business" })).status === "failure", "wrong business fails safely");
  assert((await store.readRevision({ ...input.scope, businessProfileVersion: 99 })).status === "failure", "wrong version fails safely");
  assert((await store.readRevision({ ...input.scope, businessProfileId: " " })).status === "failure", "invalid scope fails before persistence");
  await store.close();
  store = new PostgresqlBusinessProfileVersionRepository({ connectionString, schema });
  const restarted = await store.readRevision(input.scope);
  assert(restarted.status === "success", "new store instance reloads revision");
  if (restarted.status === "success") assertDeeplyFrozen(restarted.value, "restarted snapshot");
  await store.close();
}

async function verifyStoredRecordFailures() {
  const input = draftInput();
  const store = new PostgresqlBusinessProfileVersionRepository({ connectionString, schema });
  try {
    await assertConstraintRejects(`UPDATE "${schema}".business_profile_versions SET lifecycle_status='unknown' WHERE business_profile_id=$1`, [input.scope.businessProfileId], "unknown lifecycle is rejected by storage integrity");
    await assertConstraintRejects(`UPDATE "${schema}".business_profile_versions SET profile_document=jsonb_set(profile_document,'{id}','"wrong-business"'::jsonb) WHERE business_profile_id=$1`, [input.scope.businessProfileId], "envelope/document scope mismatch is rejected by storage integrity");
    await admin.query(`UPDATE "${schema}".business_profile_versions SET profile_document = jsonb_set(profile_document, '{services}', '"bad"'::jsonb) WHERE business_profile_id=$1`, [input.scope.businessProfileId]);
    const malformed = await store.readRevision(input.scope);
    assert(malformed.status === "failure" && malformed.reason === "InvalidStoredRecord", "malformed stored JSON fails closed");
    await admin.query(`UPDATE "${schema}".business_profile_versions SET record_format_version=99 WHERE business_profile_id=$1`, [input.scope.businessProfileId]);
    const incompatible = await store.readRevision(input.scope);
    assert(incompatible.status === "failure" && incompatible.reason === "IncompatibleStoredRecord", "incompatible format fails closed");
  } finally {
    await store.close();
  }
}

async function assertConstraintRejects(query: string, values: unknown[], label: string) {
  try { await admin.query(query, values); throw new Error(`Expected constraint rejection: ${label}`); }
  catch (error) { assert(error !== null && typeof error === "object" && "code" in error && error.code === "23514", label); }
}

async function verifyAuthorityBoundary() {
  const store = new PostgresqlBusinessProfileVersionRepository({ connectionString, schema });
  const input = draftInput();
  const transition = await store.recordLifecycleTransition({
    scope: input.scope,
    targetStatus: "active",
    context: {
      ...input.context,
      authorization: {
        ...input.context.authorization,
        decision: "denied",
      },
    },
  });
  assert(transition.status === "failure" && transition.reason === "RejectedInput", "store rejects a lifecycle fact without authorization");
  const capabilities = store as unknown as Record<string, unknown>;
  for (const name of ["approve", "authorize", "selectActive", "update", "delete", "mutateConversation", "release", "dispatch", "writeKnowledge"]) assert(capabilities[name] === undefined, `store exposes no ${name} capability`);
  await store.close();
}

function draftInput(id = fictionalBusinessProfile.id): CreateBusinessProfileDraftInput {
  const profile = { ...structuredClone(fictionalBusinessProfile), id, status: "draft" as const };
  return { scope: { businessProfileId: id, businessProfileVersion: profile.version }, profile, context: { requestId: `request-${id}`, expectedRevision: 0, authorization: { actorId: "fictional-owner", decisionId: `decision-${id}`, decision: "authorized" }, audit: { auditEventId: `audit-${id}`, operation: "create-draft", subject: "business-profile", reason: "Fictional Sprint 7.2 verification." } } };
}
function assertDeeplyFrozen(value: unknown, label: string) { if (!value || typeof value !== "object") return; assert(Object.isFrozen(value), `${label} is immutable`); for (const child of Object.values(value)) assertDeeplyFrozen(child, label); }
function assert(condition: unknown, label: string): asserts condition { if (!condition) throw new Error(`PostgreSQL Business Profile verification failed: ${label}`); }
function requiredUrl() { const value = process.env.TEST_DATABASE_URL?.trim(); if (!value) throw new Error("TEST_DATABASE_URL is required for PostgreSQL integration verification."); return value; }
