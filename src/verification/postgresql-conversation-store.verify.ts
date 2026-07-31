import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { Pool } from "pg";
import { ConversationStateManager } from "../conversation/conversation-state-manager";
import type {
  ConversationStoreResult,
  ConversationStoreScope,
} from "../conversation/conversation-store";
import { InMemoryConversationStore } from "../conversation/in-memory-conversation-store";
import type { ConversationState } from "../domain/conversation-state";
import {
  COMPLETION_STATES,
  CONVERSATION_STAGES,
  ESCALATION_STATES,
} from "../shared/constants";
import { applyPostgresqlMigrations } from "../persistence/postgresql/migration-runner";
import { PostgresqlConversationStore } from "../persistence/postgresql/postgresql-conversation-store";

const connectionString = requiredTestDatabaseUrl();

const schema = `sprint_6_2_${Date.now()}_${process.pid}`;
const admin = new Pool({ connectionString });

run()
  .then(() => {
    console.log("Sprint 6.2 PostgreSQL Conversation Store verification passed.");
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });

async function run() {
  await admin.query(`CREATE SCHEMA "${schema}"`);
  try {
    await verifyMigration();
    await verifyDurableStore();
    await verifyContractIsolation();
    verifyDefaultManagerRemainsSynchronous();
  } finally {
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
}

async function verifyMigration() {
  await applyPostgresqlMigrations({ connectionString, schema });
  await applyPostgresqlMigrations({ connectionString, schema });

  const migration = await admin.query<{ readonly name: string }>(
    `SELECT name FROM "${schema}".app_schema_migrations WHERE version = 1`,
  );
  assert(
    migration.rows[0]?.name === "conversation_states",
    "migration version is recorded",
  );
  const table = await admin.query<{ readonly table_name: string }>(
    `SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = $1 AND table_name = 'conversation_states'`,
    [schema],
  );
  assert(table.rows.length === 1, "clean schema contains conversation table");
}

async function verifyDurableStore() {
  const state = fixtureState();
  const expectedScope = scope();
  let store = new PostgresqlConversationStore({ connectionString, schema });

  const created = await store.create(state);
  assertSuccess(created, "create succeeds");
  assertEquivalent(created.state, state, "created state round trip");

  const duplicate = await store.create(state);
  assertFailure(
    duplicate,
    "ConversationAlreadyExists",
    "duplicate create fails explicitly",
  );

  const read = await store.read(expectedScope);
  assertSuccess(read, "scoped read succeeds");
  assertEquivalent(read.state, state, "complete state reconstructs");
  assert(
    read.state.customerClaims.length === 2
      && read.state.corrections.length === 1
      && read.state.confirmedFacts["customer-name"]?.value === "Alex River",
    "nested state survives round trip",
  );

  assertFailure(
    await store.read({ ...expectedScope, businessProfileId: "wrong-business" }),
    "ConversationNotFound",
    "wrong business fails safely",
  );
  assertFailure(
    await store.read({ ...expectedScope, businessProfileVersion: 2 }),
    "ConversationNotFound",
    "wrong Business Profile version fails safely",
  );
  assertFailure(
    await store.read({ ...expectedScope, conversationId: "missing-conversation" }),
    "ConversationNotFound",
    "missing conversation fails explicitly",
  );

  (read.state.missingFields as string[]).push("detached-mutation");
  const detachedRead = await store.read(expectedScope);
  assertSuccess(detachedRead, "detached state can be read again");
  assert(
    !detachedRead.state.missingFields.includes("detached-mutation"),
    "returned state is detached",
  );

  await store.close();
  store = new PostgresqlConversationStore({ connectionString, schema });
  const restartRead = await store.read(expectedScope);
  assertSuccess(restartRead, "new store instance reloads durable state");
  assertEquivalent(restartRead.state, state, "restart preserves exact state");

  const replacement: ConversationState = {
    ...state,
    revision: 1,
    askedQuestions: [...state.askedQuestions, "ask-project-date"],
  };
  const replaced = await store.replace({
    scope: expectedScope,
    expectedRevision: 0,
    state: replacement,
  });
  assertSuccess(replaced, "valid revision-aware replace succeeds");
  assert(replaced.state.revision === 1, "replacement advances one revision");

  const stale = await store.replace({
    scope: expectedScope,
    expectedRevision: 0,
    state: replacement,
  });
  assertFailure(stale, "RevisionConflict", "stale revision fails explicitly");
  const afterStale = await store.read(expectedScope);
  assertSuccess(afterStale, "state remains readable after stale write");
  assertEquivalent(
    afterStale.state,
    replacement,
    "stale write does not mutate durable state",
  );

  const invalidIncrement = await store.replace({
    scope: expectedScope,
    expectedRevision: 1,
    state: { ...replacement, revision: 3 },
  });
  assertFailure(
    invalidIncrement,
    "InvalidRevisionIncrement",
    "invalid revision increment fails explicitly",
  );

  const wrongScope = await store.replace({
    scope: { ...expectedScope, businessProfileId: "wrong-business" },
    expectedRevision: 1,
    state: { ...replacement, revision: 2 },
  });
  assertFailure(wrongScope, "ScopeMismatch", "wrong-scope replace fails safely");

  await store.close();
  store = new PostgresqlConversationStore({ connectionString, schema });
  const secondRestartRead = await store.read(expectedScope);
  assertSuccess(secondRestartRead, "state survives repeated store recreation");
  assertEquivalent(
    secondRestartRead.state,
    replacement,
    "recreated store preserves replacement",
  );

  await admin.query(
    `UPDATE "${schema}".conversation_states
    SET state_format_version = 99
    WHERE business_profile_id = $1
      AND business_profile_version = $2
      AND conversation_id = $3`,
    [
      expectedScope.businessProfileId,
      expectedScope.businessProfileVersion,
      expectedScope.conversationId,
    ],
  );
  assertFailure(
    await store.read(expectedScope),
    "IncompatibleStoredState",
    "incompatible state format fails closed",
  );

  await admin.query(
    `UPDATE "${schema}".conversation_states
    SET
      state_format_version = 1,
      state_document = jsonb_build_object(
        'businessProfileId', business_profile_id,
        'businessProfileVersion', business_profile_version,
        'conversationId', conversation_id,
        'revision', revision
      )
    WHERE business_profile_id = $1
      AND business_profile_version = $2
      AND conversation_id = $3`,
    [
      expectedScope.businessProfileId,
      expectedScope.businessProfileVersion,
      expectedScope.conversationId,
    ],
  );
  assertFailure(
    await store.read(expectedScope),
    "InvalidStoredState",
    "malformed stored state fails closed",
  );

  const managerStore = new PostgresqlConversationStore({
    connectionString,
    schema,
  });
  const manager = ConversationStateManager.usingStore(managerStore);
  const managerScope = {
    conversationId: "fictional-manager-conversation",
    businessProfileId: "fictional-manager-business",
    businessProfileVersion: 1,
  };
  const initialized = await manager.initialize({
    ...managerScope,
    requiredFields: ["customer-name"],
  });
  assert(initialized.status === "success", "async store injects into manager");
  const invalidInitialization = manager.initialize({
    ...managerScope,
    conversationId: "",
    requiredFields: [],
  });
  assert(
    invalidInitialization instanceof Promise,
    "async manager fail-fast paths remain asynchronous",
  );
  assert(
    (await invalidInitialization).status === "failure",
    "async manager rejects invalid initialization",
  );
  const updated = await manager.apply({
    type: "add-missing-field",
    scope: managerScope,
    field: "customer-phone",
  });
  assert(updated.status === "success", "manager updates durable store");
  await managerStore.close();

  const reloadedManagerStore = new PostgresqlConversationStore({
    connectionString,
    schema,
  });
  const reloadedManager =
    ConversationStateManager.usingStore(reloadedManagerStore);
  const managerSnapshot = await reloadedManager.snapshot(managerScope);
  assert(
    managerSnapshot.status === "success"
      && managerSnapshot.state.revision === 1
      && managerSnapshot.state.missingFields.includes("customer-phone"),
    "new manager and store reload durable state",
  );
  await reloadedManagerStore.close();
  await store.close();
}

function verifyDefaultManagerRemainsSynchronous() {
  const manager = new ConversationStateManager();
  const result = manager.initialize({
    conversationId: "fictional-default-manager",
    businessProfileId: "fictional-default-business",
    businessProfileVersion: 1,
    requiredFields: [],
  });
  assert(!(result instanceof Promise), "default manager remains synchronous");
  assert(result.status === "success", "default manager remains in-memory");
  assert(
    new InMemoryConversationStore().constructor.name
      === "InMemoryConversationStore",
    "in-memory adapter remains available",
  );
}

function verifyContractIsolation() {
  return Promise.all([
    "src/conversation/conversation-store.ts",
    "src/domain/conversation-state.ts",
  ].map(async (path) => {
    const source = await readFile(join(process.cwd(), path), "utf8");
    assert(
      !/\b(?:pg|Pool|Client|QueryResult|SQL|PostgreSQL)\b/i.test(source),
      `${path} contains no PostgreSQL or driver type`,
    );
  }));
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

function fixtureState(): ConversationState {
  return {
    conversationId: "fictional-durable-conversation",
    businessProfileId: "fictional-durable-business",
    businessProfileVersion: 1,
    authorizedEscalationDestination: "fictional-human-desk",
    revision: 0,
    stage: CONVERSATION_STAGES.INTAKE,
    confirmedFacts: {
      "customer-name": {
        field: "customer-name",
        value: "Alex River",
        source: "fictional-confirmation",
        sequence: 3,
      },
    },
    customerClaims: [
      {
        field: "customer-name",
        value: "Alex Ridge",
        source: "fictional-message-1",
        sequence: 1,
      },
      {
        field: "customer-name",
        value: "Alex River",
        source: "fictional-message-2",
        sequence: 3,
      },
    ],
    corrections: [
      {
        field: "customer-name",
        previousValue: "Alex Ridge",
        correctedValue: "Alex River",
        source: "fictional-message-2",
        sequence: 2,
        reason: "Fictional spelling correction.",
      },
    ],
    missingFields: ["project-date"],
    askedQuestions: ["ask-customer-name"],
    escalation: {
      status: ESCALATION_STATES.NONE,
      reason: null,
      triggerSource: null,
      destination: null,
    },
    completionState: COMPLETION_STATES.NOT_READY,
    finalSnapshot: null,
  };
}

function scope(): ConversationStoreScope {
  return {
    conversationId: "fictional-durable-conversation",
    businessProfileId: "fictional-durable-business",
    businessProfileVersion: 1,
  };
}

function assertSuccess(
  result: ConversationStoreResult,
  message: string,
): asserts result is Extract<ConversationStoreResult, { status: "success" }> {
  assert(result.status === "success", message);
}

function assertFailure(
  result: ConversationStoreResult,
  reason: Extract<ConversationStoreResult, { status: "failure" }>["reason"],
  message: string,
): asserts result is Extract<ConversationStoreResult, { status: "failure" }> {
  assert(
    result.status === "failure" && result.reason === reason,
    message,
  );
}

function assertEquivalent(
  actual: unknown,
  expected: unknown,
  message: string,
) {
  assert(isDeepStrictEqual(actual, expected), message);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Verification failed: ${message}.`);
}
