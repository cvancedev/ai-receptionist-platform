import { ConversationStateManager } from "../conversation/conversation-state-manager";
import { getConfirmedValue, getCurrentValue, getLatestCorrection, wasQuestionAsked } from "../conversation/conversation-state-selectors";
import type { ConversationScope, ConversationStateUpdate } from "../conversation/conversation-state-updates";
import { runPrototypeStateDemonstration } from "../prototype";
import { COMPLETION_STATES, CONVERSATION_STAGES, ESCALATION_STATES } from "../shared/constants";

const scope: ConversationScope = {
  conversationId: "verification-conversation",
  businessProfileId: "fictional-verification-business",
  businessProfileVersion: 1,
};

verifyInitialization();
verifyTransitionsClaimsFactsAndCorrections();
verifyMissingFieldsAndQuestions();
verifyEscalationAndCompletion();
verifyIsolationAndImmutability();
verifyPrototypeDemonstration();

function verifyInitialization() {
  const manager = new ConversationStateManager();
  assert(manager.initialize({ ...scope, requiredFields: ["customer-name"] }).status === "success", "valid initialization");
  assert(manager.initialize({ ...scope, requiredFields: ["customer-name"] }).status === "failure", "duplicate initialization");
  assert(new ConversationStateManager().initialize({ ...scope, conversationId: "", requiredFields: [] }).status === "failure", "missing identifier");
  assert(new ConversationStateManager().initialize({ ...scope, requiredFields: ["customer-name", "customer-name"] }).status === "failure", "duplicate required fields");
}

function verifyTransitionsClaimsFactsAndCorrections() {
  const manager = createManager(["customer-name"]);
  succeed(manager, { type: "transition-stage", scope, stage: CONVERSATION_STAGES.INTAKE });
  assert(manager.apply({ type: "transition-stage", scope, stage: CONVERSATION_STAGES.COMPLETED }).status === "failure", "invalid transition fails closed");
  succeed(manager, { type: "record-claim", scope, field: "customer-name", value: "Alex North", source: "fictional-message-1" });
  assert(manager.apply({ type: "record-claim", scope, field: "customer-name", value: "Alex North", source: "fictional-message-2" }).status === "no-op", "identical claim is a no-op");
  succeed(manager, { type: "record-claim", scope, field: "customer-name", value: "Alex West", source: "fictional-message-3" });
  let state = read(manager);
  assert(state.customerClaims.length === 2, "conflicting claims remain visible");
  assert(getConfirmedValue(state, "customer-name") === undefined, "claim is not automatically confirmed");
  succeed(manager, { type: "confirm-fact", scope, field: "customer-name", value: "Alex North", source: "application-confirmation" });
  succeed(manager, { type: "set-completion", scope, status: COMPLETION_STATES.READY_FOR_CONFIRMATION });
  succeed(manager, { type: "transition-stage", scope, stage: CONVERSATION_STAGES.CONFIRMATION });
  const beforeCorrection = read(manager);
  succeed(manager, { type: "correct-value", scope, field: "customer-name", correctedValue: "Alex Rivera", source: "fictional-message-4", reason: "Customer correction" });
  state = read(manager);
  assert(beforeCorrection.confirmedFacts["customer-name"].value === "Alex North", "prior snapshot keeps prior fact");
  assert(state.stage === CONVERSATION_STAGES.INTAKE, "correction returns confirmation to intake");
  assert(state.completionState === COMPLETION_STATES.NOT_READY, "correction revokes readiness");
  assert(state.missingFields.includes("customer-name"), "correction reopens required field");
  assert(getCurrentValue(state, "customer-name") === "Alex Rivera", "corrected value is current");
  assert(getLatestCorrection(state, "customer-name")?.previousValue === "Alex North", "correction preserves prior value");
  succeed(manager, { type: "confirm-fact", scope, field: "customer-name", value: "Alex Rivera", source: "application-confirmation-2" });
  assert(getConfirmedValue(read(manager), "customer-name") === "Alex Rivera", "corrected value can be confirmed");
}

function verifyMissingFieldsAndQuestions() {
  const manager = createManager(["customer-name"]);
  assert(manager.apply({ type: "add-missing-field", scope, field: "customer-name" }).status === "no-op", "duplicate missing field is prevented");
  succeed(manager, { type: "add-missing-field", scope, field: "contact-method" });
  succeed(manager, { type: "resolve-missing-field", scope, field: "contact-method" });
  assert(manager.apply({ type: "resolve-missing-field", scope, field: "unknown" }).status === "no-op", "unknown resolution is explicit");
  succeed(manager, { type: "mark-question-asked", scope, questionId: "ask-name" });
  assert(manager.apply({ type: "mark-question-asked", scope, questionId: "ask-name" }).status === "no-op", "duplicate question is prevented");
  assert(wasQuestionAsked(read(manager), "ask-name"), "question history is readable");
}

function verifyEscalationAndCompletion() {
  const escalationManager = createManager([], "Fictional customer care team");
  succeed(escalationManager, { type: "transition-stage", scope, stage: CONVERSATION_STAGES.INTAKE });
  succeed(escalationManager, {
    type: "set-escalation",
    scope,
    status: ESCALATION_STATES.REQUESTED_BY_CUSTOMER,
    reason: "Customer requested a person.",
    triggerSource: "fictional-message",
    destination: "Fictional customer care team",
  });
  assert(read(escalationManager).stage === CONVERSATION_STAGES.ESCALATION, "customer request activates escalation");
  assert(escalationManager.apply({ type: "set-escalation", scope, status: ESCALATION_STATES.NONE, reason: null, triggerSource: null }).status === "failure", "required escalation cannot be cleared");
  assert(escalationManager.apply({ type: "set-completion", scope, status: COMPLETION_STATES.READY_FOR_HANDOFF }).status === "failure", "escalation blocks ordinary completion");

  const manager = createManager(["customer-name"]);
  succeed(manager, { type: "transition-stage", scope, stage: CONVERSATION_STAGES.INTAKE });
  assert(manager.apply({ type: "set-completion", scope, status: COMPLETION_STATES.READY_FOR_CONFIRMATION }).status === "failure", "missing fields block readiness");
  succeed(manager, { type: "confirm-fact", scope, field: "customer-name", value: "Taylor Example", source: "application-confirmation" });
  succeed(manager, { type: "set-completion", scope, status: COMPLETION_STATES.READY_FOR_CONFIRMATION });
  succeed(manager, { type: "transition-stage", scope, stage: CONVERSATION_STAGES.CONFIRMATION });
  succeed(manager, { type: "set-completion", scope, status: COMPLETION_STATES.READY_FOR_HANDOFF });
  succeed(manager, { type: "transition-stage", scope, stage: CONVERSATION_STAGES.HANDOFF });
  succeed(manager, { type: "set-completion", scope, status: COMPLETION_STATES.COMPLETED });
  assert(read(manager).finalSnapshot?.completionStatus === COMPLETION_STATES.COMPLETED, "completion preserves final snapshot");

  const abandonedManager = createManager([]);
  succeed(abandonedManager, { type: "set-completion", scope, status: COMPLETION_STATES.ABANDONED });
  assert(read(abandonedManager).completionState === COMPLETION_STATES.ABANDONED, "abandoned remains distinct");
}

function verifyIsolationAndImmutability() {
  const manager = createManager(["customer-name"]);
  const before = read(manager);
  succeed(manager, { type: "record-claim", scope, field: "customer-name", value: "Morgan Example", source: "fictional-message" });
  const after = read(manager);
  assert(before !== after && before.customerClaims !== after.customerClaims, "updates create independent nested snapshots");
  assert(before.customerClaims.length === 0, "previous snapshot remains unchanged");
  assert(manager.read({ ...scope, businessProfileId: "wrong-business" }).status === "failure", "cross-business read fails closed");
  assert(manager.apply({ type: "add-missing-field", scope: { ...scope, businessProfileId: "wrong-business" }, field: "x" }).status === "failure", "cross-business update fails closed");
  assert(manager.apply({ type: "add-missing-field", scope: { ...scope, conversationId: "wrong-conversation" }, field: "x" }).status === "failure", "cross-conversation update fails closed");
  assert(manager.apply({ type: "add-missing-field", scope: { ...scope, businessProfileVersion: 2 }, field: "x" }).status === "failure", "profile mismatch fails closed");
}

function verifyPrototypeDemonstration() {
  const demonstration = runPrototypeStateDemonstration();
  assert(demonstration.invalidTransitionRejected, "prototype rejects invalid transition");
  assert(demonstration.initialSnapshot.customerClaims.length === 0, "prototype initial snapshot remains unchanged");
  assert(demonstration.finalSnapshot.corrections.length === 1, "prototype preserves correction history");
  assert(demonstration.finalSnapshot.askedQuestions.length === 1, "prototype tracks asked questions");
}

function createManager(requiredFields: readonly string[], destination: string | null = null) {
  const manager = new ConversationStateManager();
  assert(manager.initialize({ ...scope, requiredFields, authorizedEscalationDestination: destination }).status === "success", "test fixture initializes");
  return manager;
}

function succeed(manager: ConversationStateManager, update: ConversationStateUpdate) {
  const result = manager.apply(update);
  assert(result.status === "success", `operation succeeds: ${update.type}`);
  return result.state;
}

function read(manager: ConversationStateManager) {
  const result = manager.snapshot(scope);
  assert(result.status === "success", "snapshot succeeds");
  return result.state;
}

function assert(condition: boolean, label: string): asserts condition {
  if (!condition) throw new Error(`Prototype verification failed: ${label}`);
}
