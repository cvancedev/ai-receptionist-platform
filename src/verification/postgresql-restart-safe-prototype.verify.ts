import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { Pool } from "pg";
import { AiFoundationPrototypeOrchestrator } from "../ai/prototype/ai-foundation-orchestrator";
import {
  PersistenceBackedPrototypeIntegration,
  type PersistenceBackedPrototypeAdvanceResult,
  type PersistenceBackedPrototypeRecoveryResult,
} from "../ai/prototype/persistence-backed-prototype-integration";
import { ConversationStateManager } from "../conversation/conversation-state-manager";
import type { ConversationStoreScope } from "../conversation/conversation-store";
import { CONVERSATION_READ_MODEL_ACTIONS } from "../conversation-read-model/contracts";
import { fictionalBusinessProfile } from "../fixtures/business-profile";
import { initializedConversationState } from "../fixtures/conversation";
import { applyPostgresqlMigrations } from "../persistence/postgresql/migration-runner";
import { PostgresqlConversationStore } from "../persistence/postgresql/postgresql-conversation-store";
import { PostgresqlExecutionJournal } from "../persistence/postgresql/postgresql-execution-journal";
import { PostgresqlTransactionalExecutionCoordinator } from "../persistence/postgresql/postgresql-transactional-execution-coordinator";
import { CONVERSATION_STAGES } from "../shared/constants";

const connectionString = requiredTestDatabaseUrl();
const schema = `sprint_6_5_${Date.now()}_${process.pid}`;
const admin = new Pool({ connectionString });
const activeRuntimes = new Set<PrototypeRuntime>();

run()
  .then(() => {
    console.log("Sprint 6.5 restart-safe prototype verification passed.");
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });

async function run(): Promise<void> {
  await admin.query(`CREATE SCHEMA "${schema}"`);
  try {
    await applyPostgresqlMigrations({ connectionString, schema });
    await verifyRestartSafeLifecycle();
    await verifyMissingStateDoesNotFallback();
    await verifyArchitectureBoundaries();
    await verifyMigrationBoundary();
  } finally {
    for (const runtime of [...activeRuntimes]) await closeRuntime(runtime);
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
}

async function verifyRestartSafeLifecycle(): Promise<void> {
  const { expectedCommittedState, expectedJournal } =
    await runFirstApplicationInstance();

  const restartedRuntime = createRuntime(scope());
  const restarted = await restartedRuntime.integration.recover(scope());
  assertRecovery(restarted, "new application objects recover committed data");
  assertEquivalent(
    restarted.state,
    expectedCommittedState,
    "restart reloads the complete exact Conversation State",
  );
  assertEquivalent(
    restarted.journal,
    expectedJournal,
    "restart reloads the complete durable journal history",
  );
  assert(
    restarted.state.revision === 1
      && restarted.readModel.metadata.sourceRevision === 1
      && restarted.readModel.recommendedNextAction
        === CONVERSATION_READ_MODEL_ACTIONS.CLARIFY_SERVICE,
    "progress after restart is derived from recovered revision one",
  );

  const continued = await restartedRuntime.integration.advance(scope());
  assertProgressOnly(
    continued,
    "recovered intake state has no fabricated second transition",
  );
  assert(
    continued.recovery.readModel.metadata.sourceRevision === 1
      && continued.recovery.readModel.recommendedNextAction
        === CONVERSATION_READ_MODEL_ACTIONS.CLARIFY_SERVICE,
    "continued deterministic progression uses recovered state",
  );

  for (const mismatch of mismatchedScopes()) {
    const isolated = await restartedRuntime.integration.recover(mismatch);
    assert(
      isolated.status === "failure" && isolated.reason === "ScopeMismatch",
      "integration rejects business, profile, and conversation scope mixing",
    );
  }
  const wrongBusinessRead = await restartedRuntime.stateStore.read({
    ...scope(),
    businessProfileId: "fictional-other-business",
  });
  assert(
    wrongBusinessRead.status === "failure"
      && wrongBusinessRead.reason === "ConversationNotFound",
    "durable state lookup cannot disclose another business scope",
  );
  const wrongScopeJournal = await restartedRuntime.journal.snapshot({
    ...scope(),
    conversationId: "fictional-other-conversation",
  });
  assert(
    wrongScopeJournal.failure === undefined
      && wrongScopeJournal.entries.length === 0,
    "durable journal lookup cannot cross conversation scope",
  );

  await closeRuntime(restartedRuntime);

  const finalRuntime = createRuntime(scope());
  try {
    const finalRecovery = await finalRuntime.integration.recover(scope());
    assertRecovery(finalRecovery, "another fresh runtime sees committed data");
    assertEquivalent(
      finalRecovery.state,
      expectedCommittedState,
      "progress-only continuation does not mutate durable state",
    );
    assertEquivalent(
      finalRecovery.journal,
      expectedJournal,
      "progress-only continuation does not invent an audit entry",
    );
  } finally {
    await closeRuntime(finalRuntime);
  }
}

async function runFirstApplicationInstance(): Promise<{
  readonly expectedCommittedState: unknown;
  readonly expectedJournal: unknown;
}> {
  const firstRuntime = createRuntime(scope());
  try {
    const initialized = await firstRuntime.integration.initialize({
      ...scope(),
      requiredFields: initializedConversationState.missingFields,
      authorizedEscalationDestination:
        initializedConversationState.authorizedEscalationDestination,
    });
    assert(
      initialized.status === "success"
        && initialized.state.revision === 0
        && initialized.state.stage === CONVERSATION_STAGES.INITIALIZED,
      "opt-in PostgreSQL-backed initialization delegates to the state manager",
    );
    const duplicateInitialization = await firstRuntime.integration.initialize({
      ...scope(),
      requiredFields: initializedConversationState.missingFields,
    });
    assert(
      duplicateInitialization.status === "failure"
        && duplicateInitialization.persistenceFailure
          === "ConversationAlreadyExists",
      "duplicate initialization fails explicitly without reset",
    );

    const initializedRecovery = await firstRuntime.integration.recover(scope());
    assertRecovery(initializedRecovery, "initialized state is durably recoverable");
    assert(
      initializedRecovery.journal.entries.length === 0
        && initializedRecovery.readModel.recommendedNextAction
          === CONVERSATION_READ_MODEL_ACTIONS.BEGIN_INTAKE
        && initializedRecovery.readModel.metadata.sourceRevision === 0,
      "durable initialized state drives the existing progress engine",
    );

    const firstAdvance = await firstRuntime.integration.advance(scope());
    assertCommitted(firstAdvance, "first controlled execution commits");
    assert(
      firstAdvance.execution.executionMetadata.expectedStateRevision === 0
        && firstAdvance.execution.executionMetadata.appliedStateRevision === 1
        && firstAdvance.recovery.state.revision === 1
        && firstAdvance.recovery.state.stage === CONVERSATION_STAGES.INTAKE
        && firstAdvance.recovery.journal.entries.length === 1,
      "first execution atomically commits state revision and required audit",
    );
    return {
      expectedCommittedState: structuredClone(firstAdvance.recovery.state),
      expectedJournal: structuredClone(firstAdvance.recovery.journal),
    };
  } finally {
    await closeRuntime(firstRuntime);
  }
}

async function verifyMissingStateDoesNotFallback(): Promise<void> {
  const missingScope = {
    ...scope(),
    conversationId: "fictional-missing-conversation",
  };
  const runtime = createRuntime(missingScope);
  try {
    const recovery = await runtime.integration.recover(missingScope);
    assert(
      recovery.status === "failure"
        && recovery.reason === "StateUnavailable"
        && recovery.persistenceFailure === "ConversationNotFound",
      "missing durable state fails without fresh in-memory fallback",
    );
    const advance = await runtime.integration.advance(missingScope);
    assert(
      advance.status === "failure"
        && advance.reason === "StateUnavailable",
      "missing durable state cannot enter controlled execution",
    );
  } finally {
    await closeRuntime(runtime);
  }
}

async function verifyArchitectureBoundaries(): Promise<void> {
  const integrationPath =
    "src/ai/prototype/persistence-backed-prototype-integration.ts";
  const source = await readFile(join(process.cwd(), integrationPath), "utf8");
  assert(
    !/\b(?:pg|Pool|PoolClient|QueryResult|SQL|PostgreSQL)\b/i.test(source),
    "application integration contains no PostgreSQL or driver type",
  );
  assert(
    !/\b(?:replay|retry|dispatch|customerResponseReleased:\s*true)\b/i.test(source),
    "integration contains no replay, retry, dispatch, or release authority",
  );
  const uiFiles = [
    "app/prototype/page.tsx",
    "components/prototype/PrototypeChat.tsx",
  ];
  for (const path of uiFiles) {
    const uiSource = await readFile(join(process.cwd(), path), "utf8");
    assert(
      !/postgresql|conversation-store|execution-journal|transaction|state-executor/i
        .test(uiSource),
      `${path} has no persistence or execution authority`,
    );
  }

  const defaultManager = new ConversationStateManager();
  const defaultInitialized = defaultManager.initialize({
    conversationId: "fictional-default-restart-check",
    businessProfileId: "fictional-default-business",
    businessProfileVersion: 1,
    requiredFields: [],
  });
  assert(
    !(defaultInitialized instanceof Promise)
      && defaultInitialized.status === "success",
    "ordinary state manager remains synchronous and in-memory",
  );
  const defaultJournal = new AiFoundationPrototypeOrchestrator()
    .executionJournalSnapshot();
  assert(
    !(defaultJournal instanceof Promise) && defaultJournal.entries.length === 0,
    "ordinary AI prototype remains database-independent",
  );
}

async function verifyMigrationBoundary(): Promise<void> {
  const migrations = await admin.query<{ readonly version: number }>(
    `SELECT version FROM "${schema}".app_schema_migrations ORDER BY version`,
  );
  assertEquivalent(
    migrations.rows.map(({ version }) => version),
    [1, 2, 3, 4, 5, 6, 7],
    "restart-safe integration uses the current additive migration history",
  );
}

interface PrototypeRuntime {
  readonly stateStore: PostgresqlConversationStore;
  readonly journal: PostgresqlExecutionJournal;
  readonly coordinator: PostgresqlTransactionalExecutionCoordinator;
  readonly integration: PersistenceBackedPrototypeIntegration;
}

function createRuntime(
  configuredScope: Readonly<ConversationStoreScope>,
): PrototypeRuntime {
  const stateStore = new PostgresqlConversationStore({
    connectionString,
    schema,
  });
  const journal = new PostgresqlExecutionJournal({ connectionString, schema });
  const coordinator = new PostgresqlTransactionalExecutionCoordinator({
    connectionString,
    schema,
  });
  const runtime = {
    stateStore,
    journal,
    coordinator,
    integration: new PersistenceBackedPrototypeIntegration(
      {
        scope: configuredScope,
        businessProfile: fictionalBusinessProfile,
      },
      {
        conversationStore: stateStore,
        executionJournal: journal,
        transactionCoordinator: coordinator,
      },
    ),
  };
  activeRuntimes.add(runtime);
  return runtime;
}

async function closeRuntime(runtime: PrototypeRuntime): Promise<void> {
  if (!activeRuntimes.has(runtime)) return;
  await Promise.all([
    runtime.stateStore.close(),
    runtime.journal.close(),
    runtime.coordinator.close(),
  ]);
  activeRuntimes.delete(runtime);
}

function scope(): ConversationStoreScope {
  return {
    conversationId: initializedConversationState.conversationId,
    businessProfileId: initializedConversationState.businessProfileId,
    businessProfileVersion: initializedConversationState.businessProfileVersion,
  };
}

function mismatchedScopes(): readonly ConversationStoreScope[] {
  return [
    { ...scope(), businessProfileId: "fictional-other-business" },
    { ...scope(), businessProfileVersion: 2 },
    { ...scope(), conversationId: "fictional-other-conversation" },
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

function assertRecovery(
  result: PersistenceBackedPrototypeRecoveryResult,
  message: string,
): asserts result is Extract<
  PersistenceBackedPrototypeRecoveryResult,
  { readonly status: "success" }
> {
  assert(result.status === "success", message);
}

function assertCommitted(
  result: PersistenceBackedPrototypeAdvanceResult,
  message: string,
): asserts result is Extract<
  PersistenceBackedPrototypeAdvanceResult,
  { readonly status: "committed" }
> {
  assert(result.status === "committed", message);
}

function assertProgressOnly(
  result: PersistenceBackedPrototypeAdvanceResult,
  message: string,
): asserts result is Extract<
  PersistenceBackedPrototypeAdvanceResult,
  { readonly status: "progress-only" }
> {
  assert(result.status === "progress-only", message);
}

function assertEquivalent(actual: unknown, expected: unknown, message: string): void {
  assert(isDeepStrictEqual(actual, expected), message);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Restart-safe prototype verification failed: ${message}.`);
  }
}
