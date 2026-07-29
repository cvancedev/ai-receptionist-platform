import type { StateExecutionRequest } from "../ai/execution/contracts";
import { DeterministicStateExecutor } from "../ai/execution/state-executor";
import { InMemoryExecutionJournal } from "../ai/execution-journal/in-memory-execution-journal";
import { StateTransitionRegistry } from "../ai/execution/transition-registry";
import { AiFoundationPrototypeOrchestrator } from "../ai/prototype/ai-foundation-orchestrator";
import { PrototypeReadModelIntegration } from "../prototype-ui/prototype-read-model-integration";
import type { PrototypeChatView } from "../prototype-ui/prototype-chat-session";
import { createPrototypeChatSession } from "../prototype-ui/prototype-chat-session";
import { createPrototypeFoundation } from "../prototype";
import type { ConversationState } from "../domain/conversation-state";
import { CONVERSATION_STAGES } from "../shared/constants";

void verifyPrototypeReadModelIntegration();

async function verifyPrototypeReadModelIntegration() {
  verifyInitializedIntegration();
  await verifyApprovedExecutionIntegration();
  await verifyRejectedExecutionIntegration();
  await verifyDuplicateUnknownAndStaleExecutionIntegration();
  verifyProjectionFailures();
  await verifyResetAndDeterminism();
  await verifyReadOnlyAndExecutionPaths();
  verifyCapabilityBoundary();
}

function verifyInitializedIntegration() {
  const view = createPrototypeChatSession().view();
  const model = readModel(view);
  assert(
    view.integration.mode === "read-only",
    "initialized integration is read-only",
  );
  assert(
    model.stage === CONVERSATION_STAGES.INITIALIZED && model.revision === 0,
    "initialized read model is available",
  );
  assert(view.integration.execution === null, "no execution is invented");
  assert(Object.isFrozen(view.integration), "integration result is immutable");
  assert(Object.isFrozen(model), "integrated read model is immutable");
}

async function verifyApprovedExecutionIntegration() {
  const session = createPrototypeChatSession();
  const initialized = readModel(session.view());
  const view = await session.submit("project help");
  const model = readModel(view);
  assert(
    view.integration.mode === "controlled-execution",
    "submitted flow reports controlled execution",
  );
  assert(
    view.integration.execution?.success === true
      && view.integration.execution.reason === "TransitionApplied",
    "approved execution summary reaches the integration",
  );
  assert(
    initialized.stage === CONVERSATION_STAGES.INITIALIZED
      && model.stage === CONVERSATION_STAGES.INTAKE,
    "controlled execution advances initialized state to intake",
  );
  assert(model.revision > initialized.revision, "updated revision is projected");
  assert(
    model.resolvedServiceId === "home-project-consultation",
    "resolved service identifier is projected after execution",
  );
  assert(
    model.status.canReleaseToCustomer === false
      && view.integration.decision?.customerReleaseAuthorized === false,
    "integration does not authorize customer release",
  );
}

async function verifyRejectedExecutionIntegration() {
  const foundation = createPrototypeFoundation();
  const orchestrator = new AiFoundationPrototypeOrchestrator({
    executionManager: foundation.conversationStateManager,
  });
  const rejected = await orchestrator.runWithExecution("malformed_output");
  assert(rejected.status === "success", "rejected execution returns current state");
  assert(!rejected.value.execution.success, "invalid proposal execution is rejected");
  const integrated = new PrototypeReadModelIntegration(
    foundation.businessProfile,
  ).project(rejected.value.conversationState, rejected.value);
  assert(integrated.status === "success", "rejected execution still projects");
  assert(
    integrated.readModel.stage === CONVERSATION_STAGES.INITIALIZED
      && integrated.readModel.revision === 0,
    "rejected execution preserves the previous read model",
  );
}

async function verifyDuplicateUnknownAndStaleExecutionIntegration() {
  const approved = await approvedRequest();

  const duplicateFoundation = createPrototypeFoundation();
  const duplicateExecutor = new DeterministicStateExecutor(
    duplicateFoundation.conversationStateManager,
  );
  const first = duplicateExecutor.execute(approved);
  const afterFirst = snapshot(duplicateFoundation);
  const duplicate = duplicateExecutor.execute(approved);
  const afterDuplicate = snapshot(duplicateFoundation);
  assert(first.success, "first execution succeeds");
  assert(
    !duplicate.success && duplicate.reason === "DuplicateExecution",
    "duplicate execution fails closed",
  );
  assertEquivalent(
    afterDuplicate,
    afterFirst,
    "duplicate execution preserves current state",
  );
  const integrator = new PrototypeReadModelIntegration(
    duplicateFoundation.businessProfile,
  );
  const firstModel = integrateExecution(integrator, approved, first, afterFirst);
  const duplicateModel = integrateExecution(
    integrator,
    approved,
    duplicate,
    afterDuplicate,
  );
  assertEquivalent(
    duplicateModel,
    firstModel,
    "duplicate execution preserves the previous read model",
  );

  const unknownFoundation = createPrototypeFoundation();
  const unknown = new DeterministicStateExecutor(
    unknownFoundation.conversationStateManager,
  ).execute({
    ...approved,
    transitionIdentifier: "unknown-transition",
  });
  assert(
    !unknown.success && unknown.reason === "UnknownTransition",
    "unknown transition fails closed",
  );
  const unknownModel = integrateExecution(
    new PrototypeReadModelIntegration(unknownFoundation.businessProfile),
    approved,
    unknown,
    snapshot(unknownFoundation),
  );
  assert(
    unknownModel.stage === CONVERSATION_STAGES.INITIALIZED,
    "unknown transition retains an initialized read model",
  );

  const staleFoundation = createPrototypeFoundation();
  const stale = new DeterministicStateExecutor(
    staleFoundation.conversationStateManager,
  ).execute({
    ...approved,
    expectedStateRevision: 1,
    identity: { ...approved.identity, stateRevision: 1 },
    validation: {
      ...approved.validation,
      proposal: approved.validation.proposal
        ? { ...approved.validation.proposal, stateRevision: 1 }
        : null,
    },
  });
  assert(
    !stale.success && stale.reason === "CurrentStateMismatch",
    "stale revision fails closed",
  );
  const staleModel = integrateExecution(
    new PrototypeReadModelIntegration(staleFoundation.businessProfile),
    approved,
    stale,
    snapshot(staleFoundation),
  );
  assert(
    staleModel.stage === CONVERSATION_STAGES.INITIALIZED,
    "stale execution retains the current read model",
  );
}

function verifyProjectionFailures() {
  const foundation = createPrototypeFoundation();
  const integrator = new PrototypeReadModelIntegration(
    foundation.businessProfile,
  );
  const malformed = integrator.project({});
  assert(
    malformed.status === "projection-failure"
      && malformed.readModel === null,
    "malformed projection input fails closed",
  );
  assert(
    !("conversationState" in malformed) && !("state" in malformed),
    "projection failure exposes no raw state fallback",
  );

  const mismatch = snapshot(foundation);
  mismatch.missingFields = [...mismatch.missingFields, "unknown-required-field"];
  const mismatched = integrator.project(mismatch);
  assert(
    mismatched.status === "projection-failure"
      && mismatched.readModel === null,
    "projection-context mismatch fails closed",
  );
}

async function verifyResetAndDeterminism() {
  const session = createPrototypeChatSession();
  await session.submit("project help");
  const reset = session.reset();
  assert(
    readModel(reset).stage === CONVERSATION_STAGES.INITIALIZED
      && readModel(reset).revision === 0,
    "reset returns the initialized read model",
  );
  assert(
    reset.integration.execution === null
      && reset.integration.decision === null,
    "reset clears controlled-execution summaries",
  );

  const first = await createPrototypeChatSession().submit("project help");
  const second = await createPrototypeChatSession().submit("project help");
  assertEquivalent(
    first.integration,
    second.integration,
    "identical inputs produce identical integration results",
  );
}

async function verifyReadOnlyAndExecutionPaths() {
  const foundation = createPrototypeFoundation();
  const orchestrator = new AiFoundationPrototypeOrchestrator({
    executionManager: foundation.conversationStateManager,
  });
  const before = snapshot(foundation);
  const readOnly = await orchestrator.run("valid_intent");
  const afterReadOnly = snapshot(foundation);
  assert(readOnly.status === "success", "read-only run remains available");
  assertEquivalent(afterReadOnly, before, "run remains read-only");

  const controlled = await new AiFoundationPrototypeOrchestrator({
    executionManager: foundation.conversationStateManager,
  }).runWithExecution("valid_intent");
  const afterControlled = snapshot(foundation);
  assert(
    controlled.status === "success"
      && controlled.value.execution.success,
    "runWithExecution remains execution-enabled",
  );
  assert(
    afterControlled.stage === CONVERSATION_STAGES.INTAKE,
    "only controlled path advances the stage",
  );
}

function verifyCapabilityBoundary() {
  const view = createPrototypeChatSession().view();
  assert(!("state" in view), "UI-facing view exposes no raw state");
  assert(
    !("conversationState" in view.integration),
    "integration exposes no execution state snapshot",
  );
  assert(
    !("manager" in view.integration)
      && !("executor" in view.integration)
      && !("execute" in view.integration),
    "integration exposes no manager or execution capability",
  );
  assert(
    new StateTransitionRegistry().list().length === 1,
    "Sprint 5.3 introduces no transition",
  );
  assert(
    !containsFunction(view.integration),
    "UI-facing integration contains no callback",
  );
}

async function approvedRequest(): Promise<StateExecutionRequest> {
  const foundation = createPrototypeFoundation();
  const result = await new AiFoundationPrototypeOrchestrator({
    executionManager: foundation.conversationStateManager,
  }).run("valid_intent");
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

function integrateExecution(
  integrator: PrototypeReadModelIntegration,
  request: StateExecutionRequest,
  execution: ReturnType<DeterministicStateExecutor["execute"]>,
  state: ConversationState,
) {
  const journalAppend = new InMemoryExecutionJournal().append(execution);
  const integrated = integrator.project(state, {
    foundationDecision: request.applicationDecision,
    execution,
    journalAppend,
    conversationState: state,
  });
  assert(integrated.status === "success", "execution result projects safely");
  return integrated.readModel;
}

function snapshot(
  foundation: ReturnType<typeof createPrototypeFoundation>,
): ConversationState {
  const result = foundation.conversationStateManager.snapshot({
    conversationId: foundation.conversationState.conversationId,
    businessProfileId: foundation.businessProfile.id,
    businessProfileVersion: foundation.businessProfile.version,
  });
  assert(result.status === "success", "integration state snapshot is available");
  return result.state;
}

function readModel(view: PrototypeChatView) {
  assert(view.integration.status === "success", "read model is available");
  return view.integration.readModel;
}

function containsFunction(value: unknown): boolean {
  if (typeof value === "function") return true;
  if (!value || typeof value !== "object") return false;
  return Object.values(value).some(containsFunction);
}

function assertEquivalent(first: unknown, second: unknown, label: string) {
  assert(JSON.stringify(first) === JSON.stringify(second), label);
}

function assert(condition: boolean, label: string): asserts condition {
  if (!condition) {
    throw new Error(`Prototype read-model integration failed: ${label}`);
  }
}
