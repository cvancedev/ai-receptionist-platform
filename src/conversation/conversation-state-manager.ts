import type { ConversationState } from "../domain/conversation-state";
import {
  COMPLETION_STATES,
  CONVERSATION_STAGES,
  ESCALATION_STATES,
} from "../shared/constants";
import { validateConversationState } from "../validation/conversation-state-validation";
import type {
  ConversationStore,
  ConversationStoreFailureReason,
  ConversationStoreResult,
} from "./conversation-store";
import { InMemoryConversationStore } from "./in-memory-conversation-store";
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

export type ConversationStateAccessResult =
  | { readonly status: "success"; readonly state: ConversationState }
  | {
      readonly status: "failure";
      readonly errors: readonly string[];
      readonly persistenceFailure?: ConversationStoreFailureReason;
    };

export type ConversationStateManagerUpdateResult =
  | Extract<StateUpdateResult, { status: "success" }>
  | Extract<StateUpdateResult, { status: "no-op" }>
  | (
      Extract<StateUpdateResult, { status: "failure" }>
      & { readonly persistenceFailure?: ConversationStoreFailureReason }
    );

export class ConversationStateManager {
  constructor(
    private readonly store: ConversationStore =
      new InMemoryConversationStore(),
  ) {}

  initialize(input: InitializeConversationInput): ConversationStateAccessResult {
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
    if (!validation.valid) {
      return { status: "failure", errors: validation.errors };
    }
    return accessResult(this.store.create(state));
  }

  read(scope: ConversationScope): ConversationStateAccessResult {
    const result = this.store.read(scope);
    if (result.status === "failure") return accessResult(result);
    const validation = validateConversationState(result.state, scope);
    return validation.valid ? result : { status: "failure", errors: validation.errors };
  }

  apply(update: ConversationStateUpdate): ConversationStateManagerUpdateResult {
    const readResult = this.read(update.scope);
    if (readResult.status === "failure") {
      return {
        status: "failure",
        state: emptyFailureState(update.scope),
        errors: readResult.errors,
        ...(readResult.persistenceFailure
          ? { persistenceFailure: readResult.persistenceFailure }
          : {}),
      };
    }
    const result = applyConversationStateUpdate(readResult.state, update);
    if (result.status !== "success") return result;
    const stored = this.store.replace({
      scope: update.scope,
      expectedRevision: readResult.state.revision,
      state: result.state,
    });
    return stored.status === "success"
      ? { status: "success", state: stored.state }
      : {
          status: "failure",
          state: readResult.state,
          errors: stored.errors,
          persistenceFailure: stored.reason,
        };
  }

  snapshot(scope: ConversationScope): ConversationStateAccessResult {
    const result = this.read(scope);
    return result.status === "success"
      ? { status: "success", state: cloneConversationState(result.state) }
      : result;
  }
}

function accessResult(
  result: ConversationStoreResult,
): ConversationStateAccessResult {
  return result.status === "success"
    ? result
    : {
        status: "failure",
        errors: result.errors,
        persistenceFailure: result.reason,
      };
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
