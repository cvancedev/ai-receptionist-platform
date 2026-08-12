import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Pool } from "pg";
import { ActivatedConfigurationPrototypeIntegration } from "../ai/prototype/activated-configuration-prototype-integration";
import { ActivatedConfigurationResolver } from "../business-configuration/activated-configuration-resolver";
import type { ConfigurationActivationRequest } from "../business-configuration/activation-contracts";
import { ConfigurationActivationCoordinator } from "../business-configuration/configuration-activation-coordinator";
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
const schema = `sprint_7_5_${Date.now()}_${process.pid}`;
const admin = new Pool({ connectionString });
const effectiveAt = "2026-08-12T12:00:00.000Z";

run()
  .then(() => console.log("Sprint 7.5 activated configuration prototype verification passed."))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

async function run(): Promise<void> {
  await admin.query(`CREATE SCHEMA "${schema}"`);
  try {
    await applyPostgresqlMigrations({ connectionString, schema });
    await verifyMigrationHistory();
    await seedConfiguration(1, ["regular-hours", "unbound-policy"]);
    await activate(1, ["regular-hours"], 0, "activation-one");
    await verifyInitializationProgressAndRestart();
    await seedConfiguration(2, ["regular-hours"]);
    await activate(2, ["regular-hours"], 1, "activation-two");
    await verifyReactivationPinningAndIsolation();
    await verifyAuthorityAndDefaultBoundaries();
  } finally {
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
}

async function verifyMigrationHistory(): Promise<void> {
  const result = await admin.query(
    `SELECT version, name FROM "${schema}".app_schema_migrations ORDER BY version`,
  );
  assertEquivalent(result.rows, [
    { version: 1, name: "conversation_states" },
    { version: 2, name: "execution_journal" },
    { version: 3, name: "business_profile_versions" },
    { version: 4, name: "knowledge_record_versions" },
    { version: 5, name: "configuration_activations" },
  ], "integration reuses exact migrations 001-005");
}

async function verifyInitializationProgressAndRestart(): Promise<void> {
  let runtime = createRuntime();
  const initialized = await runtime.integration.initialize({
    businessProfileId: fictionalBusinessProfile.id,
    conversationId: "activated-conversation-one",
    effectiveAt,
  });
  assert(initialized.status === "success", "active configuration initializes a conversation");
  if (initialized.status !== "success") return;
  assert(
    initialized.value.configuration.businessProfile.version === 1
      && initialized.value.recovery.state.businessProfileVersion === 1,
    "new conversation pins exact active profile version",
  );
  assertEquivalent(
    initialized.value.configuration.knowledge.map((record) => record.id),
    ["regular-hours"],
    "only activation-bound knowledge is loaded",
  );
  assert(
    initialized.value.configuration.knowledge.every((record) =>
      record.lifecycleState === "active"
      && (record.audience === "customer" || record.audience === "both")
    ),
    "loaded knowledge passes application-owned conversation eligibility",
  );
  assertDeeplyFrozen(initialized.value, "activated initialization result");

  const scope = {
    businessProfileId: fictionalBusinessProfile.id,
    businessProfileVersion: 1,
    conversationId: "activated-conversation-one",
  };
  const advanced = await runtime.integration.advance({ scope, effectiveAt });
  assert(
    advanced.status === "committed"
      && advanced.prototype.recovery.state.revision === 1
      && advanced.prototype.recovery.state.businessProfileVersion === 1,
    "existing deterministic mock path advances pinned durable state",
  );
  await closeRuntime(runtime);

  runtime = createRuntime();
  const restarted = await runtime.integration.recover({ scope, effectiveAt });
  assert(
    restarted.status === "success"
      && restarted.value.recovery.state.revision === 1
      && restarted.value.recovery.state.businessProfileVersion === 1
      && restarted.value.configuration.activation.activationRevision === 1,
    "fresh objects recover exact activation and pinned conversation",
  );
  if (restarted.status === "success") {
    assertEquivalent(
      restarted.value.configuration.knowledge.map((record) => record.id),
      ["regular-hours"],
      "restart reloads exact selected knowledge without fixture fallback",
    );
  }
  await closeRuntime(runtime);
}

async function verifyReactivationPinningAndIsolation(): Promise<void> {
  const runtime = createRuntime();
  try {
    const oldScope = {
      businessProfileId: fictionalBusinessProfile.id,
      businessProfileVersion: 1,
      conversationId: "activated-conversation-one",
    };
    const existing = await runtime.integration.recover({
      scope: oldScope,
      effectiveAt,
    });
    assert(
      existing.status === "success"
        && existing.value.configuration.businessProfile.version === 1
        && existing.value.configuration.activation.activationRevision === 1
        && existing.value.recovery.state.businessProfileVersion === 1,
      "later activation does not repin an existing conversation",
    );

    const newer = await runtime.integration.initialize({
      businessProfileId: fictionalBusinessProfile.id,
      conversationId: "activated-conversation-two",
      effectiveAt,
    });
    assert(
      newer.status === "success"
        && newer.value.configuration.businessProfile.version === 2
        && newer.value.configuration.activation.activationRevision === 2
        && newer.value.recovery.state.businessProfileVersion === 2,
      "new conversation uses the newly active profile version",
    );

    const noActive = await runtime.integration.initialize({
      businessProfileId: "unconfigured-fictional-business",
      conversationId: "unconfigured-conversation",
      effectiveAt,
    });
    assertFailure(noActive, "ConfigurationUnavailable", "no active configuration fails closed");

    const wrongConversation = await runtime.integration.recover({
      scope: { ...oldScope, conversationId: "another-fictional-conversation" },
      effectiveAt,
    });
    assertFailure(wrongConversation, "ConversationUnavailable", "wrong conversation cannot gain pinned scope");

    const wrongVersion = await runtime.integration.recover({
      scope: { ...oldScope, businessProfileVersion: 99 },
      effectiveAt,
    });
    assertFailure(wrongVersion, "ConfigurationUnavailable", "unknown pinned profile cannot fall back");

    const active = await runtime.activations.readActive(fictionalBusinessProfile.id);
    const pinned = await runtime.activations.readForProfileVersion(
      fictionalBusinessProfile.id,
      1,
    );
    assert(
      active.status === "success"
        && active.value.businessProfileVersion === 2
        && pinned.status === "success"
        && pinned.value.businessProfileVersion === 1,
      "current and exact historical activation reads remain distinct",
    );
  } finally {
    await closeRuntime(runtime);
  }
}

async function verifyAuthorityAndDefaultBoundaries(): Promise<void> {
  const runtime = createRuntime();
  try {
    const capabilities = runtime.integration as unknown as Record<string, unknown>;
    for (const prohibited of [
      "createDraft", "activate", "suspend", "repin", "authenticate",
      "authorizeRelease", "selectProvider", "dispatch", "retry",
    ]) {
      assert(capabilities[prohibited] === undefined, `integration exposes no ${prohibited} capability`);
    }
    const ordinaryPrototype = await readFile(
      join(process.cwd(), "src", "prototype.ts"),
      "utf8",
    );
    assert(
      !ordinaryPrototype.includes("ActivatedConfigurationPrototypeIntegration")
        && ordinaryPrototype.includes("fictionalBusinessProfile")
        && ordinaryPrototype.includes("fictionalKnowledgeRecords"),
      "ordinary prototype remains fixture-backed and does not import opt-in integration",
    );
    const integrationSource = await readFile(
      join(
        process.cwd(),
        "src",
        "ai",
        "prototype",
        "activated-configuration-prototype-integration.ts",
      ),
      "utf8",
    );
    assert(
      !/fixtures|readActive\([^)]*\)\s*\?\?|setTimeout|automatic retry/i.test(integrationSource),
      "selected durable path has no fixture fallback or automatic retry",
    );
  } finally {
    await closeRuntime(runtime);
  }
}

interface Runtime {
  readonly profiles: PostgresqlBusinessProfileVersionRepository;
  readonly knowledge: PostgresqlKnowledgeVersionRepository;
  readonly activations: PostgresqlConfigurationActivationStore;
  readonly conversations: PostgresqlConversationStore;
  readonly journal: PostgresqlExecutionJournal;
  readonly transactions: PostgresqlTransactionalExecutionCoordinator;
  readonly integration: ActivatedConfigurationPrototypeIntegration;
}

function createRuntime(): Runtime {
  const profiles = new PostgresqlBusinessProfileVersionRepository({ connectionString, schema });
  const knowledge = new PostgresqlKnowledgeVersionRepository({ connectionString, schema });
  const activations = new PostgresqlConfigurationActivationStore({ connectionString, schema });
  const conversations = new PostgresqlConversationStore({ connectionString, schema });
  const journal = new PostgresqlExecutionJournal({ connectionString, schema });
  const transactions = new PostgresqlTransactionalExecutionCoordinator({ connectionString, schema });
  const resolver = new ActivatedConfigurationResolver({
    activations,
    businessProfiles: profiles,
    knowledge,
  });
  return {
    profiles,
    knowledge,
    activations,
    conversations,
    journal,
    transactions,
    integration: new ActivatedConfigurationPrototypeIntegration({
      configurationResolver: resolver,
      conversationStore: conversations,
      executionJournal: journal,
      transactionCoordinator: transactions,
    }),
  };
}

async function closeRuntime(runtime: Runtime): Promise<void> {
  await Promise.all([
    runtime.profiles.close(),
    runtime.knowledge.close(),
    runtime.activations.close(),
    runtime.conversations.close(),
    runtime.journal.close(),
    runtime.transactions.close(),
  ]);
}

async function activate(
  profileVersion: number,
  knowledgeIds: readonly string[],
  expectedActiveRevision: number,
  identity: string,
): Promise<void> {
  const runtime = createRuntime();
  try {
    const coordinator = new ConfigurationActivationCoordinator({
      businessProfiles: runtime.profiles,
      knowledge: runtime.knowledge,
      activationStore: runtime.activations,
    });
    const result = await coordinator.activate(activationRequest(
      profileVersion,
      knowledgeIds,
      expectedActiveRevision,
      identity,
    ));
    assert(result.status === "success", `configuration ${identity} activates through application coordinator`);
  } finally {
    await closeRuntime(runtime);
  }
}

function activationRequest(
  profileVersion: number,
  knowledgeIds: readonly string[],
  expectedActiveRevision: number,
  identity: string,
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
        knowledgeRecordVersion: profileVersion,
      },
      expectedRevision: 0,
    })),
    expectedActiveRevision,
    activatedAt: effectiveAt,
    context: {
      requestId: identity,
      expectedRevision: 0,
      authorization: {
        actorId: "fictional-owner",
        decisionId: `${identity}-decision`,
        decision: "authorized",
      },
      audit: {
        auditEventId: `${identity}-audit`,
        operation: "activate",
        subject: "business-profile",
        reason: "Fictional Sprint 7.5 integration verification.",
      },
    },
  };
}

async function seedConfiguration(
  profileVersion: number,
  knowledgeIds: readonly string[],
): Promise<void> {
  const profile: BusinessProfile = {
    ...structuredClone(fictionalBusinessProfile),
    version: profileVersion,
    status: "ready-for-review",
  };
  await admin.query(
    `INSERT INTO "${schema}".business_profile_versions (
      business_profile_id, business_profile_version, revision,
      lifecycle_status, record_format_version, profile_document,
      request_id, actor_id, authorization_decision_id,
      authorization_decision, audit_event_id, audit_operation,
      audit_subject, audit_reason
    ) VALUES ($1, $2, 0, 'ready-for-review', 1, $3::jsonb,
      $4, 'fictional-owner', $5, 'authorized', $6,
      'submit-for-review', 'business-profile', $7)`,
    [
      profile.id,
      profileVersion,
      JSON.stringify(profile),
      `seed-profile-${profileVersion}`,
      `seed-profile-decision-${profileVersion}`,
      `seed-profile-audit-${profileVersion}`,
      "Fictional reviewed profile fixture.",
    ],
  );
  for (const id of knowledgeIds) {
    await seedKnowledge(profileVersion, id);
  }
}

async function seedKnowledge(profileVersion: number, id: string): Promise<void> {
  const source = fictionalKnowledgeRecords.find((record) =>
    record.id === (id === "unbound-policy" ? "payment-policy" : "regular-hours")
  );
  if (!source) throw new Error("A fictional knowledge fixture is required.");
  const record: KnowledgeRecord = {
    ...source,
    id,
    version: profileVersion,
    lifecycleState: "approved",
  };
  await admin.query(
    `INSERT INTO "${schema}".knowledge_record_versions (
      business_profile_id, business_profile_version,
      knowledge_record_id, knowledge_record_version, revision,
      lifecycle_state, audience, source_identity, effective_date,
      record_format_version, record_document, request_id, actor_id,
      authorization_decision_id, authorization_decision, audit_event_id,
      audit_operation, audit_subject, audit_reason
    ) VALUES ($1, $2, $3, $4, 0, 'approved', $5, $6, $7,
      1, $8::jsonb, $9, 'fictional-owner', $10, 'authorized', $11,
      'approve', 'knowledge-record', $12)`,
    [
      record.businessProfileId,
      profileVersion,
      record.id,
      record.version,
      record.audience,
      record.source,
      record.effectiveDate,
      JSON.stringify(record),
      `seed-knowledge-${profileVersion}-${id}`,
      `seed-knowledge-decision-${profileVersion}-${id}`,
      `seed-knowledge-audit-${profileVersion}-${id}`,
      "Fictional approved knowledge fixture.",
    ],
  );
}

function assertFailure(
  result: { readonly status: string; readonly reason?: string },
  reason: string,
  message: string,
): void {
  assert(result.status === "failure" && result.reason === reason, message);
}

function assertDeeplyFrozen(value: unknown, message: string): void {
  assert(isDeeplyFrozen(value), `${message} is deeply frozen`);
}

function isDeeplyFrozen(value: unknown): boolean {
  if (!value || typeof value !== "object") return true;
  if (!Object.isFrozen(value)) return false;
  return Object.values(value as Record<string, unknown>).every(isDeeplyFrozen);
}

function assertEquivalent(actual: unknown, expected: unknown, message: string): void {
  assert(JSON.stringify(actual) === JSON.stringify(expected), message);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`PostgreSQL activated configuration prototype verification failed: ${message}`);
}

function requiredUrl(): string {
  const value = process.env.TEST_DATABASE_URL;
  if (!value?.trim()) throw new Error("TEST_DATABASE_URL is required for PostgreSQL verification.");
  return value;
}
