import type { ModelTaskIdentifier } from "../contracts/identities";
import type { ContextConversationEntry } from "../contracts/packages";
import type { ConversationState } from "../../domain/conversation-state";
import { fictionalBusinessProfile } from "../../fixtures/business-profile";
import { initializedConversationState } from "../../fixtures/conversation";
import { fictionalKnowledgeRecords } from "../../fixtures/knowledge";

export const aiPrototypeBusinessIdentity = Object.freeze({
  id: fictionalBusinessProfile.id,
  displayName: fictionalBusinessProfile.businessName,
});

export const aiPrototypeConversationEntries: readonly ContextConversationEntry[] = Object.freeze([
  Object.freeze({
    messageId: "message-history-001",
    conversationId: initializedConversationState.conversationId,
    source: "application" as const,
    sequence: 1,
    content: "How can the fictional team help?",
  }),
]);

export const aiPrototypeCurrentCustomerInput: ContextConversationEntry = Object.freeze({
  messageId: "message-current-001",
  conversationId: initializedConversationState.conversationId,
  source: "customer",
  sequence: 2,
  content: "I need project help.",
});

export function createAiPrototypeIdentity(
  taskIdentifier: ModelTaskIdentifier,
  suffix: string,
  stateRevision = initializedConversationState.revision,
) {
  return {
    requestId: `ai-request-${suffix}`,
    traceId: `ai-trace-${suffix}`,
    businessId: fictionalBusinessProfile.id,
    conversationId: initializedConversationState.conversationId,
    profileVersion: fictionalBusinessProfile.version,
    stateRevision,
    taskIdentifier,
    taskVersion: 1,
  } as const;
}

export function createAiPrototypeFixture(
  taskIdentifier: ModelTaskIdentifier,
  suffix: string,
  conversationState: ConversationState = initializedConversationState,
) {
  return {
    identity: createAiPrototypeIdentity(
      taskIdentifier,
      suffix,
      conversationState.revision,
    ),
    contextPackageId: `context-${suffix}`,
    promptPackageId: `prompt-${suffix}`,
    businessIdentity: { ...aiPrototypeBusinessIdentity },
    businessProfile: structuredClone(fictionalBusinessProfile),
    conversationState: structuredClone(conversationState),
    knowledge: structuredClone(fictionalKnowledgeRecords),
    conversationEntries: structuredClone(aiPrototypeConversationEntries),
    currentCustomerInput: { ...aiPrototypeCurrentCustomerInput },
  };
}
