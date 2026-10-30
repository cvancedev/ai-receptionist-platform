import type { AiDemoTurnResult } from "../ai/demo/ai-demo-turn";
import { runAiDemoTurn } from "../ai/demo/ai-demo-turn";
import type { OfflineTransport } from "../ai/providers/transport-model-provider-adapter";
import type { QuestionSelectionResult } from "../domain/intake";
import type { HandoffSummary } from "../domain/handoff-summary";
import { createPrototypeFoundation } from "../prototype";
import { PrototypeConversationOrchestrator } from "../services/conversation-orchestrator";
import { CONVERSATION_STAGES } from "../shared/constants";
import {
  PrototypeReadModelIntegration,
} from "./prototype-read-model-integration";
import {
  MAX_PROTOTYPE_MESSAGE_LENGTH,
  MAX_PROTOTYPE_MESSAGES,
  type PrototypeChatView,
  type PrototypeMessage,
} from "./prototype-chat-session";

const EMPTY_MESSAGE_ERROR = "Enter a fictional message before submitting.";
const LONG_MESSAGE_ERROR = `Keep the fictional message to ${MAX_PROTOTYPE_MESSAGE_LENGTH} characters or fewer.`;
const BUSY_MESSAGE_ERROR = "Wait for the current fictional operation to finish before submitting again.";
const UNEXPECTED_OPERATION_ERROR =
  "The simulated AI operation could not be completed safely. Reset the demonstration before continuing.";
const REJECTED_INTERPRETATION_ERROR =
  "The simulated receptionist could not safely interpret that message. Nothing was saved.";

export interface AiDemoDecisionSummary {
  readonly taskIdentifier: string | null;
  readonly decision: string;
  readonly failures: readonly string[];
  readonly acceptedFields: readonly string[];
  readonly rejectedFields: readonly string[];
  readonly stateMutationAuthorized: false;
  readonly customerReleaseAuthorized: false;
  readonly revisionBefore: number | null;
  readonly revisionAfter: number | null;
}

export interface AiDemoAuditEntry {
  readonly turn: number;
  readonly taskIdentifier: string | null;
  readonly decision: string;
  readonly failures: readonly string[];
  readonly applied: boolean;
  readonly revisionBefore: number;
  readonly revisionAfter: number;
}

export interface AiDemoChatView extends PrototypeChatView {
  readonly decision: AiDemoDecisionSummary;
  readonly turns: number;
}

export interface AiDemoChatSessionOptions {
  readonly transport?: OfflineTransport;
  /** The clock used to resolve the business-local day for hours questions. */
  readonly now?: () => number;
}

/**
 * Client-side AI demonstration session.
 *
 * The simulated language layer only proposes; the certified deterministic
 * conversation engine performs every state change, question, confirmation, and
 * handoff. Nothing here performs network work, holds a credential, releases a
 * customer response, or persists data. The audit trail is in memory only and
 * records the revision delta for every turn; a turn is marked applied only when
 * the deterministic engine applied the change it accepted.
 */
export class AiDemoChatSession {
  private readonly transport: OfflineTransport | undefined;
  private readonly clock: () => number;
  private foundation = createPrototypeFoundation();
  private orchestrator = this.createOrchestrator();
  private readModelIntegration: PrototypeReadModelIntegration;
  private messages: PrototypeMessage[] = [];
  private pendingFieldId: string | null = null;
  private handoff: HandoffSummary | null = null;
  private error: string | null = null;
  private operationInProgress = false;
  private nextMessageId = 1;
  private lastCustomerMessageId = 0;
  private turn = 0;
  private summary: AiDemoDecisionSummary = emptySummary();
  private audit: AiDemoAuditEntry[] = [];

  constructor(options: AiDemoChatSessionOptions = {}) {
    this.transport = options.transport;
    this.clock = typeof options.now === "function" ? options.now : Date.now;
    this.readModelIntegration = new PrototypeReadModelIntegration(
      this.foundation.businessProfile,
    );
    this.addAssistant(
      "Simulated AI receptionist for a fictional business. No model provider, network, credential, or real customer data is used. What fictional service do you need?",
    );
  }

  async submit(rawText: string): Promise<AiDemoChatView> {
    const text = rawText.trim();
    if (!text) {
      this.error = EMPTY_MESSAGE_ERROR;
      return this.view();
    }
    if (text.length > MAX_PROTOTYPE_MESSAGE_LENGTH) {
      this.error = LONG_MESSAGE_ERROR;
      return this.view();
    }
    if (this.operationInProgress) {
      this.error = BUSY_MESSAGE_ERROR;
      return this.view();
    }

    this.operationInProgress = true;
    const revisionBefore = this.readState().revision;
    try {
      this.error = null;
      this.addCustomer(text);
      const state = this.readState();

      if (state.stage === CONVERSATION_STAGES.ESCALATION) {
        this.addAssistant(
          "This fictional conversation requires human review. Routine intake is paused.",
        );
        this.commitAudit({
          decision: "deterministic-escalation",
          taskIdentifier: null,
          revisionBefore,
          applied: false,
        });
        return this.view();
      }
      if (state.stage === CONVERSATION_STAGES.HANDOFF
        || state.stage === CONVERSATION_STAGES.COMPLETED) {
        this.addAssistant(
          "The fictional intake is already ready for handoff. Reset to start another scenario.",
        );
        this.commitAudit({
          decision: "deterministic-handoff",
          taskIdentifier: null,
          revisionBefore,
          applied: false,
        });
        return this.view();
      }
      if (state.stage === CONVERSATION_STAGES.CONFIRMATION) {
        const applied = this.handleConfirmation(text);
        this.commitAudit({
          decision: "deterministic-confirmation",
          taskIdentifier: null,
          revisionBefore,
          applied,
        });
        return this.view();
      }

      const result = await this.runSimulatedTurn(text);
      if (!result.performed) {
        this.addAssistant("No simulated AI task applies to this fictional turn.");
        this.commitAudit({
          decision: "not-performed",
          taskIdentifier: result.taskIdentifier,
          revisionBefore,
          applied: false,
        });
        return this.view();
      }
      // A business-information answer is released only after the application's
      // own grounding check; `text` is the verified answer or the limitation
      // sentence, so raw model output never reaches the demonstration.
      if (result.groundedAnswer) {
        this.addAssistant(result.groundedAnswer.text);
        this.commitAudit({
          decision: result.groundedAnswer.verdict === "supported" ? "answered" : "answer-withheld",
          taskIdentifier: result.taskIdentifier,
          failures: result.groundedAnswer.failures,
          revisionBefore,
          applied: false,
        });
        return this.view();
      }
      if (!result.decision || result.decision.decision !== "accepted" || !result.proposal) {
        this.error = `Simulated decision: ${result.decision?.decision ?? result.failureReason ?? "unavailable"}.`;
        this.addAssistant(REJECTED_INTERPRETATION_ERROR);
        this.commitAudit({
          decision: result.decision?.decision ?? "interpretation-failed",
          taskIdentifier: result.taskIdentifier,
          failures: result.failures,
          revisionBefore,
          applied: false,
        });
        return this.view();
      }

      const applied = this.applyAccepted(result);
      this.commitAudit({
        decision: result.decision.decision,
        taskIdentifier: result.taskIdentifier,
        failures: result.failures,
        acceptedFields: result.acceptedFields,
        rejectedFields: result.rejectedFields,
        revisionBefore,
        applied,
      });
    } catch {
      this.error = UNEXPECTED_OPERATION_ERROR;
      this.addAssistant(
        "The simulated operation was rejected. Review the displayed error and reset if needed.",
      );
      this.commitAudit({
        decision: "unexpected-failure",
        taskIdentifier: null,
        revisionBefore,
        applied: false,
      });
    } finally {
      this.operationInProgress = false;
    }
    return this.view();
  }

  reset(): AiDemoChatView {
    if (this.operationInProgress) {
      this.error = BUSY_MESSAGE_ERROR;
      return this.view();
    }
    this.foundation = createPrototypeFoundation();
    this.orchestrator = this.createOrchestrator();
    this.readModelIntegration = new PrototypeReadModelIntegration(
      this.foundation.businessProfile,
    );
    this.messages = [];
    this.pendingFieldId = null;
    this.handoff = null;
    this.error = null;
    this.nextMessageId = 1;
    this.lastCustomerMessageId = 0;
    this.turn = 0;
    this.summary = emptySummary();
    this.audit = [];
    this.operationInProgress = false;
    this.addAssistant(
      "Demonstration reset. What fictional service do you need?",
    );
    return this.view();
  }

  auditLog(): readonly AiDemoAuditEntry[] {
    return this.audit.map((entry) => ({
      ...entry,
      failures: [...entry.failures],
    }));
  }

  view(): AiDemoChatView {
    const state = this.readState();
    const evaluated = this.orchestrator.processTurn({ type: "evaluate" }).intake;
    if (!evaluated) throw new Error("The deterministic intake result is unavailable.");
    return {
      messages: this.messages.map((message) => ({ ...message })),
      integration: this.readModelIntegration.project(state, null),
      readiness: evaluated.readiness.status,
      handoff: this.handoff ? { ...this.handoff } : null,
      error: this.error,
      pendingFieldId: this.pendingFieldId,
      decision: { ...this.summary, revisionAfter: state.revision },
      turns: this.turn,
    };
  }

  private async runSimulatedTurn(text: string): Promise<AiDemoTurnResult> {
    const state = this.readState();
    return runAiDemoTurn({
      businessProfile: this.foundation.businessProfile,
      knowledge: this.foundation.knowledge,
      conversationState: state,
      conversationEntries: this.historyEntries(),
      currentCustomerInput: {
        messageId: `message-current-${this.lastCustomerMessageId}`,
        conversationId: state.conversationId,
        source: "customer",
        sequence: this.messages.length,
        content: text,
      },
      pendingFieldId: this.pendingFieldId,
      identifiers: {
        requestId: `ai-demo-request-${this.turn + 1}`,
        traceId: `ai-demo-trace-${this.turn + 1}`,
        contextPackageId: `ai-demo-context-${this.turn + 1}`,
        promptPackageId: `ai-demo-prompt-${this.turn + 1}`,
      },
      businessHoursNowMs: this.clock(),
      transport: this.transport,
    });
  }

  private historyEntries() {
    const state = this.readState();
    return this.messages.slice(0, -1).map((message, index) => ({
      messageId: `message-history-${message.id}`,
      conversationId: state.conversationId,
      source: message.role === "customer" ? "customer" as const : "application" as const,
      sequence: index + 1,
      content: message.text,
    }));
  }

  private applyAccepted(result: AiDemoTurnResult): boolean {
    const proposal = result.proposal;
    if (!proposal) return false;
    if (result.taskIdentifier === "language_interpretation") {
      this.applyInterpretation(proposal);
      return true;
    }
    if (result.taskIdentifier === "candidate_fact_extraction") {
      return this.applyCandidateFact(proposal);
    }
    return false;
  }

  private applyInterpretation(proposal: Readonly<Record<string, unknown>>): void {
    if (proposal.ambiguity === true) {
      const options = this.foundation.businessProfile.services
        .filter((service) => service.status === "active")
        .map((service) => service.name)
        .join(" or ");
      this.addAssistant(
        `That request matches more than one fictional service: ${options}. Which one do you need?`,
      );
      return;
    }

    const candidate = proposal.candidateServiceReference;
    if (typeof candidate === "string" && candidate.length > 0) {
      const intake = this.requireIntake(this.orchestrator.processTurn({
        type: "start-intake",
        serviceInput: candidate,
        source: this.source("simulated-service"),
      }));
      if (intake.serviceResolution.status === "resolved") {
        this.addAssistant(
          `Simulated interpretation resolved the fictional service: ${intake.serviceResolution.service.name}.`,
        );
        this.askNextOrCoordinate();
        return;
      }
      if (intake.serviceResolution.status === "unsupported") {
        this.addAssistant(
          "That service is not configured for this fictional business. The request was preserved and marked for human review; no service was invented.",
        );
        return;
      }
      this.addAssistant(
        "The simulated service proposal was not usable, so no fictional service was selected.",
      );
      return;
    }

    const intake = this.requireIntake(this.orchestrator.processTurn({
      type: "start-intake",
      serviceInput: this.lastCustomerText(),
      source: this.source("simulated-unsupported"),
    }));
    this.addAssistant(
      intake.serviceResolution.status === "unsupported"
        ? "That request is outside the configured fictional services. It was preserved and marked for human review; no service or commitment was invented."
        : "The simulated receptionist could not identify a configured fictional service.",
    );
  }

  private applyCandidateFact(proposal: Readonly<Record<string, unknown>>): boolean {
    const field = proposal.fieldIdentifier;
    const value = proposal.candidateValue;
    if (typeof field !== "string" || typeof value !== "string" || !value.trim()) {
      this.addAssistant(
        "The simulated receptionist could not extract a usable fictional answer.",
      );
      return false;
    }
    if (!this.pendingFieldId || field !== this.pendingFieldId) {
      this.addAssistant(
        "The simulated receptionist proposed a field that is not currently being collected, so it was not applied.",
      );
      return false;
    }
    const intake = this.requireIntake(this.orchestrator.processTurn({
      type: "answer",
      fieldId: field,
      value,
      source: this.source(`simulated-${field}`),
    }));
    if (intake.validationErrors.length) {
      this.addAssistant(
        "The deterministic backend rejected that simulated fictional answer.",
      );
      return false;
    }
    this.pendingFieldId = null;
    this.askNextOrCoordinate();
    return true;
  }

  private handleConfirmation(text: string): boolean {
    if (/^(confirm|confirmed|yes)$/i.test(text)) {
      const result = this.requireIntake(this.orchestrator.processTurn({ type: "confirm-intake" }));
      if (result.validationErrors.length) {
        this.fail(result.validationErrors);
        return false;
      }
      const built = this.orchestrator.processTurn({ type: "build-handoff" }).handoff;
      if (!built) {
        this.fail(["The deterministic handoff result is unavailable."]);
        return false;
      }
      if (built.status === "failure") {
        this.fail(built.errors);
        return false;
      }
      this.handoff = built.summary;
      this.addAssistant("Fictional intake confirmed. The validated handoff summary is now available.");
      return true;
    }
    const correction = /^correct\s+([a-z0-9-]+)\s*:\s*(.+)$/i.exec(text);
    if (!correction) {
      this.addAssistant(
        "Type “confirm” to approve the fictional intake, or use “correct field-id: new value” to make a correction.",
      );
      return false;
    }
    const result = this.requireIntake(this.orchestrator.processTurn({
      type: "correction",
      fieldId: correction[1],
      value: correction[2],
      source: this.source("simulated-correction"),
    }));
    if (result.validationErrors.length) {
      this.fail(result.validationErrors);
      return false;
    }
    this.addAssistant(`Correction preserved for ${correction[1]}.`);
    this.askNextOrCoordinate();
    return true;
  }

  private askNextOrCoordinate() {
    const coordinated = this.requireIntake(
      this.orchestrator.processTurn({ type: "coordinate-readiness" }),
    );
    if (coordinated.stage === CONVERSATION_STAGES.CONFIRMATION) {
      this.pendingFieldId = null;
      this.addAssistant(
        "All required fictional information is confirmed. Type “confirm” or “correct field-id: new value.”",
      );
      return;
    }
    const question = this.orchestrator.processTurn({ type: "select-question" }).question;
    if (!question) return this.fail(["The deterministic question result is unavailable."]);
    this.renderQuestion(question);
  }

  private renderQuestion(question: QuestionSelectionResult) {
    if (question.status === "selected") {
      this.pendingFieldId = question.field.id;
      this.addAssistant(`${question.question} [${question.field.id}]`);
    } else if (question.status === "clarification-required") {
      this.pendingFieldId = question.field?.id ?? null;
      this.addAssistant(question.question ?? question.reason);
    } else if (question.status === "blocked") {
      this.fail(question.errors);
    }
  }

  private createOrchestrator() {
    return new PrototypeConversationOrchestrator(
      this.foundation.businessProfile,
      this.foundation.conversationStateManager,
      this.foundation.conversationState.conversationId,
    );
  }

  private requireIntake(
    result: ReturnType<PrototypeConversationOrchestrator["processTurn"]>,
  ) {
    if (!result.intake) throw new Error("The deterministic intake result is unavailable.");
    return result.intake;
  }

  private readState() {
    const result = this.foundation.conversationStateManager.snapshot({
      conversationId: this.foundation.conversationState.conversationId,
      businessProfileId: this.foundation.businessProfile.id,
      businessProfileVersion: this.foundation.businessProfile.version,
    });
    if (result.status === "failure") throw new Error(result.errors.join(" "));
    return result.state;
  }

  private commitAudit(input: {
    readonly decision: string;
    readonly taskIdentifier: string | null;
    readonly failures?: readonly string[];
    readonly acceptedFields?: readonly string[];
    readonly rejectedFields?: readonly string[];
    readonly revisionBefore: number;
    readonly applied: boolean;
  }): void {
    this.turn += 1;
    const revisionAfter = this.readState().revision;
    const applied = input.applied && revisionAfter !== input.revisionBefore;
    this.summary = {
      taskIdentifier: input.taskIdentifier,
      decision: input.decision,
      failures: [...(input.failures ?? [])],
      acceptedFields: [...(input.acceptedFields ?? [])],
      rejectedFields: [...(input.rejectedFields ?? [])],
      stateMutationAuthorized: false,
      customerReleaseAuthorized: false,
      revisionBefore: input.revisionBefore,
      revisionAfter,
    };
    this.audit.push({
      turn: this.turn,
      taskIdentifier: input.taskIdentifier,
      decision: input.decision,
      failures: [...(input.failures ?? [])],
      applied,
      revisionBefore: input.revisionBefore,
      revisionAfter,
    });
  }

  private lastCustomerText(): string {
    for (let index = this.messages.length - 1; index >= 0; index -= 1) {
      const message = this.messages[index];
      if (message?.role === "customer") return message.text;
    }
    return "";
  }

  private source(label: string) {
    return `ai-demo-${label}-${this.nextMessageId}`;
  }

  private fail(errors: readonly string[]) {
    void errors;
    this.error = REJECTED_INTERPRETATION_ERROR;
    this.addAssistant("The deterministic backend rejected that fictional operation.");
  }

  private addCustomer(text: string) {
    this.addMessage("customer", text);
  }

  private addAssistant(text: string) {
    this.addMessage("assistant", text);
  }

  private addMessage(role: PrototypeMessage["role"], text: string) {
    this.messages.push({ id: this.nextMessageId, role, text });
    if (role === "customer") this.lastCustomerMessageId = this.nextMessageId;
    this.nextMessageId += 1;
    if (this.messages.length > MAX_PROTOTYPE_MESSAGES) {
      this.messages.splice(0, this.messages.length - MAX_PROTOTYPE_MESSAGES);
    }
  }
}

function emptySummary(): AiDemoDecisionSummary {
  return {
    taskIdentifier: null,
    decision: "not-attempted",
    failures: [],
    acceptedFields: [],
    rejectedFields: [],
    stateMutationAuthorized: false,
    customerReleaseAuthorized: false,
    revisionBefore: null,
    revisionAfter: null,
  };
}

export function createAiDemoChatSession(
  options: AiDemoChatSessionOptions = {},
): AiDemoChatSession {
  return new AiDemoChatSession(options);
}
