import type { StateExecutionRequest } from "../ai/execution/contracts";
import { DeterministicStateExecutor } from "../ai/execution/state-executor";
import { StateTransitionRegistry } from "../ai/execution/transition-registry";
import { AiFoundationPrototypeOrchestrator } from "../ai/prototype/ai-foundation-orchestrator";
import { ConversationStateManager } from "../conversation/conversation-state-manager";
import type { ConversationState } from "../domain/conversation-state";
import { initializedConversationState } from "../fixtures/conversation";
import { CONVERSATION_STAGES } from "../shared/constants";

void verifyStateExecution();

async function verifyStateExecution() {
  verifyTransitionRegistry();
  await verifyIntegratedLegalTransition();
  await verifyRejectedInputs();
  await verifyIllegalAndDuplicateExecution();
  await verifyDeterministicExecution();
}

function verifyTransitionRegistry() {
  const registry = new StateTransitionRegistry();
  const definitions = registry.list();
  assert(definitions.length === 1, "only the Sprint 5.1 transition is registered");
  assert(Object.isFrozen(definitions), "transition registry is immutable");
  assert(Object.isFrozen(definitions[0]), "transition definition is immutable");
  assert(
    definitions[0].currentStage === CONVERSATION_STAGES.INITIALIZED
      && definitions[0].nextStage === CONVERSATION_STAGES.INTAKE,
    "registered transition is explicitly initialized to intake",
  );
  assert(
    definitions[0].requiredConditions.length === 5,
    "registered transition declares every required condition",
  );
  assert(
    registry.resolve("unknown-transition", 1).status === "failure",
    "unknown transition fails closed",
  );
}

async function verifyIntegratedLegalTransition() {
  const result = await new AiFoundationPrototypeOrchestrator()
    .runWithExecution("valid_intent");
  assert(result.status === "success", "integrated execution returns a snapshot");
  const snapshot = result.value;
  assert(
    snapshot.foundationDecision.decision === "accepted",
    "execution follows an accepted application decision",
  );
  assert(
    snapshot.foundationDecision.stateMutationAuthorized === false,
    "model-facing decision still cannot directly authorize mutation",
  );
  assert(snapshot.execution.success, "legal transition succeeds");
  assert(
    snapshot.execution.previousState?.stage === CONVERSATION_STAGES.INITIALIZED,
    "execution records the previous stage",
  );
  assert(
    snapshot.execution.newState?.stage === CONVERSATION_STAGES.INTAKE,
    "execution records the new stage",
  );
  assert(
    snapshot.conversationState.stage === CONVERSATION_STAGES.INTAKE
      && snapshot.conversationState.revision === 1,
    "integrated prototype advances its in-memory conversation",
  );
  assert(Object.isFrozen(snapshot.execution), "execution result is immutable");
  assert(
    Object.isFrozen(snapshot.execution.executionMetadata)
      && Object.isFrozen(snapshot.execution.newState),
    "execution metadata and state snapshots are immutable",
  );
}

async function verifyRejectedInputs() {
  const request = await approvedRequest();

  assertRejectedWithoutMutation(
    "raw AI output",
    '{"proposalType":"intent_interpretation"}',
    "MalformedExecutionRequest",
  );
  assertRejectedWithoutMutation(
    "parsed but unvalidated proposal",
    request.validation.proposal,
    "MalformedExecutionRequest",
  );
  assertRejectedWithoutMutation(
    "malformed decision",
    {
      ...request,
      applicationDecision: {
        ...request.applicationDecision,
        reasons: [],
      },
    },
    "DecisionNotApproved",
  );
  assertRejectedWithoutMutation(
    "unknown transition",
    { ...request, transitionIdentifier: "unknown-transition" },
    "UnknownTransition",
  );
  assertRejectedWithoutMutation(
    "unknown task",
    {
      ...request,
      identity: { ...request.identity, taskIdentifier: "unknown-task" },
    },
    "UnknownTask",
  );
  assertRejectedWithoutMutation(
    "unknown proposal type",
    {
      ...request,
      validation: {
        ...request.validation,
        proposal: {
          ...request.validation.proposal,
          proposalType: "unknown-proposal",
        },
      },
    },
    "UnknownProposalType",
  );
  assertRejectedWithoutMutation(
    "unvalidated proposal",
    {
      ...request,
      validation: {
        ...request.validation,
        status: "invalid",
        failures: ["RawOutputMalformed"],
      },
    },
    "ProposalNotValidated",
  );
  assertRejectedWithoutMutation(
    "cross-business execution",
    {
      ...request,
      identity: { ...request.identity, businessId: "another-business" },
      validation: {
        ...request.validation,
        proposal: {
          ...request.validation.proposal,
          businessId: "another-business",
        },
      },
    },
    "ScopeMismatch",
  );
  assertRejectedWithoutMutation(
    "stale state revision",
    {
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
    },
    "CurrentStateMismatch",
  );
  assertRejectedWithoutMutation(
    "incompatible output contract policy",
    {
      ...request,
      identity: {
        ...request.identity,
        outputContractIdentifier: "output_candidate_fact",
      },
      validation: {
        ...request.validation,
        proposal: {
          ...request.validation.proposal,
          outputContractIdentifier: "output_candidate_fact",
        },
      },
    },
    "PolicyViolation",
  );
  assertRejectedWithoutMutation(
    "duplicate decision with a noncanonical execution id",
    { ...request, executionId: "execution-alternate" },
    "PolicyViolation",
  );
}

async function verifyIllegalAndDuplicateExecution() {
  const request = await approvedRequest();
  const illegalManager = createManager();
  const advanced = illegalManager.apply({
    type: "transition-stage",
    scope: scope(),
    stage: CONVERSATION_STAGES.INTAKE,
  });
  assert(advanced.status === "success", "illegal-transition fixture advances");
  const beforeIllegal = snapshot(illegalManager);
  const illegal = new DeterministicStateExecutor(illegalManager).execute(request);
  assert(
    !illegal.success && illegal.reason === "CurrentStateMismatch",
    "known transition from the wrong current state fails",
  );
  assertEquivalent(
    snapshot(illegalManager),
    beforeIllegal,
    "illegal transition performs no mutation",
  );

  const manager = createManager();
  const executor = new DeterministicStateExecutor(manager);
  const first = executor.execute(request);
  const afterFirst = snapshot(manager);
  const duplicate = executor.execute(request);
  assert(first.success, "first unique execution succeeds");
  assert(
    !duplicate.success && duplicate.reason === "DuplicateExecution",
    "duplicate execution fails closed",
  );
  assertEquivalent(
    snapshot(manager),
    afterFirst,
    "duplicate rejection preserves state",
  );
  assert(
    executor.duplicateSnapshot().stateOperationAttemptCount === 1,
    "one state execution identity is registered",
  );
}

async function verifyDeterministicExecution() {
  const request = await approvedRequest();
  const firstManager = createManager();
  const secondManager = createManager();
  const first = new DeterministicStateExecutor(firstManager).execute(request);
  const second = new DeterministicStateExecutor(secondManager).execute(request);
  assertEquivalent(first, second, "fresh identical executions are deterministic");
  assertEquivalent(
    snapshot(firstManager),
    snapshot(secondManager),
    "deterministic executions produce equivalent stored state",
  );
  assert(first.previousState?.revision === 0, "execution records prior revision");
  assert(first.newState?.revision === 1, "execution increments revision once");
  assert(
    first.newState?.conversationId === first.previousState?.conversationId
      && first.newState?.businessProfileId
        === first.previousState?.businessProfileId
      && first.newState?.businessProfileVersion
        === first.previousState?.businessProfileVersion,
    "execution preserves conversation scope integrity",
  );
  assert(
    JSON.stringify(first.newState?.missingFields)
      === JSON.stringify(first.previousState?.missingFields),
    "stage execution does not alter unrelated conversation data",
  );
}

async function approvedRequest(): Promise<StateExecutionRequest> {
  const result = await new AiFoundationPrototypeOrchestrator().run("valid_intent");
  assert(result.status === "success", "approved fixture reaches a foundation decision");
  const proposalId = result.value.validation.proposal?.proposalId;
  assert(typeof proposalId === "string", "approved fixture has a proposal identity");
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

function assertRejectedWithoutMutation(
  label: string,
  input: unknown,
  reason: ReturnType<DeterministicStateExecutor["execute"]>["reason"],
) {
  const manager = createManager();
  const before = snapshot(manager);
  const result = new DeterministicStateExecutor(manager).execute(input);
  assert(!result.success && result.reason === reason, `${label} fails closed`);
  assertEquivalent(snapshot(manager), before, `${label} preserves state`);
}

function createManager() {
  const manager = new ConversationStateManager();
  const initialized = manager.initialize({
    ...scope(),
    requiredFields: initializedConversationState.missingFields,
    authorizedEscalationDestination:
      initializedConversationState.authorizedEscalationDestination,
  });
  assert(initialized.status === "success", "execution fixture initializes");
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
  assert(result.status === "success", "execution fixture snapshot is available");
  return result.state;
}

function assertEquivalent(first: unknown, second: unknown, label: string) {
  assert(JSON.stringify(first) === JSON.stringify(second), label);
}

function assert(condition: unknown, label: string): asserts condition {
  if (!condition) {
    throw new Error(`State execution verification failed: ${label}`);
  }
}
