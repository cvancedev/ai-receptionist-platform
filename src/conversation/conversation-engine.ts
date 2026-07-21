import type { BusinessProfile } from "../domain/business-profile";
import type { ConversationState } from "../domain/conversation-state";
import type { KnowledgeRecord } from "../domain/knowledge-record";
import type { ModelProposal } from "../domain/model-proposal";

export interface ConversationEngineInput {
  businessProfile: BusinessProfile;
  knowledge: readonly KnowledgeRecord[];
  conversationState: ConversationState;
  customerMessage: string;
}

export interface ConversationEngineResult {
  proposal: ModelProposal;
}

/** Determines the next allowed conversation step from validated inputs. */
export interface ConversationEngine {
  // TODO: Implement deterministic conversation behavior in later Sprint 3 milestones.
  evaluate(input: ConversationEngineInput): Promise<ConversationEngineResult>;
}
