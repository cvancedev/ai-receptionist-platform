import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { Pool } from "pg";
import type { ConfigurationActivationRequest } from "../business-configuration/activation-contracts";
import { ConfigurationActivationCoordinator } from "../business-configuration/configuration-activation-coordinator";
import type { BusinessProfile } from "../domain/business-profile";
import type { KnowledgeRecord } from "../domain/knowledge-record";
import { fictionalBusinessProfile } from "../fixtures/business-profile";
import { fictionalKnowledgeRecords } from "../fixtures/knowledge";
import { applyPostgresqlMigrations } from "../persistence/postgresql/migration-runner";
import { PostgresqlBusinessProfileVersionRepository } from "../persistence/postgresql/postgresql-business-profile-version-repository";
import { PostgresqlConfigurationActivationStore } from "../persistence/postgresql/postgresql-configuration-activation-store";
import { PostgresqlKnowledgeVersionRepository } from "../persistence/postgresql/postgresql-knowledge-version-repository";

const connectionString = requiredUrl();
const schema = `sprint_7_4_${Date.now()}_${process.pid}`;
const admin = new Pool({ connectionString });

run()
  .then(() => console.log("Sprint 7.4 PostgreSQL configuration activation verification passed."))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

async function run(): Promise<void> {
  await admin.query(`CREATE SCHEMA "${schema}"`);
  try {
    await verifyMigration();
    await seedConfiguration(1, ["knowledge-one", "knowledge-two"]);
    await verifyEligibilityAuthorizationAndIsolation();
    await verifyInitialActivationAndIdempotency();
    await verifyRollbackAndReplacement();
    await verifyConcurrency();
    await verifyRestartAndStoredRecordFailures();
    await verifyAuthorityBoundary();
  } finally {
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
}

async function verifyMigration(): Promise<void> {
  await applyPostgresqlMigrations({ connectionString, schema });
  await applyPostgresqlMigrations({ connectionString, schema });
  const history = await admin.query(
    `SELECT version, name FROM "${schema}".app_schema_migrations ORDER BY version`,
  );
  assertEquivalent(history.rows, [
    { version: 1, name: "conversation_states" },
    { version: 2, name: "execution_journal" },
    { version: 3, name: "business_profile_versions" },
    { version: 4, name: "knowledge_record_versions" },
    { version: 5, name: "configuration_activations" },
    { version: 6, name: "configuration_lifecycle_transitions" },
  ], "ordered migrations 001-006 are compatible and idempotent");
}

async function verifyEligibilityAuthorizationAndIsolation(): Promise<void> {
  const runtime = createRuntime();
  try {
    const denied = await runtime.coordinator.activate({
      ...requestFor(1, ["knowledge-one"], "denied", 0),
      context: {
        ...requestFor(1, ["knowledge-one"], "denied", 0).context,
        authorization: {
          ...requestFor(1, ["knowledge-one"], "denied", 0).context.authorization,
          decision: "denied",
        },
      },
    });
    assertFailure(denied, "AuthorizationDenied", "denied authorization cannot activate");

    const empty = await runtime.coordinator.activate({
      ...requestFor(1, ["knowledge-one"], "empty", 0),
      knowledge: [],
    });
    assertFailure(empty, "InvalidInput", "empty knowledge selection cannot activate");

    const wrongBusiness = await runtime.coordinator.activate({
      ...requestFor(1, ["knowledge-one"], "wrong-business", 0),
      profileScope: {
        businessProfileId: "unrelated-fictional-business",
        businessProfileVersion: 1,
      },
      knowledge: [{
        scope: {
          businessProfileId: "unrelated-fictional-business",
          businessProfileVersion: 1,
          knowledgeRecordId: "knowledge-one",
          knowledgeRecordVersion: 1,
        },
        expectedRevision: 0,
      }],
    });
    assertFailure(wrongBusiness, "ProfileUnavailable", "wrong business fails safely");

    const wrongProfile = await runtime.coordinator.activate(
      requestFor(99, ["knowledge-one"], "wrong-profile", 0),
    );
    assertFailure(wrongProfile, "ProfileUnavailable", "wrong profile version fails safely");

    const wrongKnowledge = await runtime.coordinator.activate(
      requestFor(1, ["missing-knowledge"], "wrong-knowledge", 0),
    );
    assertFailure(wrongKnowledge, "KnowledgeUnavailable", "wrong knowledge fails safely");

    const staleProfile = await runtime.coordinator.activate({
      ...requestFor(1, ["knowledge-one"], "stale-profile", 0),
      context: {
        ...requestFor(1, ["knowledge-one"], "stale-profile", 0).context,
        expectedRevision: 1,
      },
    });
    assertFailure(staleProfile, "StaleRevision", "stale profile revision fails closed");

    const staleKnowledgeRequest = requestFor(
      1,
      ["knowledge-one"],
      "stale-knowledge",
      0,
    );
    const staleKnowledge = await runtime.coordinator.activate({
      ...staleKnowledgeRequest,
      knowledge: staleKnowledgeRequest.knowledge.map((selection) => ({
        ...selection,
        expectedRevision: 1,
      })),
    });
    assertFailure(staleKnowledge, "StaleRevision", "stale knowledge revision fails closed");

    await seedProfile(8, "draft");
    await seedKnowledge(8, "unready-knowledge", "approved");
    const unready = await runtime.coordinator.activate(
      requestFor(8, ["unready-knowledge"], "unready", 0),
    );
    assertFailure(unready, "LifecycleConflict", "unready profile cannot activate");

    await seedKnowledge(1, "unapproved-knowledge", "draft");
    const unapproved = await runtime.coordinator.activate(
      requestFor(1, ["unapproved-knowledge"], "unapproved", 0),
    );
    assertFailure(unapproved, "LifecycleConflict", "unapproved knowledge cannot activate");

    await seedKnowledge(1, "future-knowledge", "approved", {
      effectiveDate: "2030-01-01",
    });
    const future = await runtime.coordinator.activate(
      requestFor(1, ["future-knowledge"], "future", 0),
    );
    assertFailure(future, "ActivationIneligible", "future knowledge cannot activate early");

    await seedKnowledge(1, "conflict-a", "approved", {
      title: "Conflicting fictional rule",
      category: "fictional-policy",
      content: "First fictional answer.",
    });
    await seedKnowledge(1, "conflict-b", "approved", {
      title: "Conflicting fictional rule",
      category: "fictional-policy",
      content: "Second fictional answer.",
    });
    const conflict = await runtime.coordinator.activate(
      requestFor(1, ["conflict-a", "conflict-b"], "conflict", 0),
    );
    assertFailure(conflict, "ConfigurationConflict", "material knowledge conflict blocks activation");

    await seedProfile(9, "ready-for-review", { services: [] });
    const invalidProfile = await runtime.coordinator.activate(
      requestFor(9, ["missing-for-invalid-profile"], "invalid-profile", 0),
    );
    assertFailure(invalidProfile, "InvalidStoredRecord", "structurally invalid profile fails closed");

    await seedKnowledge(1, "invalid-knowledge", "approved", {
      effectiveDate: "not-a-date",
    });
    const invalidKnowledge = await runtime.coordinator.activate(
      requestFor(1, ["invalid-knowledge"], "invalid-knowledge", 0),
    );
    assertFailure(invalidKnowledge, "InvalidStoredRecord", "structurally invalid knowledge fails closed");

    await assertNoActivation("eligibility and authorization failures perform no mutation");
  } finally {
    await closeRuntime(runtime);
  }
}

async function verifyInitialActivationAndIdempotency(): Promise<void> {
  const runtime = createRuntime();
  const request = requestFor(
    1,
    ["knowledge-one", "knowledge-two"],
    "activation-one",
    0,
  );
  try {
    const activated = await runtime.coordinator.activate(request);
    assert(activated.status === "success", "valid configuration activates");
    if (activated.status !== "success") return;
    assert(activated.value.activationRevision === 1, "first activation has revision one");
    assert(activated.value.businessProfileVersion === 1, "exact profile version is active");
    assertDeeplyFrozen(activated.value, "activation result");

    const active = await runtime.coordinator.readActive(fictionalBusinessProfile.id);
    assert(active.status === "success", "active configuration becomes visible");
    if (active.status === "success") {
      assertEquivalent(active.value.knowledge.map((item) => item.knowledgeRecordId), [
        "knowledge-one",
        "knowledge-two",
      ], "exact selected knowledge versions are preserved");
      assertDeeplyFrozen(active.value, "active configuration read");
    }

    const audit = await admin.query(
      `SELECT actor_id, authorization_decision, audit_operation, audit_subject,
        audit_reason, expected_active_revision, prior_activation_revision,
        resulting_profile_lifecycle_status, knowledge_selection
      FROM "${schema}".configuration_activations
      WHERE business_profile_id = $1 AND request_id = $2`,
      [fictionalBusinessProfile.id, request.context.requestId],
    );
    assert(
      audit.rows[0]?.actor_id === "fictional-owner"
        && audit.rows[0]?.authorization_decision === "authorized"
        && audit.rows[0]?.audit_operation === "activate"
        && audit.rows[0]?.audit_subject === "business-profile"
        && audit.rows[0]?.expected_active_revision === 0
        && audit.rows[0]?.prior_activation_revision === null
        && audit.rows[0]?.resulting_profile_lifecycle_status === "active"
        && Array.isArray(audit.rows[0]?.knowledge_selection),
      "bounded activation audit evidence persists",
    );

    await assertVersionDocumentsUnchanged(1, ["knowledge-one", "knowledge-two"]);

    const duplicate = await runtime.coordinator.activate(request);
    assertFailure(duplicate, "DuplicateActivationRequest", "same request cannot activate twice");
    const conflicting = await runtime.coordinator.activate({
      ...request,
      activatedAt: "2026-08-07T12:00:00.000Z",
    });
    assertFailure(conflicting, "ConflictingActivationRequest", "conflicting duplicate is explicit");
    assert(await activationCount() === 1, "duplicates add no activation history");
  } finally {
    await closeRuntime(runtime);
  }
}

async function verifyRollbackAndReplacement(): Promise<void> {
  await seedConfiguration(2, ["replacement-knowledge"]);
  await admin.query(
    `INSERT INTO "${schema}".conversation_states (
      business_profile_id, business_profile_version, conversation_id,
      revision, state_format_version, state_document
    ) VALUES ($1, 1, 'pinned-fictional-conversation', 0, 1, $2::jsonb)`,
    [fictionalBusinessProfile.id, JSON.stringify({
      businessProfileId: fictionalBusinessProfile.id,
      businessProfileVersion: 1,
      conversationId: "pinned-fictional-conversation",
      revision: 0,
    })],
  );
  await admin.query(
    `CREATE FUNCTION "${schema}".reject_active_pointer()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'fictional activation pointer failure';
    END $$`,
  );
  await admin.query(
    `CREATE TRIGGER reject_active_pointer
    BEFORE INSERT OR UPDATE ON "${schema}".active_configurations
    FOR EACH ROW EXECUTE FUNCTION "${schema}".reject_active_pointer()`,
  );

  const runtime = createRuntime();
  const replacement = requestFor(
    2,
    ["replacement-knowledge"],
    "activation-two",
    1,
  );
  try {
    const failed = await runtime.coordinator.activate(replacement);
    assertFailure(failed, "TransactionFailure", "in-transaction failure is explicit");
  } finally {
    await admin.query(`DROP TRIGGER reject_active_pointer ON "${schema}".active_configurations`);
    await admin.query(`DROP FUNCTION "${schema}".reject_active_pointer()`);
  }

  try {
    const activeAfterFailure = await runtime.coordinator.readActive(
      fictionalBusinessProfile.id,
    );
    assert(
      activeAfterFailure.status === "success"
        && activeAfterFailure.value.activationRevision === 1
        && activeAfterFailure.value.businessProfileVersion === 1,
      "previous active configuration remains authoritative after rollback",
    );
    const failedHistory = await admin.query(
      `SELECT COUNT(*)::integer AS count
      FROM "${schema}".configuration_activations WHERE request_id = $1`,
      [replacement.context.requestId],
    );
    assert(failedHistory.rows[0]?.count === 0, "rollback leaves no false success audit");

    const activated = await runtime.coordinator.activate(replacement);
    assert(
      activated.status === "success"
        && activated.value.activationRevision === 2
        && activated.value.priorActivationRevision === 1,
      "replacement activation commits atomically",
    );
    assert(await activationCount() === 2, "prior activation remains auditable");
    const pointerCount = await admin.query(
      `SELECT COUNT(*)::integer AS count FROM "${schema}".active_configurations
      WHERE business_profile_id = $1`,
      [fictionalBusinessProfile.id],
    );
    assert(pointerCount.rows[0]?.count === 1, "exactly one active configuration exists");
    const pinned = await admin.query(
      `SELECT business_profile_version FROM "${schema}".conversation_states
      WHERE conversation_id = 'pinned-fictional-conversation'`,
    );
    assert(pinned.rows[0]?.business_profile_version === 1, "existing conversation remains pinned");
    await assertVersionDocumentsUnchanged(2, ["replacement-knowledge"]);
  } finally {
    await closeRuntime(runtime);
  }
}

async function verifyConcurrency(): Promise<void> {
  await seedConfiguration(3, ["concurrent-three"]);
  await seedConfiguration(4, ["concurrent-four"]);
  const runtime = createRuntime();
  try {
    const [left, right] = await Promise.all([
      runtime.coordinator.activate(requestFor(3, ["concurrent-three"], "concurrent-three", 2)),
      runtime.coordinator.activate(requestFor(4, ["concurrent-four"], "concurrent-four", 2)),
    ]);
    const successes = [left, right].filter((result) => result.status === "success");
    const stale = [left, right].filter(
      (result) => result.status === "failure" && result.reason === "StaleRevision",
    );
    assert(successes.length === 1 && stale.length === 1, "competing activations produce one winner and one stale failure");
    assert(await activationCount() === 3, "losing concurrent activation adds no history");
  } finally {
    await closeRuntime(runtime);
  }
}

async function verifyRestartAndStoredRecordFailures(): Promise<void> {
  let store = new PostgresqlConfigurationActivationStore({ connectionString, schema });
  const first = await store.readActive(fictionalBusinessProfile.id);
  assert(first.status === "success", "active configuration survives new store instance");
  if (first.status !== "success") return;
  const savedSelection = await admin.query(
    `SELECT activation_revision, knowledge_selection
    FROM "${schema}".configuration_activations
    WHERE business_profile_id = $1 AND activation_revision = $2`,
    [fictionalBusinessProfile.id, first.value.activationRevision],
  );

  let mismatchedProfileRejected = false;
  try {
    await admin.query(
      `UPDATE "${schema}".configuration_activation_knowledge
      SET business_profile_version = business_profile_version + 100
      WHERE business_profile_id = $1 AND activation_revision = $2`,
      [fictionalBusinessProfile.id, first.value.activationRevision],
    );
  } catch {
    mismatchedProfileRejected = true;
  }
  assert(
    mismatchedProfileRejected,
    "activation knowledge cannot be reassigned to another profile version",
  );

  await admin.query(
    `UPDATE "${schema}".active_configurations SET record_format_version = 99
    WHERE business_profile_id = $1`,
    [fictionalBusinessProfile.id],
  );
  const incompatible = await store.readActive(fictionalBusinessProfile.id);
  assertReadFailure(incompatible, "IncompatibleStoredRecord", "unsupported active format fails closed");
  await admin.query(
    `UPDATE "${schema}".active_configurations SET record_format_version = 1
    WHERE business_profile_id = $1`,
    [fictionalBusinessProfile.id],
  );

  await admin.query(
    `UPDATE "${schema}".configuration_activations SET knowledge_selection = '[]'::jsonb
    WHERE business_profile_id = $1 AND activation_revision = $2`,
    [fictionalBusinessProfile.id, first.value.activationRevision],
  );
  const malformed = await store.readActive(fictionalBusinessProfile.id);
  assertReadFailure(malformed, "InvalidStoredRecord", "malformed active selection fails closed");
  await admin.query(
    `UPDATE "${schema}".configuration_activations SET knowledge_selection = $3::jsonb
    WHERE business_profile_id = $1 AND activation_revision = $2`,
    [
      fictionalBusinessProfile.id,
      first.value.activationRevision,
      JSON.stringify(savedSelection.rows[0]?.knowledge_selection),
    ],
  );
  await store.close();
  store = new PostgresqlConfigurationActivationStore({ connectionString, schema });
  const recovered = await store.readActive(fictionalBusinessProfile.id);
  assert(recovered.status === "success", "restored exact active record reloads after restart");
  await store.close();
}

async function verifyAuthorityBoundary(): Promise<void> {
  const runtime = createRuntime();
  try {
    const coordinatorCapabilities = runtime.coordinator as unknown as Record<string, unknown>;
    for (const name of [
      "authenticate", "createProfile", "createKnowledge", "mutateConversation",
      "repinConversation", "selectProvider", "release", "dispatch", "retry",
    ]) assert(coordinatorCapabilities[name] === undefined, `coordinator exposes no ${name} capability`);

    const storeCapabilities = runtime.activationStore as unknown as Record<string, unknown>;
    for (const name of [
      "authenticate", "validate", "approve", "createProfile", "createKnowledge",
      "mutateConversation", "selectProvider", "release", "dispatch", "retry",
    ]) assert(storeCapabilities[name] === undefined, `store exposes no ${name} capability`);

    const source = await readFile(
      join(process.cwd(), "src", "persistence", "postgresql", "postgresql-configuration-activation-store.ts"),
      "utf8",
    );
    assert(
      !/conversation_states|execution_journal|customerResponseReleased|automatic retry|setTimeout/i.test(source),
      "activation store contains no conversation, release, journal, or retry behavior",
    );
    assert(source.includes('commitAttempted ? "CommitFailure"'), "commit ambiguity has an explicit failure outcome");
  } finally {
    await closeRuntime(runtime);
  }
}

interface Runtime {
  readonly profiles: PostgresqlBusinessProfileVersionRepository;
  readonly knowledge: PostgresqlKnowledgeVersionRepository;
  readonly activationStore: PostgresqlConfigurationActivationStore;
  readonly coordinator: ConfigurationActivationCoordinator;
}

function createRuntime(): Runtime {
  const profiles = new PostgresqlBusinessProfileVersionRepository({ connectionString, schema });
  const knowledge = new PostgresqlKnowledgeVersionRepository({ connectionString, schema });
  const activationStore = new PostgresqlConfigurationActivationStore({ connectionString, schema });
  return {
    profiles,
    knowledge,
    activationStore,
    coordinator: new ConfigurationActivationCoordinator({
      businessProfiles: profiles,
      knowledge,
      activationStore,
    }),
  };
}

async function closeRuntime(runtime: Runtime): Promise<void> {
  await Promise.all([
    runtime.profiles.close(),
    runtime.knowledge.close(),
    runtime.activationStore.close(),
  ]);
}

function requestFor(
  profileVersion: number,
  knowledgeIds: readonly string[],
  identity: string,
  expectedActiveRevision: number,
): ConfigurationActivationRequest {
  return {
    profileScope: {
      businessProfileId: fictionalBusinessProfile.id,
      businessProfileVersion: profileVersion,
    },
    knowledge: knowledgeIds.map((knowledgeRecordId) => ({
      scope: {
        businessProfileId: fictionalBusinessProfile.id,
        businessProfileVersion: profileVersion,
        knowledgeRecordId,
        knowledgeRecordVersion: 1,
      },
      expectedRevision: 0,
    })),
    expectedActiveRevision,
    activatedAt: "2026-08-06T12:00:00.000Z",
    context: {
      requestId: `request-${identity}`,
      expectedRevision: 0,
      authorization: {
        actorId: "fictional-owner",
        decisionId: `decision-${identity}`,
        decision: "authorized",
      },
      audit: {
        auditEventId: `audit-${identity}`,
        operation: "activate",
        subject: "business-profile",
        reason: "Fictional Sprint 7.4 activation verification.",
      },
    },
  };
}

async function seedConfiguration(
  profileVersion: number,
  knowledgeIds: readonly string[],
): Promise<void> {
  await seedProfile(profileVersion, "ready-for-review");
  for (const knowledgeId of knowledgeIds) {
    await seedKnowledge(profileVersion, knowledgeId, "approved");
  }
}

async function seedProfile(
  version: number,
  status: BusinessProfile["status"],
  overrides: Partial<BusinessProfile> = {},
): Promise<void> {
  const profile: BusinessProfile = {
    ...structuredClone(fictionalBusinessProfile),
    ...overrides,
    version,
    status,
  };
  await admin.query(
    `INSERT INTO "${schema}".business_profile_versions (
      business_profile_id, business_profile_version, revision,
      lifecycle_status, record_format_version, profile_document,
      request_id, actor_id, authorization_decision_id,
      authorization_decision, audit_event_id, audit_operation,
      audit_subject, audit_reason
    ) VALUES ($1, $2, 0, $3, 1, $4::jsonb, $5, 'fictional-owner',
      $6, 'authorized', $7, 'submit-for-review', 'business-profile', $8)`,
    [
      profile.id,
      profile.version,
      profile.status,
      JSON.stringify(profile),
      `seed-profile-request-${version}`,
      `seed-profile-decision-${version}`,
      `seed-profile-audit-${version}`,
      "Fictional pre-activation profile fixture.",
    ],
  );
}

async function seedKnowledge(
  profileVersion: number,
  id: string,
  lifecycleState: KnowledgeRecord["lifecycleState"],
  overrides: Partial<KnowledgeRecord> = {},
): Promise<void> {
  const source = fictionalKnowledgeRecords[0];
  if (!source) throw new Error("A fictional knowledge fixture is required.");
  const record: KnowledgeRecord = {
    ...structuredClone(source),
    ...overrides,
    id,
    version: 1,
    businessProfileId: fictionalBusinessProfile.id,
    lifecycleState,
  };
  await admin.query(
    `INSERT INTO "${schema}".knowledge_record_versions (
      business_profile_id, business_profile_version,
      knowledge_record_id, knowledge_record_version, revision,
      lifecycle_state, audience, source_identity, effective_date,
      record_format_version, record_document, request_id, actor_id,
      authorization_decision_id, authorization_decision, audit_event_id,
      audit_operation, audit_subject, audit_reason
    ) VALUES ($1, $2, $3, $4, 0, $5, $6, $7, $8, 1, $9::jsonb,
      $10, 'fictional-owner', $11, 'authorized', $12,
      'approve', 'knowledge-record', $13)`,
    [
      record.businessProfileId,
      profileVersion,
      record.id,
      record.version,
      record.lifecycleState,
      record.audience,
      record.source,
      record.effectiveDate,
      JSON.stringify(record),
      `seed-knowledge-request-${profileVersion}-${id}`,
      `seed-knowledge-decision-${profileVersion}-${id}`,
      `seed-knowledge-audit-${profileVersion}-${id}`,
      "Fictional pre-activation knowledge fixture.",
    ],
  );
}

async function assertVersionDocumentsUnchanged(
  profileVersion: number,
  knowledgeIds: readonly string[],
): Promise<void> {
  const profile = await admin.query(
    `SELECT lifecycle_status, profile_document ->> 'status' AS document_status
    FROM "${schema}".business_profile_versions
    WHERE business_profile_id = $1 AND business_profile_version = $2`,
    [fictionalBusinessProfile.id, profileVersion],
  );
  assert(
    profile.rows[0]?.lifecycle_status === "ready-for-review"
      && profile.rows[0]?.document_status === "ready-for-review",
    "activation does not mutate immutable Business Profile version content",
  );
  const knowledge = await admin.query(
    `SELECT knowledge_record_id, lifecycle_state,
      record_document ->> 'lifecycleState' AS document_status
    FROM "${schema}".knowledge_record_versions
    WHERE business_profile_id = $1 AND business_profile_version = $2
      AND knowledge_record_id = ANY($3::text[])
    ORDER BY knowledge_record_id`,
    [fictionalBusinessProfile.id, profileVersion, knowledgeIds],
  );
  assert(
    knowledge.rows.length === knowledgeIds.length
      && knowledge.rows.every((row) =>
        row.lifecycle_state === "approved" && row.document_status === "approved"
      ),
    "activation does not mutate immutable Knowledge Record version content",
  );
}

async function assertNoActivation(label: string): Promise<void> {
  assert(await activationCount() === 0, label);
  const active = await admin.query(
    `SELECT COUNT(*)::integer AS count FROM "${schema}".active_configurations`,
  );
  assert(active.rows[0]?.count === 0, label);
}

async function activationCount(): Promise<number> {
  const result = await admin.query(
    `SELECT COUNT(*)::integer AS count FROM "${schema}".configuration_activations`,
  );
  return result.rows[0]?.count ?? -1;
}

function assertFailure(
  result: Awaited<ReturnType<ConfigurationActivationCoordinator["activate"]>>,
  reason: string,
  label: string,
): void {
  assert(result.status === "failure" && result.reason === reason, label);
}

function assertReadFailure(
  result: Awaited<ReturnType<PostgresqlConfigurationActivationStore["readActive"]>>,
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
    throw new Error(`PostgreSQL configuration activation verification failed: ${label}`);
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
