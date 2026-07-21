import { fictionalBusinessProfile } from "./fixtures/business-profile";
import { initializedConversationState } from "./fixtures/conversation";
import { fictionalKnowledgeRecords } from "./fixtures/knowledge";
import { MockModelGateway, type ModelGateway } from "./model/model-gateway";

export interface PrototypeFoundation {
  businessProfile: typeof fictionalBusinessProfile;
  knowledge: typeof fictionalKnowledgeRecords;
  conversationState: typeof initializedConversationState;
  modelGateway: ModelGateway;
}

/** Instantiates the isolated, in-memory foundation without changing the UI. */
export function createPrototypeFoundation(): PrototypeFoundation {
  return {
    businessProfile: fictionalBusinessProfile,
    knowledge: fictionalKnowledgeRecords,
    conversationState: initializedConversationState,
    modelGateway: new MockModelGateway(),
  };
}

export const prototypeFoundation = createPrototypeFoundation();
