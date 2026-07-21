import { ConversationStateManager } from "./conversation/conversation-state-manager";
import type { ConversationScope } from "./conversation/conversation-state-updates";
import { fictionalBusinessProfile } from "./fixtures/business-profile";
import { fictionalKnowledgeRecords } from "./fixtures/knowledge";
import { MockModelGateway, type ModelGateway } from "./model/model-gateway";
import { COMPLETION_STATES, CONVERSATION_STAGES } from "./shared/constants";
import type { ConversationState } from "./domain/conversation-state";

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
    requiredFields: [
      "customer-name",
      "contact-method",
      "requested-service",
      "project-description",
    ],
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

export const prototypeFoundation = createPrototypeFoundation();

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
