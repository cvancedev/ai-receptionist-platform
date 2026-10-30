import type { AiDemoTurnResult } from "../../ai/demo/ai-demo-turn";
import { runAiDemoTurn } from "../../ai/demo/ai-demo-turn";
import {
  createConversationHandle,
  digestConversationHandle,
  isConversationHandle,
} from "../auth/conversation-handle";
import { createSimulatedModelTransport } from "../../ai/demo/simulated-model-transport";
import type { OfflineTransport } from "../../ai/providers/transport-model-provider-adapter";
import { ConversationStateManager } from "../../conversation/conversation-state-manager";
import { InMemoryConversationStore } from "../../conversation/in-memory-conversation-store";
import { decodeConversationState } from "../../validation/conversation-state-codec";
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
export const RECEPTIONIST_SERVICE_VERSION = "b2.3.2-receptionist-service/v1" as const;
export const MAXIMUM_MESSAGE_LENGTH = 2_000;
export const MAXIMUM_CONVERSATIONS = 2_000;
export const INITIAL_GREETING =
  "Simulated AI receptionist for a fictional business. No model provider, network, credential, or real customer data is used. What fictional service do you need?";
const MAXIMUM_RETURNED_MESSAGES = 40;

const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const CONFIRM_MESSAGE = /^(confirm|confirmed|yes)$/i;
const CORRECTION_MESSAGE = /^correct\s+([a-z0-9-]+)\s*:\s*(.+)$/i;

export interface ReceptionistBusiness {
  readonly profile: BusinessProfile;
  readonly knowledge: readonly KnowledgeRecord[];
}

export interface DurableConversationSnapshot {
  readonly state: ConversationState;
  readonly messages: readonly InternalMessageSnapshot[];
  readonly pendingFieldId: string | null;
  readonly handoffAvailable: boolean;
  readonly turn: number;
  readonly nextMessageId: number;
}

export interface InternalMessageSnapshot {
  readonly messageId: number;
  readonly role: "customer" | "assistant";
  readonly content: string;
}

export interface HydrateConversationInput {
  readonly businessId: string;
  readonly conversationId: string;
  readonly state: Readonly<ConversationState>;
  readonly messages: readonly InternalMessageSnapshot[];
  readonly pendingFieldId: string | null;
  readonly handoffAvailable: boolean;
  readonly turn: number;
  readonly nextMessageId: number;
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
      /** True when a duplicate turn identifier was answered from its receipt. */
      readonly replayed?: boolean;
    }
  | { readonly status: "conflict"; readonly reason: "stale" | "turn-mismatch" }
  | { readonly status: "budget-exhausted" }
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
  /** Handle digest to conversation key. Handles are never stored in clear. */
  private readonly handles = new Map<string, string>();
  /** Raw handle is retained in memory only, for in-process reuse. */
  private readonly rawHandleByKey = new Map<string, string>();
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

  /**
   * Create one conversation and return its opaque server-side handle. The
   * caller cannot choose the handle, and the handle reveals no identity.
   */
  begin(businessId: unknown, conversationId: unknown): string | null {
    if (!isIdentifier(businessId) || !isIdentifier(conversationId)) return null;
    const business = this.businesses.get(businessId);
    if (!business || business.profile.status !== "active") return null;
    const key = conversationKey(businessId, conversationId);
    if (this.conversations.has(key)) return null;
    if (this.conversations.size >= this.maximumConversations) return null;

    const manager = new ConversationStateManager();
    const initialized = manager.initialize({
      conversationId,
      businessProfileId: business.profile.id,
      businessProfileVersion: business.profile.version,
      requiredFields: ["requested-service"],
      authorizedEscalationDestination: business.profile.escalation.destination,
    });
    if (initialized.status === "failure") return null;

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
    this.addMessage(runtime, "assistant", INITIAL_GREETING);
    this.conversations.set(key, runtime);
    return this.registerHandle(key);
  }

  /**
   * Rebuild a conversation from a persisted snapshot. This is used after a
   * restart or on the first turn served by a new instance, so the engine sees
   * exactly the durable state and message history rather than a fresh scope.
   */
  hydrate(input: HydrateConversationInput): string | null {
    const business = this.businesses.get(input.businessId);
    if (!business || business.profile.status !== "active") return null;
    if (!isIdentifier(input.conversationId)) return null;
    if (input.state.conversationId !== input.conversationId
      || input.state.businessProfileId !== business.profile.id
      || input.state.businessProfileVersion !== business.profile.version) return null;
    const decoded = decodeConversationState(input.state, {
      conversationId: input.conversationId,
      businessProfileId: business.profile.id,
      businessProfileVersion: business.profile.version,
    });
    if (decoded.status === "failure") return null;

    const key = conversationKey(input.businessId, input.conversationId);
    if (this.conversations.has(key)) return null;
    if (this.conversations.size >= this.maximumConversations) return null;

    if (!Number.isInteger(input.turn) || input.turn < 0) return null;
    if (!Number.isInteger(input.nextMessageId) || input.nextMessageId < 1) return null;
    if (input.messages.length > 100) return null;
    const messages: InternalMessage[] = [];
    const ids = new Set<number>();
    for (const message of input.messages) {
      if (!Number.isInteger(message.messageId) || message.messageId < 1) return null;
      if (ids.has(message.messageId)) return null;
      if (message.role !== "customer" && message.role !== "assistant") return null;
      if (typeof message.content !== "string" || message.content.length === 0) return null;
      if (message.messageId >= input.nextMessageId) return null;
      ids.add(message.messageId);
      messages.push(Object.freeze({
        id: message.messageId,
        role: message.role,
        text: message.content,
      }));
    }
    messages.sort((left, right) => left.id - right.id);

    const store = new InMemoryConversationStore();
    const seeded = store.create(decoded.state);
    if (seeded.status === "failure") return null;
    const manager = ConversationStateManager.usingStore(store);
    const orchestrator = new PrototypeConversationOrchestrator(
      business.profile,
      manager,
      input.conversationId,
    );
    this.conversations.set(key, {
      business,
      conversationId: input.conversationId,
      scope: {
        conversationId: input.conversationId,
        businessProfileId: business.profile.id,
        businessProfileVersion: business.profile.version,
      },
      manager,
      orchestrator,
      messages,
      pendingFieldId: input.pendingFieldId,
      handoffAvailable: input.handoffAvailable,
      turn: input.turn,
      nextMessageId: input.nextMessageId,
    });
    return this.registerHandle(key);
  }

  /** Server-only snapshot used by the durable layer to commit one turn. */
  exportForPersistence(handle: unknown): DurableConversationSnapshot | null {
    const runtime = this.resolveHandle(handle);
    if (!runtime) return null;
    const state = this.managerSnapshot(runtime);
    if (!state) return null;
    return Object.freeze({
      state,
      messages: Object.freeze(runtime.messages.map((message) => Object.freeze({
        messageId: message.id,
        role: message.role,
        content: message.text,
      }))),
      pendingFieldId: runtime.pendingFieldId,
      handoffAvailable: runtime.handoffAvailable,
      turn: runtime.turn,
      nextMessageId: runtime.nextMessageId,
    });
  }

  handleForScope(businessId: unknown, conversationId: unknown): string | null {
    if (!isIdentifier(businessId) || !isIdentifier(conversationId)) return null;
    return this.rawHandleByKey.get(conversationKey(businessId, conversationId)) ?? null;
  }

  /** Drop an in-memory conversation after a failed durable commit. */
  discard(handle: unknown): void {
    const runtime = this.resolveHandle(handle);
    if (!runtime) return;
    const key = conversationKey(runtime.business.profile.id, runtime.conversationId);
    this.conversations.delete(key);
    this.rawHandleByKey.delete(key);
    for (const [handleDigest, mappedKey] of this.handles) {
      if (mappedKey === key) this.handles.delete(handleDigest);
    }
  }

  revisionOfHandle(handle: unknown): number | null {
    const runtime = this.resolveHandle(handle);
    if (!runtime) return null;
    const snapshot = this.managerSnapshot(runtime);
    return snapshot ? snapshot.revision : null;
  }

  async submit(input: unknown): Promise<ReceptionistTurnOutcome> {
    const parsed = parseTurnHandleInput(input);
    if (!parsed) return Object.freeze({ status: "invalid-message" });
    const runtime = this.resolveHandle(parsed.handle);
    if (!runtime) return Object.freeze({ status: "conversation-unavailable" });
    if (runtime.business.profile.status !== "active") {
      return Object.freeze({ status: "conversation-unavailable" });
    }

    const key = conversationKey(
      runtime.business.profile.id,
      runtime.conversationId,
    );
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

  private registerHandle(key: string): string | null {
    // A minted handle is accepted only if its digest is not already mapped, so
    // a defective entropy source cannot silently alias two conversations.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const handle = createConversationHandle();
      const handleDigest = digestConversationHandle(handle);
      if (this.handles.has(handleDigest)) continue;
      this.handles.set(handleDigest, key);
      this.rawHandleByKey.set(key, handle);
      return handle;
    }
    this.conversations.delete(key);
    return null;
  }

  private resolveHandle(handle: unknown): ConversationRuntime | null {
    if (!isConversationHandle(handle)) return null;
    const key = this.handles.get(digestConversationHandle(handle));
    if (!key) return null;
    return this.conversations.get(key) ?? null;
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

/**
 * Produce the revision-zero state for a new conversation. Shared by the
 * in-memory and durable services so both start from identical authority.
 */
export function createInitialConversationState(
  business: ReceptionistBusiness,
  conversationId: string,
): ConversationState | null {
  const manager = new ConversationStateManager();
  const initialized = manager.initialize({
    conversationId,
    businessProfileId: business.profile.id,
    businessProfileVersion: business.profile.version,
    requiredFields: ["requested-service"],
    authorizedEscalationDestination: business.profile.escalation.destination,
  });
  if (initialized.status === "failure") return null;
  const snapshot = manager.snapshot({
    conversationId,
    businessProfileId: business.profile.id,
    businessProfileVersion: business.profile.version,
  });
  return snapshot.status === "success" ? snapshot.state : null;
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

function parseTurnHandleInput(input: unknown): {
  readonly handle: string;
  readonly message: string;
} | null {
  if (!isPlainRecord(input)) return null;
  const keys = Object.keys(input);
  const hasOptionalTurnId = keys.includes("turnId");
  if ((keys.length !== 2 && keys.length !== 3)
    || !keys.includes("handle")
    || !keys.includes("message")
    || keys.some((key) => key !== "handle" && key !== "message" && key !== "turnId")) {
    return null;
  }
  // The local demonstration is ephemeral, so a turn identifier is accepted for
  // request-shape compatibility but never used for durable replay.
  if (hasOptionalTurnId && !isPersistedTurnId(input.turnId)) return null;
  if (!isConversationHandle(input.handle) || typeof input.message !== "string") {
    return null;
  }
  const message = input.message.trim();
  if (message.length === 0 || message.length > MAXIMUM_MESSAGE_LENGTH) return null;
  if (CONTROL_CHARACTERS.test(message)) return null;
  return { handle: input.handle, message };
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

function isPersistedTurnId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(value);
}
