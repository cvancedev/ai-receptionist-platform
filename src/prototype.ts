import { ConversationStateManager } from "./conversation/conversation-state-manager";
import type { ConversationScope } from "./conversation/conversation-state-updates";
import { fictionalBusinessProfile } from "./fixtures/business-profile";
import { fictionalKnowledgeRecords } from "./fixtures/knowledge";
import { MockModelGateway, type ModelGateway } from "./model/model-gateway";
import { COMPLETION_STATES, CONVERSATION_STAGES } from "./shared/constants";
import type { ConversationState } from "./domain/conversation-state";
import { DeterministicConversationEngine } from "./conversation/conversation-engine";
import { DeterministicHandoffBuilder, type HandoffBuildResult } from "./handoff/handoff-builder";
import type { DeterministicIntakeResult } from "./domain/intake";

export interface PrototypeFoundation {
  businessProfile: typeof fictionalBusinessProfile;
  knowledge: typeof fictionalKnowledgeRecords;
  conversationStateManager: ConversationStateManager;
  conversationState: ConversationState;
  modelGateway: ModelGateway;
}

/** Instantiates the isolated, in-memory foundation without changing the UI. */
export function createPrototypeFoundation(): PrototypeFoundation {
  const conversationStateManager = new ConversationStateManager();
  const initialized = conversationStateManager.initialize({
    conversationId: "fictional-conversation-001",
    businessProfileId: fictionalBusinessProfile.id,
    businessProfileVersion: fictionalBusinessProfile.version,
    requiredFields: ["requested-service"],
    authorizedEscalationDestination:
      fictionalBusinessProfile.escalation.destination,
  });
  if (initialized.status === "failure") {
    throw new Error("The fictional prototype fixture could not be initialized.");
  }
  return {
    businessProfile: fictionalBusinessProfile,
    knowledge: fictionalKnowledgeRecords,
    conversationStateManager,
    conversationState: initialized.state,
    modelGateway: new MockModelGateway(),
  };
}

export interface DeterministicIntakeDemonstration {
  successful: { intake: DeterministicIntakeResult; handoff: HandoffBuildResult };
  correction: DeterministicIntakeResult;
  unsupported: DeterministicIntakeResult;
  ambiguous: DeterministicIntakeResult;
}

export function runDeterministicIntakeDemonstration(): DeterministicIntakeDemonstration {
  const successfulFoundation = createPrototypeFoundation();
  const successfulEngine = new DeterministicConversationEngine(
    successfulFoundation.businessProfile,
    successfulFoundation.conversationStateManager,
    successfulFoundation.conversationState.conversationId,
  );
  successfulEngine.initializeIntake("project help", "fictional-service-message");
  answerNext(successfulEngine, "customer-name", "Jordan Example", "fictional-name-message");
  answerNext(successfulEngine, "contact-method", "Fictional written follow-up", "fictional-contact-message");
  answerNext(successfulEngine, "project-description", "A fictional room needs a routine project review.", "fictional-description-message");
  answerNext(successfulEngine, "service-location", "North Harbor", "fictional-location-message");
  successfulEngine.coordinateReadiness();
  successfulEngine.correctAnswer("service-location", "Maple Glen", "fictional-correction-message");
  const correction = successfulEngine.evaluate();
  answerNext(successfulEngine, "service-location", "Maple Glen", "fictional-corrected-location-message");
  successfulEngine.coordinateReadiness();
  const successful = successfulEngine.confirmIntake();
  const successfulState = successfulFoundation.conversationStateManager.snapshot({
    conversationId: successfulFoundation.conversationState.conversationId,
    businessProfileId: successfulFoundation.businessProfile.id,
    businessProfileVersion: successfulFoundation.businessProfile.version,
  });
  if (successfulState.status === "failure") throw new Error("Successful fictional state is unavailable.");
  const handoff = new DeterministicHandoffBuilder().build(successfulFoundation.businessProfile, successfulState.state);

  const unsupportedFoundation = createPrototypeFoundation();
  const unsupported = new DeterministicConversationEngine(unsupportedFoundation.businessProfile, unsupportedFoundation.conversationStateManager, unsupportedFoundation.conversationState.conversationId).initializeIntake("unconfigured fictional roofing", "fictional-unsupported-message");
  const ambiguousFoundation = createPrototypeFoundation();
  const ambiguous = new DeterministicConversationEngine(ambiguousFoundation.businessProfile, ambiguousFoundation.conversationStateManager, ambiguousFoundation.conversationState.conversationId).initializeIntake("consultation", "fictional-ambiguous-message");
  return { successful: { intake: successful, handoff }, correction, unsupported, ambiguous };
}

function answerNext(engine: DeterministicConversationEngine, expectedField: string, value: string, source: string) {
  const question = engine.selectAndMarkNextQuestion();
  if (question.status !== "selected" || question.field.id !== expectedField) throw new Error(`Unexpected fictional intake question for ${expectedField}.`);
  engine.applyAnswer(expectedField, value, source);
}

export interface PrototypeStateDemonstration {
  initialSnapshot: ConversationState;
  finalSnapshot: ConversationState;
  invalidTransitionRejected: boolean;
}

export function runPrototypeStateDemonstration(): PrototypeStateDemonstration {
  const foundation = createPrototypeFoundation();
  const manager = foundation.conversationStateManager;
  const scope: ConversationScope = {
    conversationId: foundation.conversationState.conversationId,
    businessProfileId: foundation.businessProfile.id,
    businessProfileVersion: foundation.businessProfile.version,
  };
  const initialSnapshot = requireState(manager.snapshot(scope));
  applyRequired(manager, { type: "transition-stage", scope, stage: CONVERSATION_STAGES.INTAKE });
  const invalid = manager.apply({ type: "transition-stage", scope, stage: CONVERSATION_STAGES.COMPLETED });
  applyRequired(manager, { type: "record-claim", scope, field: "requested-service", value: "Home Project Consultation", source: "fictional-message-001" });
  applyRequired(manager, { type: "confirm-fact", scope, field: "requested-service", value: "Home Project Consultation", source: "application-confirmation-001" });
  applyRequired(manager, { type: "mark-question-asked", scope, questionId: "ask-customer-name" });
  applyRequired(manager, { type: "record-claim", scope, field: "customer-name", value: "Jamie Reed", source: "fictional-message-002" });
  applyRequired(manager, { type: "confirm-fact", scope, field: "customer-name", value: "Jamie Reed", source: "application-confirmation-002" });
  applyRequired(manager, { type: "transition-stage", scope, stage: CONVERSATION_STAGES.CONFIRMATION });
  applyRequired(manager, { type: "correct-value", scope, field: "customer-name", correctedValue: "Jamie Rivera", source: "fictional-message-003", reason: "Customer corrected the name." });
  applyRequired(manager, { type: "confirm-fact", scope, field: "customer-name", value: "Jamie Rivera", source: "application-confirmation-003" });
  const finalSnapshot = requireState(manager.snapshot(scope));
  if (finalSnapshot.completionState !== COMPLETION_STATES.NOT_READY) {
    throw new Error("The partial demonstration must remain incomplete.");
  }
  return {
    initialSnapshot,
    finalSnapshot,
    invalidTransitionRejected: invalid.status === "failure",
  };
}

function applyRequired(
  manager: ConversationStateManager,
  update: Parameters<ConversationStateManager["apply"]>[0],
) {
  const result = manager.apply(update);
  if (result.status !== "success") throw new Error("A required fictional state update failed.");
  return result.state;
}

function requireState(result: ReturnType<ConversationStateManager["snapshot"]>) {
  if (result.status === "failure") throw new Error("A fictional state snapshot could not be read.");
  return result.state;
}
