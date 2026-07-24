import type { ConversationStateManager } from "../../conversation/conversation-state-manager";
import { cloneConversationState } from "../../conversation/conversation-state-updates";
import type { ConversationState } from "../../domain/conversation-state";
import { deepFreeze } from "../shared/immutable";
import { DuplicateProcessingGuard } from "../validation/duplicate-processing-guard";
import type {
  StateExecutionMetadata,
  StateExecutionReason,
  StateExecutionRequest,
  StateExecutionResult,
} from "./contracts";
import {
  StateTransitionValidator,
  type TransitionValidationResult,
} from "./transition-validator";

export type ExecutionTimestampProvider = () => string;

export class DeterministicStateExecutor {
  constructor(
    private readonly manager: ConversationStateManager,
    private readonly validator = new StateTransitionValidator(),
    private readonly duplicateGuard = new DuplicateProcessingGuard(),
    private readonly timestampProvider: ExecutionTimestampProvider =
      () => "prototype-deterministic",
  ) {}

  execute(input: unknown): StateExecutionResult {
    const validation = this.validator.validate(
      input,
      this.manager,
      this.duplicateGuard,
    );
    if (validation.status === "invalid") {
      return this.rejectedResult(validation);
    }

    const request = validation.request;
    const previousState = validation.currentState;
    const result = this.manager.apply({
      type: "transition-stage",
      scope: {
        conversationId: request.identity.conversationId,
        businessProfileId: request.identity.businessId,
        businessProfileVersion: request.identity.profileVersion,
      },
      stage: validation.definition.nextStage,
    });
    if (result.status !== "success") {
      const details = result.status === "failure"
        ? result.errors
        : [result.reason];
      return this.result({
        success: false,
        reason: "StateApplicationFailed",
        previousState,
        newState: previousState,
        transitionId: validation.definition.identifier,
        request,
        failures: ["StateApplicationFailed"],
        details,
        appliedStateRevision: null,
      });
    }
    return this.result({
      success: true,
      reason: "TransitionApplied",
      previousState,
      newState: result.state,
      transitionId: validation.definition.identifier,
      request,
      failures: [],
      details: [],
      appliedStateRevision: result.state.revision,
    });
  }

  duplicateSnapshot() {
    return this.duplicateGuard.snapshot();
  }

  private rejectedResult(
    validation: Extract<TransitionValidationResult, { status: "invalid" }>,
  ) {
    return this.result({
      success: false,
      reason: validation.failures[0],
      previousState: validation.currentState,
      newState: validation.currentState,
      transitionId: validation.transitionId,
      request: validation.request,
      failures: validation.failures,
      details: validation.details,
      appliedStateRevision: null,
    });
  }

  private result(input: {
    success: boolean;
    reason: StateExecutionReason;
    previousState: ConversationState | null;
    newState: ConversationState | null;
    transitionId: string | null;
    request: StateExecutionRequest | null;
    failures: readonly StateExecutionReason[];
    details: readonly string[];
    appliedStateRevision: number | null;
  }): StateExecutionResult {
    const proposalId = input.request?.validation.proposal?.proposalId;
    const metadata: StateExecutionMetadata = {
      executionId: input.request?.executionId ?? null,
      requestId: input.request?.identity.requestId ?? null,
      traceId: input.request?.identity.traceId ?? null,
      taskIdentifier: input.request?.identity.taskIdentifier ?? null,
      proposalId: typeof proposalId === "string" ? proposalId : null,
      expectedStateRevision: input.request?.expectedStateRevision ?? null,
      appliedStateRevision: input.appliedStateRevision,
      failures: [...input.failures],
      details: [...input.details],
    };
    return deepFreeze({
      success: input.success,
      reason: input.reason,
      previousState: freezeState(input.previousState),
      newState: freezeState(input.newState),
      transitionId: input.transitionId,
      executionTimestamp: this.timestampProvider(),
      executionMetadata: metadata,
    });
  }
}

function freezeState(state: ConversationState | null) {
  return state ? deepFreeze(cloneConversationState(state)) : null;
}
