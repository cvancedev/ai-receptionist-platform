import type { ConversationState } from "../domain/conversation-state";
import {
  COMPLETION_STATES,
  CONVERSATION_STAGES,
  ESCALATION_STATES,
} from "../shared/constants";

export const initializedConversationState: ConversationState = {
  conversationId: "fictional-conversation-001",
  businessProfileId: "friendly-home-services",
  businessProfileVersion: 1,
  authorizedEscalationDestination: "Fictional customer care team",
  revision: 0,
  stage: CONVERSATION_STAGES.INITIALIZED,
  confirmedFacts: {},
  customerClaims: [],
  corrections: [],
  missingFields: [
    "customer-name",
    "contact-method",
    "requested-service",
    "project-description",
  ],
  askedQuestions: [],
  escalation: {
    status: ESCALATION_STATES.NONE,
    reason: null,
    triggerSource: null,
    destination: null,
  },
  completionState: COMPLETION_STATES.NOT_READY,
  finalSnapshot: null,
};
