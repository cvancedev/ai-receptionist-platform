import type { BusinessProfile } from "../domain/business-profile";
import type { ConversationState } from "../domain/conversation-state";
import type { DeterministicIntakeResult, QuestionSelectionResult, ServiceResolutionResult } from "../domain/intake";
import { COMPLETION_STATES, CONVERSATION_STAGES, ESCALATION_STATES } from "../shared/constants";
import { validateBusinessProfile } from "../validation/business-profile-validation";
import { validateConversationState } from "../validation/conversation-state-validation";
import { ConversationStateManager } from "./conversation-state-manager";
import type { ConversationScope, ConversationStateUpdate } from "./conversation-state-updates";
import { resolveIntakeFields } from "./intake-field-resolution";
import { selectNextIntakeQuestion } from "./intake-question-selector";
import { evaluateIntakeReadiness } from "./intake-readiness";
import { resolveService } from "./service-resolution";

export interface ConversationEngineInput {
  businessProfile: BusinessProfile;
  conversationState: ConversationState;
  serviceInput?: string;
}

export class DeterministicConversationEngine {
  private readonly scope: ConversationScope;

  constructor(
    private readonly profile: BusinessProfile,
    private readonly stateManager: ConversationStateManager,
    conversationId: string,
  ) {
    this.scope = {
      conversationId,
      businessProfileId: profile.id,
      businessProfileVersion: profile.version,
    };
  }

  initializeIntake(serviceInput: string, source: string): DeterministicIntakeResult {
    const state = this.requireState();
    const resolution = resolveService(this.profile, state, serviceInput);
    if (serviceInput.trim()) this.applyRequired({ type: "record-claim", scope: this.scope, field: "requested-service", value: serviceInput, source });
    this.enterIntakeIfInitialized();
    if (resolution.status === "ambiguous") {
      this.applyRequired({ type: "transition-stage", scope: this.scope, stage: CONVERSATION_STAGES.CLARIFICATION });
      return this.result(resolution);
    }
    if (resolution.status === "unsupported") {
      this.applyRequired({
        type: "set-escalation",
        scope: this.scope,
        status: ESCALATION_STATES.REQUIRED,
        reason: resolution.reason,
        triggerSource: source,
        destination: this.profile.escalation.destination,
      });
      return this.result(resolution);
    }
    if (resolution.status !== "resolved") return this.result(resolution);
    this.applyRequired({ type: "confirm-fact", scope: this.scope, field: "requested-service", value: resolution.service.id, source: "application-service-resolution" });
    const fields = resolveIntakeFields(this.profile, resolution.service, this.requireState());
    if (!fields) return this.blockedResult(resolution, ["Intake configuration could not be resolved."]);
    for (const field of fields.required) {
      if (!this.requireState().confirmedFacts[field.id]) {
        const result = this.stateManager.apply({ type: "add-missing-field", scope: this.scope, field: field.id });
        if (result.status === "failure") return this.blockedResult(resolution, result.errors);
      }
    }
    const evaluated = this.evaluate();
    return { ...evaluated, serviceResolution: resolution };
  }

  selectAndMarkNextQuestion(): QuestionSelectionResult {
    const result = this.evaluate().nextQuestion;
    if (result.status === "selected") {
      this.applyRequired({ type: "mark-question-asked", scope: this.scope, questionId: result.questionId });
    } else if (result.status === "clarification-required" && result.questionId) {
      this.applyRequired({ type: "mark-question-asked", scope: this.scope, questionId: result.questionId });
    }
    return result;
  }

  applyAnswer(fieldId: string, value: string, source: string): DeterministicIntakeResult {
    const state = this.requireState();
    const service = this.currentService(state);
    if (!service) return this.blockedResult(resolveService(this.profile, state, null), ["A service must be resolved before intake answers."]);
    const fields = resolveIntakeFields(this.profile, service, state);
    const field = fields && [...fields.required, ...fields.optional].find((candidate) => candidate.id === fieldId);
    if (!field || !value.trim()) return this.blockedResult(resolveService(this.profile, state, service.id), ["The intake answer is invalid or outside the resolved service."]);
    this.applyRequired({ type: "record-claim", scope: this.scope, field: fieldId, value, source });
    const current = this.requireState().confirmedFacts[fieldId];
    if (current && current.value !== value) {
      const stage = this.requireState().stage;
      if (stage === CONVERSATION_STAGES.INTAKE || stage === CONVERSATION_STAGES.CONFIRMATION) {
        this.applyRequired({ type: "transition-stage", scope: this.scope, stage: CONVERSATION_STAGES.CLARIFICATION });
      }
      return this.evaluate();
    }
    this.applyRequired({ type: "confirm-fact", scope: this.scope, field: fieldId, value, source: "application-intake-validation" });
    return this.evaluate();
  }

  correctAnswer(fieldId: string, correctedValue: string, source: string): DeterministicIntakeResult {
    const service = this.currentService(this.requireState());
    const fields = service && resolveIntakeFields(this.profile, service, this.requireState());
    if (!fields?.required.some((field) => field.id === fieldId) || !correctedValue.trim()) {
      return this.blockedResult(this.currentResolution(), ["The correction is invalid or outside required intake."]);
    }
    this.applyRequired({ type: "correct-value", scope: this.scope, field: fieldId, correctedValue, source, reason: "Customer corrected intake information." });
    return this.evaluate();
  }

  coordinateReadiness(): DeterministicIntakeResult {
    const evaluated = this.evaluate();
    if (evaluated.readiness.status === "ready-for-confirmation" && evaluated.stage !== CONVERSATION_STAGES.CONFIRMATION) {
      this.applyRequired({ type: "set-completion", scope: this.scope, status: COMPLETION_STATES.READY_FOR_CONFIRMATION });
      this.applyRequired({ type: "transition-stage", scope: this.scope, stage: CONVERSATION_STAGES.CONFIRMATION });
    }
    return this.evaluate();
  }

  confirmIntake(): DeterministicIntakeResult {
    const state = this.requireState();
    const readiness = evaluateIntakeReadiness(this.profile, state, this.currentService(state));
    if (state.stage !== CONVERSATION_STAGES.CONFIRMATION || readiness.status !== "ready-for-confirmation") {
      return this.blockedResult(this.currentResolution(), ["Intake is not ready for confirmation."]);
    }
    this.applyRequired({ type: "set-completion", scope: this.scope, status: COMPLETION_STATES.READY_FOR_HANDOFF });
    this.applyRequired({ type: "transition-stage", scope: this.scope, stage: CONVERSATION_STAGES.HANDOFF });
    return this.evaluate();
  }

  evaluate(): DeterministicIntakeResult {
    const state = this.requireState();
    const resolution = this.currentResolution();
    const profileValidation = validateBusinessProfile(this.profile, { id: state.businessProfileId, version: state.businessProfileVersion });
    const stateValidation = validateConversationState(state, this.scope);
    const errors = [...profileValidation.errors, ...stateValidation.errors];
    if (errors.length) return this.blockedResult(resolution, errors);
    const service = resolution.status === "resolved" ? resolution.service : undefined;
    const fields = service ? resolveIntakeFields(this.profile, service, state) : null;
    const nextQuestion = fields ? selectNextIntakeQuestion(state, fields.required) : resolution.status === "ambiguous" ? { status: "clarification-required", reason: resolution.reason } satisfies QuestionSelectionResult : { status: "none", reason: "A service must be resolved before intake questions." } satisfies QuestionSelectionResult;
    const readiness = evaluateIntakeReadiness(this.profile, state, service);
    return {
      stage: state.stage,
      serviceResolution: resolution,
      nextQuestion,
      unresolvedRequiredFields: fields?.unresolvedRequired.map((field) => field.id) ?? [],
      readiness,
      escalationStatus: state.escalation.status,
      handoffAvailable: readiness.status === "ready-for-handoff",
      validationErrors: [],
    };
  }

  private currentResolution() {
    const state = this.requireState();
    return resolveService(this.profile, state, state.confirmedFacts["requested-service"]?.value);
  }

  private currentService(state: ConversationState) {
    const id = state.confirmedFacts["requested-service"]?.value;
    return this.profile.services.find((service) => service.id === id && service.status === "active");
  }

  private enterIntakeIfInitialized() {
    if (this.requireState().stage === CONVERSATION_STAGES.INITIALIZED) this.applyRequired({ type: "transition-stage", scope: this.scope, stage: CONVERSATION_STAGES.INTAKE });
  }

  private requireState() {
    const result = this.stateManager.snapshot(this.scope);
    if (result.status === "failure") throw new Error("Prototype conversation state is unavailable.");
    return result.state;
  }

  private applyRequired(update: ConversationStateUpdate) {
    const result = this.stateManager.apply(update);
    if (result.status !== "success" && result.status !== "no-op") throw new Error(result.errors.join(" "));
  }

  private result(resolution: ServiceResolutionResult): DeterministicIntakeResult {
    const state = this.requireState();
    return { stage: state.stage, serviceResolution: resolution, nextQuestion: resolution.status === "ambiguous" ? { status: "clarification-required", reason: resolution.reason } : { status: "none", reason: "No intake question is available." }, unresolvedRequiredFields: [...state.missingFields], readiness: resolution.status === "blocked" ? { status: "blocked", unresolvedFields: [...state.missingFields], errors: resolution.errors } : { status: "not-ready", unresolvedFields: [...state.missingFields], reason: "Service resolution is incomplete." }, escalationStatus: state.escalation.status, handoffAvailable: false, validationErrors: resolution.status === "blocked" ? resolution.errors : [] };
  }

  private blockedResult(resolution: ServiceResolutionResult, errors: readonly string[]): DeterministicIntakeResult {
    const state = this.requireState();
    return { stage: state.stage, serviceResolution: resolution, nextQuestion: { status: "blocked", errors }, unresolvedRequiredFields: [...state.missingFields], readiness: { status: "blocked", unresolvedFields: [...state.missingFields], errors }, escalationStatus: state.escalation.status, handoffAvailable: false, validationErrors: errors };
  }
}
