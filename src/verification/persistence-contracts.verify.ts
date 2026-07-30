import type {
  ExecutionJournalStore,
} from "../ai/execution-journal/contracts";
import { InMemoryExecutionJournal } from "../ai/execution-journal/in-memory-execution-journal";
import type { StateExecutionResult } from "../ai/execution/contracts";
import { AiFoundationPrototypeOrchestrator } from "../ai/prototype/ai-foundation-orchestrator";
import {
  ConversationStateManager,
} from "../conversation/conversation-state-manager";
import type {
  ConversationStore,
  ConversationStoreFailureReason,
  ConversationStoreReplaceInput,
  ConversationStoreResult,
  ConversationStoreScope,
} from "../conversation/conversation-store";
import { InMemoryConversationStore } from "../conversation/in-memory-conversation-store";
import { cloneConversationState } from "../conversation/conversation-state-updates";
import type { ConversationState } from "../domain/conversation-state";
import { initializedConversationState } from "../fixtures/conversation";
import { CONVERSATION_STAGES } from "../shared/constants";

async function verifyPersistenceContracts() {
  verifyConversationStoreContract();
  verifyConversationStateManagerContract();
  await verifyExecutionJournalContract();
}

function verifyConversationStoreContract() {
  const store: ConversationStore = new InMemoryConversationStore();
  const initial = cloneConversationState(initializedConversationState);
  const created = store.create(initial);
  assert(created.status === "success", "in-memory contract creates state");

  initial.stage = CONVERSATION_STAGES.INTAKE;
  assert(
    readStore(store).stage === CONVERSATION_STAGES.INITIALIZED,
    "create detaches caller state from stored state",
  );

  const duplicate = store.create(initializedConversationState);
  assert(
    duplicate.status === "failure"
      && duplicate.reason === "ConversationAlreadyExists",
    "duplicate create fails explicitly",
  );

  const correctScope = store.read(scope());
  assert(correctScope.status === "success", "correct-scope read succeeds");
  const wrongScope = store.read({
    ...scope(),
    businessProfileId: "another-fictional-business",
  });
  assert(
    wrongScope.status === "failure"
      && wrongScope.reason === "ConversationNotFound",
    "wrong-scope read fails without exposing another business",
  );

  const replacement = nextState(readStore(store));
  const replaced = store.replace({
    scope: scope(),
    expectedRevision: 0,
    state: replacement,
  });
  assert(
    replaced.status === "success"
      && replaced.state.revision === 1
      && replaced.state.stage === CONVERSATION_STAGES.INTAKE,
    "matching expected revision replaces state once",
  );

  const staleCandidate = cloneConversationState(replacement);
  const stale = store.replace({
    scope: scope(),
    expectedRevision: 0,
    state: staleCandidate,
  });
  assert(
    stale.status === "failure" && stale.reason === "RevisionConflict",
    "stale expected revision returns an explicit conflict",
  );
  assertEquivalent(
    readStore(store),
    replacement,
    "stale replacement does not mutate stored state",
  );

  const wrongBusiness = store.replace({
    scope: {
      ...scope(),
      businessProfileId: "another-fictional-business",
    },
    expectedRevision: 1,
    state: { ...replacement, revision: 2 },
  });
  assert(
    wrongBusiness.status === "failure"
      && wrongBusiness.reason === "ConversationNotFound",
    "wrong-business replacement fails safely",
  );

  const mismatchedState = store.replace({
    scope: scope(),
    expectedRevision: 1,
    state: {
      ...replacement,
      businessProfileId: "another-fictional-business",
      revision: 2,
    },
  });
  assert(
    mismatchedState.status === "failure"
      && mismatchedState.reason === "ScopeMismatch",
    "replacement state cannot cross the requested business scope",
  );

  const invalidIncrement = store.replace({
    scope: scope(),
    expectedRevision: 1,
    state: replacement,
  });
  assert(
    invalidIncrement.status === "failure"
      && invalidIncrement.reason === "InvalidRevisionIncrement",
    "replacement must advance the expected revision exactly once",
  );

  const firstRead = store.read(scope());
  const secondRead = store.read(scope());
  assert(
    firstRead.status === "success"
      && secondRead.status === "success"
      && firstRead.state !== secondRead.state
      && firstRead.state.missingFields !== secondRead.state.missingFields,
    "reads return detached state snapshots",
  );
  if (firstRead.status === "success") {
    (firstRead.state.missingFields as string[]).push("caller-only-field");
  }
  assert(
    !readStore(store).missingFields.includes("caller-only-field"),
    "mutating a returned copy cannot mutate stored state",
  );
}

function verifyConversationStateManagerContract() {
  const defaultManager = new ConversationStateManager();
  initialize(defaultManager);
  const defaultUpdate = defaultManager.apply({
    type: "transition-stage",
    scope: scope(),
    stage: CONVERSATION_STAGES.INTAKE,
  });
  assert(
    defaultUpdate.status === "success"
      && defaultUpdate.state.revision === 1,
    "default manager retains in-memory behavior",
  );

  const recordingStore = new RecordingConversationStore();
  const injectedManager = new ConversationStateManager(recordingStore);
  initialize(injectedManager);
  const injectedUpdate = injectedManager.apply({
    type: "transition-stage",
    scope: scope(),
    stage: CONVERSATION_STAGES.INTAKE,
  });
  assert(
    injectedUpdate.status === "success"
      && recordingStore.lastExpectedRevision === 0,
    "injected contract receives the expected previous revision",
  );
  assert(
    snapshot(injectedManager).revision === 1,
    "injected contract preserves manager initialization, read, and apply behavior",
  );

  const conflictStore = new RejectingReplaceStore("RevisionConflict");
  const conflictManager = new ConversationStateManager(conflictStore);
  initialize(conflictManager);
  const beforeConflict = snapshot(conflictManager);
  const conflict = conflictManager.apply({
    type: "transition-stage",
    scope: scope(),
    stage: CONVERSATION_STAGES.INTAKE,
  });
  assert(
    conflict.status === "failure"
      && conflict.persistenceFailure === "RevisionConflict",
    "manager propagates revision conflict explicitly",
  );
  assertEquivalent(
    snapshot(conflictManager),
    beforeConflict,
    "revision conflict causes no partial state mutation",
  );

  const failureStore = new RejectingReplaceStore("PersistenceFailure");
  const failureManager = new ConversationStateManager(failureStore);
  initialize(failureManager);
  const beforeFailure = snapshot(failureManager);
  const failure = failureManager.apply({
    type: "transition-stage",
    scope: scope(),
    stage: CONVERSATION_STAGES.INTAKE,
  });
  assert(
    failure.status === "failure"
      && failure.persistenceFailure === "PersistenceFailure",
    "manager reports a generic persistence failure explicitly",
  );
  assertEquivalent(
    snapshot(failureManager),
    beforeFailure,
    "store failure causes no partial state mutation",
  );
}

async function verifyExecutionJournalContract() {
  const journal: ExecutionJournalStore = new InMemoryExecutionJournal();
  const execution = await trustedExecutionResult();
  const appended = journal.append(execution);
  assert(
    appended.status === "success",
    "in-memory journal satisfies append contract",
  );
  assertDeeplyFrozen(appended, "journal append result");

  const firstSnapshot = journal.snapshot(scope());
  const secondSnapshot = journal.snapshot(scope());
  assert(
    firstSnapshot.entries.length === 1
      && firstSnapshot.entries[0] !== secondSnapshot.entries[0],
    "journal snapshots are detached",
  );
  assert(
    journal.snapshot({
      ...scope(),
      businessProfileId: "another-fictional-business",
    }).entries.length === 0,
    "journal retrieval is business scoped",
  );
  assertDeeplyFrozen(firstSnapshot, "journal snapshot");

  const malformed = journal.append(
    null as unknown as StateExecutionResult,
  );
  assert(
    malformed.status === "failure"
      && malformed.reason === "UntrustedExecutionMetadata",
    "malformed metadata still fails closed",
  );
  assert(
    journal.snapshot(scope()).entries.length === 1,
    "failed append cannot alter journal history",
  );

  const capabilities = journal as unknown as Record<string, unknown>;
  for (const prohibited of [
    "execute",
    "apply",
    "replace",
    "update",
    "delete",
    "replay",
    "retry",
    "release",
    "dispatch",
  ]) {
    assert(
      typeof capabilities[prohibited] === "undefined",
      `journal contract exposes no ${prohibited} capability`,
    );
  }
}

class RecordingConversationStore implements ConversationStore {
  private readonly delegate = new InMemoryConversationStore();
  lastExpectedRevision: number | null = null;

  create(state: Readonly<ConversationState>): ConversationStoreResult {
    return this.delegate.create(state);
  }

  read(
    storeScope: Readonly<ConversationStoreScope>,
  ): ConversationStoreResult {
    return this.delegate.read(storeScope);
  }

  replace(
    input: Readonly<ConversationStoreReplaceInput>,
  ): ConversationStoreResult {
    this.lastExpectedRevision = input.expectedRevision;
    return this.delegate.replace(input);
  }
}

class RejectingReplaceStore implements ConversationStore {
  private readonly delegate = new InMemoryConversationStore();

  constructor(
    private readonly reason: Extract<
      ConversationStoreFailureReason,
      "RevisionConflict" | "PersistenceFailure"
    >,
  ) {}

  create(state: Readonly<ConversationState>): ConversationStoreResult {
    return this.delegate.create(state);
  }

  read(
    storeScope: Readonly<ConversationStoreScope>,
  ): ConversationStoreResult {
    return this.delegate.read(storeScope);
  }

  replace(): ConversationStoreResult {
    return {
      status: "failure",
      reason: this.reason,
      errors: [
        this.reason === "RevisionConflict"
          ? "Conversation revision does not match the expected revision."
          : "Persistence operation failed.",
      ],
    };
  }
}

function initialize(manager: ConversationStateManager) {
  const result = manager.initialize({
    ...scope(),
    requiredFields: initializedConversationState.missingFields,
    authorizedEscalationDestination:
      initializedConversationState.authorizedEscalationDestination,
  });
  assert(result.status === "success", "manager fixture initializes");
}

function scope(): ConversationStoreScope {
  return {
    conversationId: initializedConversationState.conversationId,
    businessProfileId: initializedConversationState.businessProfileId,
    businessProfileVersion:
      initializedConversationState.businessProfileVersion,
  };
}

function readStore(store: ConversationStore): ConversationState {
  const result = store.read(scope());
  assert(result.status === "success", "store fixture is readable");
  return result.state;
}

function snapshot(manager: ConversationStateManager): ConversationState {
  const result = manager.snapshot(scope());
  assert(result.status === "success", "manager fixture is readable");
  return result.state;
}

function nextState(state: ConversationState): ConversationState {
  return {
    ...cloneConversationState(state),
    revision: state.revision + 1,
    stage: CONVERSATION_STAGES.INTAKE,
  };
}

async function trustedExecutionResult(): Promise<StateExecutionResult> {
  const result = await new AiFoundationPrototypeOrchestrator()
    .runWithExecution("valid_intent");
  assert(result.status === "success", "trusted execution fixture succeeds");
  return result.value.execution;
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
    throw new Error(`Persistence contract verification failed: ${label}`);
  }
}

void verifyPersistenceContracts();
