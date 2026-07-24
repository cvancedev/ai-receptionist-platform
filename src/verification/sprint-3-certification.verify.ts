import { ConversationStateManager } from "../conversation/conversation-state-manager";
import type { ConversationScope, ConversationStateUpdate } from "../conversation/conversation-state-updates";
import { resolveService } from "../conversation/service-resolution";
import type { ConversationState } from "../domain/conversation-state";
import { fictionalBusinessProfile } from "../fixtures/business-profile";
import { initializedConversationState } from "../fixtures/conversation";
import { fictionalKnowledgeRecords } from "../fixtures/knowledge";
import { DeterministicHandoffBuilder } from "../handoff/handoff-builder";
import { MockModelGateway } from "../model/model-gateway";
import { createPrototypeFoundation, runDeterministicIntakeDemonstration } from "../prototype";
import { createPrototypeChatSession } from "../prototype-ui/prototype-chat-session";
import { COMPLETION_STATES, CONVERSATION_STAGES, ESCALATION_STATES } from "../shared/constants";
import { validateBusinessProfile } from "../validation/business-profile-validation";
import { validateConversationState } from "../validation/conversation-state-validation";
import { validateKnowledge } from "../validation/knowledge-validation";
import { validateModelProposal } from "../validation/model-proposal-validation";

void certifySprint3();

async function certifySprint3() {
  await verifyFoundation();
  await scenarioACompleteSuccessfulIntake();
  await scenarioBCorrectionAfterConfirmation();
  await scenarioCUnsupportedService();
  await scenarioDAmbiguousService();
  scenarioECustomerRequestsEscalation();
  scenarioFAbandonedConversation();
  scenarioGCrossBusinessIsolation();
  scenarioHProfileVersionMismatch();
  scenarioIInvalidTransitionRejection();
  await scenarioJEquivalentRepeatedExecution();
}

async function verifyFoundation() {
  assert(validateBusinessProfile(fictionalBusinessProfile).valid, "fictional Business Profile validates");
  assert(validateConversationState(initializedConversationState).valid, "fictional conversation fixture validates");
  assert(validateKnowledge(fictionalKnowledgeRecords, fictionalBusinessProfile.id).valid, "fictional knowledge validates in business scope");

  const foundation = createPrototypeFoundation();
  const request = {
    businessProfile: foundation.businessProfile,
    knowledge: foundation.knowledge,
    conversationState: foundation.conversationState,
    customerMessage: "Fictional customer request",
  };
  const gateway = new MockModelGateway();
  const first = await gateway.request(request);
  const second = await gateway.request(request);
  assert(JSON.stringify(first) === JSON.stringify(second), "mock gateway returns equivalent output for identical input");
  assert(validateModelProposal(first).valid, "mock proposal passes active structural validation");
  assert(!validateKnowledge([{ ...fictionalKnowledgeRecords[0], businessProfileId: "another-business" }], fictionalBusinessProfile.id).valid, "knowledge validator rejects cross-business scope");
  assert(!validateModelProposal({ ...first, customerResponse: "" }).valid, "model proposal validator rejects missing response");
}

async function scenarioACompleteSuccessfulIntake() {
  const view = await completeSession(createPrototypeChatSession());
  assert(readModel(view).stage === CONVERSATION_STAGES.HANDOFF, "Scenario A reaches handoff");
  assert(Boolean(view.handoff), "Scenario A creates a validated handoff");
  assert(view.handoff?.missingInformation.length === 0, "Scenario A has no missing required information");
}

async function scenarioBCorrectionAfterConfirmation() {
  const session = createPrototypeChatSession();
  await reachConfirmation(session);
  let view = await session.submit("correct service-location: Maple Glen");
  assert(readModel(view).stage === CONVERSATION_STAGES.INTAKE, "Scenario B correction reopens intake");
  assert(readModel(view).corrections[0]?.previousValue === "North Harbor", "Scenario B retains the superseded value");
  assert(readModel(view).missingRequiredFields.includes("service-location"), "Scenario B reopens the corrected required field");
  view = await session.submit("Maple Glen");
  view = await session.submit("confirm");
  assert(view.handoff?.confirmedFacts["service-location"] === "Maple Glen", "Scenario B handoff uses only the corrected confirmed value");
  assert(view.handoff?.corrections.length === 1, "Scenario B handoff retains correction history");
}

async function scenarioCUnsupportedService() {
  const view = await createPrototypeChatSession().submit("fictional unsupported roofing");
  assert(readModel(view).stage === CONVERSATION_STAGES.ESCALATION, "Scenario C escalates unsupported service");
  assert(readModel(view).resolvedServiceId === null && view.handoff === null, "Scenario C invents no service or handoff");
}

async function scenarioDAmbiguousService() {
  const session = createPrototypeChatSession();
  let view = await session.submit("consultation");
  assert(readModel(view).stage === CONVERSATION_STAGES.CLARIFICATION, "Scenario D enters clarification");
  assert(readModel(view).resolvedServiceId === null, "Scenario D does not guess between candidates");
  view = await session.submit("Seasonal Home Check-In");
  assert(readModel(view).stage === CONVERSATION_STAGES.INTAKE, "Scenario D resumes intake after exact clarification");
  assert(readModel(view).resolvedServiceId === "seasonal-home-check-in", "Scenario D resolves only the clarified service");
}

function scenarioECustomerRequestsEscalation() {
  const { manager, scope } = createStateContext([], "certification-human-request");
  apply(manager, { type: "transition-stage", scope, stage: CONVERSATION_STAGES.INTAKE });
  apply(manager, {
    type: "set-escalation",
    scope,
    status: ESCALATION_STATES.REQUESTED_BY_CUSTOMER,
    reason: "Customer requested a person.",
    triggerSource: "fictional-customer-message",
    destination: fictionalBusinessProfile.escalation.destination,
  });
  const state = snapshot(manager, scope);
  assert(state.stage === CONVERSATION_STAGES.ESCALATION, "Scenario E honors a customer request for a person");
  assert(state.escalation.destination === fictionalBusinessProfile.escalation.destination, "Scenario E uses the authorized business destination");
}

function scenarioFAbandonedConversation() {
  const { manager, scope } = createStateContext(["customer-name"], "certification-abandoned");
  apply(manager, { type: "transition-stage", scope, stage: CONVERSATION_STAGES.INTAKE });
  apply(manager, { type: "record-claim", scope, field: "requested-service", value: "project help", source: "fictional-customer-message" });
  apply(manager, { type: "set-completion", scope, status: COMPLETION_STATES.ABANDONED });
  const state = snapshot(manager, scope);
  assert(state.stage === CONVERSATION_STAGES.ABANDONED, "Scenario F reaches the distinct abandoned stage");
  assert(state.finalSnapshot?.customerClaims.length === 1, "Scenario F preserves useful partial context");
}

function scenarioGCrossBusinessIsolation() {
  const { manager, scope } = createStateContext([], "certification-isolation");
  assert(manager.read({ ...scope, businessProfileId: "another-business" }).status === "failure", "Scenario G rejects cross-business reads");
  assert(manager.apply({ type: "add-missing-field", scope: { ...scope, businessProfileId: "another-business" }, field: "x" }).status === "failure", "Scenario G rejects cross-business updates");
  assert(new DeterministicHandoffBuilder().build({ ...fictionalBusinessProfile, id: "another-business" }, snapshot(manager, scope)).status === "failure", "Scenario G rejects cross-business handoff construction");
}

function scenarioHProfileVersionMismatch() {
  const foundation = createPrototypeFoundation();
  const mismatched = { ...foundation.conversationState, businessProfileVersion: fictionalBusinessProfile.version + 1 };
  assert(resolveService(fictionalBusinessProfile, mismatched, "project help").status === "blocked", "Scenario H blocks service resolution across profile versions");
  assert(!validateBusinessProfile(fictionalBusinessProfile, { id: fictionalBusinessProfile.id, version: fictionalBusinessProfile.version + 1 }).valid, "Scenario H rejects profile-version mismatch during validation");
}

function scenarioIInvalidTransitionRejection() {
  const { manager, scope } = createStateContext([], "certification-invalid-transition");
  const result = manager.apply({ type: "transition-stage", scope, stage: CONVERSATION_STAGES.HANDOFF });
  assert(result.status === "failure", "Scenario I rejects an invalid direct handoff transition");
  assert(snapshot(manager, scope).stage === CONVERSATION_STAGES.INITIALIZED, "Scenario I leaves state unchanged after rejection");
}

async function scenarioJEquivalentRepeatedExecution() {
  const first = runDeterministicIntakeDemonstration();
  const second = runDeterministicIntakeDemonstration();
  assert(JSON.stringify(first) === JSON.stringify(second), "Scenario J produces equivalent deterministic domain results");

  const firstView = await completeSession(createPrototypeChatSession());
  const secondView = await completeSession(createPrototypeChatSession());
  assert(JSON.stringify(firstView) === JSON.stringify(secondView), "Scenario J produces equivalent deterministic UI projections");
}

async function completeSession(session: ReturnType<typeof createPrototypeChatSession>) {
  await reachConfirmation(session);
  return session.submit("confirm");
}

async function reachConfirmation(session: ReturnType<typeof createPrototypeChatSession>) {
  await session.submit("project help");
  await session.submit("Riley Example");
  await session.submit("Fictional written follow-up");
  await session.submit("A fictional room needs a routine review.");
  return session.submit("North Harbor");
}

function readModel(
  view: Awaited<ReturnType<ReturnType<typeof createPrototypeChatSession>["submit"]>>,
) {
  assert(view.integration.status === "success", "UI projection is available");
  return view.integration.readModel;
}

function createStateContext(requiredFields: readonly string[], conversationId: string) {
  const manager = new ConversationStateManager();
  const scope: ConversationScope = {
    conversationId,
    businessProfileId: fictionalBusinessProfile.id,
    businessProfileVersion: fictionalBusinessProfile.version,
  };
  const initialized = manager.initialize({
    ...scope,
    requiredFields,
    authorizedEscalationDestination: fictionalBusinessProfile.escalation.destination,
  });
  assert(initialized.status === "success", "certification state context initializes");
  return { manager, scope };
}

function apply(manager: ConversationStateManager, update: ConversationStateUpdate) {
  const result = manager.apply(update);
  assert(result.status === "success", `certification operation succeeds: ${update.type}`);
  return result.state;
}

function snapshot(manager: ConversationStateManager, scope: ConversationScope): ConversationState {
  const result = manager.snapshot(scope);
  assert(result.status === "success", "certification snapshot is available");
  return result.state;
}

function assert(condition: boolean, label: string): asserts condition {
  if (!condition) throw new Error(`Sprint 3 certification failed: ${label}`);
}
