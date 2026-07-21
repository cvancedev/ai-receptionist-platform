import type { BusinessProfile } from "../domain/business-profile";
import type { ConversationState } from "../domain/conversation-state";
import type { KnowledgeRecord } from "../domain/knowledge-record";
import type { ModelProposal } from "../domain/model-proposal";

export interface ModelGatewayRequest {
  businessProfile: BusinessProfile;
  knowledge: readonly KnowledgeRecord[];
  conversationState: ConversationState;
  customerMessage: string;
}

export interface ModelGateway {
  request(request: ModelGatewayRequest): Promise<ModelProposal>;
}

/** Local deterministic stand-in. It performs no AI, prompt, API, or network work. */
export class MockModelGateway implements ModelGateway {
  request(request: ModelGatewayRequest): Promise<ModelProposal> {
    void request;

    return Promise.resolve({
      customerResponse:
        "Thanks for contacting Friendly Home Services. I'm ready to learn how we can help.",
      proposedStateUpdates: [],
      proposedAction: "ask-question",
      escalationRecommendation: { recommended: false },
      completionRecommendation: {
        recommended: false,
        missingFields: [
          "customer-name",
          "contact-method",
          "requested-service",
          "project-description",
        ],
      },
    });
  }
}
