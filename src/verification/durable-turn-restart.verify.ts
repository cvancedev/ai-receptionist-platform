import { isDeepStrictEqual } from "node:util";
import { Pool } from "pg";
import type { StateExecutionRequest, StateExecutionResult } from "../ai/execution/contracts";
import { DeterministicStateExecutor } from "../ai/execution/state-executor";
import { AiFoundationPrototypeOrchestrator } from "../ai/prototype/ai-foundation-orchestrator";
import {
  decodeDurableMessageEvidence,
  type DurableMessageEvidence,
} from "../application/end-to-end/message-evidence";
import { ConversationStateManager } from "../conversation/conversation-state-manager";
import type { ConversationStoreScope } from "../conversation/conversation-store";
import { initializedConversationState } from "../fixtures/conversation";
import { applyPostgresqlMigrations } from "../persistence/postgresql/migration-runner";
import { PostgresqlConversationStore } from "../persistence/postgresql/postgresql-conversation-store";
import { PostgresqlExecutionJournal } from "../persistence/postgresql/postgresql-execution-journal";
import { PostgresqlMessageEvidenceStore } from "../persistence/postgresql/postgresql-message-evidence-store";
import { PostgresqlTransactionalExecutionCoordinator } from "../persistence/postgresql/postgresql-transactional-execution-coordinator";
import { CONVERSATION_STAGES } from "../shared/constants";

const connectionString = requiredTestDatabaseUrl();
const schema = `sprint_8_4_${Date.now()}_${process.pid}`;
const admin = new Pool({ connectionString });

run().then(() => console.log("Sprint 8.4 durable turn and restart verification passed."))
  .catch((error: unknown) => { console.error(error); process.exitCode = 1; });

async function run(): Promise<void> {
  await admin.query(`CREATE SCHEMA "${schema}"`);
  try {
    await applyPostgresqlMigrations({ connectionString, schema });
    await verifyOrderedMigration();
    const trusted = await trustedAppliedExecution();
    await verifyAtomicCommitAndRestart(trusted);
    await verifyDuplicateAndStaleRollback(trusted);
    await verifyMessageFailureRollback(trusted);
    await verifyScopeIsolationAndCorruption(trusted);
  } finally {
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
}

async function verifyOrderedMigration(): Promise<void> {
  const history = await admin.query<{ version: number; name: string }>(
    `SELECT version, name FROM "${schema}".app_schema_migrations ORDER BY version`,
  );
  equal(history.rows.map((row) => [row.version, row.name]), [
    [1, "conversation_states"], [2, "execution_journal"],
    [3, "business_profile_versions"], [4, "knowledge_record_versions"],
    [5, "configuration_activations"], [6, "configuration_lifecycle_transitions"],
    [7, "message_evidence"],
  ], "migration 007 is ordered and migrations 001 through 006 remain compatible");
}

async function verifyAtomicCommitAndRestart(trusted: StateExecutionResult): Promise<void> {
  const execution = scopedExecution(trusted, "commit");
  const scope = scopeFor("commit");
  await seed(execution);
  const coordinator = new PostgresqlTransactionalExecutionCoordinator({ connectionString, schema });
  try {
    const result = await coordinator.persist({
      scope, execution, messageEvidence: evidenceFor(execution, 1),
    });
    assert(result.status === "success", "state, execution, and message commit together");
  } finally { await coordinator.close(); }
  const recovered = await snapshot(scope);
  equal(recovered.state, execution.newState, "restart reloads only committed authoritative state");
  assert(recovered.journalCount === 1 && recovered.messages.length === 1,
    "restart reloads matching execution and transcript evidence");
  assert(recovered.messages[0]?.resultingStateRevision === recovered.state.revision,
    "message provenance is bound to the committed state revision");
}

async function verifyDuplicateAndStaleRollback(trusted: StateExecutionResult): Promise<void> {
  const execution = scopedExecution(trusted, "duplicate");
  const scope = scopeFor("duplicate");
  await seed(execution);
  const coordinator = new PostgresqlTransactionalExecutionCoordinator({ connectionString, schema });
  try {
    const first = await coordinator.persist({ scope, execution, messageEvidence: evidenceFor(execution, 1) });
    assert(first.status === "success", "first durable turn commits");
    const duplicate = await coordinator.persist({ scope, execution, messageEvidence: evidenceFor(execution, 1) });
    assert(duplicate.status === "failure" && duplicate.reason === "DuplicateConflict",
      "duplicate turn fails without another fact");
    const stale = await coordinator.persist({
      scope,
      execution: withExecutionId(execution, "stale"),
      messageEvidence: { ...evidenceFor(execution, 2), messageId: "message-stale", turnId: "turn-stale" },
    });
    assert(stale.status === "failure" && stale.reason === "RevisionConflict",
      "stale turn fails without another fact");
  } finally { await coordinator.close(); }
  const recovered = await snapshot(scope);
  assert(recovered.journalCount === 1 && recovered.messages.length === 1,
    "duplicate and stale failures consume no durable sequence");
}

async function verifyMessageFailureRollback(trusted: StateExecutionResult): Promise<void> {
  const execution = scopedExecution(trusted, "rollback");
  const scope = scopeFor("rollback");
  await seed(execution);
  await admin.query(`CREATE FUNCTION "${schema}".reject_message() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced'; END; $$`);
  await admin.query(`CREATE TRIGGER reject_message BEFORE INSERT ON "${schema}".conversation_message_evidence FOR EACH ROW EXECUTE FUNCTION "${schema}".reject_message()`);
  const coordinator = new PostgresqlTransactionalExecutionCoordinator({ connectionString, schema });
  try {
    const failed = await coordinator.persist({ scope, execution, messageEvidence: evidenceFor(execution, 1) });
    assert(failed.status === "failure" && failed.reason === "InfrastructureFailure",
      "message failure is explicit");
  } finally {
    await coordinator.close();
    await admin.query(`DROP TRIGGER reject_message ON "${schema}".conversation_message_evidence`);
    await admin.query(`DROP FUNCTION "${schema}".reject_message()`);
  }
  const recovered = await snapshot(scope);
  equal(recovered.state, execution.previousState, "message failure rolls back state");
  assert(recovered.journalCount === 0 && recovered.messages.length === 0,
    "message failure rolls back execution and message evidence");
}

async function verifyScopeIsolationAndCorruption(trusted: StateExecutionResult): Promise<void> {
  const execution = scopedExecution(trusted, "isolation");
  const scope = scopeFor("isolation");
  await seed(execution);
  const coordinator = new PostgresqlTransactionalExecutionCoordinator({ connectionString, schema });
  try {
    const wrong = await coordinator.persist({
      scope: { ...scope, businessProfileId: "other-business" },
      execution, messageEvidence: evidenceFor(execution, 1),
    });
    assert(wrong.status === "failure" && wrong.reason === "InvalidPersistenceInput",
      "cross-business persistence fails closed");
  } finally { await coordinator.close(); }
  const corrupt = decodeDurableMessageEvidence({
    ...evidenceFor(execution, 1), evidenceSchemaVersion: 2,
  }, scope);
  assert(corrupt.status === "failure", "restart decoder rejects corrupt evidence");
}

async function snapshot(scope: ConversationStoreScope) {
  const states = new PostgresqlConversationStore({ connectionString, schema });
  const journal = new PostgresqlExecutionJournal({ connectionString, schema });
  const messages = new PostgresqlMessageEvidenceStore({ connectionString, schema });
  try {
    const state = await states.read(scope);
    const entries = await journal.snapshot(scope);
    const evidence = await messages.snapshot(scope);
    assert(state.status === "success" && !entries.failure && evidence.status === "success",
      "fresh adapters recover committed scope");
    return { state: state.state, journalCount: entries.entries.length, messages: evidence.snapshot.entries };
  } finally { await Promise.all([states.close(), journal.close(), messages.close()]); }
}

async function seed(execution: StateExecutionResult): Promise<void> {
  assert(execution.previousState, "trusted execution has prior state");
  const store = new PostgresqlConversationStore({ connectionString, schema });
  try { assert((await store.create(execution.previousState)).status === "success", "prior state seeds"); }
  finally { await store.close(); }
}

function evidenceFor(execution: StateExecutionResult, sequence: number): DurableMessageEvidence {
  assert(execution.newState, "trusted execution has resulting state");
  return {
    messageId: `message-${execution.newState.conversationId}-${sequence}`,
    turnId: `turn-${execution.newState.conversationId}-${sequence}`,
    businessProfileId: execution.newState.businessProfileId,
    businessProfileVersion: execution.newState.businessProfileVersion,
    conversationId: execution.newState.conversationId,
    activationRevision: 1,
    sequence, source: "customer", content: "Fictional bounded customer message.",
    resultingStateRevision: execution.newState.revision,
    recordedAt: "sprint-8.4-deterministic", evidenceSchemaVersion: 1,
  };
}

async function trustedAppliedExecution(): Promise<StateExecutionResult> {
  const foundation = await new AiFoundationPrototypeOrchestrator().run("valid_intent");
  assert(foundation.status === "success", "foundation fixture is approved");
  const proposalId = foundation.value.validation.proposal?.proposalId;
  assert(typeof proposalId === "string", "foundation fixture has proposal identity");
  const manager = new ConversationStateManager();
  assert(manager.initialize({
    conversationId: initializedConversationState.conversationId,
    businessProfileId: initializedConversationState.businessProfileId,
    businessProfileVersion: initializedConversationState.businessProfileVersion,
    requiredFields: initializedConversationState.missingFields,
    authorizedEscalationDestination: initializedConversationState.authorizedEscalationDestination,
  }).status === "success", "fixture initializes");
  const request: StateExecutionRequest = {
    executionId: `execution-${proposalId}`,
    transitionIdentifier: "begin_intake_after_language_interpretation",
    transitionVersion: 1, expectedCurrentStage: CONVERSATION_STAGES.INITIALIZED,
    expectedStateRevision: foundation.value.identity.stateRevision,
    identity: foundation.value.identity,
    applicationDecision: foundation.value.decision, validation: foundation.value.validation,
  };
  const result = new DeterministicStateExecutor(manager).execute(request);
  assert(result.success, "trusted state executor approves transition");
  return result;
}

function scopedExecution(value: StateExecutionResult, suffix: string): StateExecutionResult {
  const scope = scopeFor(suffix);
  const state = (candidate: StateExecutionResult["previousState"]) => candidate && ({ ...candidate, ...scope });
  return { ...value, previousState: state(value.previousState), newState: state(value.newState), executionMetadata: {
    ...value.executionMetadata, executionId: `execution-${suffix}`, requestId: `request-${suffix}`,
    traceId: `trace-${suffix}`, proposalId: `proposal-${suffix}`,
    conversationId: scope.conversationId, businessProfileId: scope.businessProfileId,
    businessProfileVersion: scope.businessProfileVersion,
  } };
}

function withExecutionId(value: StateExecutionResult, id: string): StateExecutionResult {
  return { ...value, executionMetadata: { ...value.executionMetadata, executionId: id } };
}

function scopeFor(suffix: string): ConversationStoreScope {
  return { businessProfileId: `business-${suffix}`, businessProfileVersion: 1, conversationId: `conversation-${suffix}` };
}

function requiredTestDatabaseUrl(): string {
  const value = process.env.TEST_DATABASE_URL?.trim();
  if (!value) throw new Error("TEST_DATABASE_URL is required for PostgreSQL integration verification.");
  return value;
}

function equal(actual: unknown, expected: unknown, message: string): void {
  assert(isDeepStrictEqual(actual, expected), message);
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Sprint 8.4 verification failed: ${message}.`);
}
