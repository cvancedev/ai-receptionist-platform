import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { Pool } from "pg";
import type {
  StateExecutionRequest,
  StateExecutionResult,
} from "../ai/execution/contracts";
import { DeterministicStateExecutor } from "../ai/execution/state-executor";
import { AiFoundationPrototypeOrchestrator } from "../ai/prototype/ai-foundation-orchestrator";
import {
  PersistenceBackedPrototypeIntegration,
  type PersistenceBackedPrototypeDependencies,
} from "../ai/prototype/persistence-backed-prototype-integration";
import { ConversationStateManager } from "../conversation/conversation-state-manager";
import type { ConversationStoreScope } from "../conversation/conversation-store";
import type { ConversationState } from "../domain/conversation-state";
import { fictionalBusinessProfile } from "../fixtures/business-profile";
import { initializedConversationState } from "../fixtures/conversation";
import { applyPostgresqlMigrations } from "../persistence/postgresql/migration-runner";
import { PostgresqlConversationStore } from "../persistence/postgresql/postgresql-conversation-store";
import { PostgresqlExecutionJournal } from "../persistence/postgresql/postgresql-execution-journal";
import { PostgresqlTransactionalExecutionCoordinator } from "../persistence/postgresql/postgresql-transactional-execution-coordinator";
import { CONVERSATION_STAGES } from "../shared/constants";

const connectionString = requiredTestDatabaseUrl();
const schema = `sprint_6_6_${Date.now()}_${process.pid}`;
const incompatibleSchema = `${schema}_incompatible`;
const newerMigrationSchema = `${schema}_newer_migration`;
const admin = new Pool({ connectionString });

run()
  .then(() => {
    console.log("Sprint 6.6 persistence recovery verification passed.");
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });

async function run(): Promise<void> {
  const trusted = await trustedAppliedExecution();
  await verifyDatabaseUnavailable(trusted);
  await admin.query(`CREATE SCHEMA "${schema}"`);
  await admin.query(`CREATE SCHEMA "${incompatibleSchema}"`);
  await admin.query(`CREATE SCHEMA "${newerMigrationSchema}"`);
  try {
    await applyPostgresqlMigrations({ connectionString, schema });
    await verifyDuplicateConversation();
    await verifySuccessfulCommitAndRestart(trusted);
    await verifyCommitFailureAndRestart(trusted);
    await verifyJournalFailuresAndRollback(trusted);
    await verifyMalformedAndIncompatibleStoredState();
    await verifyMissingAndWrongScope(trusted);
    await verifyIncompatibleSchema(trusted);
    await verifyIncompatibleMigrationHistory();
    await verifyRecoveryAndAuthorityBoundaries();
    await verifyMigrationOrder();
  } finally {
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.query(`DROP SCHEMA IF EXISTS "${incompatibleSchema}" CASCADE`);
    await admin.query(`DROP SCHEMA IF EXISTS "${newerMigrationSchema}" CASCADE`);
    await admin.end();
  }
}

async function verifyDatabaseUnavailable(
  trusted: StateExecutionResult,
): Promise<void> {
  const unavailableConnection =
    "postgresql://fictional_user:fictional_secret@127.0.0.1:1/fictional_database?connect_timeout=1";
  const unavailableScope = scopeFor("database-unavailable");
  const execution = executionForScope(trusted, unavailableScope, "unavailable");
  const runtime = createRuntime(unavailableConnection, schema, unavailableScope);
  try {
    const state = await runtime.stateStore.read(unavailableScope);
    assert(
      state.status === "failure"
        && state.reason === "PersistenceFailure"
        && state.errors.length === 1
        && !state.errors[0]?.includes("fictional_secret")
        && !state.errors[0]?.includes("SELECT"),
      "database-unavailable state reads return only a sanitized persistence failure",
    );
    assert(execution.previousState !== null, "unavailable fixture has prior state");
    const create = await runtime.stateStore.create(execution.previousState);
    assert(
      create.status === "failure" && create.reason === "PersistenceFailure",
      "database-unavailable state creation returns an explicit persistence failure",
    );
    const journal = await runtime.journal.snapshot(unavailableScope);
    assert(
      journal.failure === "JournalReadFailed" && journal.entries.length === 0,
      "database-unavailable journal reads fail explicitly without content",
    );
    const append = await runtime.journal.append(execution);
    assert(
      append.status === "failure" && append.reason === "JournalAppendFailed",
      "database-unavailable journal append cannot invent success",
    );
    const transaction = await runtime.coordinator.persist({
      scope: unavailableScope,
      execution,
    });
    assert(
      transaction.status === "failure"
        && transaction.reason === "InfrastructureFailure",
      "database-unavailable transactions return a technology-neutral failure",
    );
    const recovery = await runtime.integration.recover(unavailableScope);
    assert(
      recovery.status === "failure"
        && recovery.reason === "StateUnavailable"
        && recovery.persistenceFailure === "PersistenceFailure",
      "database-unavailable recovery cannot fall back to in-memory authority",
    );
  } finally {
    await closeRuntime(runtime);
  }
}

async function verifyDuplicateConversation(): Promise<void> {
  const duplicateScope = scopeFor("duplicate-conversation");
  const runtime = createRuntime(connectionString, schema, duplicateScope);
  try {
    const input = initializationFor(duplicateScope);
    const first = await runtime.integration.initialize(input);
    assert(
      first.status === "success" && first.state.revision === 0,
      "first durable initialization succeeds at revision zero",
    );
    const second = await runtime.integration.initialize(input);
    assert(
      second.status === "failure"
        && second.persistenceFailure === "ConversationAlreadyExists",
      "duplicate durable initialization is explicit",
    );
    const recovered = await runtime.integration.recover(duplicateScope);
    assert(
      recovered.status === "success"
        && recovered.state.revision === 0
        && recovered.journal.entries.length === 0,
      "duplicate initialization preserves original state and journal",
    );
  } finally {
    await closeRuntime(runtime);
  }
}

async function verifySuccessfulCommitAndRestart(
  trusted: StateExecutionResult,
): Promise<void> {
  const successScope = scopeFor("successful-restart");
  const execution = executionForScope(trusted, successScope, "successful-restart");
  await seedPreviousState(execution);

  const firstCoordinator = new PostgresqlTransactionalExecutionCoordinator({
    connectionString,
    schema,
  });
  const committed = await firstCoordinator.persist({ scope: successScope, execution });
  assert(
    committed.status === "success"
      && committed.state.revision === 1
      && committed.journalEntry.sequence === 1,
    "atomic execution commits state and journal exactly once",
  );
  await firstCoordinator.close();

  const restarted = createRuntime(connectionString, schema, successScope);
  try {
    const recovered = await restarted.integration.recover(successScope);
    assert(
      recovered.status === "success"
        && recovered.state.revision === 1
        && recovered.journal.entries.length === 1
        && recovered.journal.entries[0]?.executionId
          === execution.executionMetadata.executionId
        && recovered.readModel.metadata.sourceRevision === 1,
      "fresh application and adapters recover exact committed state, audit, and progress",
    );

    const duplicate = await restarted.coordinator.persist({
      scope: successScope,
      execution,
    });
    assert(
      duplicate.status === "failure" && duplicate.reason === "DuplicateConflict",
      "durable duplicate execution protection survives restart",
    );

    const staleExecution = withExecutionIdentity(execution, "stale-revision");
    const stale = await restarted.coordinator.persist({
      scope: successScope,
      execution: staleExecution,
    });
    assert(
      stale.status === "failure" && stale.reason === "RevisionConflict",
      "stale expected revision is explicit and is not retried",
    );

    const afterFailures = await restarted.integration.recover(successScope);
    assert(
      afterFailures.status === "success"
        && afterFailures.state.revision === 1
        && afterFailures.journal.entries.length === 1,
      "duplicate and stale attempts produce no second mutation or audit entry",
    );
  } finally {
    await closeRuntime(restarted);
  }
}

async function verifyCommitFailureAndRestart(
  trusted: StateExecutionResult,
): Promise<void> {
  const rollbackScope = scopeFor("commit-rollback");
  const execution = executionForScope(trusted, rollbackScope, "commit-rollback");
  await seedPreviousState(execution);
  await createFailureTrigger(
    "execution_journal_entries",
    "sprint_6_6_forced_commit_failure",
    true,
  );
  const coordinator = new PostgresqlTransactionalExecutionCoordinator({
    connectionString,
    schema,
  });
  try {
    const result = await coordinator.persist({ scope: rollbackScope, execution });
    assert(
      result.status === "failure" && result.reason === "TransactionCommitFailed",
      "deferred commit failure is explicit and never reports success",
    );
  } finally {
    await coordinator.close();
    await dropFailureTrigger(
      "execution_journal_entries",
      "sprint_6_6_forced_commit_failure",
    );
  }

  const restarted = createRuntime(connectionString, schema, rollbackScope);
  try {
    const recovered = await restarted.integration.recover(rollbackScope);
    assert(
      recovered.status === "success"
        && recovered.state.revision === 0
        && recovered.journal.entries.length === 0,
      "restart after rollback sees only the prior committed state and no residue",
    );
  } finally {
    await closeRuntime(restarted);
  }
}

async function verifyJournalFailuresAndRollback(
  trusted: StateExecutionResult,
): Promise<void> {
  const standaloneScope = scopeFor("standalone-journal-failure");
  const standaloneExecution = executionForScope(
    trusted,
    standaloneScope,
    "standalone-journal-failure",
  );
  await createFailureTrigger(
    "execution_journal_entries",
    "sprint_6_6_forced_standalone_journal_failure",
    false,
  );
  const standaloneJournal = new PostgresqlExecutionJournal({ connectionString, schema });
  try {
    const append = await standaloneJournal.append(standaloneExecution);
    assert(
      append.status === "failure" && append.reason === "JournalAppendFailed",
      "standalone journal failure is explicit and cannot invent success",
    );
  } finally {
    await standaloneJournal.close();
    await dropFailureTrigger(
      "execution_journal_entries",
      "sprint_6_6_forced_standalone_journal_failure",
    );
  }
  await assertJournalCount(standaloneScope, 0, "failed standalone append commits nothing");

  const transactionalScope = scopeFor("transactional-journal-failure");
  const transactionalExecution = executionForScope(
    trusted,
    transactionalScope,
    "transactional-journal-failure",
  );
  await seedPreviousState(transactionalExecution);
  await createFailureTrigger(
    "execution_journal_entries",
    "sprint_6_6_forced_transactional_journal_failure",
    false,
  );
  const coordinator = new PostgresqlTransactionalExecutionCoordinator({
    connectionString,
    schema,
  });
  try {
    const result = await coordinator.persist({
      scope: transactionalScope,
      execution: transactionalExecution,
    });
    assert(
      result.status === "failure" && result.reason === "InfrastructureFailure",
      "transactional journal failure is explicit",
    );
  } finally {
    await coordinator.close();
    await dropFailureTrigger(
      "execution_journal_entries",
      "sprint_6_6_forced_transactional_journal_failure",
    );
  }
  await assertDurableRevisionAndJournal(
    transactionalScope,
    0,
    0,
    "transactional journal failure rolls back the state mutation and audit",
  );
}

async function verifyMalformedAndIncompatibleStoredState(): Promise<void> {
  const malformedScope = scopeFor("malformed-state");
  await initializeScope(malformedScope);
  await admin.query(
    `UPDATE "${schema}".conversation_states
    SET state_document = jsonb_set(
      state_document,
      '{stage}',
      '"fictional-invalid-stage"'::jsonb
    )
    WHERE business_profile_id = $1
      AND business_profile_version = $2
      AND conversation_id = $3`,
    scopeValues(malformedScope),
  );
  const malformedRuntime = createRuntime(connectionString, schema, malformedScope);
  try {
    const direct = await malformedRuntime.stateStore.read(malformedScope);
    assert(
      direct.status === "failure" && direct.reason === "InvalidStoredState",
      "malformed persisted state fails exact decoding without repair",
    );
    const recovery = await malformedRuntime.integration.recover(malformedScope);
    assert(
      recovery.status === "failure"
        && recovery.reason === "StateUnavailable"
        && recovery.persistenceFailure === "InvalidStoredState",
      "malformed state is quarantined before journal, projection, progress, or AI use",
    );
    await assertJournalCount(malformedScope, 0, "malformed state recovery writes nothing");
  } finally {
    await closeRuntime(malformedRuntime);
  }

  const incompatibleScope = scopeFor("incompatible-state-format");
  await initializeScope(incompatibleScope);
  await admin.query(
    `UPDATE "${schema}".conversation_states
    SET state_format_version = 99
    WHERE business_profile_id = $1
      AND business_profile_version = $2
      AND conversation_id = $3`,
    scopeValues(incompatibleScope),
  );
  const store = new PostgresqlConversationStore({ connectionString, schema });
  try {
    const result = await store.read(incompatibleScope);
    assert(
      result.status === "failure" && result.reason === "IncompatibleStoredState",
      "unsupported stored-state format fails closed without promotion",
    );
  } finally {
    await store.close();
  }
}

async function verifyMissingAndWrongScope(
  trusted: StateExecutionResult,
): Promise<void> {
  const authorizedScope = scopeFor("scope-isolation");
  const execution = executionForScope(trusted, authorizedScope, "scope-isolation");
  await seedPreviousState(execution);
  const runtime = createRuntime(connectionString, schema, authorizedScope);
  try {
    const missingScope = scopeFor("missing-conversation");
    const missing = await runtime.stateStore.read(missingScope);
    assert(
      missing.status === "failure" && missing.reason === "ConversationNotFound",
      "missing exact scope returns a safe not-found result without creation",
    );
    const missingRuntime = createRuntime(connectionString, schema, missingScope);
    try {
      const missingRecovery = await missingRuntime.integration.recover(missingScope);
      assert(
        missingRecovery.status === "failure"
          && missingRecovery.reason === "StateUnavailable"
          && missingRecovery.persistenceFailure === "ConversationNotFound",
        "missing recovery fails without fresh in-memory authority",
      );
    } finally {
      await closeRuntime(missingRuntime);
    }

    const wrongBusiness = {
      ...authorizedScope,
      businessProfileId: "fictional-other-business",
    };
    const wrongBusinessState = await runtime.stateStore.read(wrongBusiness);
    const wrongBusinessJournal = await runtime.journal.snapshot(wrongBusiness);
    assert(
      wrongBusinessState.status === "failure"
        && wrongBusinessState.reason === "ConversationNotFound"
        && wrongBusinessJournal.failure === undefined
        && wrongBusinessJournal.entries.length === 0,
      "wrong-business reads disclose neither state nor journal existence",
    );
    const wrongBusinessExecution = await runtime.coordinator.persist({
      scope: wrongBusiness,
      execution,
    });
    assert(
      wrongBusinessExecution.status === "failure"
        && wrongBusinessExecution.reason === "InvalidPersistenceInput",
      "wrong-business execution fails before durable access",
    );

    const wrongVersion = {
      ...authorizedScope,
      businessProfileVersion: authorizedScope.businessProfileVersion + 1,
    };
    const versionRecovery = await runtime.integration.recover(wrongVersion);
    const wrongVersionState = await runtime.stateStore.read(wrongVersion);
    const wrongVersionJournal = await runtime.journal.snapshot(wrongVersion);
    const versionExecution = await runtime.coordinator.persist({
      scope: wrongVersion,
      execution,
    });
    assert(
      versionRecovery.status === "failure"
        && versionRecovery.reason === "ScopeMismatch"
        && wrongVersionState.status === "failure"
        && wrongVersionState.reason === "ConversationNotFound"
        && wrongVersionJournal.failure === undefined
        && wrongVersionJournal.entries.length === 0
        && versionExecution.status === "failure"
        && versionExecution.reason === "InvalidPersistenceInput",
      "profile-version mismatch cannot switch, promote, or migrate scope",
    );

    await assertDurableRevisionAndJournal(
      authorizedScope,
      0,
      0,
      "negative scope attempts cannot mutate the authorized conversation",
    );
    const missingCheck = await runtime.stateStore.read(missingScope);
    assert(
      missingCheck.status === "failure" && missingCheck.reason === "ConversationNotFound",
      "missing recovery never creates fresh authoritative state",
    );
  } finally {
    await closeRuntime(runtime);
  }
}

async function verifyIncompatibleSchema(
  trusted: StateExecutionResult,
): Promise<void> {
  await admin.query(
    `CREATE TABLE "${incompatibleSchema}".app_schema_migrations (
      version integer PRIMARY KEY,
      name text NOT NULL UNIQUE
    )`,
  );
  await admin.query(
    `INSERT INTO "${incompatibleSchema}".app_schema_migrations (version, name)
    VALUES (99, 'fictional_incompatible_schema')`,
  );
  const incompatibleScope = scopeFor("incompatible-schema");
  const execution = executionForScope(
    trusted,
    incompatibleScope,
    "incompatible-schema",
  );
  const runtime = createRuntime(
    connectionString,
    incompatibleSchema,
    incompatibleScope,
  );
  try {
    const state = await runtime.stateStore.read(incompatibleScope);
    const journal = await runtime.journal.snapshot(incompatibleScope);
    const transaction = await runtime.coordinator.persist({
      scope: incompatibleScope,
      execution,
    });
    assert(
      state.status === "failure"
        && state.reason === "PersistenceFailure"
        && journal.failure === "JournalReadFailed"
        && transaction.status === "failure"
        && transaction.reason === "InfrastructureFailure",
      "unsupported schema blocks every authoritative persistence operation explicitly",
    );
  } finally {
    await closeRuntime(runtime);
  }

  const versions = await admin.query<{ readonly version: number }>(
    `SELECT version
    FROM "${incompatibleSchema}".app_schema_migrations
    ORDER BY version`,
  );
  const tables = await admin.query<{ readonly table_name: string }>(
    `SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = $1
    ORDER BY table_name`,
    [incompatibleSchema],
  );
  assertEquivalent(
    versions.rows.map(({ version }) => version),
    [99],
    "request-time persistence does not alter incompatible migration history",
  );
  assertEquivalent(
    tables.rows.map(({ table_name }) => table_name),
    ["app_schema_migrations"],
    "request-time persistence does not create or repair schema objects",
  );
}

async function verifyIncompatibleMigrationHistory(): Promise<void> {
  await applyPostgresqlMigrations({
    connectionString,
    schema: newerMigrationSchema,
  });
  await admin.query(
    `INSERT INTO "${newerMigrationSchema}".app_schema_migrations (
      version,
      name
    ) VALUES (99, 'fictional_newer_migration')`,
  );

  let failure: unknown = null;
  try {
    await applyPostgresqlMigrations({
      connectionString,
      schema: newerMigrationSchema,
    });
  } catch (error) {
    failure = error;
  }
  assert(
    failure instanceof Error
      && failure.message === "PostgreSQL migration history is incompatible.",
    "unknown newer migration history fails before migration SQL runs",
  );

  const history = await admin.query<{
    readonly version: number;
    readonly name: string;
  }>(
    `SELECT version, name
    FROM "${newerMigrationSchema}".app_schema_migrations
    ORDER BY version`,
  );
  assertEquivalent(
    history.rows,
    [
      { version: 1, name: "conversation_states" },
      { version: 2, name: "execution_journal" },
      { version: 3, name: "business_profile_versions" },
      { version: 4, name: "knowledge_record_versions" },
      { version: 5, name: "configuration_activations" },
      { version: 6, name: "configuration_lifecycle_transitions" },
      { version: 99, name: "fictional_newer_migration" },
    ],
    "migration-history rejection performs no destructive repair",
  );
}

async function verifyRecoveryAndAuthorityBoundaries(): Promise<void> {
  const integrationPath =
    "src/ai/prototype/persistence-backed-prototype-integration.ts";
  const source = await readFile(join(process.cwd(), integrationPath), "utf8");
  assert(
    !/journal[\s\S]{0,80}(?:rebuild|reconstruct|restore).*state/i.test(source)
      && !/\b(?:replay|retry|customerResponseReleased:\s*true|dispatch)\b/i.test(source),
    "recovery contains no journal replay, retry, release, or dispatch authority",
  );
  assert(
    source.indexOf("stateManager.snapshot(scope)")
      < source.indexOf("executionJournal.snapshot(scope)"),
    "recovery loads authoritative Conversation State before audit evidence",
  );

  const manager = new ConversationStateManager();
  const initialized = manager.initialize(initializationFor(scopeFor("default-manager")));
  assert(
    !(initialized instanceof Promise) && initialized.status === "success",
    "default prototype state manager remains synchronous and in-memory",
  );
}

async function verifyMigrationOrder(): Promise<void> {
  const migrations = await admin.query<{ readonly version: number; readonly name: string }>(
    `SELECT version, name
    FROM "${schema}".app_schema_migrations
    ORDER BY version`,
  );
  assertEquivalent(
    migrations.rows,
    [
      { version: 1, name: "conversation_states" },
      { version: 2, name: "execution_journal" },
      { version: 3, name: "business_profile_versions" },
      { version: 4, name: "knowledge_record_versions" },
      { version: 5, name: "configuration_activations" },
      { version: 6, name: "configuration_lifecycle_transitions" },
    ],
    "the complete ordered migration history is present",
  );
}

interface Runtime {
  readonly stateStore: PostgresqlConversationStore;
  readonly journal: PostgresqlExecutionJournal;
  readonly coordinator: PostgresqlTransactionalExecutionCoordinator;
  readonly integration: PersistenceBackedPrototypeIntegration;
}

function createRuntime(
  runtimeConnectionString: string,
  runtimeSchema: string,
  configuredScope: Readonly<ConversationStoreScope>,
): Runtime {
  const stateStore = new PostgresqlConversationStore({
    connectionString: runtimeConnectionString,
    schema: runtimeSchema,
  });
  const journal = new PostgresqlExecutionJournal({
    connectionString: runtimeConnectionString,
    schema: runtimeSchema,
  });
  const coordinator = new PostgresqlTransactionalExecutionCoordinator({
    connectionString: runtimeConnectionString,
    schema: runtimeSchema,
  });
  const dependencies: PersistenceBackedPrototypeDependencies = {
    conversationStore: stateStore,
    executionJournal: journal,
    transactionCoordinator: coordinator,
  };
  return {
    stateStore,
    journal,
    coordinator,
    integration: new PersistenceBackedPrototypeIntegration(
      { scope: configuredScope, businessProfile: fictionalBusinessProfile },
      dependencies,
    ),
  };
}

async function closeRuntime(runtime: Runtime): Promise<void> {
  await Promise.all([
    runtime.stateStore.close(),
    runtime.journal.close(),
    runtime.coordinator.close(),
  ]);
}

async function initializeScope(scope: Readonly<ConversationStoreScope>): Promise<void> {
  const store = new PostgresqlConversationStore({ connectionString, schema });
  const manager = ConversationStateManager.usingStore(store);
  try {
    const result = await manager.initialize(initializationFor(scope));
    assert(result.status === "success", "verification scope initializes durably");
  } finally {
    await store.close();
  }
}

async function seedPreviousState(execution: StateExecutionResult): Promise<void> {
  assert(execution.previousState !== null, "execution fixture includes prior state");
  const store = new PostgresqlConversationStore({ connectionString, schema });
  try {
    const result = await store.create(execution.previousState);
    assert(result.status === "success", "execution prior state is seeded durably");
  } finally {
    await store.close();
  }
}

async function assertDurableRevisionAndJournal(
  scope: Readonly<ConversationStoreScope>,
  revision: number,
  journalCount: number,
  message: string,
): Promise<void> {
  const stateStore = new PostgresqlConversationStore({ connectionString, schema });
  const journal = new PostgresqlExecutionJournal({ connectionString, schema });
  try {
    const state = await stateStore.read(scope);
    const snapshot = await journal.snapshot(scope);
    assert(
      state.status === "success"
        && state.state.revision === revision
        && snapshot.failure === undefined
        && snapshot.entries.length === journalCount,
      message,
    );
  } finally {
    await stateStore.close();
    await journal.close();
  }
}

async function assertJournalCount(
  scope: Readonly<ConversationStoreScope>,
  count: number,
  message: string,
): Promise<void> {
  const journal = new PostgresqlExecutionJournal({ connectionString, schema });
  try {
    const snapshot = await journal.snapshot(scope);
    assert(
      snapshot.failure === undefined && snapshot.entries.length === count,
      message,
    );
  } finally {
    await journal.close();
  }
}

async function createFailureTrigger(
  table: "conversation_states" | "execution_journal_entries",
  name: string,
  deferred: boolean,
): Promise<void> {
  await admin.query(
    `CREATE FUNCTION "${schema}"."${name}_function"()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'fictional forced persistence failure';
    END;
    $$`,
  );
  if (deferred) {
    await admin.query(
      `CREATE CONSTRAINT TRIGGER "${name}"
      AFTER INSERT ON "${schema}"."${table}"
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION "${schema}"."${name}_function"()`,
    );
    return;
  }
  await admin.query(
    `CREATE TRIGGER "${name}"
    BEFORE INSERT ON "${schema}"."${table}"
    FOR EACH ROW EXECUTE FUNCTION "${schema}"."${name}_function"()`,
  );
}

async function dropFailureTrigger(
  table: "conversation_states" | "execution_journal_entries",
  name: string,
): Promise<void> {
  await admin.query(`DROP TRIGGER IF EXISTS "${name}" ON "${schema}"."${table}"`);
  await admin.query(`DROP FUNCTION IF EXISTS "${schema}"."${name}_function"()`);
}

async function trustedAppliedExecution(): Promise<StateExecutionResult> {
  const foundation = await new AiFoundationPrototypeOrchestrator().run("valid_intent");
  assert(foundation.status === "success", "fixture reaches an approved decision");
  const proposalId = foundation.value.validation.proposal?.proposalId;
  assert(typeof proposalId === "string", "fixture has proposal identity");
  const manager = new ConversationStateManager();
  const initialized = manager.initialize({
    conversationId: initializedConversationState.conversationId,
    businessProfileId: initializedConversationState.businessProfileId,
    businessProfileVersion: initializedConversationState.businessProfileVersion,
    requiredFields: initializedConversationState.missingFields,
    authorizedEscalationDestination:
      initializedConversationState.authorizedEscalationDestination,
  });
  assert(initialized.status === "success", "fixture state initializes");
  const request: StateExecutionRequest = {
    executionId: `execution-${proposalId}`,
    transitionIdentifier: "begin_intake_after_language_interpretation",
    transitionVersion: 1,
    expectedCurrentStage: CONVERSATION_STAGES.INITIALIZED,
    expectedStateRevision: foundation.value.identity.stateRevision,
    identity: foundation.value.identity,
    applicationDecision: foundation.value.decision,
    validation: foundation.value.validation,
  };
  const execution = new DeterministicStateExecutor(manager).execute(request);
  assert(execution.success, "fixture execution is already approved and applied");
  return execution;
}

function executionForScope(
  execution: StateExecutionResult,
  scope: Readonly<ConversationStoreScope>,
  identitySuffix: string,
): StateExecutionResult {
  const scopedState = (state: StateExecutionResult["previousState"]): ConversationState | null =>
    state
      ? {
          ...state,
          conversationId: scope.conversationId,
          businessProfileId: scope.businessProfileId,
          businessProfileVersion: scope.businessProfileVersion,
        }
      : null;
  return {
    ...execution,
    previousState: scopedState(execution.previousState),
    newState: scopedState(execution.newState),
    executionMetadata: {
      ...execution.executionMetadata,
      executionId: `fictional-execution-${identitySuffix}`,
      requestId: `fictional-request-${identitySuffix}`,
      traceId: `fictional-trace-${identitySuffix}`,
      proposalId: `fictional-proposal-${identitySuffix}`,
      conversationId: scope.conversationId,
      businessProfileId: scope.businessProfileId,
      businessProfileVersion: scope.businessProfileVersion,
    },
  };
}

function withExecutionIdentity(
  execution: StateExecutionResult,
  suffix: string,
): StateExecutionResult {
  return {
    ...execution,
    executionMetadata: {
      ...execution.executionMetadata,
      executionId: `fictional-execution-${suffix}`,
      requestId: `fictional-request-${suffix}`,
      traceId: `fictional-trace-${suffix}`,
      proposalId: `fictional-proposal-${suffix}`,
    },
  };
}

function scopeFor(suffix: string): ConversationStoreScope {
  return {
    conversationId: `fictional-conversation-${suffix}`,
    businessProfileId: fictionalBusinessProfile.id,
    businessProfileVersion: fictionalBusinessProfile.version,
  };
}

function initializationFor(scope: Readonly<ConversationStoreScope>) {
  return {
    ...scope,
    requiredFields: initializedConversationState.missingFields,
    authorizedEscalationDestination:
      initializedConversationState.authorizedEscalationDestination,
  };
}

function scopeValues(scope: Readonly<ConversationStoreScope>): unknown[] {
  return [
    scope.businessProfileId,
    scope.businessProfileVersion,
    scope.conversationId,
  ];
}

function requiredTestDatabaseUrl(): string {
  const value = process.env.TEST_DATABASE_URL?.trim();
  if (!value) {
    throw new Error(
      "TEST_DATABASE_URL is required for PostgreSQL integration verification.",
    );
  }
  return value;
}

function assertEquivalent(actual: unknown, expected: unknown, message: string): void {
  assert(isDeepStrictEqual(actual, expected), message);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Persistence recovery verification failed: ${message}.`);
  }
}
