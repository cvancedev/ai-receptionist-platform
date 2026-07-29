import type {
  ExecutionJournalAppendResult,
  ExecutionJournalSnapshot,
  ExecutionJournalWriter,
} from "../ai/execution-journal/contracts";
import { InMemoryExecutionJournal } from "../ai/execution-journal/in-memory-execution-journal";
import type {
  StateExecutionRequest,
  StateExecutionResult,
} from "../ai/execution/contracts";
import { DeterministicStateExecutor } from "../ai/execution/state-executor";
import { StateTransitionRegistry } from "../ai/execution/transition-registry";
import { AiFoundationPrototypeOrchestrator } from "../ai/prototype/ai-foundation-orchestrator";
import { deepFreeze } from "../ai/shared/immutable";
import { ConversationStateManager } from "../conversation/conversation-state-manager";
import type { ConversationState } from "../domain/conversation-state";
import { initializedConversationState } from "../fixtures/conversation";
import { createPrototypeFoundation } from "../prototype";
import { createPrototypeChatSession } from "../prototype-ui/prototype-chat-session";
import { CONVERSATION_STAGES } from "../shared/constants";

void verifyExecutionJournal();

async function verifyExecutionJournal() {
  await verifyControlledBoundary();
  await verifyRejectedOutcomes();
  await verifyOrderingAndImmutability();
  await verifyTrustBoundary();
  await verifyAppendFailure();
  await verifyResetAndPathBoundaries();
}

async function verifyControlledBoundary() {
  const orchestrator = new AiFoundationPrototypeOrchestrator();
  const result = await orchestrator.runWithExecution("valid_intent");
  assert(result.status === "success", "controlled execution succeeds");
  assert(result.value.execution.success, "transition is applied");
  assert(
    result.value.journalAppend.status === "success",
    "controlled boundary reports a successful append",
  );
  const journal = orchestrator.executionJournalSnapshot();
  assert(journal.entries.length === 1, "successful execution creates one entry");
  const entry = journal.entries[0];
  assert(entry.outcome === "applied", "successful execution records applied");
  assert(entry.reason === "TransitionApplied", "executor reason is preserved");
  assert(
    entry.transitionId === "begin_intake_after_language_interpretation",
    "registered transition identity is recorded",
  );
  assert(
    entry.previousStateRevision === 0
      && entry.resultingStateRevision === 1,
    "previous and resulting revisions are recorded",
  );
  assert(
    entry.conversationId === initializedConversationState.conversationId
      && entry.businessProfileId
        === initializedConversationState.businessProfileId
      && entry.businessProfileVersion
        === initializedConversationState.businessProfileVersion,
    "trusted conversation and profile scope is recorded",
  );
  assert(
    entry.journalMetadata.recordedAt === "prototype-deterministic"
      && entry.executionTimestamp === "prototype-deterministic",
    "journal timing follows deterministic prototype conventions",
  );
}

async function verifyRejectedOutcomes() {
  const request = await approvedRequest();

  const duplicateManager = createManager();
  const duplicateExecutor = new DeterministicStateExecutor(duplicateManager);
  duplicateExecutor.execute(request);
  const duplicate = duplicateExecutor.execute(request);
  assertJournalOutcome(duplicate, "duplicate", "duplicate execution");

  const stale = new DeterministicStateExecutor(createManager()).execute({
    ...request,
    expectedStateRevision: 1,
    identity: { ...request.identity, stateRevision: 1 },
    validation: {
      ...request.validation,
      proposal: {
        ...request.validation.proposal,
        stateRevision: 1,
      },
    },
  });
  assertJournalOutcome(stale, "stale", "stale revision");

  const invalidTransition = new DeterministicStateExecutor(createManager())
    .execute({
      ...request,
      transitionIdentifier: "unknown-transition",
    });
  assertJournalOutcome(
    invalidTransition,
    "invalid_transition",
    "unknown transition",
  );

  const policyRejected = new DeterministicStateExecutor(createManager())
    .execute({
      ...request,
      identity: { ...request.identity, taskIdentifier: "unknown-task" },
    });
  assertJournalOutcome(
    policyRejected,
    "policy_rejected",
    "unknown task policy rejection",
  );

  const integrated = new AiFoundationPrototypeOrchestrator();
  const rejected = await integrated.runWithExecution("malformed_output");
  assert(rejected.status === "success", "trusted rejected path returns a result");
  assert(!rejected.value.execution.success, "execution is rejected");
  assert(
    rejected.value.journalAppend.status === "success"
      && integrated.executionJournalSnapshot().entries[0].outcome
        === "policy_rejected",
    "trusted integrated rejection is journaled",
  );
}

async function verifyOrderingAndImmutability() {
  const request = await approvedRequest();
  const manager = createManager();
  const executor = new DeterministicStateExecutor(manager);
  const journal = new InMemoryExecutionJournal();
  const applied = executor.execute(request);
  const duplicate = executor.execute(request);

  const firstAppend = journal.append(applied);
  assert(firstAppend.status === "success", "first result appends");
  const firstSnapshot = journal.snapshot();
  const firstSerialized = JSON.stringify(firstSnapshot);
  const secondAppend = journal.append(duplicate);
  assert(secondAppend.status === "success", "second result appends");
  const secondSnapshot = journal.snapshot();

  assert(
    secondSnapshot.entries.map((entry) => entry.sequence).join(",") === "1,2",
    "sequence is explicit and deterministic",
  );
  assert(
    secondSnapshot.entries[0].journalEntryId
      === `execution-journal-1-${request.executionId}`
      && secondSnapshot.entries[1].journalEntryId
        === `execution-journal-2-${request.executionId}`,
    "journal identity is deterministic and sequence-qualified",
  );
  assert(
    JSON.stringify(firstSnapshot) === firstSerialized
      && firstSnapshot.entries.length === 1,
    "later appends cannot alter an earlier snapshot",
  );
  assert(
    firstSnapshot.entries[0] !== secondSnapshot.entries[0],
    "reads do not expose the internal entry reference",
  );
  assertDeeplyFrozen(firstAppend, "append result");
  assertDeeplyFrozen(firstSnapshot, "first snapshot");
  assertDeeplyFrozen(secondSnapshot, "second snapshot");

  const freshRequest = await approvedRequest();
  const firstJournal = new InMemoryExecutionJournal();
  const secondJournal = new InMemoryExecutionJournal();
  const firstResult = new DeterministicStateExecutor(createManager())
    .execute(freshRequest);
  const secondResult = new DeterministicStateExecutor(createManager())
    .execute(freshRequest);
  firstJournal.append(firstResult);
  secondJournal.append(secondResult);
  assertEquivalent(
    firstJournal.snapshot(),
    secondJournal.snapshot(),
    "identical fresh scenarios produce equivalent journals",
  );
}

async function verifyTrustBoundary() {
  const journal = new InMemoryExecutionJournal();
  const manager = createManager();
  const before = snapshot(manager);
  const malformed = new DeterministicStateExecutor(manager)
    .execute('{"proposalType":"intent_interpretation"}');
  const malformedAppend = journal.append(malformed);
  assert(
    malformedAppend.status === "failure"
      && malformedAppend.reason === "UntrustedExecutionMetadata",
    "malformed input without canonical audit identity fails closed",
  );
  assert(journal.snapshot().entries.length === 0, "failed append records nothing");
  assertEquivalent(snapshot(manager), before, "journal cannot mutate state");
  const malformedResult = journal.append(
    null as unknown as StateExecutionResult,
  );
  assert(
    malformedResult.status === "failure"
      && malformedResult.reason === "UntrustedExecutionMetadata",
    "malformed execution results fail closed without throwing",
  );

  const request = await approvedRequest();
  const execution = new DeterministicStateExecutor(createManager())
    .execute(request);
  const authorityJournal = new InMemoryExecutionJournal();
  assert(
    authorityJournal.append(execution).status === "success",
    "trusted immutable result appends",
  );
  assertEquivalent(
    snapshot(manager),
    before,
    "successful journal append has no conversation-state authority",
  );
  const unknownOutcome = journal.append({
    ...execution,
    reason: "FutureExecutionReason",
  } as unknown as StateExecutionResult);
  assert(
    unknownOutcome.status === "failure"
      && unknownOutcome.reason === "UnknownExecutionOutcome",
    "unknown outcomes fail closed",
  );
  assert(journal.snapshot().entries.length === 0, "unknown outcome is not stored");

  const capabilities = journal as unknown as Record<string, unknown>;
  assert(
    typeof capabilities.execute === "undefined"
      && typeof capabilities.apply === "undefined"
      && typeof capabilities.update === "undefined"
      && typeof capabilities.delete === "undefined"
      && typeof capabilities.replace === "undefined",
    "journal exposes no execution, state, update, delete, or replace authority",
  );
  assert(
    !containsKey(journal.snapshot(), "customerReleaseAuthorized"),
    "journal cannot authorize customer release",
  );
  assert(
    !containsKey(journal.snapshot(), "previousState")
      && !containsKey(journal.snapshot(), "newState")
      && !containsKey(journal.snapshot(), "rawOutput")
      && !containsKey(journal.snapshot(), "prompt"),
    "safe reads contain no raw state, output, or prompts",
  );
}

async function verifyAppendFailure() {
  const foundation = createPrototypeFoundation();
  const orchestrator = new AiFoundationPrototypeOrchestrator({
    executionManager: foundation.conversationStateManager,
    executionJournal: new ThrowingExecutionJournal(),
  });
  const result = await orchestrator.runWithExecution("valid_intent");
  assert(result.status === "success", "execution result remains observable");
  assert(result.value.execution.success, "journal failure does not undo execution");
  assert(
    result.value.journalAppend.status === "failure"
      && result.value.journalAppend.reason === "JournalAppendFailed",
    "journal append failure is reported explicitly",
  );
  assert(
    result.value.conversationState.stage === CONVERSATION_STAGES.INTAKE,
    "no ad hoc rollback mutates the applied state",
  );
}

async function verifyResetAndPathBoundaries() {
  const session = createPrototypeChatSession();
  await session.submit("project help");
  const beforeReset = session.executionJournalSnapshot();
  assert(beforeReset.entries.length === 1, "session records controlled execution");
  session.reset();
  const afterReset = session.executionJournalSnapshot();
  assert(afterReset.entries.length === 0, "reset creates a fresh journal");
  assert(
    beforeReset.entries.length === 1 && Object.isFrozen(beforeReset),
    "old immutable snapshot cannot affect the reset session",
  );

  const orchestrator = new AiFoundationPrototypeOrchestrator();
  const readOnly = await orchestrator.run("valid_intent");
  assert(readOnly.status === "success", "read-only run succeeds");
  assert(
    orchestrator.executionJournalSnapshot().entries.length === 0,
    "run remains read-only and creates no entry",
  );
  const controlled = await orchestrator.runWithExecution("valid_intent");
  assert(
    controlled.status === "success"
      && orchestrator.executionJournalSnapshot().entries.length === 1,
    "runWithExecution remains the journaled execution path",
  );
  assert(
    new StateTransitionRegistry().list().length === 1,
    "exactly one controlled transition remains registered",
  );
}

function assertJournalOutcome(
  result: StateExecutionResult,
  outcome: string,
  label: string,
) {
  const journal = new InMemoryExecutionJournal();
  const appended = journal.append(result);
  assert(appended.status === "success", `${label} has trusted metadata`);
  assert(
    appended.entry.outcome === outcome,
    `${label} records ${outcome}`,
  );
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

function createManager() {
  const manager = new ConversationStateManager();
  const initialized = manager.initialize({
    ...scope(),
    requiredFields: initializedConversationState.missingFields,
    authorizedEscalationDestination:
      initializedConversationState.authorizedEscalationDestination,
  });
  assert(initialized.status === "success", "journal fixture initializes");
  return manager;
}

function scope() {
  return {
    conversationId: initializedConversationState.conversationId,
    businessProfileId: initializedConversationState.businessProfileId,
    businessProfileVersion:
      initializedConversationState.businessProfileVersion,
  };
}

function snapshot(manager: ConversationStateManager): ConversationState {
  const result = manager.snapshot(scope());
  assert(result.status === "success", "journal fixture snapshot is available");
  return result.state;
}

class ThrowingExecutionJournal implements ExecutionJournalWriter {
  append(): ExecutionJournalAppendResult {
    throw new Error("controlled journal failure");
  }

  snapshot(): ExecutionJournalSnapshot {
    return deepFreeze({ entries: [] });
  }
}

function containsKey(value: unknown, prohibited: string): boolean {
  if (!value || typeof value !== "object") return false;
  if (prohibited in value) return true;
  return Object.values(value).some((child) => containsKey(child, prohibited));
}

function assertDeeplyFrozen(value: unknown, label: string) {
  if (!value || typeof value !== "object") return;
  assert(Object.isFrozen(value), `${label} is deeply immutable`);
  for (const child of Object.values(value)) {
    assertDeeplyFrozen(child, label);
  }
}

function assertEquivalent(first: unknown, second: unknown, label: string) {
  assert(JSON.stringify(first) === JSON.stringify(second), label);
}

function assert(condition: unknown, label: string): asserts condition {
  if (!condition) {
    throw new Error(`Execution journal verification failed: ${label}`);
  }
}
