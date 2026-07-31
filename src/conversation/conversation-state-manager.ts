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
  ConversationStoreOperationMode,
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

type ManagerOperation<
  Mode extends ConversationStoreOperationMode,
  Result,
> = Mode extends "asynchronous" ? Promise<Result> : Result;

export class ConversationStateManager<
  Mode extends ConversationStoreOperationMode = "synchronous",
> {
  private readonly store: ConversationStore<Mode>;

  static usingStore<StoreMode extends ConversationStoreOperationMode>(
    store: ConversationStore<StoreMode>,
  ): ConversationStateManager<StoreMode> {
    return new ConversationStateManager<StoreMode>(store);
  }

  constructor(
    store: ConversationStore<Mode> | undefined = undefined,
  ) {
    this.store = store
      ?? new InMemoryConversationStore() as unknown as ConversationStore<Mode>;
  }

  initialize(
    input: InitializeConversationInput,
  ): ManagerOperation<Mode, ConversationStateAccessResult> {
    const inputErrors = validateInitialization(input);
    if (inputErrors.length > 0) {
      return operationForMode(this.store.operationMode, {
        status: "failure",
        errors: inputErrors,
      });
    }
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
      return operationForMode(this.store.operationMode, {
        status: "failure",
        errors: validation.errors,
      });
    }
    return mapStoreOperation(
      this.store.create(state),
      accessResult,
    ) as ManagerOperation<Mode, ConversationStateAccessResult>;
  }

  read(
    scope: ConversationScope,
  ): ManagerOperation<Mode, ConversationStateAccessResult> {
    return mapStoreOperation<ConversationStateAccessResult>(
      this.store.read(scope),
      (result) => {
        if (result.status === "failure") return accessResult(result);
        const validation = validateConversationState(result.state, scope);
        return validation.valid
          ? result
          : { status: "failure", errors: validation.errors };
      },
    ) as ManagerOperation<Mode, ConversationStateAccessResult>;
  }

  apply(
    update: ConversationStateUpdate,
  ): ManagerOperation<Mode, ConversationStateManagerUpdateResult> {
    return chainManagerOperation(this.read(update.scope), (readResult) => {
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
      return mapStoreOperation(
        this.store.replace({
          scope: update.scope,
          expectedRevision: readResult.state.revision,
          state: result.state,
        }),
        (stored) => stored.status === "success"
          ? { status: "success", state: stored.state }
          : {
              status: "failure",
              state: readResult.state,
              errors: stored.errors,
              persistenceFailure: stored.reason,
            },
      );
    }) as ManagerOperation<Mode, ConversationStateManagerUpdateResult>;
  }

  snapshot(
    scope: ConversationScope,
  ): ManagerOperation<Mode, ConversationStateAccessResult> {
    return chainManagerOperation(this.read(scope), (result) =>
      result.status === "success"
        ? { status: "success", state: cloneConversationState(result.state) }
        : result
    ) as ManagerOperation<Mode, ConversationStateAccessResult>;
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

function isPromise<T>(value: T | Promise<T>): value is Promise<T> {
  return value instanceof Promise;
}

function mapStoreOperation<Result>(
  operation: ConversationStoreResult | Promise<ConversationStoreResult>,
  map: (result: ConversationStoreResult) => Result,
): Result | Promise<Result> {
  return isPromise(operation) ? operation.then(map) : map(operation);
}

function chainManagerOperation<Input, Result>(
  operation: Input | Promise<Input>,
  next: (input: Input) => Result | Promise<Result>,
): Result | Promise<Result> {
  return isPromise(operation) ? operation.then(next) : next(operation);
}

function operationForMode<
  Mode extends ConversationStoreOperationMode,
  Result,
>(
  mode: Mode,
  result: Result,
): ManagerOperation<Mode, Result> {
  return (
    mode === "asynchronous" ? Promise.resolve(result) : result
  ) as ManagerOperation<Mode, Result>;
}
