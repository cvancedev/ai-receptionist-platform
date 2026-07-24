import type { ConversationStateManager } from "../../conversation/conversation-state-manager";
import { canTransitionStage } from "../../conversation/conversation-state-transitions";
import type { ConversationState } from "../../domain/conversation-state";
import { CONVERSATION_STAGES } from "../../shared/constants";
import {
  isModelProposalIdentifier,
  isModelTaskIdentifier,
} from "../contracts/identities";
import { OutputContractRegistry } from "../registries/output-contract-registry";
import { TaskRegistry } from "../registries/task-registry";
import type { DuplicateProcessingGuard } from "../validation/duplicate-processing-guard";
import type {
  StateExecutionReason,
  StateExecutionRequest,
  StateTransitionDefinition,
} from "./contracts";
import { StateTransitionRegistry } from "./transition-registry";

export type TransitionValidationResult =
  | {
      status: "valid";
      request: StateExecutionRequest;
      definition: StateTransitionDefinition;
      currentState: ConversationState;
    }
  | {
      status: "invalid";
      failures: readonly StateExecutionReason[];
      details: readonly string[];
      request: StateExecutionRequest | null;
      currentState: ConversationState | null;
      transitionId: string | null;
    };

export class StateTransitionValidator {
  constructor(
    private readonly transitions = new StateTransitionRegistry(),
    private readonly tasks = new TaskRegistry(),
    private readonly contracts = new OutputContractRegistry(),
  ) {}

  validate(
    input: unknown,
    manager: ConversationStateManager,
    duplicateGuard: DuplicateProcessingGuard,
  ): TransitionValidationResult {
    if (!isExecutionRequest(input)) {
      return invalid(
        ["MalformedExecutionRequest"],
        ["Execution input does not match the approved request contract."],
      );
    }
    const request = input;
    const transition = this.transitions.resolve(
      request.transitionIdentifier,
      request.transitionVersion,
    );
    if (transition.status === "failure") {
      return invalid(
        ["UnknownTransition"],
        ["The requested transition is not registered."],
        request,
      );
    }
    const definition = transition.definition;
    const proposal = request.validation.proposal;
    const proposalType = proposal?.proposalType;

    if (!isModelTaskIdentifier(request.identity.taskIdentifier)) {
      return invalid(
        ["UnknownTask"],
        ["The execution request contains an unknown task identifier."],
        request,
      );
    }
    const task = this.tasks.resolve(
      request.identity.taskIdentifier,
      request.identity.taskVersion,
    );
    if (task.status === "failure") {
      return invalid(
        ["UnknownTask"],
        ["The task identifier or version is not approved."],
        request,
      );
    }
    if (!isModelProposalIdentifier(proposalType)) {
      return invalid(
        ["UnknownProposalType"],
        ["The validated result contains an unknown proposal type."],
        request,
      );
    }
    if (
      request.validation.status !== "valid"
      || request.validation.failures.length > 0
      || !proposal
    ) {
      return invalid(
        ["ProposalNotValidated"],
        ["Only a successfully validated proposal can be executed."],
        request,
      );
    }
    if (
      request.applicationDecision.decision !== definition.requiredDecision
      || request.applicationDecision.stateMutationAuthorized !== false
      || request.applicationDecision.customerReleaseAuthorized !== false
      || request.applicationDecision.reasons.length !== 1
      || request.applicationDecision.reasons[0] !== "validation-passed"
      || !sameStrings(
        request.applicationDecision.acceptedFields,
        request.validation.acceptedFields,
      )
      || !sameStrings(
        request.applicationDecision.rejectedFields,
        request.validation.rejectedFields,
      )
    ) {
      return invalid(
        ["DecisionNotApproved"],
        ["The application decision is malformed or is not an accepted validation result."],
        request,
      );
    }

    const contract = this.contracts.resolve(
      request.identity.outputContractIdentifier,
      request.identity.outputContractVersion,
    );
    const proposalId = proposal.proposalId;
    if (
      contract.status === "failure"
      || !nonEmptyString(proposalId)
      || request.executionId !== `execution-${proposalId}`
      || task.value.compatibleProposalType !== proposalType
      || task.value.compatibleOutputContract
        !== request.identity.outputContractIdentifier
      || definition.requiredTaskIdentifier !== task.value.identifier
      || definition.requiredProposalType !== proposalType
      || request.expectedCurrentStage !== definition.currentStage
      || !canTransitionStage(definition.currentStage, definition.nextStage)
    ) {
      return invalid(
        ["PolicyViolation"],
        ["The execution identity, task, proposal, contract, or transition policy does not match."],
        request,
      );
    }

    const scope = {
      conversationId: request.identity.conversationId,
      businessProfileId: request.identity.businessId,
      businessProfileVersion: request.identity.profileVersion,
    };
    const snapshot = manager.snapshot(scope);
    if (snapshot.status === "failure") {
      return invalid(
        ["ScopeMismatch"],
        snapshot.errors,
        request,
      );
    }
    const currentState = snapshot.state;
    if (!proposalMatchesIdentity(proposal, request)) {
      return invalid(
        ["ScopeMismatch"],
        ["The validated proposal identity does not match the execution identity."],
        request,
        currentState,
      );
    }
    if (duplicateGuard.hasStateOperation(request.executionId)) {
      return invalid(
        ["DuplicateExecution"],
        ["The execution identifier has already been processed."],
        request,
        currentState,
      );
    }
    if (
      currentState.stage !== definition.currentStage
      || currentState.stage !== request.expectedCurrentStage
      || currentState.revision !== request.expectedStateRevision
      || currentState.revision !== request.identity.stateRevision
    ) {
      return invalid(
        ["CurrentStateMismatch"],
        ["The current stage or revision does not match the approved transition."],
        request,
        currentState,
      );
    }
    const registration = duplicateGuard.registerStateOperation(request.executionId);
    if (registration.status === "failure") {
      return invalid(
        ["DuplicateExecution"],
        ["The execution identifier has already been processed."],
        request,
        currentState,
      );
    }
    return {
      status: "valid",
      request,
      definition,
      currentState,
    };
  }
}

function isExecutionRequest(value: unknown): value is StateExecutionRequest {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, [
    "executionId",
    "transitionIdentifier",
    "transitionVersion",
    "expectedCurrentStage",
    "expectedStateRevision",
    "identity",
    "applicationDecision",
    "validation",
  ])) return false;
  if (
    !nonEmptyString(value.executionId)
    || !nonEmptyString(value.transitionIdentifier)
    || !positiveInteger(value.transitionVersion)
    || !Object.values(CONVERSATION_STAGES).includes(
      value.expectedCurrentStage as never,
    )
    || !nonNegativeInteger(value.expectedStateRevision)
  ) return false;
  return isIdentity(value.identity)
    && isApplicationDecision(value.applicationDecision)
    && isValidation(value.validation);
}

function isIdentity(value: unknown): boolean {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, [
    "requestId",
    "traceId",
    "businessId",
    "conversationId",
    "profileVersion",
    "stateRevision",
    "taskIdentifier",
    "taskVersion",
    "contextPackageId",
    "promptPackageId",
    "outputContractIdentifier",
    "outputContractVersion",
  ])) return false;
  return [
    value.requestId,
    value.traceId,
    value.businessId,
    value.conversationId,
    value.taskIdentifier,
    value.contextPackageId,
    value.promptPackageId,
    value.outputContractIdentifier,
  ].every(nonEmptyString)
    && positiveInteger(value.profileVersion)
    && nonNegativeInteger(value.stateRevision)
    && positiveInteger(value.taskVersion)
    && positiveInteger(value.outputContractVersion);
}

function isApplicationDecision(value: unknown): boolean {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, [
    "decision",
    "reasons",
    "acceptedFields",
    "rejectedFields",
    "stateMutationAuthorized",
    "customerReleaseAuthorized",
  ])) return false;
  return nonEmptyString(value.decision)
    && stringArray(value.reasons)
    && stringArray(value.acceptedFields)
    && stringArray(value.rejectedFields)
    && typeof value.stateMutationAuthorized === "boolean"
    && typeof value.customerReleaseAuthorized === "boolean";
}

function isValidation(value: unknown): boolean {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, [
    "status",
    "failures",
    "warnings",
    "acceptedFields",
    "rejectedFields",
    "stages",
    "policyVersions",
    "traceId",
    "proposal",
  ])) return false;
  return nonEmptyString(value.status)
    && stringArray(value.failures)
    && stringArray(value.warnings)
    && stringArray(value.acceptedFields)
    && stringArray(value.rejectedFields)
    && Array.isArray(value.stages)
    && isPlainRecord(value.policyVersions)
    && nonEmptyString(value.policyVersions.validatorVersion)
    && nonEmptyString(value.traceId)
    && (value.proposal === null || isPlainRecord(value.proposal));
}

function proposalMatchesIdentity(
  proposal: Readonly<Record<string, unknown>>,
  request: StateExecutionRequest,
): boolean {
  const identity = request.identity;
  return nonEmptyString(proposal.proposalId)
    && request.validation.traceId === identity.traceId
    && proposal.requestId === identity.requestId
    && proposal.traceId === identity.traceId
    && proposal.businessId === identity.businessId
    && proposal.conversationId === identity.conversationId
    && proposal.profileVersion === identity.profileVersion
    && proposal.stateRevision === identity.stateRevision
    && proposal.taskIdentifier === identity.taskIdentifier
    && proposal.taskVersion === identity.taskVersion
    && proposal.contextPackageId === identity.contextPackageId
    && proposal.promptPackageId === identity.promptPackageId
    && proposal.outputContractIdentifier === identity.outputContractIdentifier
    && proposal.outputContractVersion === identity.outputContractVersion;
}

function invalid(
  failures: readonly StateExecutionReason[],
  details: readonly string[],
  request: StateExecutionRequest | null = null,
  currentState: ConversationState | null = null,
): TransitionValidationResult {
  return {
    status: "invalid",
    failures,
    details,
    request,
    currentState,
    transitionId: request?.transitionIdentifier ?? null,
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function hasOnlyKeys(
  value: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowed.includes(key))
    && allowed.every((key) => key in value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function positiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function sameStrings(first: readonly string[], second: readonly string[]) {
  return JSON.stringify(first) === JSON.stringify(second);
}
