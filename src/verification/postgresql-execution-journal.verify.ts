import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { Pool } from "pg";
import type {
  ExecutionJournalAppendResult,
  ExecutionJournalSnapshot,
  ExecutionJournalStoreScope,
} from "../ai/execution-journal/contracts";
import { InMemoryExecutionJournal } from "../ai/execution-journal/in-memory-execution-journal";
import type {
  StateExecutionRequest,
  StateExecutionResult,
} from "../ai/execution/contracts";
import { DeterministicStateExecutor } from "../ai/execution/state-executor";
import { AiFoundationPrototypeOrchestrator } from "../ai/prototype/ai-foundation-orchestrator";
import { ConversationStateManager } from "../conversation/conversation-state-manager";
import type { ConversationState } from "../domain/conversation-state";
import { initializedConversationState } from "../fixtures/conversation";
import { applyPostgresqlMigrations } from "../persistence/postgresql/migration-runner";
import { PostgresqlExecutionJournal } from "../persistence/postgresql/postgresql-execution-journal";
import { CONVERSATION_STAGES } from "../shared/constants";

const connectionString = requiredTestDatabaseUrl();
const schema = `sprint_6_3_${Date.now()}_${process.pid}`;
const admin = new Pool({ connectionString });

run()
  .then(() => {
    console.log("Sprint 6.3 PostgreSQL Execution Journal verification passed.");
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });

async function run() {
  await admin.query(`CREATE SCHEMA "${schema}"`);
  try {
    await verifyMigration();
    await verifyDurableJournal();
    await verifyContractIsolation();
    verifyDefaultJournalRemainsSynchronous();
  } finally {
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
}

async function verifyMigration() {
  await applyPostgresqlMigrations({ connectionString, schema });
  await applyPostgresqlMigrations({ connectionString, schema });

  const migrations = await admin.query<{
    readonly version: number;
    readonly name: string;
  }>(
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
    "ordered migrations are recorded exactly once",
  );
  const table = await admin.query<{ readonly table_name: string }>(
    `SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = $1 AND table_name = 'execution_journal_entries'`,
    [schema],
  );
  assert(table.rows.length === 1, "durable journal table exists");
}

async function verifyDurableJournal() {
  const { manager, applied, duplicate } = await trustedExecutionResults();
  const stateAfterExecution = managerSnapshot(manager);
  const expectedScope = scope();
  let store = new PostgresqlExecutionJournal({ connectionString, schema });

  const malformed = await store.append(
    null as unknown as StateExecutionResult,
  );
  assertAppendFailure(
    malformed,
    "UntrustedExecutionMetadata",
    "malformed metadata fails closed",
  );
  const invalidScope = await store.append({
    ...applied,
    executionMetadata: {
      ...applied.executionMetadata,
      businessProfileId: " ",
    },
  });
  assertAppendFailure(
    invalidScope,
    "UntrustedExecutionMetadata",
    "malformed execution scope fails closed",
  );
  const unknown = await store.append({
    ...applied,
    reason: "FutureExecutionReason",
  } as unknown as StateExecutionResult);
  assertAppendFailure(
    unknown,
    "UnknownExecutionOutcome",
    "unknown outcome fails closed",
  );
  assert(
    (await store.snapshot(expectedScope)).entries.length === 0,
    "failed append attempts store no entry",
  );

  const firstAppend = await store.append(applied);
  assertAppendSuccess(firstAppend, "trusted applied result persists");
  const secondAppend = await store.append(duplicate);
  assertAppendSuccess(secondAppend, "trusted duplicate result persists");
  assert(firstAppend.entry.outcome === "applied", "applied outcome is preserved");
  assert(
    secondAppend.entry.outcome === "duplicate",
    "duplicate execution outcome is preserved",
  );
  assert(
    firstAppend.entry.sequence === 1
      && secondAppend.entry.sequence === 2
      && firstAppend.entry.journalEntryId
        === `execution-journal-1-${applied.executionMetadata.executionId}`
      && secondAppend.entry.journalEntryId
        === `execution-journal-2-${duplicate.executionMetadata.executionId}`,
    "sequence and journal identities are deterministic and collision-free",
  );
  let duplicateRowRejected = false;
  try {
    await admin.query(
      `INSERT INTO "${schema}".execution_journal_entries
      SELECT * FROM "${schema}".execution_journal_entries
      WHERE sequence = 1`,
    );
  } catch (error) {
    duplicateRowRejected = isUniqueViolation(error);
  }
  assert(
    duplicateRowRejected,
    "database uniqueness rejects an exact duplicate journal row",
  );
  const otherScope = {
    ...expectedScope,
    businessProfileId: "other-fictional-business",
  };
  const otherBusinessAppend = await store.append(
    executionInScope(applied, otherScope),
  );
  assertAppendSuccess(
    otherBusinessAppend,
    "equivalent execution identity persists in another business scope",
  );
  assert(
    otherBusinessAppend.entry.sequence === 1
      && otherBusinessAppend.entry.journalEntryId
        === firstAppend.entry.journalEntryId,
    "journal sequence and identity uniqueness are isolated by scope",
  );
  const otherBusinessSnapshot = await store.snapshot(otherScope);
  assertSnapshotSuccess(
    otherBusinessSnapshot,
    "other business reads only its exact scoped journal",
  );
  assert(
    otherBusinessSnapshot.entries.length === 1,
    "other business history is isolated",
  );
  assertDeeplyFrozen(firstAppend, "durable append result");
  assertEquivalent(
    managerSnapshot(manager),
    stateAfterExecution,
    "journal append cannot mutate Conversation State",
  );

  const firstSnapshot = await store.snapshot(expectedScope);
  assertSnapshotSuccess(firstSnapshot, "scoped snapshot succeeds");
  assertEquivalent(
    firstSnapshot.entries,
    [firstAppend.entry, secondAppend.entry],
    "all safe journal fields round-trip exactly",
  );
  assert(
    firstSnapshot.entries.map((entry) => entry.sequence).join(",") === "1,2",
    "scoped entries use deterministic sequence ordering",
  );
  assertDeeplyFrozen(firstSnapshot, "durable journal snapshot");

  const secondSnapshot = await store.snapshot(expectedScope);
  assertSnapshotSuccess(secondSnapshot, "second scoped snapshot succeeds");
  assert(
    firstSnapshot.entries[0] !== secondSnapshot.entries[0]
      && firstSnapshot.entries[0]?.executionMetadata
        !== secondSnapshot.entries[0]?.executionMetadata,
    "snapshot entries are detached from other reads",
  );
  assertEmptySnapshot(
    await store.snapshot({
      ...expectedScope,
      businessProfileId: "absent-fictional-business",
    }),
    "wrong business returns no unauthorized entries",
  );
  assertEmptySnapshot(
    await store.snapshot({ ...expectedScope, businessProfileVersion: 2 }),
    "wrong Business Profile version returns no entries",
  );
  assertEmptySnapshot(
    await store.snapshot({
      ...expectedScope,
      conversationId: "other-fictional-conversation",
    }),
    "wrong conversation returns no entries",
  );
  const malformedScope = await store.snapshot({
    ...expectedScope,
    conversationId: " ",
  });
  assert(
    malformedScope.entries.length === 0
      && malformedScope.failure === "InvalidJournalScope",
    "malformed retrieval scope fails explicitly",
  );

  await store.close();
  store = new PostgresqlExecutionJournal({ connectionString, schema });
  const restartSnapshot = await store.snapshot(expectedScope);
  assertSnapshotSuccess(restartSnapshot, "new store instance reloads journal");
  assertEquivalent(
    restartSnapshot.entries,
    firstSnapshot.entries,
    "journal history survives store recreation",
  );

  const durableOrchestrator =
    new AiFoundationPrototypeOrchestrator<"asynchronous">({
      executionJournal: store,
    });
  const integrated = await durableOrchestrator.runWithExecution("valid_intent");
  assert(
    integrated.status === "success"
      && integrated.value.journalAppend.status === "success",
    "explicitly injected durable journal integrates with controlled execution",
  );
  const integratedSnapshot = await durableOrchestrator
    .executionJournalSnapshot();
  assertSnapshotSuccess(
    integratedSnapshot,
    "injected durable journal exposes awaited scoped history",
  );
  assert(
    integratedSnapshot.entries.length === 3
      && integratedSnapshot.entries[2]?.sequence === 3,
    "injected append continues durable sequence",
  );

  verifyAuthorityBoundary(store, integratedSnapshot);

  await admin.query(
    `UPDATE "${schema}".execution_journal_entries
    SET journal_schema_version = 99
    WHERE sequence = 2`,
  );
  const incompatible = await store.snapshot(expectedScope);
  assert(
    incompatible.entries.length === 0
      && incompatible.failure === "IncompatibleStoredJournalEntry",
    "incompatible stored entry fails closed",
  );
  await admin.query(
    `UPDATE "${schema}".execution_journal_entries
    SET
      journal_schema_version = 1,
      execution_metadata = '{"failures":"invalid"}'::jsonb
    WHERE sequence = 2`,
  );
  const malformedStored = await store.snapshot(expectedScope);
  assert(
    malformedStored.entries.length === 0
      && malformedStored.failure === "InvalidStoredJournalEntry",
    "malformed stored entry fails closed",
  );
  await store.close();

  const unavailable = new PostgresqlExecutionJournal({
    connectionString,
    schema,
  });
  await unavailable.close();
  assertAppendFailure(
    await unavailable.append(applied),
    "JournalAppendFailed",
    "persistence append failure is explicit",
  );
  const unavailableSnapshot = await unavailable.snapshot(expectedScope);
  assert(
    unavailableSnapshot.entries.length === 0
      && unavailableSnapshot.failure === "JournalReadFailed",
    "persistence read failure is explicit",
  );
}

function verifyAuthorityBoundary(
  store: PostgresqlExecutionJournal,
  snapshot: ExecutionJournalSnapshot,
) {
  const capabilities = store as unknown as Record<string, unknown>;
  for (const prohibited of [
    "execute",
    "apply",
    "update",
    "delete",
    "replace",
    "replay",
    "retry",
    "release",
    "dispatch",
  ]) {
    assert(
      typeof capabilities[prohibited] === "undefined",
      `durable journal exposes no ${prohibited} capability`,
    );
  }
  for (const prohibited of [
    "previousState",
    "newState",
    "rawOutput",
    "prompt",
    "customerReleaseAuthorized",
    "externalAction",
  ]) {
    assert(
      !containsKey(snapshot, prohibited),
      `durable journal stores no ${prohibited}`,
    );
  }
}

async function verifyContractIsolation() {
  for (const path of [
    "src/ai/execution-journal/contracts.ts",
    "src/ai/execution-journal/entry-mapper.ts",
    "src/ai/execution/contracts.ts",
  ]) {
    const source = await readFile(join(process.cwd(), path), "utf8");
    assert(
      !/\b(?:pg|Pool|PoolClient|QueryResult|SQL|PostgreSQL)\b/i.test(source),
      `${path} contains no PostgreSQL or driver type`,
    );
  }
}

function verifyDefaultJournalRemainsSynchronous() {
  const journal = new InMemoryExecutionJournal();
  assert(journal.operationMode === "synchronous", "in-memory journal is synchronous");
  const orchestrator = new AiFoundationPrototypeOrchestrator();
  const snapshot = orchestrator.executionJournalSnapshot();
  assert(!(snapshot instanceof Promise), "default journal snapshot is synchronous");
  assert(snapshot.entries.length === 0, "default journal remains in-memory and empty");
}

async function trustedExecutionResults(): Promise<{
  readonly manager: ConversationStateManager;
  readonly applied: StateExecutionResult;
  readonly duplicate: StateExecutionResult;
}> {
  const request = await approvedRequest();
  const manager = createManager();
  const executor = new DeterministicStateExecutor(manager);
  return {
    manager,
    applied: executor.execute(request),
    duplicate: executor.execute(request),
  };
}

async function approvedRequest(): Promise<StateExecutionRequest> {
  const result = await new AiFoundationPrototypeOrchestrator()
    .run("valid_intent");
  assert(result.status === "success", "approved fixture reaches a decision");
  const proposalId = result.value.validation.proposal?.proposalId;
  assert(typeof proposalId === "string", "approved fixture has proposal identity");
  return {
    executionId: `execution-${proposalId}`,
    transitionIdentifier: "begin_intake_after_language_interpretation",
    transitionVersion: 1,
    expectedCurrentStage: CONVERSATION_STAGES.INITIALIZED,
    expectedStateRevision: result.value.identity.stateRevision,
    identity: result.value.identity,
    applicationDecision: result.value.decision,
    validation: result.value.validation,
  };
}

function createManager(): ConversationStateManager {
  const manager = new ConversationStateManager();
  const initialized = manager.initialize({
    ...scope(),
    requiredFields: initializedConversationState.missingFields,
    authorizedEscalationDestination:
      initializedConversationState.authorizedEscalationDestination,
  });
  assert(initialized.status === "success", "durable journal fixture initializes");
  return manager;
}

function managerSnapshot(manager: ConversationStateManager): ConversationState {
  const result = manager.snapshot(scope());
  assert(result.status === "success", "conversation fixture remains readable");
  return result.state;
}

function scope(): ExecutionJournalStoreScope {
  return {
    conversationId: initializedConversationState.conversationId,
    businessProfileId: initializedConversationState.businessProfileId,
    businessProfileVersion:
      initializedConversationState.businessProfileVersion,
  };
}

function executionInScope(
  result: StateExecutionResult,
  targetScope: Readonly<ExecutionJournalStoreScope>,
): StateExecutionResult {
  const scopedState = (state: StateExecutionResult["previousState"]) =>
    state
      ? {
          ...state,
          conversationId: targetScope.conversationId,
          businessProfileId: targetScope.businessProfileId,
          businessProfileVersion: targetScope.businessProfileVersion,
        }
      : null;
  return {
    ...result,
    previousState: scopedState(result.previousState),
    newState: scopedState(result.newState),
    executionMetadata: {
      ...result.executionMetadata,
      conversationId: targetScope.conversationId,
      businessProfileId: targetScope.businessProfileId,
      businessProfileVersion: targetScope.businessProfileVersion,
    },
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

function assertAppendSuccess(
  result: ExecutionJournalAppendResult,
  message: string,
): asserts result is Extract<
  ExecutionJournalAppendResult,
  { readonly status: "success" }
> {
  assert(result.status === "success", message);
}

function assertAppendFailure(
  result: ExecutionJournalAppendResult,
  reason: Extract<
    ExecutionJournalAppendResult,
    { readonly status: "failure" }
  >["reason"],
  message: string,
): void {
  assert(result.status === "failure" && result.reason === reason, message);
}

function assertSnapshotSuccess(
  snapshot: ExecutionJournalSnapshot,
  message: string,
): void {
  assert(snapshot.failure === undefined, message);
}

function assertEmptySnapshot(
  snapshot: ExecutionJournalSnapshot,
  message: string,
): void {
  assert(snapshot.failure === undefined && snapshot.entries.length === 0, message);
}

function containsKey(value: unknown, prohibited: string): boolean {
  if (!value || typeof value !== "object") return false;
  if (prohibited in value) return true;
  return Object.values(value).some((child) => containsKey(child, prohibited));
}

function isUniqueViolation(error: unknown): boolean {
  return error !== null
    && typeof error === "object"
    && "code" in error
    && error.code === "23505";
}

function assertDeeplyFrozen(value: unknown, message: string): void {
  if (!value || typeof value !== "object") return;
  assert(Object.isFrozen(value), message);
  for (const child of Object.values(value)) {
    assertDeeplyFrozen(child, message);
  }
}

function assertEquivalent(
  actual: unknown,
  expected: unknown,
  message: string,
): void {
  assert(isDeepStrictEqual(actual, expected), message);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`PostgreSQL Execution Journal verification failed: ${message}.`);
  }
}
