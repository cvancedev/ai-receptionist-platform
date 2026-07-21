import type { ConversationState } from "../domain/conversation-state";
import {
  COMPLETION_STATES,
  CONVERSATION_STAGES,
  ESCALATION_STATES,
} from "../shared/constants";
import { validateConversationState } from "../validation/conversation-state-validation";
import { InMemoryConversationStore, type StoreResult } from "./in-memory-conversation-store";
import {
  applyConversationStateUpdate,
  cloneConversationState,
  type ConversationScope,
  type ConversationStateUpdate,
  type StateUpdateResult,
} from "./conversation-state-updates";

export interface InitializeConversationInput extends ConversationScope {
  requiredFields: readonly string[];
  authorizedEscalationDestination?: string | null;
}

export class ConversationStateManager {
  constructor(private readonly store = new InMemoryConversationStore()) {}

  initialize(input: InitializeConversationInput): StoreResult {
    const inputErrors = validateInitialization(input);
    if (inputErrors.length > 0) return { status: "failure", errors: inputErrors };
    const state: ConversationState = {
      conversationId: input.conversationId,
      businessProfileId: input.businessProfileId,
      businessProfileVersion: input.businessProfileVersion,
      authorizedEscalationDestination: input.authorizedEscalationDestination ?? null,
      revision: 0,
      stage: CONVERSATION_STAGES.INITIALIZED,
      confirmedFacts: {},
      customerClaims: [],
      corrections: [],
      missingFields: [...input.requiredFields],
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
    const validation = validateConversationState(state, input);
    return validation.valid
      ? this.store.create(state)
      : { status: "failure", errors: validation.errors };
  }

  read(scope: ConversationScope): StoreResult {
    const result = this.store.read(scope.conversationId, scope.businessProfileId);
    if (result.status === "failure") return result;
    const validation = validateConversationState(result.state, scope);
    return validation.valid ? result : { status: "failure", errors: validation.errors };
  }

  apply(update: ConversationStateUpdate): StateUpdateResult {
    const readResult = this.read(update.scope);
    if (readResult.status === "failure") {
      return { status: "failure", state: emptyFailureState(update.scope), errors: readResult.errors };
    }
    const result = applyConversationStateUpdate(readResult.state, update);
    if (result.status !== "success") return result;
    const stored = this.store.replace(result.state, update.scope.businessProfileId);
    return stored.status === "success"
      ? { status: "success", state: stored.state }
      : { status: "failure", state: readResult.state, errors: stored.errors };
  }

  snapshot(scope: ConversationScope): StoreResult {
    const result = this.read(scope);
    return result.status === "success"
      ? { status: "success", state: cloneConversationState(result.state) }
      : result;
  }
}

function validateInitialization(input: InitializeConversationInput): string[] {
  const errors: string[] = [];
  if (!input.conversationId.trim()) errors.push("Conversation identifier is required.");
  if (!input.businessProfileId.trim()) errors.push("Business identifier is required.");
  if (!Number.isInteger(input.businessProfileVersion) || input.businessProfileVersion < 1) {
    errors.push("Business Profile version must be a positive integer.");
  }
  if (input.requiredFields.some((field) => !field.trim())) errors.push("Required fields cannot be empty.");
  if (new Set(input.requiredFields).size !== input.requiredFields.length) errors.push("Required fields cannot contain duplicates.");
  return errors;
}

function emptyFailureState(scope: ConversationScope): ConversationState {
  return {
    conversationId: scope.conversationId,
    businessProfileId: scope.businessProfileId,
    businessProfileVersion: scope.businessProfileVersion,
    authorizedEscalationDestination: null,
    revision: 0,
    stage: CONVERSATION_STAGES.INITIALIZED,
    confirmedFacts: {},
    customerClaims: [],
    corrections: [],
    missingFields: [],
    askedQuestions: [],
    escalation: { status: ESCALATION_STATES.NONE, reason: null, triggerSource: null, destination: null },
    completionState: COMPLETION_STATES.NOT_READY,
    finalSnapshot: null,
  };
}
