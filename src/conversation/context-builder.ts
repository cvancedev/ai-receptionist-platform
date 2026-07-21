import type { BusinessProfile } from "../domain/business-profile";
import type { ConversationState } from "../domain/conversation-state";
import type { KnowledgeRecord } from "../domain/knowledge-record";

export interface ContextBuilderInput {
  businessProfile: BusinessProfile;
  knowledge: readonly KnowledgeRecord[];
  conversationState: ConversationState;
  customerMessage: string;
}

export interface ConversationContext {
  businessProfile: BusinessProfile;
  knowledge: readonly KnowledgeRecord[];
  conversationState: ConversationState;
  customerMessage: string;
}

/** Builds a validated, business-scoped context package for a model boundary. */
export interface ContextBuilder {
  // TODO: Implement context selection and assembly in a later milestone.
  build(input: ContextBuilderInput): ConversationContext;
}
