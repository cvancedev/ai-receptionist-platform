import type { AiDemoTurnResult } from "../../ai/demo/ai-demo-turn";
import { runAiDemoTurn } from "../../ai/demo/ai-demo-turn";
import { createSimulatedModelTransport } from "../../ai/demo/simulated-model-transport";
import type { OfflineTransport } from "../../ai/providers/transport-model-provider-adapter";
import { ConversationStateManager } from "../../conversation/conversation-state-manager";
import type { ConversationScope } from "../../conversation/conversation-state-updates";
import type { BusinessProfile } from "../../domain/business-profile";
import type { ConversationState } from "../../domain/conversation-state";
import type { DeterministicIntakeResult, QuestionSelectionResult } from "../../domain/intake";
import type { KnowledgeRecord } from "../../domain/knowledge-record";
import { PrototypeConversationOrchestrator } from "../../services/conversation-orchestrator";
import { CONVERSATION_STAGES } from "../../shared/constants";

if (typeof window !== "undefined") {
  throw new Error("The receptionist conversation service is server-only.");
}

/**
 * Server-side conversation runtime for one authenticated session.
 *
 * It reuses the certified deterministic conversation engine and the Stage A/B1
 * simulated language layer unchanged in authority: the model may only return a
 * validated interpretation or candidate fact, and only this service may apply
 * an accepted result through the deterministic orchestrator. It cannot execute
 * tools, release customer responses, choose a business, choose a conversation,
 * or bypass the application validator.
 *
 * Turns for one conversation are serialized so concurrent HTTP requests cannot
 * interleave reads, provider work, and state replacements.
 */
export const RECEPTIONIST_SERVICE_VERSION = "b2.2-receptionist-service/v1" as const;
export const MAXIMUM_MESSAGE_LENGTH = 2_000;
export const MAXIMUM_CONVERSATIONS = 2_000;
const MAXIMUM_RETURNED_MESSAGES = 40;

const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const CONFIRM_MESSAGE = /^(confirm|confirmed|yes)$/i;
const CORRECTION_MESSAGE = /^correct\s+([a-z0-9-]+)\s*:\s*(.+)$/i;

export interface ReceptionistBusiness {
  readonly profile: BusinessProfile;
  readonly knowledge: readonly KnowledgeRecord[];
}

export interface SanitizedMessage {
  readonly role: "customer" | "assistant";
  readonly text: string;
}

export interface SanitizedConversation {
  readonly stage: string;
  readonly revision: number;
  readonly pendingFieldId: string | null;
  readonly readiness: string;
  readonly handoffAvailable: boolean;
}

export type ReceptionistDecision =
  | "accepted"
  | "clarification"
  | "confirmation"
  | "escalation"
  | "handoff"
  | "not-performed"
  | "rejected";

export type ReceptionistTurnOutcome =
  | {
      readonly status: "ok";
      readonly turn: number;
      readonly decision: ReceptionistDecision;
      readonly messages: readonly SanitizedMessage[];
      readonly conversation: SanitizedConversation;
    }
  | { readonly status: "provider-failure" }
  | { readonly status: "conversation-unavailable" }
  | { readonly status: "invalid-message" }
  | { readonly status: "internal-failure" };

export interface ReceptionistConversationServiceOptions {
  readonly transport?: OfflineTransport;
  readonly maximumConversations?: number;
}

interface InternalMessage {
  readonly id: number;
  readonly role: "customer" | "assistant";
  readonly text: string;
}

interface ConversationRuntime {
  readonly business: ReceptionistBusiness;
  readonly conversationId: string;
  readonly scope: ConversationScope;
  readonly manager: ConversationStateManager;
  readonly orchestrator: PrototypeConversationOrchestrator;
  readonly messages: InternalMessage[];
  pendingFieldId: string | null;
  handoffAvailable: boolean;
  turn: number;
  nextMessageId: number;
}

export class ReceptionistConversationService {
  private readonly businesses = new Map<string, ReceptionistBusiness>();
  private readonly conversations = new Map<string, ConversationRuntime>();
  private readonly queues = new Map<string, Promise<void>>();
  private readonly transport: OfflineTransport | undefined;
  private readonly maximumConversations: number;

  constructor(
    businesses: readonly ReceptionistBusiness[],
    options: ReceptionistConversationServiceOptions = {},
  ) {
    for (const business of businesses) {
      const normalized = normalizeBusiness(business);
      if (!normalized) throw new Error("The receptionist business configuration is invalid.");
      if (this.businesses.has(normalized.profile.id)) {
        throw new Error("Receptionist business identifiers must be unique.");
      }
      this.businesses.set(normalized.profile.id, normalized);
    }
    if (this.businesses.size === 0) throw new Error("At least one receptionist business is required.");
    this.transport = options.transport;
    this.maximumConversations = boundedInteger(
      options.maximumConversations ?? MAXIMUM_CONVERSATIONS,
      1,
      MAXIMUM_CONVERSATIONS,
    ) ?? MAXIMUM_CONVERSATIONS;
  }

  hasBusiness(businessId: unknown): boolean {
    return typeof businessId === "string" && this.businesses.has(businessId);
  }

  begin(businessId: unknown, conversationId: unknown): boolean {
    if (!isIdentifier(businessId) || !isIdentifier(conversationId)) return false;
    const business = this.businesses.get(businessId);
    if (!business || business.profile.status !== "active") return false;
    const key = conversationKey(businessId, conversationId);
    if (this.conversations.has(key)) return false;
    if (this.conversations.size >= this.maximumConversations) return false;

    const manager = new ConversationStateManager();
    const initialized = manager.initialize({
      conversationId,
      businessProfileId: business.profile.id,
      businessProfileVersion: business.profile.version,
      requiredFields: ["requested-service"],
      authorizedEscalationDestination: business.profile.escalation.destination,
    });
    if (initialized.status === "failure") return false;

    const orchestrator = new PrototypeConversationOrchestrator(
      business.profile,
      manager,
      conversationId,
    );
    const runtime: ConversationRuntime = {
      business,
      conversationId,
      scope: {
        conversationId,
        businessProfileId: business.profile.id,
        businessProfileVersion: business.profile.version,
      },
      manager,
      orchestrator,
      messages: [],
      pendingFieldId: null,
      handoffAvailable: false,
      turn: 0,
      nextMessageId: 1,
    };
    this.addMessage(
      runtime,
      "assistant",
      "Simulated AI receptionist for a fictional business. No model provider, network, credential, or real customer data is used. What fictional service do you need?",
    );
    this.conversations.set(key, runtime);
    return true;
  }

  revisionOf(businessId: unknown, conversationId: unknown): number | null {
    if (!isIdentifier(businessId) || !isIdentifier(conversationId)) return null;
    const runtime = this.conversations.get(conversationKey(businessId, conversationId));
    if (!runtime) return null;
    const snapshot = this.managerSnapshot(runtime);
    return snapshot ? snapshot.revision : null;
  }

  async submit(input: unknown): Promise<ReceptionistTurnOutcome> {
    const parsed = parseTurnInput(input);
    if (!parsed) return Object.freeze({ status: "invalid-message" });
    const runtime = this.conversations.get(
      conversationKey(parsed.businessId, parsed.conversationId),
    );
    if (!runtime) return Object.freeze({ status: "conversation-unavailable" });
    if (runtime.business.profile.status !== "active") {
      return Object.freeze({ status: "conversation-unavailable" });
    }

    const key = conversationKey(parsed.businessId, parsed.conversationId);
    const previous = this.queues.get(key) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.queues.set(key, current);
    await previous;
    try {
      return await this.process(runtime, parsed.message);
    } finally {
      release();
      if (this.queues.get(key) === current) this.queues.delete(key);
    }
  }

  private async process(
    runtime: ConversationRuntime,
    message: string,
  ): Promise<ReceptionistTurnOutcome> {
    let state: ConversationState;
    try {
      state = this.requireState(runtime);
    } catch {
      return Object.freeze({ status: "conversation-unavailable" });
    }

    const startIndex = runtime.messages.length;
    runtime.turn += 1;
    this.addMessage(runtime, "customer", message);

    try {
      if (state.stage === CONVERSATION_STAGES.ESCALATION) {
        this.addMessage(
          runtime,
          "assistant",
          "This fictional conversation requires human review. Routine intake is paused.",
        );
        return this.ok(runtime, "escalation", startIndex);
      }
      if (state.stage === CONVERSATION_STAGES.HANDOFF
        || state.stage === CONVERSATION_STAGES.COMPLETED) {
        this.addMessage(
          runtime,
          "assistant",
          "The fictional intake is already ready for handoff. Start another scenario to continue.",
        );
        return this.ok(runtime, "handoff", startIndex);
      }
      if (state.stage === CONVERSATION_STAGES.CONFIRMATION) {
        const handled = this.handleConfirmation(runtime, message);
        return this.ok(runtime, "confirmation", startIndex, handled ? "accepted" : "clarification");
      }

      const result = await this.runSimulatedTurn(runtime, message);
      if (!result.performed) {
        this.addMessage(runtime, "assistant", "No simulated AI task applies to this fictional turn.");
        return this.ok(runtime, "not-performed", startIndex);
      }
      // A completed but invalid proposal carries a decision and no proposal;
      // that is an application rejection, not a provider transport failure.
      if (!result.decision) {
        return Object.freeze({ status: "provider-failure" });
      }
      if (result.decision.decision !== "accepted" || !result.proposal) {
        this.addMessage(
          runtime,
          "assistant",
          "The simulated receptionist could not safely interpret that message. Nothing was saved.",
        );
        return this.ok(runtime, "rejected", startIndex);
      }

      const applied = this.applyAccepted(runtime, result);
      return this.ok(runtime, applied ? "accepted" : "rejected", startIndex);
    } catch {
      return Object.freeze({ status: "internal-failure" });
    }
  }

  private async runSimulatedTurn(
    runtime: ConversationRuntime,
    message: string,
  ): Promise<AiDemoTurnResult> {
    const state = this.requireState(runtime);
    const current = runtime.messages[runtime.messages.length - 1];
    if (!current) throw new Error("The current customer message is unavailable.");
    const history = runtime.messages.slice(0, -1).map((entry, index) => ({
      messageId: `server-history-${runtime.conversationId}-${entry.id}`,
      conversationId: runtime.conversationId,
      source: entry.role === "customer" ? "customer" as const : "application" as const,
      sequence: index + 1,
      content: entry.text,
    }));
    const turnLabel = `${runtime.conversationId}-${runtime.turn}`;
    return runAiDemoTurn({
      businessProfile: runtime.business.profile,
      knowledge: runtime.business.knowledge,
      conversationState: state,
      conversationEntries: history,
      currentCustomerInput: {
        messageId: `server-current-${runtime.conversationId}-${current.id}`,
        conversationId: runtime.conversationId,
        source: "customer",
        sequence: runtime.messages.length,
        content: message,
      },
      pendingFieldId: runtime.pendingFieldId,
      identifiers: {
        requestId: `server-request-${turnLabel}`,
        traceId: `server-trace-${turnLabel}`,
        contextPackageId: `server-context-${turnLabel}`,
        promptPackageId: `server-prompt-${turnLabel}`,
      },
      transport: this.transport ?? createSimulatedModelTransport(runtime.business.profile),
    });
  }

  private applyAccepted(runtime: ConversationRuntime, result: AiDemoTurnResult): boolean {
    const proposal = result.proposal;
    if (!proposal) return false;
    if (result.taskIdentifier === "language_interpretation") {
      this.applyInterpretation(runtime, proposal);
      return true;
    }
    if (result.taskIdentifier === "candidate_fact_extraction") {
      return this.applyCandidateFact(runtime, proposal);
    }
    return false;
  }

  private applyInterpretation(
    runtime: ConversationRuntime,
    proposal: Readonly<Record<string, unknown>>,
  ): void {
    if (proposal.ambiguity === true) {
      const options = runtime.business.profile.services
        .filter((service) => service.status === "active")
        .map((service) => service.name)
        .join(" or ");
      this.addMessage(
        runtime,
        "assistant",
        `That request matches more than one fictional service: ${options}. Which one do you need?`,
      );
      return;
    }

    const candidate = proposal.candidateServiceReference;
    if (typeof candidate === "string" && candidate.length > 0) {
      const intake = this.requireIntake(runtime.orchestrator.processTurn({
        type: "start-intake",
        serviceInput: candidate,
        source: this.source(runtime, "service"),
      }));
      if (intake.serviceResolution.status === "resolved") {
        this.addMessage(
          runtime,
          "assistant",
          `Simulated interpretation resolved the fictional service: ${intake.serviceResolution.service.name}.`,
        );
        this.askNextOrCoordinate(runtime);
        return;
      }
      if (intake.serviceResolution.status === "unsupported") {
        this.addMessage(
          runtime,
          "assistant",
          "That service is not configured for this fictional business. The request was preserved and marked for human review; no service was invented.",
        );
        return;
      }
      this.addMessage(
        runtime,
        "assistant",
        "The simulated service proposal was not usable, so no fictional service was selected.",
      );
      return;
    }

    const intake = this.requireIntake(runtime.orchestrator.processTurn({
      type: "start-intake",
      serviceInput: this.lastCustomerText(runtime),
      source: this.source(runtime, "unsupported"),
    }));
    this.addMessage(
      runtime,
      "assistant",
      intake.serviceResolution.status === "unsupported"
        ? "That request is outside the configured fictional services. It was preserved and marked for human review; no service or commitment was invented."
        : "The simulated receptionist could not identify a configured fictional service.",
    );
  }

  private applyCandidateFact(
    runtime: ConversationRuntime,
    proposal: Readonly<Record<string, unknown>>,
  ): boolean {
    const field = proposal.fieldIdentifier;
    const value = proposal.candidateValue;
    if (typeof field !== "string" || typeof value !== "string" || !value.trim()) {
      this.addMessage(
        runtime,
        "assistant",
        "The simulated receptionist could not extract a usable fictional answer.",
      );
      return false;
    }
    if (!runtime.pendingFieldId || field !== runtime.pendingFieldId) {
      this.addMessage(
        runtime,
        "assistant",
        "The simulated receptionist proposed a field that is not currently being collected, so it was not applied.",
      );
      return false;
    }
    const intake = this.requireIntake(runtime.orchestrator.processTurn({
      type: "answer",
      fieldId: field,
      value,
      source: this.source(runtime, field),
    }));
    if (intake.validationErrors.length > 0) {
      this.addMessage(
        runtime,
        "assistant",
        "The deterministic backend rejected that fictional answer.",
      );
      return false;
    }
    runtime.pendingFieldId = null;
    this.askNextOrCoordinate(runtime);
    return true;
  }

  private handleConfirmation(
    runtime: ConversationRuntime,
    message: string,
  ): boolean {
    if (CONFIRM_MESSAGE.test(message)) {
      const result = this.requireIntake(runtime.orchestrator.processTurn({
        type: "confirm-intake",
      }));
      if (result.validationErrors.length > 0) return false;
      const built = runtime.orchestrator.processTurn({ type: "build-handoff" }).handoff;
      if (!built || built.status === "failure") return false;
      runtime.handoffAvailable = true;
      this.addMessage(
        runtime,
        "assistant",
        "Fictional intake confirmed. The validated handoff summary is now available to the application.",
      );
      return true;
    }

    const correction = CORRECTION_MESSAGE.exec(message);
    if (!correction) {
      this.addMessage(
        runtime,
        "assistant",
        "Type “confirm” to approve the fictional intake, or use “correct field-id: new value” to make a correction.",
      );
      return false;
    }
    const result = this.requireIntake(runtime.orchestrator.processTurn({
      type: "correction",
      fieldId: correction[1],
      value: correction[2],
      source: this.source(runtime, "correction"),
    }));
    if (result.validationErrors.length > 0) return false;
    this.addMessage(runtime, "assistant", `Correction preserved for ${correction[1]}.`);
    this.askNextOrCoordinate(runtime);
    return true;
  }

  private askNextOrCoordinate(runtime: ConversationRuntime): void {
    const coordinated = this.requireIntake(
      runtime.orchestrator.processTurn({ type: "coordinate-readiness" }),
    );
    if (coordinated.stage === CONVERSATION_STAGES.CONFIRMATION) {
      runtime.pendingFieldId = null;
      this.addMessage(
        runtime,
        "assistant",
        "All required fictional information is confirmed. Type “confirm” or “correct field-id: new value.”",
      );
      return;
    }
    const question = runtime.orchestrator.processTurn({ type: "select-question" }).question;
    if (!question) throw new Error("The deterministic question result is unavailable.");
    this.renderQuestion(runtime, question);
  }

  private renderQuestion(runtime: ConversationRuntime, question: QuestionSelectionResult): void {
    if (question.status === "selected") {
      runtime.pendingFieldId = question.field.id;
      this.addMessage(runtime, "assistant", question.question);
      return;
    }
    if (question.status === "clarification-required") {
      runtime.pendingFieldId = question.field?.id ?? null;
      this.addMessage(runtime, "assistant", question.question ?? question.reason);
      return;
    }
    if (question.status === "blocked") {
      runtime.pendingFieldId = null;
      this.addMessage(runtime, "assistant", "The fictional intake could not continue safely.");
    }
  }

  private ok(
    runtime: ConversationRuntime,
    decision: ReceptionistDecision,
    startIndex: number,
    overrideDecision?: ReceptionistDecision,
  ): ReceptionistTurnOutcome {
    const state = this.requireState(runtime);
    const evaluated = runtime.orchestrator.processTurn({ type: "evaluate" }).intake;
    if (!evaluated) throw new Error("The deterministic intake result is unavailable.");
    return Object.freeze({
      status: "ok",
      turn: runtime.turn,
      decision: overrideDecision ?? decision,
      messages: Object.freeze(
        runtime.messages
          .slice(startIndex)
          .slice(-MAXIMUM_RETURNED_MESSAGES)
          .map((entry) => Object.freeze({ role: entry.role, text: entry.text })),
      ),
      conversation: Object.freeze({
        stage: state.stage,
        revision: state.revision,
        pendingFieldId: runtime.pendingFieldId,
        readiness: evaluated.readiness.status,
        handoffAvailable: runtime.handoffAvailable,
      }),
    });
  }

  private requireIntake(
    result: ReturnType<PrototypeConversationOrchestrator["processTurn"]>,
  ): DeterministicIntakeResult {
    if (!result.intake) throw new Error("The deterministic intake result is unavailable.");
    return result.intake;
  }

  private requireState(runtime: ConversationRuntime): ConversationState {
    const snapshot = this.managerSnapshot(runtime);
    if (!snapshot) throw new Error("The conversation state is unavailable.");
    return snapshot;
  }

  private managerSnapshot(runtime: ConversationRuntime): ConversationState | null {
    const result = runtime.manager.snapshot(runtime.scope);
    return result.status === "success" ? result.state : null;
  }

  private addMessage(
    runtime: ConversationRuntime,
    role: "customer" | "assistant",
    text: string,
  ): InternalMessage {
    const message = Object.freeze({
      id: runtime.nextMessageId,
      role,
      text,
    });
    runtime.nextMessageId += 1;
    runtime.messages.push(message);
    if (runtime.messages.length > 100) {
      runtime.messages.splice(0, runtime.messages.length - 100);
    }
    return message;
  }

  private lastCustomerText(runtime: ConversationRuntime): string {
    for (let index = runtime.messages.length - 1; index >= 0; index -= 1) {
      const message = runtime.messages[index];
      if (message?.role === "customer") return message.text;
    }
    return "";
  }

  private source(runtime: ConversationRuntime, label: string): string {
    return `server-${runtime.conversationId}-${label}-${runtime.turn}`;
  }
}

function normalizeBusiness(business: unknown): ReceptionistBusiness | null {
  if (!isPlainRecord(business)
    || !isPlainRecord(business.profile)
    || !Array.isArray(business.knowledge)) return null;
  const profile = business.profile as unknown as BusinessProfile;
  if (!isIdentifier(profile.id) || !Number.isInteger(profile.version)
    || profile.version < 1 || profile.status !== "active") return null;
  if (!Array.isArray(profile.services) || !Array.isArray(profile.intakeRequirements)) return null;
  const knowledge = business.knowledge as readonly KnowledgeRecord[];
  if (knowledge.some((record) => !isPlainRecord(record)
    || record.businessProfileId !== profile.id)) return null;
  return Object.freeze({
    profile: profile as BusinessProfile,
    knowledge: Object.freeze([...knowledge]),
  });
}

function parseTurnInput(input: unknown): {
  readonly businessId: string;
  readonly conversationId: string;
  readonly message: string;
} | null {
  if (!isPlainRecord(input)
    || !isIdentifier(input.businessId)
    || !isIdentifier(input.conversationId)
    || typeof input.message !== "string") return null;
  const message = input.message.trim();
  if (message.length === 0 || message.length > MAXIMUM_MESSAGE_LENGTH) return null;
  if (CONTROL_CHARACTERS.test(message)) return null;
  return {
    businessId: input.businessId,
    conversationId: input.conversationId,
    message,
  };
}

function conversationKey(businessId: string, conversationId: string): string {
  // JSON encoding prevents delimiter collisions between two valid identifiers.
  return JSON.stringify([businessId, conversationId]);
}

function isIdentifier(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length < 1 || value.length > 128) return false;
  if (value !== value.trim()) return false;
  for (const character of value) {
    const code = character.charCodeAt(0);
    const allowed = (code >= 0x30 && code <= 0x39)
      || (code >= 0x41 && code <= 0x5a)
      || (code >= 0x61 && code <= 0x7a)
      || code === 0x2d
      || code === 0x5f
      || code === 0x2e
      || code === 0x3a;
    if (!allowed) return false;
  }
  return true;
}

function boundedInteger(value: unknown, minimum: number, maximum: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < minimum || value > maximum) return null;
  return value;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
