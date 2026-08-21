import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { Pool } from "pg";
import type {
  TransactionalExecutionPersistenceFailureReason,
  TransactionalExecutionPersistenceResult,
} from "../ai/execution-persistence/contracts";
import type {
  StateExecutionRequest,
  StateExecutionResult,
} from "../ai/execution/contracts";
import { DeterministicStateExecutor } from "../ai/execution/state-executor";
import { AiFoundationPrototypeOrchestrator } from "../ai/prototype/ai-foundation-orchestrator";
import { ConversationStateManager } from "../conversation/conversation-state-manager";
import type { ConversationStoreScope } from "../conversation/conversation-store";
import type { ConversationState } from "../domain/conversation-state";
import { initializedConversationState } from "../fixtures/conversation";
import { applyPostgresqlMigrations } from "../persistence/postgresql/migration-runner";
import { PostgresqlConversationStore } from "../persistence/postgresql/postgresql-conversation-store";
import { PostgresqlExecutionJournal } from "../persistence/postgresql/postgresql-execution-journal";
import { PostgresqlTransactionalExecutionCoordinator } from "../persistence/postgresql/postgresql-transactional-execution-coordinator";
import { CONVERSATION_STAGES } from "../shared/constants";

const connectionString = requiredTestDatabaseUrl();
const schema = `sprint_6_4_${Date.now()}_${process.pid}`;
const admin = new Pool({ connectionString });
const coordinator = new PostgresqlTransactionalExecutionCoordinator({
  connectionString,
  schema,
});

run()
  .then(() => {
    console.log("Sprint 6.4 transactional execution verification passed.");
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });

async function run(): Promise<void> {
  await admin.query(`CREATE SCHEMA "${schema}"`);
  try {
    await applyPostgresqlMigrations({ connectionString, schema });
    const trusted = await trustedAppliedExecution();
    await verifySuccessfulAtomicCommit(trusted);
    await verifyStateFailureRollback(trusted);
    await verifyJournalFailureRollback(trusted);
    await verifyDurableDuplicateConflict(trusted);
    await verifyRevisionConflict(trusted);
    await verifyScopeIsolation(trusted);
    await verifyInputFailures(trusted);
    await verifyCommitFailureRollback(trusted);
    await verifyContractAndDefaultIsolation();
    await verifyNoSchemaChange();
  } finally {
    await coordinator.close();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
}

async function verifySuccessfulAtomicCommit(
  trusted: StateExecutionResult,
): Promise<void> {
  const execution = executionForScope(trusted, "atomic-success");
  const scope = scopeFor("atomic-success");
  await seedPreviousState(execution);

  const result = await coordinator.persist({ scope, execution });
  assertSuccess(result, "valid execution commits atomically");
  assert(result.state.revision === 1, "state advances exactly once");
  assert(result.journalEntry.sequence === 1, "journal begins at sequence one");
  assert(
    result.journalEntry.resultingStateRevision === result.state.revision,
    "journal records the committed resulting revision",
  );

  const stores = await durableSnapshot(scope);
  assertEquivalent(
    stores.state,
    execution.newState,
    "new store instance reloads the committed state",
  );
  assert(
    stores.entries.length === 1
      && stores.entries[0]?.executionId
        === execution.executionMetadata.executionId,
    "new journal instance reloads the corresponding entry",
  );
}

async function verifyStateFailureRollback(
  trusted: StateExecutionResult,
): Promise<void> {
  const execution = executionForScope(trusted, "state-failure");
  const scope = scopeFor("state-failure");
  await seedPreviousState(execution);
  await createFailureTrigger(
    "conversation_states",
    "forced_state_failure",
    false,
  );
  try {
    assertFailure(
      await coordinator.persist({ scope, execution }),
      "InfrastructureFailure",
      "state write failure is explicit",
    );
  } finally {
    await dropFailureTrigger("conversation_states", "forced_state_failure");
  }
  await assertPriorStateAndNoJournal(scope, execution, "state failure rolls back");
}

async function verifyJournalFailureRollback(
  trusted: StateExecutionResult,
): Promise<void> {
  const execution = executionForScope(trusted, "journal-failure");
  const scope = scopeFor("journal-failure");
  await seedPreviousState(execution);
  await createFailureTrigger(
    "execution_journal_entries",
    "forced_journal_failure",
    false,
  );
  try {
    assertFailure(
      await coordinator.persist({ scope, execution }),
      "InfrastructureFailure",
      "journal failure after state update is explicit",
    );
  } finally {
    await dropFailureTrigger(
      "execution_journal_entries",
      "forced_journal_failure",
    );
  }
  await assertPriorStateAndNoJournal(
    scope,
    execution,
    "journal failure rolls back the earlier state update",
  );
}

async function verifyRevisionConflict(
  trusted: StateExecutionResult,
): Promise<void> {
  const execution = executionForScope(trusted, "revision-conflict");
  const scope = scopeFor("revision-conflict");
  await seedPreviousState(execution);

  assertSuccess(
    await coordinator.persist({ scope, execution }),
    "first revision-aware execution commits",
  );
  const staleExecution = withExecutionIdentity(execution, "stale-writer");
  assertFailure(
    await coordinator.persist({ scope, execution: staleExecution }),
    "RevisionConflict",
    "stale execution fails closed without retry",
  );
  const stores = await durableSnapshot(scope);
  assert(stores.state.revision === 1, "stale execution does not overwrite state");
  assert(stores.entries.length === 1, "stale execution appends no journal entry");
}

async function verifyDurableDuplicateConflict(
  trusted: StateExecutionResult,
): Promise<void> {
  const execution = executionForScope(trusted, "duplicate-conflict");
  const scope = scopeFor("duplicate-conflict");
  await seedPreviousState(execution);
  const journal = new PostgresqlExecutionJournal({ connectionString, schema });
  try {
    const seeded = await journal.append(execution);
    assert(seeded.status === "success", "durable execution identity is seeded");
  } finally {
    await journal.close();
  }

  assertFailure(
    await coordinator.persist({ scope, execution }),
    "DuplicateConflict",
    "persisted execution identity fails before state replacement",
  );
  const stores = await durableSnapshot(scope);
  assertEquivalent(
    stores.state,
    execution.previousState,
    "duplicate execution does not change state",
  );
  assert(stores.entries.length === 1, "duplicate execution adds no second entry");
}

async function verifyScopeIsolation(
  trusted: StateExecutionResult,
): Promise<void> {
  const execution = executionForScope(trusted, "scope-isolation");
  const scope = scopeFor("scope-isolation");
  await seedPreviousState(execution);
  const mismatches: readonly ConversationStoreScope[] = [
    { ...scope, businessProfileId: "fictional-other-business" },
    { ...scope, businessProfileVersion: 2 },
    { ...scope, conversationId: "fictional-other-conversation" },
  ];
  for (const mismatchedScope of mismatches) {
    assertFailure(
      await coordinator.persist({ scope: mismatchedScope, execution }),
      "InvalidPersistenceInput",
      "mismatched transaction scope fails before commit",
    );
  }
  await assertPriorStateAndNoJournal(
    scope,
    execution,
    "scope mismatch cannot affect the authorized tenant",
  );
}

async function verifyInputFailures(
  trusted: StateExecutionResult,
): Promise<void> {
  const missing = executionForScope(trusted, "missing-state");
  assertFailure(
    await coordinator.persist({ scope: scopeFor("missing-state"), execution: missing }),
    "ConversationNotFound",
    "missing state is distinguished without a journal append",
  );

  const malformed = executionForScope(trusted, "journal-rejection");
  assertFailure(
    await coordinator.persist({
      scope: scopeFor("journal-rejection"),
      execution: {
        ...malformed,
        executionMetadata: {
          ...malformed.executionMetadata,
          traceId: " ",
        },
      },
    }),
    "JournalRejected",
    "journal trust rejection occurs before persistence",
  );
}

async function verifyCommitFailureRollback(
  trusted: StateExecutionResult,
): Promise<void> {
  const execution = executionForScope(trusted, "commit-failure");
  const scope = scopeFor("commit-failure");
  await seedPreviousState(execution);
  await createFailureTrigger(
    "execution_journal_entries",
    "forced_commit_failure",
    true,
  );
  try {
    assertFailure(
      await coordinator.persist({ scope, execution }),
      "TransactionCommitFailed",
      "deferred transaction failure is not reported as success",
    );
  } finally {
    await dropFailureTrigger(
      "execution_journal_entries",
      "forced_commit_failure",
    );
  }
  await assertPriorStateAndNoJournal(
    scope,
    execution,
    "commit failure leaves no accepted partial outcome",
  );
}

async function verifyContractAndDefaultIsolation(): Promise<void> {
  const contractPath = "src/ai/execution-persistence/contracts.ts";
  const contract = await readFile(join(process.cwd(), contractPath), "utf8");
  assert(
    !/\b(?:pg|Pool|PoolClient|QueryResult|SQL|PostgreSQL)\b/i.test(contract),
    "application coordination contract contains no PostgreSQL or driver type",
  );
  assert(
    !/\b(?:execute|validate|release|replay|retry|dispatch)\s*\(/i.test(contract),
    "coordination contract exposes no execution, validation, release, replay, retry, or dispatch method",
  );
  const prototype = new AiFoundationPrototypeOrchestrator();
  const snapshot = prototype.executionJournalSnapshot();
  assert(!(snapshot instanceof Promise), "default prototype journal remains synchronous");
  assert(snapshot.entries.length === 0, "default prototype remains database-independent");
}

async function verifyNoSchemaChange(): Promise<void> {
  const migrations = await admin.query<{ readonly version: number }>(
    `SELECT version FROM "${schema}".app_schema_migrations ORDER BY version`,
  );
  assertEquivalent(
    migrations.rows.map(({ version }) => version),
    [1, 2, 3, 4, 5, 6, 7],
    "transaction coordination uses the current additive migration history",
  );
}

async function seedPreviousState(execution: StateExecutionResult): Promise<void> {
  assert(execution.previousState !== null, "fixture has a previous state");
  const store = new PostgresqlConversationStore({ connectionString, schema });
  try {
    const created = await store.create(execution.previousState);
    assert(created.status === "success", "previous durable state is seeded");
  } finally {
    await store.close();
  }
}

async function durableSnapshot(scope: Readonly<ConversationStoreScope>): Promise<{
  readonly state: Readonly<ConversationState>;
  readonly entries: readonly { readonly executionId: string; readonly sequence: number }[];
}> {
  const stateStore = new PostgresqlConversationStore({ connectionString, schema });
  const journal = new PostgresqlExecutionJournal({ connectionString, schema });
  try {
    const state = await stateStore.read(scope);
    const entries = await journal.snapshot(scope);
    assert(state.status === "success", "durable state remains readable");
    assert(entries.failure === undefined, "durable journal remains readable");
    return { state: state.state, entries: entries.entries };
  } finally {
    await stateStore.close();
    await journal.close();
  }
}

async function assertPriorStateAndNoJournal(
  scope: Readonly<ConversationStoreScope>,
  execution: StateExecutionResult,
  message: string,
): Promise<void> {
  const stores = await durableSnapshot(scope);
  assertEquivalent(stores.state, execution.previousState, message);
  assert(stores.entries.length === 0, message);
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
  const timing = table === "conversation_states"
    ? "BEFORE UPDATE"
    : "BEFORE INSERT";
  await admin.query(
    `CREATE TRIGGER "${name}"
    ${timing} ON "${schema}"."${table}"
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
  const foundation = await new AiFoundationPrototypeOrchestrator()
    .run("valid_intent");
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
  suffix: string,
): StateExecutionResult {
  const scope = scopeFor(suffix);
  const scopedState = (state: StateExecutionResult["previousState"]) =>
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
      executionId: `fictional-execution-${suffix}`,
      requestId: `fictional-request-${suffix}`,
      traceId: `fictional-trace-${suffix}`,
      proposalId: `fictional-proposal-${suffix}`,
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
    businessProfileId: `fictional-business-${suffix}`,
    businessProfileVersion: 1,
  };
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

function assertSuccess(
  result: TransactionalExecutionPersistenceResult,
  message: string,
): asserts result is Extract<
  TransactionalExecutionPersistenceResult,
  { readonly status: "success" }
> {
  assert(result.status === "success", message);
}

function assertFailure(
  result: TransactionalExecutionPersistenceResult,
  reason: TransactionalExecutionPersistenceFailureReason,
  message: string,
): void {
  assert(result.status === "failure" && result.reason === reason, message);
}

function assertEquivalent(actual: unknown, expected: unknown, message: string): void {
  assert(isDeepStrictEqual(actual, expected), message);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Transactional execution verification failed: ${message}.`);
  }
}
