import { deepFreeze } from "../../ai/shared/immutable";
import { ConversationStateManager } from "../../conversation/conversation-state-manager";
import { DeterministicConversationEngine } from "../../conversation/conversation-engine";
import { InMemoryConversationStore } from "../../conversation/in-memory-conversation-store";
import { resolveIntakeFields } from "../../conversation/intake-field-resolution";
import type { ConversationReadModel } from "../../conversation-read-model/contracts";
import { ConversationReadModelProjector } from "../../conversation-read-model/conversation-read-model-projector";
import { buildPrototypeProjectionContext } from "../../conversation-read-model/prototype-projection-context";
import type { IntakeFieldDefinition } from "../../domain/business-profile";
import type { ConversationState } from "../../domain/conversation-state";
import type { HandoffSummary } from "../../domain/handoff-summary";
import type { QuestionSelectionResult } from "../../domain/intake";
import { DeterministicHandoffBuilder } from "../../handoff/handoff-builder";
import {
  COMPLETION_STATES,
  CONVERSATION_STAGES,
  ESCALATION_STATES,
} from "../../shared/constants";
import { validateBusinessProfile } from "../../validation/business-profile-validation";
import { validateConversationState } from "../../validation/conversation-state-validation";
import { EndToEndGroundingValidator } from "./activated-context-and-grounding";
import {
  ACTIVATED_CONTEXT_POLICY_VERSION,
  GROUNDED_OUTPUT_POLICY_VERSION,
  type EndToEndActivatedContext,
  type EndToEndCustomerMessage,
  type EndToEndGroundedCandidateInput,
  type EndToEndValidatedResponseCandidate,
} from "./contracts";

const MAX_IDENTIFIER_LENGTH = 160;
const MAX_MESSAGE_LENGTH = 4_000;

export type DeterministicWorkflowAction =
  | { readonly type: "understand-request" }
  | { readonly type: "answer-required-field"; readonly fieldId: string }
  | { readonly type: "correct-required-field"; readonly fieldId: string }
  | { readonly type: "confirm-intake" }
  | { readonly type: "request-human" }
  | { readonly type: "complete-conversation" }
  | {
      readonly type: "validate-grounded-answer";
      readonly candidate: Readonly<EndToEndGroundedCandidateInput>;
    };

export interface DeterministicWorkflowTurnRequest {
  readonly turnId: string;
  readonly scope: Readonly<{
    readonly businessProfileId: string;
    readonly businessProfileVersion: number;
    readonly conversationId: string;
    readonly activationRevision: number;
  }>;
  readonly expectedStateRevision: number;
  readonly message: Readonly<EndToEndCustomerMessage>;
  readonly action: Readonly<DeterministicWorkflowAction>;
}

export type DeterministicWorkflowPrompt =
  | {
      readonly status: "available";
      readonly kind: "greeting" | "question" | "clarification" | "confirmation" | "human-review";
      readonly questionId: string | null;
      readonly fieldId: string | null;
      readonly content: string;
      readonly localFictionalDisplayOnly: true;
      readonly customerReleaseAuthorized: false;
    }
  | {
      readonly status: "none";
      readonly kind: "handoff-ready" | "completed";
      readonly questionId: null;
      readonly fieldId: null;
      readonly content: null;
      readonly localFictionalDisplayOnly: true;
      readonly customerReleaseAuthorized: false;
    };

export interface DeterministicWorkflowSnapshot {
  readonly identity: Readonly<{
    readonly businessProfileId: string;
    readonly businessProfileVersion: number;
    readonly conversationId: string;
    readonly activationRevision: number;
    readonly stateRevision: number;
  }>;
  readonly state: Readonly<ConversationState>;
  readonly readModel: Readonly<ConversationReadModel>;
  readonly nextPrompt: DeterministicWorkflowPrompt;
  readonly groundedCandidate: Readonly<EndToEndValidatedResponseCandidate> | null;
  readonly handoff: Readonly<{
    readonly status: "ready" | "not-ready";
    readonly summary: Readonly<HandoffSummary> | null;
  }>;
  readonly authority: Readonly<{
    readonly decisionOwner: "application-domain";
    readonly customerInputTrust: "untrusted-data";
    readonly stateMutationPath: "deterministic-conversation-engine-and-state-manager";
    readonly modelStateAuthority: false;
    readonly customerReleaseAuthorized: false;
    readonly externalActionAuthorized: false;
  }>;
  readonly durability: Readonly<{
    readonly mode: "transient-milestone-8.3";
    readonly messagePersisted: false;
    readonly statePersistedByWorkflow: false;
    readonly executionEvidencePersistedByWorkflow: false;
    readonly durableTurnBoundaryAuthorized: false;
  }>;
}

export type DeterministicWorkflowFailureReason =
  | "InvalidContext"
  | "InvalidInput"
  | "ScopeMismatch"
  | "StaleRevision"
  | "DuplicateTurn"
  | "InvalidSequence"
  | "ActionNotAllowed"
  | "GroundingRejected"
  | "TransitionRejected"
  | "ProjectionUnavailable";

export type DeterministicWorkflowTurnResult =
  | { readonly status: "success"; readonly value: Readonly<DeterministicWorkflowSnapshot> }
  | {
      readonly status: "failure";
      readonly reason: DeterministicWorkflowFailureReason;
      readonly errors: readonly string[];
      readonly stateRevision: number | null;
      readonly customerReleaseAuthorized: false;
    };

export type DeterministicWorkflowCreationResult =
  | { readonly status: "success"; readonly workflow: DeterministicMultiTurnConversationWorkflow }
  | Extract<DeterministicWorkflowTurnResult, { readonly status: "failure" }>;

/**
 * Milestone 8.3 transient deterministic workflow. It is seeded only from an
 * eligible activated context and deliberately owns no durable turn storage.
 */
export class DeterministicMultiTurnConversationWorkflow {
  private manager: ConversationStateManager;
  private readonly processedTurnIds = new Set<string>();
  private readonly processedMessageIds = new Set<string>();
  private lastMessageSequence: number;
  private firstTurnPending = true;
  private readonly groundingValidator = new EndToEndGroundingValidator();
  private readonly projector = new ConversationReadModelProjector();
  private readonly handoffBuilder = new DeterministicHandoffBuilder();

  static create(contextInput: unknown): DeterministicWorkflowCreationResult {
    let context: Readonly<EndToEndActivatedContext>;
    try {
      if (!isEligibleActivatedContext(contextInput)) {
        return workflowFailure("InvalidContext", "Activated conversation context is invalid.", null);
      }
      context = deepFreeze(structuredClone(contextInput));
    } catch {
      return workflowFailure("InvalidContext", "Activated conversation context is invalid.", null);
    }
    const manager = managerFromState(context.conversationState);
    if (!manager) {
      return workflowFailure("InvalidContext", "Activated conversation context is unavailable.", null);
    }
    return {
      status: "success",
      workflow: new DeterministicMultiTurnConversationWorkflow(context, manager),
    };
  }

  private constructor(
    private readonly context: Readonly<EndToEndActivatedContext>,
    manager: ConversationStateManager,
  ) {
    this.manager = manager;
    this.lastMessageSequence = context.currentCustomerInput.sequence - 1;
  }

  snapshot(): DeterministicWorkflowTurnResult {
    return this.buildSnapshot(this.currentState(), null, null);
  }

  processTurn(input: unknown): DeterministicWorkflowTurnResult {
    if (!isTurnRequest(input)) {
      return this.failure("InvalidInput", "Deterministic turn input is invalid.");
    }
    if (!hasExactScope(input.scope, this.context)) {
      return this.failure("ScopeMismatch", "Deterministic conversation scope is unavailable.");
    }
    if (input.message.conversationId !== this.context.identity.conversationId) {
      return this.failure("ScopeMismatch", "Customer message conversation scope is unavailable.");
    }
    const current = this.currentState();
    if (input.expectedStateRevision !== current.revision) {
      return this.failure("StaleRevision", "Deterministic conversation revision is stale.");
    }
    if (
      this.processedTurnIds.has(input.turnId)
      || this.processedMessageIds.has(input.message.messageId)
    ) {
      return this.failure("DuplicateTurn", "Deterministic conversation turn is duplicated.");
    }
    if (input.message.sequence !== this.lastMessageSequence + 1) {
      return this.failure("InvalidSequence", "Customer message sequence is invalid.");
    }
    if (this.firstTurnPending && !sameMessage(input.message, this.context.currentCustomerInput)) {
      return this.failure("ScopeMismatch", "The first turn does not match the activated context.");
    }

    if (input.action.type === "validate-grounded-answer") {
      const grounding = this.groundingValidator.validate(input.action.candidate, this.context);
      if (grounding.status === "failure") {
        return this.failure("GroundingRejected", "Grounded response candidate is unavailable.");
      }
      const snapshot = this.buildSnapshot(current, grounding.value, null);
      if (snapshot.status === "failure") return snapshot;
      this.acceptTurn(input);
      return snapshot;
    }

    const candidateManager = managerFromState(current);
    if (!candidateManager) {
      return this.failure("TransitionRejected", "Candidate conversation state is unavailable.");
    }
    const engine = new DeterministicConversationEngine(
      structuredClone(this.context.businessProfile),
      candidateManager,
      current.conversationId,
    );
    const applied = applyAction(
      input.action,
      input.message,
      engine,
      candidateManager,
      this.context,
    );
    if (applied.status === "failure") {
      return this.failure(applied.reason, applied.error);
    }
    const candidateState = stateFromManager(candidateManager, this.context);
    if (!candidateState) {
      return this.failure("TransitionRejected", "Candidate conversation state is unavailable.");
    }
    const snapshot = this.buildSnapshot(candidateState, null, applied.nextQuestion);
    if (snapshot.status === "failure") return snapshot;
    this.manager = candidateManager;
    this.acceptTurn(input);
    return snapshot;
  }

  private acceptTurn(input: DeterministicWorkflowTurnRequest): void {
    this.processedTurnIds.add(input.turnId);
    this.processedMessageIds.add(input.message.messageId);
    this.lastMessageSequence = input.message.sequence;
    this.firstTurnPending = false;
  }

  private currentState(): ConversationState {
    const result = this.manager.snapshot(scopeFor(this.context));
    if (result.status === "failure") {
      throw new Error("Deterministic workflow state is unavailable.");
    }
    return result.state;
  }

  private buildSnapshot(
    state: Readonly<ConversationState>,
    groundedCandidate: Readonly<EndToEndValidatedResponseCandidate> | null,
    selectedQuestion: QuestionSelectionResult | null,
  ): DeterministicWorkflowTurnResult {
    const projectionContext = buildPrototypeProjectionContext(
      this.context.businessProfile,
      state,
    );
    const projection = projectionContext
      ? this.projector.project(state, projectionContext)
      : { status: "failure" as const, errors: ["Projection context is unavailable."] };
    if (projection.status === "failure") {
      return this.failure("ProjectionUnavailable", "Conversation projection is unavailable.");
    }
    const handoff = deriveHandoff(this.handoffBuilder, this.context, state);
    if (handoff.status === "failure") {
      return this.failure("ProjectionUnavailable", "Validated handoff is unavailable.");
    }
    return deepFreeze({
      status: "success" as const,
      value: {
        identity: {
          businessProfileId: state.businessProfileId,
          businessProfileVersion: state.businessProfileVersion,
          conversationId: state.conversationId,
          activationRevision: this.context.identity.activationRevision,
          stateRevision: state.revision,
        },
        state: structuredClone(state),
        readModel: projection.readModel,
        nextPrompt: promptFor(this.context, state, selectedQuestion),
        groundedCandidate,
        handoff: handoff.value,
        authority: {
          decisionOwner: "application-domain",
          customerInputTrust: "untrusted-data",
          stateMutationPath: "deterministic-conversation-engine-and-state-manager",
          modelStateAuthority: false,
          customerReleaseAuthorized: false,
          externalActionAuthorized: false,
        },
        durability: {
          mode: "transient-milestone-8.3",
          messagePersisted: false,
          statePersistedByWorkflow: false,
          executionEvidencePersistedByWorkflow: false,
          durableTurnBoundaryAuthorized: false,
        },
      },
    });
  }

  private failure(reason: DeterministicWorkflowFailureReason, error: string) {
    let revision: number | null = null;
    try { revision = this.currentState().revision; } catch { revision = null; }
    return workflowFailure(reason, error, revision);
  }
}

type AppliedActionResult =
  | { readonly status: "success"; readonly nextQuestion: QuestionSelectionResult | null }
  | {
      readonly status: "failure";
      readonly reason: "ActionNotAllowed" | "TransitionRejected";
      readonly error: string;
    };

function applyAction(
  action: Exclude<DeterministicWorkflowAction, { readonly type: "validate-grounded-answer" }>,
  message: Readonly<EndToEndCustomerMessage>,
  engine: DeterministicConversationEngine,
  manager: ConversationStateManager,
  context: Readonly<EndToEndActivatedContext>,
): AppliedActionResult {
  const before = stateFromManager(manager, context);
  if (!before) return rejected("TransitionRejected");

  if (action.type === "understand-request") {
    if (
      before.stage !== CONVERSATION_STAGES.INITIALIZED
      && before.stage !== CONVERSATION_STAGES.CLARIFICATION
    ) return rejected("ActionNotAllowed");
    const result = engine.initializeIntake(message.content, message.messageId);
    if (result.validationErrors.length > 0 || result.serviceResolution.status === "blocked") {
      return rejected("TransitionRejected");
    }
    return { status: "success", nextQuestion: selectQuestionIfAvailable(engine, result.nextQuestion) };
  }

  if (action.type === "answer-required-field") {
    if (!isAwaitingField(before, context, action.fieldId)) return rejected("ActionNotAllowed");
    const result = engine.applyAnswer(action.fieldId, message.content, message.messageId);
    if (result.validationErrors.length > 0 || result.readiness.status === "blocked") {
      return rejected("TransitionRejected");
    }
    const coordinated = result.readiness.status === "ready-for-confirmation"
      ? engine.coordinateReadiness()
      : result;
    return {
      status: "success",
      nextQuestion: selectQuestionIfAvailable(engine, coordinated.nextQuestion),
    };
  }

  if (action.type === "correct-required-field") {
    if (!isCorrectableRequiredField(before, context, action.fieldId)) {
      return rejected("ActionNotAllowed");
    }
    const result = engine.correctAnswer(action.fieldId, message.content, message.messageId);
    if (result.validationErrors.length > 0 || result.readiness.status === "blocked") {
      return rejected("TransitionRejected");
    }
    return { status: "success", nextQuestion: engine.selectAndMarkNextQuestion() };
  }

  if (action.type === "confirm-intake") {
    const result = engine.confirmIntake();
    return result.validationErrors.length === 0 && result.handoffAvailable
      ? { status: "success", nextQuestion: null }
      : rejected("TransitionRejected");
  }

  if (action.type === "request-human") {
    const result = manager.apply({
      type: "set-escalation",
      scope: scopeFor(context),
      status: ESCALATION_STATES.REQUESTED_BY_CUSTOMER,
      reason: "Customer requested human assistance.",
      triggerSource: message.messageId,
      destination: context.businessProfile.escalation.destination,
    });
    return result.status === "success"
      ? { status: "success", nextQuestion: null }
      : rejected("TransitionRejected");
  }

  const handoff = new DeterministicHandoffBuilder().build(
    structuredClone(context.businessProfile),
    before,
  );
  if (handoff.status === "failure") return rejected("ActionNotAllowed");
  const completed = manager.apply({
    type: "set-completion",
    scope: scopeFor(context),
    status: COMPLETION_STATES.COMPLETED,
  });
  return completed.status === "success"
    ? { status: "success", nextQuestion: null }
    : rejected("TransitionRejected");
}

function selectQuestionIfAvailable(
  engine: DeterministicConversationEngine,
  preview: QuestionSelectionResult,
): QuestionSelectionResult | null {
  return preview.status === "selected" || preview.status === "clarification-required"
    ? engine.selectAndMarkNextQuestion()
    : null;
}

function isAwaitingField(
  state: Readonly<ConversationState>,
  context: Readonly<EndToEndActivatedContext>,
  fieldId: string,
): boolean {
  const field = requiredField(state, context, fieldId);
  return Boolean(
    field
    && state.missingFields.includes(fieldId)
    && state.askedQuestions.some((questionId) =>
      questionId === field.questionId || questionId.startsWith(`${field.questionId}:correction:`)),
  );
}

function isCorrectableRequiredField(
  state: Readonly<ConversationState>,
  context: Readonly<EndToEndActivatedContext>,
  fieldId: string,
): boolean {
  return Boolean(requiredField(state, context, fieldId) && state.confirmedFacts[fieldId]);
}

function requiredField(
  state: Readonly<ConversationState>,
  context: Readonly<EndToEndActivatedContext>,
  fieldId: string,
): IntakeFieldDefinition | null {
  const serviceId = state.confirmedFacts["requested-service"]?.value;
  const service = context.businessProfile.services.find((candidate) =>
    candidate.id === serviceId && candidate.status === "active");
  const fields = service
    ? resolveIntakeFields(context.businessProfile, service, state)
    : null;
  return fields?.required.find((field) => field.id === fieldId) ?? null;
}

function promptFor(
  context: Readonly<EndToEndActivatedContext>,
  state: Readonly<ConversationState>,
  selectedQuestion: QuestionSelectionResult | null,
): DeterministicWorkflowPrompt {
  if (selectedQuestion?.status === "selected") {
    return availablePrompt(
      "question",
      selectedQuestion.question,
      selectedQuestion.questionId,
      selectedQuestion.field.id,
    );
  }
  if (selectedQuestion?.status === "clarification-required") {
    return availablePrompt(
      "clarification",
      selectedQuestion.question ?? "Please clarify the fictional service request.",
      selectedQuestion.questionId ?? null,
      selectedQuestion.field?.id ?? null,
    );
  }
  if (state.stage === CONVERSATION_STAGES.INITIALIZED) {
    return availablePrompt(
      "greeting",
      `How can ${context.businessProfile.businessName} help?`,
      null,
      null,
    );
  }
  if (state.stage === CONVERSATION_STAGES.CLARIFICATION) {
    return availablePrompt(
      "clarification",
      "Please clarify which configured service best matches the fictional request.",
      null,
      null,
    );
  }
  if (state.stage === CONVERSATION_STAGES.CONFIRMATION) {
    return availablePrompt(
      "confirmation",
      "Please confirm the validated fictional intake summary.",
      null,
      null,
    );
  }
  if (state.stage === CONVERSATION_STAGES.ESCALATION) {
    return availablePrompt(
      "human-review",
      "This fictional request requires human review.",
      null,
      null,
    );
  }
  return {
    status: "none",
    kind: state.stage === CONVERSATION_STAGES.COMPLETED ? "completed" : "handoff-ready",
    questionId: null,
    fieldId: null,
    content: null,
    localFictionalDisplayOnly: true,
    customerReleaseAuthorized: false,
  };
}

function availablePrompt(
  kind: Extract<DeterministicWorkflowPrompt, { readonly status: "available" }>["kind"],
  content: string,
  questionId: string | null,
  fieldId: string | null,
): DeterministicWorkflowPrompt {
  return {
    status: "available",
    kind,
    questionId,
    fieldId,
    content,
    localFictionalDisplayOnly: true,
    customerReleaseAuthorized: false,
  };
}

function deriveHandoff(
  builder: DeterministicHandoffBuilder,
  context: Readonly<EndToEndActivatedContext>,
  state: Readonly<ConversationState>,
):
  | { readonly status: "success"; readonly value: DeterministicWorkflowSnapshot["handoff"] }
  | { readonly status: "failure" } {
  const ready = state.stage === CONVERSATION_STAGES.HANDOFF
    || state.stage === CONVERSATION_STAGES.COMPLETED
    || state.completionState === COMPLETION_STATES.READY_FOR_HANDOFF;
  if (!ready) return { status: "success", value: { status: "not-ready", summary: null } };
  const handoff = builder.build(
    structuredClone(context.businessProfile),
    structuredClone(state),
  );
  return handoff.status === "success"
    ? { status: "success", value: { status: "ready", summary: handoff.summary } }
    : { status: "failure" };
}

function isEligibleActivatedContext(value: unknown): value is EndToEndActivatedContext {
  if (
    !isPlainRecord(value)
    || !isPlainRecord(value.identity)
    || !isPlainRecord(value.businessProfile)
    || !isPlainRecord(value.conversationState)
    || !isPlainRecord(value.currentCustomerInput)
    || !isPlainRecord(value.provenance)
    || !isPlainRecord(value.authority)
    || !Array.isArray(value.knowledge)
  ) return false;
  const candidate = value as unknown as EndToEndActivatedContext;
  const profile = structuredClone(candidate.businessProfile);
  const state = structuredClone(candidate.conversationState);
  const profileValidation = validateBusinessProfile(profile, {
    id: candidate.identity.businessProfileId,
    version: candidate.identity.businessProfileVersion,
  });
  const stateValidation = validateConversationState(state, {
    conversationId: candidate.identity.conversationId,
    businessProfileId: candidate.identity.businessProfileId,
    businessProfileVersion: candidate.identity.businessProfileVersion,
  });
  return profileValidation.valid
    && stateValidation.valid
    && state.revision === candidate.identity.stateRevision
    && Number.isInteger(candidate.identity.activationRevision)
    && candidate.identity.activationRevision > 0
    && isCustomerMessage(candidate.currentCustomerInput)
    && candidate.currentCustomerInput.conversationId === state.conversationId
    && candidate.currentCustomerInput.trust === "untrusted-customer-input"
    && candidate.provenance.contextPolicyVersion === ACTIVATED_CONTEXT_POLICY_VERSION
    && candidate.provenance.groundingPolicyVersion === GROUNDED_OUTPUT_POLICY_VERSION
    && candidate.authority.assembledBy === "application"
    && candidate.authority.providerExecutionAuthorized === false
    && candidate.authority.stateMutationAuthorized === false
    && candidate.authority.customerReleaseAuthorized === false
    && Array.isArray(candidate.knowledge)
    && candidate.knowledge.length > 0
    && candidate.knowledge.every((record) =>
      record.businessProfileId === state.businessProfileId
      && record.businessProfileVersion === state.businessProfileVersion
      && record.activationRevision === candidate.identity.activationRevision
      && record.lifecycleState === "active"
      && (record.audience === "customer" || record.audience === "both")
      && record.eligibility.decision === "included");
}

function isTurnRequest(value: unknown): value is DeterministicWorkflowTurnRequest {
  if (!isPlainRecord(value) || !hasExactKeys(value, [
    "turnId", "scope", "expectedStateRevision", "message", "action",
  ])) return false;
  return isBoundedIdentifier(value.turnId)
    && isWorkflowScope(value.scope)
    && Number.isInteger(value.expectedStateRevision)
    && Number(value.expectedStateRevision) >= 0
    && isCustomerMessage(value.message)
    && isAction(value.action);
}

function isWorkflowScope(value: unknown): boolean {
  return isPlainRecord(value)
    && hasExactKeys(value, [
      "businessProfileId", "businessProfileVersion", "conversationId", "activationRevision",
    ])
    && isBoundedIdentifier(value.businessProfileId)
    && Number.isInteger(value.businessProfileVersion)
    && Number(value.businessProfileVersion) > 0
    && isBoundedIdentifier(value.conversationId)
    && Number.isInteger(value.activationRevision)
    && Number(value.activationRevision) > 0;
}

function isCustomerMessage(value: unknown): value is EndToEndCustomerMessage {
  const hasApprovedKeys = isPlainRecord(value)
    && (hasExactKeys(value, ["messageId", "conversationId", "source", "sequence", "content"])
      || (hasExactKeys(value, [
        "messageId", "conversationId", "source", "sequence", "content", "trust",
      ]) && value.trust === "untrusted-customer-input"));
  return isPlainRecord(value)
    && hasApprovedKeys
    && isBoundedIdentifier(value.messageId)
    && isBoundedIdentifier(value.conversationId)
    && value.source === "customer"
    && Number.isInteger(value.sequence)
    && Number(value.sequence) > 0
    && typeof value.content === "string"
    && value.content === value.content.trim()
    && value.content.length > 0
    && value.content.length <= MAX_MESSAGE_LENGTH;
}

function isAction(value: unknown): value is DeterministicWorkflowAction {
  if (!isPlainRecord(value) || typeof value.type !== "string") return false;
  if ([
    "understand-request", "confirm-intake", "request-human", "complete-conversation",
  ].includes(value.type)) return hasExactKeys(value, ["type"]);
  if (value.type === "answer-required-field" || value.type === "correct-required-field") {
    return hasExactKeys(value, ["type", "fieldId"]) && isBoundedIdentifier(value.fieldId);
  }
  return value.type === "validate-grounded-answer"
    && hasExactKeys(value, ["type", "candidate"])
    && isPlainRecord(value.candidate);
}

function hasExactScope(
  scope: DeterministicWorkflowTurnRequest["scope"],
  context: Readonly<EndToEndActivatedContext>,
): boolean {
  return scope.businessProfileId === context.identity.businessProfileId
    && scope.businessProfileVersion === context.identity.businessProfileVersion
    && scope.conversationId === context.identity.conversationId
    && scope.activationRevision === context.identity.activationRevision;
}

function sameMessage(
  left: Readonly<EndToEndCustomerMessage>,
  right: Readonly<EndToEndCustomerMessage>,
): boolean {
  return left.messageId === right.messageId
    && left.conversationId === right.conversationId
    && left.source === right.source
    && left.sequence === right.sequence
    && left.content === right.content;
}

function managerFromState(state: Readonly<ConversationState>): ConversationStateManager | null {
  const store = new InMemoryConversationStore();
  const created = store.create(structuredClone(state));
  return created.status === "success"
    ? ConversationStateManager.usingStore(store)
    : null;
}

function stateFromManager(
  manager: ConversationStateManager,
  context: Readonly<EndToEndActivatedContext>,
): ConversationState | null {
  const result = manager.snapshot(scopeFor(context));
  return result.status === "success" ? result.state : null;
}

function scopeFor(context: Readonly<EndToEndActivatedContext>) {
  return {
    businessProfileId: context.identity.businessProfileId,
    businessProfileVersion: context.identity.businessProfileVersion,
    conversationId: context.identity.conversationId,
  };
}

function rejected(reason: "ActionNotAllowed" | "TransitionRejected"): AppliedActionResult {
  return {
    status: "failure",
    reason,
    error: reason === "ActionNotAllowed"
      ? "The deterministic action is not allowed in the current state."
      : "The deterministic state transition was rejected.",
  };
}

function workflowFailure(
  reason: DeterministicWorkflowFailureReason,
  error: string,
  stateRevision: number | null,
): Extract<DeterministicWorkflowTurnResult, { readonly status: "failure" }> {
  return deepFreeze({
    status: "failure",
    reason,
    errors: [error],
    stateRevision,
    customerReleaseAuthorized: false,
  });
}

function isBoundedIdentifier(value: unknown): value is string {
  return typeof value === "string"
    && value === value.trim()
    && value.length > 0
    && value.length <= MAX_IDENTIFIER_LENGTH;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function hasExactKeys(value: Readonly<Record<string, unknown>>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}
