import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Pool } from "pg";
import { ActivatedConfigurationPrototypeIntegration } from "../ai/prototype/activated-configuration-prototype-integration";
import type { ActiveConfigurationSnapshot, AtomicConfigurationActivationStore, ConfigurationActivationRequest } from "../business-configuration/activation-contracts";
import { ActivatedConfigurationResolver } from "../business-configuration/activated-configuration-resolver";
import { ConfigurationActivationCoordinator } from "../business-configuration/configuration-activation-coordinator";
import { ConversationStateManager } from "../conversation/conversation-state-manager";
import type { ConversationStoreScope } from "../conversation/conversation-store";
import type { BusinessProfile } from "../domain/business-profile";
import type { KnowledgeRecord } from "../domain/knowledge-record";
import { fictionalBusinessProfile } from "../fixtures/business-profile";
import { fictionalKnowledgeRecords } from "../fixtures/knowledge";
import { applyPostgresqlMigrations } from "../persistence/postgresql/migration-runner";
import { PostgresqlBusinessProfileVersionRepository } from "../persistence/postgresql/postgresql-business-profile-version-repository";
import { PostgresqlConfigurationActivationStore } from "../persistence/postgresql/postgresql-configuration-activation-store";
import { PostgresqlConversationStore } from "../persistence/postgresql/postgresql-conversation-store";
import { PostgresqlExecutionJournal } from "../persistence/postgresql/postgresql-execution-journal";
import { PostgresqlKnowledgeVersionRepository } from "../persistence/postgresql/postgresql-knowledge-version-repository";
import { PostgresqlTransactionalExecutionCoordinator } from "../persistence/postgresql/postgresql-transactional-execution-coordinator";

const connectionString = requiredUrl();
const schema = `sprint_7_6_${Date.now()}_${process.pid}`;
const admin = new Pool({ connectionString });
const effectiveAt = "2026-08-12T12:00:00.000Z";

run().then(() => {
  console.log("Sprint 7.6 Business Configuration recovery verification passed.");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function run(): Promise<void> {
  await admin.query(`CREATE SCHEMA "${schema}"`);
  try {
    await applyPostgresqlMigrations({ connectionString, schema });
    await verifyMigrationHistory();
    await seedConfiguration(1, ["bound-knowledge", "unbound-knowledge"]);
    await seedConfiguration(2, ["replacement-knowledge"]);
    await activate(requestFor(1, ["bound-knowledge"], 0, "baseline"));
    await verifyResolutionAndCorruptionFailures();
    await verifyActivationReadFailures();
    await verifyCommitFailureAndRestart();
    await verifyPinnedHistoryFailure();
    await verifyInfrastructureFailures();
    await verifyAuthorityBoundaries();
  } finally {
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
}

async function verifyMigrationHistory(): Promise<void> {
  const result = await admin.query(`SELECT version, name FROM "${schema}".app_schema_migrations ORDER BY version`);
  equivalent(result.rows, [
    { version: 1, name: "conversation_states" },
    { version: 2, name: "execution_journal" },
    { version: 3, name: "business_profile_versions" },
    { version: 4, name: "knowledge_record_versions" },
    { version: 5, name: "configuration_activations" },
    { version: 6, name: "configuration_lifecycle_transitions" },
    { version: 7, name: "message_evidence" },
  ], "exact additive migrations 001-007 are used");
}

async function verifyResolutionAndCorruptionFailures(): Promise<void> {
  const runtime = createRuntime();
  try {
    readFailure(await runtime.activations.readActive("business-without-configuration"), "NotFound", "no active configuration fails explicitly");
    const active = await runtime.activations.readActive(fictionalBusinessProfile.id);
    assert(active.status === "success", "baseline activation is readable");
    if (active.status !== "success") return;
    const resolved = await runtime.resolver.resolve(resolveRequest("current"));
    assert(resolved.status === "success" && resolved.value.knowledge.length === 1 && resolved.value.knowledge[0]?.id === "bound-knowledge", "unbound knowledge never enters activated context");

    const missingProfile = resolverFor({
      ...active.value,
      businessProfileVersion: 99,
      knowledge: active.value.knowledge.map((scope) => ({ ...scope, businessProfileVersion: 99 })),
    }, runtime);
    resolutionFailure(await missingProfile.resolve(resolveRequest("current")), "ProfileUnavailable", "missing selected profile fails closed");

    const missingKnowledge = resolverFor({
      ...active.value,
      knowledge: [{
        businessProfileId: fictionalBusinessProfile.id,
        businessProfileVersion: 1,
        knowledgeRecordId: "missing-selected-knowledge",
        knowledgeRecordVersion: 1,
      }],
    }, runtime);
    resolutionFailure(await missingKnowledge.resolve(resolveRequest("current")), "KnowledgeUnavailable", "missing selected knowledge fails closed");

    const where = `business_profile_id=$1 AND business_profile_version=1 AND knowledge_record_id='bound-knowledge' AND knowledge_record_version=1`;
    await admin.query(`UPDATE "${schema}".knowledge_record_versions SET record_document=jsonb_set(record_document,'{title}','42'::jsonb) WHERE ${where}`, [fictionalBusinessProfile.id]);
    for (const label of ["first", "repeated"]) {
      resolutionFailure(await runtime.resolver.resolve(resolveRequest("current")), "KnowledgeInvalid", `${label} malformed selected knowledge read fails closed`);
    }
    const stored = await admin.query(`SELECT jsonb_typeof(record_document->'title') AS type FROM "${schema}".knowledge_record_versions WHERE ${where}`, [fictionalBusinessProfile.id]);
    assert(stored.rows[0]?.type === "number", "malformed durable knowledge is not repaired");
    await restoreKnowledge(1, "bound-knowledge");
  } finally {
    await closeRuntime(runtime);
  }
}

async function verifyActivationReadFailures(): Promise<void> {
  const runtime = createRuntime();
  try {
    const baseline = await runtime.activations.readActive(fictionalBusinessProfile.id);
    assert(baseline.status === "success", "baseline exists before read failures");
    if (baseline.status !== "success") return;

    await admin.query(`ALTER TABLE "${schema}".active_configurations RENAME TO active_configurations_unavailable`);
    readFailure(await runtime.activations.readActive(fictionalBusinessProfile.id), "InfrastructureFailure", "active-pointer read failure is explicit");
    await admin.query(`ALTER TABLE "${schema}".active_configurations_unavailable RENAME TO active_configurations`);

    await admin.query(`ALTER TABLE "${schema}".configuration_activations RENAME TO configuration_activations_unavailable`);
    readFailure(await runtime.activations.readForProfileVersion(fictionalBusinessProfile.id, 1), "InfrastructureFailure", "activation-history read failure is explicit");
    await admin.query(`ALTER TABLE "${schema}".configuration_activations_unavailable RENAME TO configuration_activations`);

    await admin.query(`UPDATE "${schema}".active_configurations SET record_format_version=99 WHERE business_profile_id=$1`, [fictionalBusinessProfile.id]);
    readFailure(await runtime.activations.readActive(fictionalBusinessProfile.id), "IncompatibleStoredRecord", "incompatible active record fails closed");
    readFailure(await runtime.activations.readActive(fictionalBusinessProfile.id), "IncompatibleStoredRecord", "incompatible active record is not repaired");
    const format = await admin.query(`SELECT record_format_version FROM "${schema}".active_configurations WHERE business_profile_id=$1`, [fictionalBusinessProfile.id]);
    assert(format.rows[0]?.record_format_version === 99, "incompatible durable activation remains unchanged");
    await admin.query(`UPDATE "${schema}".active_configurations SET record_format_version=1 WHERE business_profile_id=$1`, [fictionalBusinessProfile.id]);

    const selection = await admin.query(`SELECT knowledge_selection FROM "${schema}".configuration_activations WHERE business_profile_id=$1 AND activation_revision=1`, [fictionalBusinessProfile.id]);
    await admin.query(`UPDATE "${schema}".configuration_activations SET knowledge_selection='[]'::jsonb WHERE business_profile_id=$1 AND activation_revision=1`, [fictionalBusinessProfile.id]);
    readFailure(await runtime.activations.readActive(fictionalBusinessProfile.id), "InvalidStoredRecord", "malformed activation history fails closed");
    await admin.query(`UPDATE "${schema}".configuration_activations SET knowledge_selection=$2::jsonb WHERE business_profile_id=$1 AND activation_revision=1`, [fictionalBusinessProfile.id, JSON.stringify(selection.rows[0]?.knowledge_selection)]);

    await admin.query(`DELETE FROM "${schema}".active_configurations WHERE business_profile_id=$1`, [fictionalBusinessProfile.id]);
    readFailure(await runtime.activations.readActive(fictionalBusinessProfile.id), "NotFound", "missing pointer is not reconstructed from audit history");
    const history = await admin.query(`SELECT COUNT(*)::integer AS count FROM "${schema}".configuration_activations WHERE business_profile_id=$1`, [fictionalBusinessProfile.id]);
    assert(history.rows[0]?.count === 1, "activation history remains evidence only");
    await foreignKeyFailure(`INSERT INTO "${schema}".active_configurations (business_profile_id,activation_revision,business_profile_version,request_id,record_format_version,activated_at) VALUES ($1,999,1,'orphan',1,$2)`, [fictionalBusinessProfile.id, effectiveAt], "orphan active pointer is rejected");
    await admin.query(`INSERT INTO "${schema}".active_configurations (business_profile_id,activation_revision,business_profile_version,request_id,record_format_version,activated_at) VALUES ($1,$2,$3,$4,1,$5)`, [baseline.value.businessProfileId, baseline.value.activationRevision, baseline.value.businessProfileVersion, baseline.value.requestId, baseline.value.activatedAt]);
  } finally {
    await closeRuntime(runtime);
  }
}

async function verifyCommitFailureAndRestart(): Promise<void> {
  await admin.query(`CREATE FUNCTION "${schema}".reject_configuration_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fictional deferred commit failure'; END $$`);
  await admin.query(`CREATE CONSTRAINT TRIGGER reject_configuration_commit AFTER INSERT ON "${schema}".configuration_activations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "${schema}".reject_configuration_commit()`);
  const request = requestFor(2, ["replacement-knowledge"], 1, "commit-failure");
  const runtime = createRuntime();
  try {
    activationFailure(await runtime.coordinator.activate(request), "CommitFailure", "commit ambiguity is never success");
  } finally {
    await admin.query(`DROP TRIGGER reject_configuration_commit ON "${schema}".configuration_activations`);
    await admin.query(`DROP FUNCTION "${schema}".reject_configuration_commit()`);
    await closeRuntime(runtime);
  }
  const restarted = createRuntime();
  try {
    const active = await restarted.activations.readActive(fictionalBusinessProfile.id);
    assert(active.status === "success" && active.value.activationRevision === 1 && active.value.businessProfileVersion === 1, "restart preserves last committed activation after failed commit");
    const failed = await admin.query(`SELECT COUNT(*)::integer AS count FROM "${schema}".configuration_activations WHERE request_id=$1`, [request.context.requestId]);
    assert(failed.rows[0]?.count === 0, "failed commit leaves no activation or audit row");
    activationFailure(await restarted.coordinator.activate(requestFor(1, ["bound-knowledge"], 0, "baseline")), "DuplicateActivationRequest", "duplicate protection survives restart");
  } finally {
    await closeRuntime(restarted);
  }
}

async function verifyPinnedHistoryFailure(): Promise<void> {
  const conversations = new PostgresqlConversationStore({ connectionString, schema });
  const journal = new PostgresqlExecutionJournal({ connectionString, schema });
  const transactions = new PostgresqlTransactionalExecutionCoordinator({ connectionString, schema });
  const runtime = createRuntime();
  const scope: ConversationStoreScope = { businessProfileId: fictionalBusinessProfile.id, businessProfileVersion: 2, conversationId: "conversation-without-activation-history" };
  try {
    const manager = ConversationStateManager.usingStore(conversations);
    assert((await manager.initialize({ ...scope, requiredFields: ["requested-service"] })).status === "success", "pinned fictional conversation is stored");
    const integration = new ActivatedConfigurationPrototypeIntegration({ configurationResolver: runtime.resolver, conversationStore: conversations, executionJournal: journal, transactionCoordinator: transactions });
    const result = await integration.recover({ scope, effectiveAt });
    assert(result.status === "failure" && result.reason === "ConfigurationUnavailable", "missing historical activation fails without current-profile substitution");
    const durable = await conversations.read(scope);
    assert(durable.status === "success" && durable.state.revision === 0 && durable.state.businessProfileVersion === 2, "failed recovery preserves exact pin and creates no fallback state");
    const count = await admin.query(`SELECT COUNT(*)::integer AS count FROM "${schema}".conversation_states WHERE business_profile_id=$1 AND conversation_id=$2`, [scope.businessProfileId, scope.conversationId]);
    assert(count.rows[0]?.count === 1, "failed recovery creates no fresh conversation");
  } finally {
    await Promise.all([conversations.close(), journal.close(), transactions.close(), closeRuntime(runtime)]);
  }
}

async function verifyInfrastructureFailures(): Promise<void> {
  const unavailable = new URL(connectionString);
  unavailable.hostname = "127.0.0.1";
  unavailable.port = "1";
  unavailable.searchParams.set("connect_timeout", "1");
  const profiles = new PostgresqlBusinessProfileVersionRepository({ connectionString: unavailable.toString(), schema });
  const knowledge = new PostgresqlKnowledgeVersionRepository({ connectionString: unavailable.toString(), schema });
  const activations = new PostgresqlConfigurationActivationStore({ connectionString: unavailable.toString(), schema });
  try {
    repositoryFailure(await profiles.readRevision({ businessProfileId: fictionalBusinessProfile.id, businessProfileVersion: 1 }), "PersistenceFailure", "profile repository failure is explicit");
    repositoryFailure(await knowledge.readRevision({ businessProfileId: fictionalBusinessProfile.id, businessProfileVersion: 1, knowledgeRecordId: "bound-knowledge", knowledgeRecordVersion: 1 }), "PersistenceFailure", "knowledge repository failure is explicit");
    readFailure(await activations.readActive(fictionalBusinessProfile.id), "InfrastructureFailure", "activation repository failure is explicit");
    const resolver = new ActivatedConfigurationResolver({ activations, businessProfiles: profiles, knowledge });
    resolutionFailure(await resolver.resolve(resolveRequest("current")), "ConfigurationUnavailable", "resolution failure is application-owned");
  } finally {
    await Promise.all([profiles.close(), knowledge.close(), activations.close()]);
  }
}

async function verifyAuthorityBoundaries(): Promise<void> {
  const activated = await readFile(join(process.cwd(), "src", "ai", "prototype", "activated-configuration-prototype-integration.ts"), "utf8");
  const persistence = await readFile(join(process.cwd(), "src", "ai", "prototype", "persistence-backed-prototype-integration.ts"), "utf8");
  const activation = await readFile(join(process.cwd(), "src", "persistence", "postgresql", "postgresql-configuration-activation-store.ts"), "utf8");
  assert(!/fixtures|automatic retry|setTimeout|releaseCustomer|dispatch/i.test(activated), "durable activated path has no fixture fallback, retry, release, or dispatch");
  assert(!/journal.*replay|replay.*journal|automatic retry|setTimeout/i.test(persistence), "recovery has no journal replay or automatic retry");
  assert(activation.includes('commitAttempted ? "CommitFailure"') && !/conversation_states|execution_journal|releaseCustomer|dispatch/i.test(activation), "activation persistence has no conversation or external-action authority");
}

interface Runtime { profiles: PostgresqlBusinessProfileVersionRepository; knowledge: PostgresqlKnowledgeVersionRepository; activations: PostgresqlConfigurationActivationStore; coordinator: ConfigurationActivationCoordinator; resolver: ActivatedConfigurationResolver }
function createRuntime(): Runtime {
  const profiles = new PostgresqlBusinessProfileVersionRepository({ connectionString, schema });
  const knowledge = new PostgresqlKnowledgeVersionRepository({ connectionString, schema });
  const activations = new PostgresqlConfigurationActivationStore({ connectionString, schema });
  return { profiles, knowledge, activations, coordinator: new ConfigurationActivationCoordinator({ businessProfiles: profiles, knowledge, activationStore: activations }), resolver: new ActivatedConfigurationResolver({ activations, businessProfiles: profiles, knowledge }) };
}
async function closeRuntime(runtime: Runtime): Promise<void> { await Promise.all([runtime.profiles.close(), runtime.knowledge.close(), runtime.activations.close()]); }
function resolverFor(snapshot: ActiveConfigurationSnapshot, runtime: Runtime): ActivatedConfigurationResolver { return new ActivatedConfigurationResolver({ activations: staticActivationStore(snapshot), businessProfiles: runtime.profiles, knowledge: runtime.knowledge }); }
function staticActivationStore(snapshot: ActiveConfigurationSnapshot): AtomicConfigurationActivationStore { return { async activateApproved() { return { status: "failure", reason: "InvalidInput", errors: ["Activation is unavailable in this verifier."] }; }, async readActive() { return { status: "success", value: snapshot }; }, async readForProfileVersion() { return { status: "success", value: snapshot }; } }; }
function resolveRequest(mode: "current") { return { businessProfileId: fictionalBusinessProfile.id, effectiveAt, audience: "customer" as const, selection: { mode } as const }; }

async function activate(request: ConfigurationActivationRequest): Promise<void> { const runtime = createRuntime(); try { assert((await runtime.coordinator.activate(request)).status === "success", "baseline configuration activates"); } finally { await closeRuntime(runtime); } }
function requestFor(profileVersion: number, knowledgeIds: readonly string[], expectedActiveRevision: number, identity: string): ConfigurationActivationRequest { return { profileScope: { businessProfileId: fictionalBusinessProfile.id, businessProfileVersion: profileVersion }, knowledge: knowledgeIds.map((knowledgeRecordId) => ({ scope: { businessProfileId: fictionalBusinessProfile.id, businessProfileVersion: profileVersion, knowledgeRecordId, knowledgeRecordVersion: profileVersion }, expectedRevision: 0 })), expectedActiveRevision, activatedAt: effectiveAt, context: { requestId: `s7-6-${identity}`, expectedRevision: 0, authorization: { actorId: "fictional-owner", decisionId: `s7-6-${identity}-decision`, decision: "authorized" }, audit: { auditEventId: `s7-6-${identity}-audit`, operation: "activate", subject: "business-profile", reason: "Fictional Sprint 7.6 recovery verification." } } }; }

async function seedConfiguration(version: number, ids: readonly string[]): Promise<void> {
  const profile: BusinessProfile = { ...structuredClone(fictionalBusinessProfile), version, status: "ready-for-review" };
  await admin.query(`INSERT INTO "${schema}".business_profile_versions (business_profile_id,business_profile_version,revision,lifecycle_status,record_format_version,profile_document,request_id,actor_id,authorization_decision_id,authorization_decision,audit_event_id,audit_operation,audit_subject,audit_reason) VALUES ($1,$2,0,'ready-for-review',1,$3::jsonb,$4,'fictional-owner',$5,'authorized',$6,'submit-for-review','business-profile','Fictional reviewed profile.')`, [profile.id, version, JSON.stringify(profile), `s7-6-profile-${version}`, `s7-6-profile-${version}-decision`, `s7-6-profile-${version}-audit`]);
  for (const id of ids) await seedKnowledge(version, id);
}
async function seedKnowledge(version: number, id: string): Promise<void> {
  const source = fictionalKnowledgeRecords[0]; if (!source) throw new Error("A fictional knowledge fixture is required.");
  const record: KnowledgeRecord = { ...structuredClone(source), id, version, businessProfileId: fictionalBusinessProfile.id, lifecycleState: "approved" };
  await admin.query(`INSERT INTO "${schema}".knowledge_record_versions (business_profile_id,business_profile_version,knowledge_record_id,knowledge_record_version,revision,lifecycle_state,audience,source_identity,effective_date,record_format_version,record_document,request_id,actor_id,authorization_decision_id,authorization_decision,audit_event_id,audit_operation,audit_subject,audit_reason) VALUES ($1,$2,$3,$4,0,'approved',$5,$6,$7,1,$8::jsonb,$9,'fictional-owner',$10,'authorized',$11,'approve','knowledge-record','Fictional approved knowledge.')`, [record.businessProfileId, version, id, version, record.audience, record.source, record.effectiveDate, JSON.stringify(record), `s7-6-knowledge-${version}-${id}`, `s7-6-knowledge-${version}-${id}-decision`, `s7-6-knowledge-${version}-${id}-audit`]);
}
async function restoreKnowledge(version: number, id: string): Promise<void> { const source = fictionalKnowledgeRecords[0]; if (!source) throw new Error("A fictional knowledge fixture is required."); const record: KnowledgeRecord = { ...structuredClone(source), id, version, businessProfileId: fictionalBusinessProfile.id, lifecycleState: "approved" }; await admin.query(`UPDATE "${schema}".knowledge_record_versions SET record_document=$5::jsonb,lifecycle_state=$6,audience=$7,source_identity=$8,effective_date=$9,record_format_version=1 WHERE business_profile_id=$1 AND business_profile_version=$2 AND knowledge_record_id=$3 AND knowledge_record_version=$4`, [record.businessProfileId, version, id, version, JSON.stringify(record), record.lifecycleState, record.audience, record.source, record.effectiveDate]); }

async function foreignKeyFailure(query: string, values: unknown[], label: string): Promise<void> { try { await admin.query(query, values); throw new Error(`Expected constraint failure: ${label}`); } catch (error) { assert(error !== null && typeof error === "object" && "code" in error && error.code === "23503", label); } }
function activationFailure(result: Awaited<ReturnType<ConfigurationActivationCoordinator["activate"]>>, reason: string, label: string): void { assert(result.status === "failure" && result.reason === reason, label); if (result.status === "failure") sanitized(result.errors, label); }
function resolutionFailure(result: Awaited<ReturnType<ActivatedConfigurationResolver["resolve"]>>, reason: string, label: string): void { assert(result.status === "failure" && result.reason === reason, label); if (result.status === "failure") sanitized(result.errors, label); }
function readFailure(result: { status: string; reason?: string; errors?: readonly string[] }, reason: string, label: string): void { assert(result.status === "failure" && result.reason === reason, label); if (result.errors) sanitized(result.errors, label); }
function repositoryFailure(result: { status: string; reason?: string; errors?: readonly string[] }, reason: string, label: string): void { readFailure(result, reason, label); }
function sanitized(errors: readonly string[], label: string): void { assert(!/postgres|sql|select |insert |update |delete |password|credential|connection string|127\.0\.0\.1|:\/\//i.test(errors.join(" ")), `${label} exposes no infrastructure detail`); }
function equivalent(actual: unknown, expected: unknown, label: string): void { assert(JSON.stringify(actual) === JSON.stringify(expected), label); }
function assert(condition: unknown, label: string): asserts condition { if (!condition) throw new Error(`PostgreSQL Business Configuration recovery verification failed: ${label}`); }
function requiredUrl(): string { const value = process.env.TEST_DATABASE_URL?.trim(); if (!value) throw new Error("TEST_DATABASE_URL is required for PostgreSQL integration verification."); return value; }
