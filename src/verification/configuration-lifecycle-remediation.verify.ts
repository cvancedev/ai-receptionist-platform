import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Pool } from "pg";
import { ActivatedConfigurationPrototypeIntegration } from "../ai/prototype/activated-configuration-prototype-integration";
import { ActivatedConfigurationResolver } from "../business-configuration/activated-configuration-resolver";
import type { ConfigurationActivationRequest } from "../business-configuration/activation-contracts";
import { ConfigurationActivationCoordinator } from "../business-configuration/configuration-activation-coordinator";
import { ConfigurationLifecycleCoordinator } from "../business-configuration/configuration-lifecycle-coordinator";
import type {
  ConfigurationChangeContext,
  TransitionBusinessProfileLifecycleInput,
  TransitionKnowledgeLifecycleInput,
} from "../business-configuration/contracts";
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
const schema = `sprint_7_lifecycle_${Date.now()}_${process.pid}`;
const admin = new Pool({ connectionString });
const effectiveAt = "2026-08-12T12:00:00.000Z";
const profileScope = {
  businessProfileId: fictionalBusinessProfile.id,
  businessProfileVersion: 1,
} as const;
const knowledgeScope = {
  ...profileScope,
  knowledgeRecordId: "lifecycle-knowledge",
  knowledgeRecordVersion: 1,
} as const;

run().then(() => {
  console.log("Sprint 7 lifecycle remediation verification passed.");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function run(): Promise<void> {
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const runtime = createRuntime();
  try {
    await applyPostgresqlMigrations({ connectionString, schema });
    await verifyMigrationHistory();
    await verifyNegativeDraftBoundaries(runtime);
    await createDrafts(runtime);
    await reviewAndApprove(runtime);
    await verifyActivationPrerequisites(runtime);
    await activateConfiguration(runtime);
    const pinnedScope = await activateLifecycleAndInitializeConversation(runtime);
    await suspendAndVerifyIneligibility(runtime, pinnedScope);
    await verifyAuditAndImmutableDocuments();
    await verifyAuthorityAndNoDirectSqlWorkflow();
  } finally {
    await closeRuntime(runtime);
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
}

async function verifyMigrationHistory(): Promise<void> {
  const history = await admin.query(
    `SELECT version, name FROM "${schema}".app_schema_migrations ORDER BY version`,
  );
  equivalent(history.rows, [
    { version: 1, name: "conversation_states" },
    { version: 2, name: "execution_journal" },
    { version: 3, name: "business_profile_versions" },
    { version: 4, name: "knowledge_record_versions" },
    { version: 5, name: "configuration_activations" },
    { version: 6, name: "configuration_lifecycle_transitions" },
    { version: 7, name: "message_evidence" },
  ], "ordered migrations 001-007 are exact");
}

async function verifyNegativeDraftBoundaries(runtime: Runtime): Promise<void> {
  const invalidProfile: BusinessProfile = {
    ...structuredClone(fictionalBusinessProfile),
    id: "invalid-lifecycle-profile",
    version: 1,
    status: "draft",
    services: [],
  };
  const invalidScope = {
    businessProfileId: invalidProfile.id,
    businessProfileVersion: invalidProfile.version,
  };
  const rejected = await runtime.profiles.createDraft({
    scope: invalidScope,
    profile: invalidProfile,
    context: context("invalid-profile-create", 0, "create-draft", "business-profile"),
  });
  assert(
    rejected.status === "failure" && rejected.reason === "RejectedInput",
    "structurally invalid profile cannot become a durable draft",
  );
  lifecycleFailure(
    await runtime.lifecycle.transitionBusinessProfile({
      scope: invalidScope,
      targetStatus: "ready-for-review",
      context: context("invalid-profile-review", 0, "submit-for-review", "business-profile"),
    }),
    "RevisionUnavailable",
    "unvalidated profile cannot enter review",
  );
}

async function createDrafts(runtime: Runtime): Promise<void> {
  const profile: BusinessProfile = {
    ...structuredClone(fictionalBusinessProfile),
    version: 1,
    status: "draft",
  };
  const source = fictionalKnowledgeRecords[0];
  if (!source) throw new Error("A fictional knowledge fixture is required.");
  const knowledge: KnowledgeRecord = {
    ...structuredClone(source),
    id: knowledgeScope.knowledgeRecordId,
    version: knowledgeScope.knowledgeRecordVersion,
    lifecycleState: "draft",
  };
  assert((await runtime.profiles.createDraft({
    scope: profileScope,
    profile,
    context: context("profile-create", 0, "create-draft", "business-profile"),
  })).status === "success", "Business Profile draft is created through its repository contract");
  assert((await runtime.knowledge.createDraft({
    scope: knowledgeScope,
    record: knowledge,
    context: context("knowledge-create", 0, "create-draft", "knowledge-record"),
  })).status === "success", "Knowledge draft is created through its repository contract");

  lifecycleFailure(
    await runtime.lifecycle.transitionBusinessProfile(profileTransition(
      "profile-skip-active",
      0,
      "active",
      "activate",
    )),
    "IllegalTransition",
    "draft profile cannot skip directly to active",
  );
  lifecycleFailure(
    await runtime.lifecycle.transitionKnowledge(knowledgeTransition(
      "knowledge-skip-active",
      0,
      "active",
      "activate",
    )),
    "IllegalTransition",
    "draft knowledge cannot skip directly to active",
  );
}

async function reviewAndApprove(runtime: Runtime): Promise<void> {
  assert((await runtime.lifecycle.transitionBusinessProfile(profileTransition(
    "profile-review",
    0,
    "ready-for-review",
    "submit-for-review",
  ))).status === "success", "validated profile enters ready-for-review");
  assert((await runtime.lifecycle.transitionKnowledge(knowledgeTransition(
    "knowledge-review",
    0,
    "under-review",
    "submit-for-review",
  ))).status === "success", "validated knowledge enters review");

  lifecycleFailure(
    await runtime.lifecycle.transitionBusinessProfile(profileTransition(
      "profile-review-stale",
      0,
      "active",
      "activate",
    )),
    "StaleRevision",
    "stale profile lifecycle transition fails",
  );
  lifecycleFailure(
    await runtime.lifecycle.transitionBusinessProfile({
      ...profileTransition("profile-wrong-business", 1, "active", "activate"),
      scope: { ...profileScope, businessProfileId: "wrong-fictional-business" },
    }),
    "RevisionUnavailable",
    "wrong-business profile lifecycle transition fails safely",
  );
  lifecycleFailure(
    await runtime.lifecycle.transitionBusinessProfile(profileTransition(
      "profile-backwards",
      1,
      "draft",
      "submit-for-review",
    )),
    "IllegalTransition",
    "illegal backwards profile transition fails",
  );
  lifecycleFailure(
    await runtime.lifecycle.transitionKnowledge({
      ...knowledgeTransition("knowledge-denied", 1, "approved", "approve"),
      context: {
        ...context("knowledge-denied", 1, "approve", "knowledge-record"),
        authorization: {
          ...context("knowledge-denied", 1, "approve", "knowledge-record").authorization,
          decision: "denied",
        },
      },
    }),
    "AuthorizationDenied",
    "unauthorized knowledge transition fails",
  );
}

async function verifyActivationPrerequisites(runtime: Runtime): Promise<void> {
  const unapproved = await runtime.activation.activate(activationRequest(1, 1));
  assert(
    unapproved.status === "failure" && unapproved.reason === "LifecycleConflict",
    "unapproved knowledge cannot activate",
  );
  assert((await runtime.lifecycle.transitionKnowledge(knowledgeTransition(
    "knowledge-approve",
    1,
    "approved",
    "approve",
  ))).status === "success", "reviewed knowledge is approved");
  lifecycleFailure(
    await runtime.lifecycle.transitionBusinessProfile(profileTransition(
      "profile-active-before-activation",
      1,
      "active",
      "activate",
    )),
    "ActivationUnavailable",
    "profile cannot become active without exact activation evidence",
  );
  lifecycleFailure(
    await runtime.lifecycle.transitionKnowledge(knowledgeTransition(
      "knowledge-active-before-activation",
      2,
      "active",
      "activate",
    )),
    "ActivationUnavailable",
    "knowledge cannot become active without exact activation evidence",
  );
}

async function activateConfiguration(runtime: Runtime): Promise<void> {
  const activated = await runtime.activation.activate(activationRequest(1, 2));
  assert(
    activated.status === "success"
      && activated.value.businessProfileVersion === 1
      && activated.value.activationRevision === 1,
    "reviewed configuration activates through the existing application path",
  );
  const inspected = await runtime.activation.readActive(fictionalBusinessProfile.id);
  assert(
    inspected.status === "success"
      && inspected.value.knowledge[0]?.knowledgeRecordId === knowledgeScope.knowledgeRecordId,
    "active configuration is inspectable through the existing read path",
  );

  lifecycleFailure(
    await runtime.lifecycle.transitionBusinessProfile(profileTransition(
      "profile-review",
      1,
      "active",
      "activate",
    )),
    "DuplicateRequest",
    "duplicate lifecycle request identity fails explicitly",
  );
}

async function activateLifecycleAndInitializeConversation(
  runtime: Runtime,
): Promise<{ readonly businessProfileId: string; readonly businessProfileVersion: number; readonly conversationId: string }> {
  assert((await runtime.lifecycle.transitionBusinessProfile(profileTransition(
    "profile-active",
    1,
    "active",
    "activate",
  ))).status === "success", "activated profile lifecycle becomes active");
  assert((await runtime.lifecycle.transitionKnowledge(knowledgeTransition(
    "knowledge-active",
    2,
    "active",
    "activate",
  ))).status === "success", "activation-bound knowledge lifecycle becomes active");

  const profile = await runtime.lifecycle.inspectBusinessProfile(profileScope);
  const knowledge = await runtime.lifecycle.inspectKnowledge(knowledgeScope);
  assert(
    profile.status === "success"
      && profile.value.lifecycleStatus === "active"
      && profile.value.revision === 2,
    "active profile lifecycle is inspectable",
  );
  assert(
    knowledge.status === "success"
      && knowledge.value.lifecycleStatus === "active"
      && knowledge.value.revision === 3,
    "active knowledge lifecycle is inspectable",
  );

  const conversationId = "lifecycle-remediation-conversation";
  const initialized = await runtime.prototype.initialize({
    businessProfileId: fictionalBusinessProfile.id,
    conversationId,
    effectiveAt,
  });
  assert(
    initialized.status === "success"
      && initialized.value.recovery.state.businessProfileVersion === 1,
    "active lifecycle initializes an exactly pinned fictional conversation",
  );
  return { ...profileScope, conversationId };
}

async function suspendAndVerifyIneligibility(
  runtime: Runtime,
  pinnedScope: { readonly businessProfileId: string; readonly businessProfileVersion: number; readonly conversationId: string },
): Promise<void> {
  assert((await runtime.lifecycle.transitionKnowledge(knowledgeTransition(
    "knowledge-suspend",
    3,
    "suspended",
    "suspend",
  ))).status === "success", "active knowledge is suspended");
  assert((await runtime.lifecycle.transitionBusinessProfile(profileTransition(
    "profile-suspend",
    2,
    "suspended",
    "suspend",
  ))).status === "success", "active profile is suspended");

  const profile = await runtime.lifecycle.inspectBusinessProfile(profileScope);
  const knowledge = await runtime.lifecycle.inspectKnowledge(knowledgeScope);
  assert(
    profile.status === "success" && profile.value.lifecycleStatus === "suspended",
    "suspended profile state is inspectable",
  );
  assert(
    knowledge.status === "success" && knowledge.value.lifecycleStatus === "suspended",
    "suspended knowledge state is inspectable",
  );
  const current = await runtime.resolver.resolve({
    businessProfileId: fictionalBusinessProfile.id,
    effectiveAt,
    audience: "customer",
    selection: { mode: "current" },
  });
  assert(
    current.status === "failure" && current.reason === "ProfileInvalid",
    "suspended configuration is no longer conversation-eligible",
  );
  const recovered = await runtime.prototype.recover({ scope: pinnedScope, effectiveAt });
  assert(
    recovered.status === "failure" && recovered.reason === "ConfigurationUnavailable",
    "existing pinned conversation fails safely after suspension",
  );
  const durable = await runtime.conversations.read(pinnedScope);
  assert(
    durable.status === "success"
      && durable.state.businessProfileVersion === 1
      && durable.state.conversationId === pinnedScope.conversationId,
    "suspension preserves the existing exact conversation pin",
  );
}

async function verifyAuditAndImmutableDocuments(): Promise<void> {
  const profile = await admin.query(
    `SELECT lifecycle_status, revision, profile_document->>'status' AS document_status
    FROM "${schema}".business_profile_versions
    WHERE business_profile_id=$1 AND business_profile_version=1`,
    [fictionalBusinessProfile.id],
  );
  const knowledge = await admin.query(
    `SELECT lifecycle_state, revision,
      record_document->>'lifecycleState' AS document_state
    FROM "${schema}".knowledge_record_versions
    WHERE business_profile_id=$1 AND business_profile_version=1
      AND knowledge_record_id=$2 AND knowledge_record_version=1`,
    [fictionalBusinessProfile.id, knowledgeScope.knowledgeRecordId],
  );
  assert(
    profile.rows[0]?.lifecycle_status === "suspended"
      && profile.rows[0]?.revision === 3
      && profile.rows[0]?.document_status === "draft",
    "profile lifecycle envelope changes without mutating immutable document",
  );
  assert(
    knowledge.rows[0]?.lifecycle_state === "suspended"
      && knowledge.rows[0]?.revision === 4
      && knowledge.rows[0]?.document_state === "draft",
    "knowledge lifecycle envelope changes without mutating immutable document",
  );
  const profileAudit = await admin.query(
    `SELECT prior_lifecycle_status, resulting_lifecycle_status,
      expected_revision, resulting_revision, authorization_decision,
      audit_subject, transitioned_at IS NOT NULL AS has_timestamp
    FROM "${schema}".business_profile_lifecycle_transitions
    WHERE business_profile_id=$1 ORDER BY resulting_revision`,
    [fictionalBusinessProfile.id],
  );
  const knowledgeAudit = await admin.query(
    `SELECT prior_lifecycle_state, resulting_lifecycle_state,
      expected_revision, resulting_revision, authorization_decision,
      audit_subject, transitioned_at IS NOT NULL AS has_timestamp
    FROM "${schema}".knowledge_record_lifecycle_transitions
    WHERE business_profile_id=$1 ORDER BY resulting_revision`,
    [fictionalBusinessProfile.id],
  );
  assert(
    profileAudit.rows.length === 3
      && profileAudit.rows.every((row) =>
        row.authorization_decision === "authorized"
        && row.audit_subject === "business-profile"
        && row.has_timestamp === true
        && row.resulting_revision === row.expected_revision + 1
      ),
    "bounded Business Profile transition evidence is append-only and revision-aware",
  );
  assert(
    knowledgeAudit.rows.length === 4
      && knowledgeAudit.rows.every((row) =>
        row.authorization_decision === "authorized"
        && row.audit_subject === "knowledge-record"
        && row.has_timestamp === true
        && row.resulting_revision === row.expected_revision + 1
      ),
    "bounded Knowledge transition evidence is append-only and revision-aware",
  );
}

async function verifyAuthorityAndNoDirectSqlWorkflow(): Promise<void> {
  const source = await readFile(
    join(process.cwd(), "src", "verification", "configuration-lifecycle-remediation.verify.ts"),
    "utf8",
  );
  const workflowSource = source.slice(0, source.indexOf("async function verifyAuditAndImmutableDocuments"));
  assert(
    !/INSERT INTO|UPDATE\s+[^\n]+SET|DELETE FROM/i.test(workflowSource),
    "focused lifecycle workflow uses no direct SQL to manufacture lifecycle state",
  );
  const coordinator = runtimeCapabilities(ConfigurationLifecycleCoordinator.prototype);
  for (const prohibited of [
    "authenticate", "createDraft", "delete", "genericUpdate", "retry",
    "release", "dispatch", "mutateConversation", "selectProvider",
  ]) {
    assert(coordinator[prohibited] === undefined, `lifecycle coordinator exposes no ${prohibited} capability`);
  }
  const defaultPrototype = await readFile(join(process.cwd(), "src", "prototype.ts"), "utf8");
  assert(
    !defaultPrototype.includes("ConfigurationLifecycleCoordinator")
      && !defaultPrototype.includes("Postgresql"),
    "ordinary prototype remains fixture-backed and in memory",
  );
}

interface Runtime {
  readonly profiles: PostgresqlBusinessProfileVersionRepository;
  readonly knowledge: PostgresqlKnowledgeVersionRepository;
  readonly activations: PostgresqlConfigurationActivationStore;
  readonly conversations: PostgresqlConversationStore;
  readonly journal: PostgresqlExecutionJournal;
  readonly transactions: PostgresqlTransactionalExecutionCoordinator;
  readonly lifecycle: ConfigurationLifecycleCoordinator;
  readonly activation: ConfigurationActivationCoordinator;
  readonly resolver: ActivatedConfigurationResolver;
  readonly prototype: ActivatedConfigurationPrototypeIntegration;
}

function createRuntime(): Runtime {
  const profiles = new PostgresqlBusinessProfileVersionRepository({ connectionString, schema });
  const knowledge = new PostgresqlKnowledgeVersionRepository({ connectionString, schema });
  const activations = new PostgresqlConfigurationActivationStore({ connectionString, schema });
  const conversations = new PostgresqlConversationStore({ connectionString, schema });
  const journal = new PostgresqlExecutionJournal({ connectionString, schema });
  const transactions = new PostgresqlTransactionalExecutionCoordinator({ connectionString, schema });
  const resolver = new ActivatedConfigurationResolver({ activations, businessProfiles: profiles, knowledge });
  return {
    profiles,
    knowledge,
    activations,
    conversations,
    journal,
    transactions,
    lifecycle: new ConfigurationLifecycleCoordinator({ businessProfiles: profiles, knowledge, activations }),
    activation: new ConfigurationActivationCoordinator({ businessProfiles: profiles, knowledge, activationStore: activations }),
    resolver,
    prototype: new ActivatedConfigurationPrototypeIntegration({ configurationResolver: resolver, conversationStore: conversations, executionJournal: journal, transactionCoordinator: transactions }),
  };
}

async function closeRuntime(runtime: Runtime): Promise<void> {
  await Promise.all([
    runtime.profiles.close(), runtime.knowledge.close(), runtime.activations.close(),
    runtime.conversations.close(), runtime.journal.close(), runtime.transactions.close(),
  ]);
}

function profileTransition(
  identity: string,
  expectedRevision: number,
  targetStatus: TransitionBusinessProfileLifecycleInput["targetStatus"],
  operation: ConfigurationChangeContext["audit"]["operation"],
): TransitionBusinessProfileLifecycleInput {
  return { scope: profileScope, targetStatus, context: context(identity, expectedRevision, operation, "business-profile") };
}

function knowledgeTransition(
  identity: string,
  expectedRevision: number,
  targetStatus: TransitionKnowledgeLifecycleInput["targetStatus"],
  operation: ConfigurationChangeContext["audit"]["operation"],
): TransitionKnowledgeLifecycleInput {
  return { scope: knowledgeScope, targetStatus, context: context(identity, expectedRevision, operation, "knowledge-record") };
}

function activationRequest(
  profileRevision: number,
  knowledgeRevision: number,
): ConfigurationActivationRequest {
  return {
    profileScope,
    knowledge: [{ scope: knowledgeScope, expectedRevision: knowledgeRevision }],
    expectedActiveRevision: 0,
    activatedAt: effectiveAt,
    context: context("configuration-activate", profileRevision, "activate", "business-profile"),
  };
}

function context(
  identity: string,
  expectedRevision: number,
  operation: ConfigurationChangeContext["audit"]["operation"],
  subject: ConfigurationChangeContext["audit"]["subject"],
): ConfigurationChangeContext {
  return {
    requestId: `lifecycle-${identity}`,
    expectedRevision,
    authorization: {
      actorId: "fictional-owner",
      decisionId: `lifecycle-${identity}-decision`,
      decision: "authorized",
    },
    audit: {
      auditEventId: `lifecycle-${identity}-audit`,
      operation,
      subject,
      reason: "Fictional Sprint 7 lifecycle remediation verification.",
    },
  };
}

function lifecycleFailure(
  result: { readonly status: string; readonly reason?: string },
  reason: string,
  label: string,
): void {
  assert(result.status === "failure" && result.reason === reason, label);
}

function runtimeCapabilities(value: object): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function equivalent(actual: unknown, expected: unknown, label: string): void {
  assert(JSON.stringify(actual) === JSON.stringify(expected), label);
}

function assert(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(`Sprint 7 lifecycle remediation verification failed: ${label}`);
}

function requiredUrl(): string {
  const value = process.env.TEST_DATABASE_URL?.trim();
  if (!value) throw new Error("TEST_DATABASE_URL is required for PostgreSQL verification.");
  return value;
}
