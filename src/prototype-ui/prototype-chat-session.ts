import type { AiControlledExecutionSnapshot } from "../ai/execution/contracts";
import { AiFoundationPrototypeOrchestrator } from "../ai/prototype/ai-foundation-orchestrator";
import type { QuestionSelectionResult } from "../domain/intake";
import type { HandoffSummary } from "../domain/handoff-summary";
import { createPrototypeFoundation } from "../prototype";
import { PrototypeConversationOrchestrator } from "../services/conversation-orchestrator";
import { CONVERSATION_STAGES } from "../shared/constants";
import {
  PrototypeReadModelIntegration,
  type PrototypeReadModelIntegrationResult,
} from "./prototype-read-model-integration";

export interface PrototypeMessage {
  id: number;
  role: "customer" | "assistant";
  text: string;
}

export interface PrototypeChatView {
  messages: readonly PrototypeMessage[];
  integration: PrototypeReadModelIntegrationResult;
  readiness: string;
  handoff: HandoffSummary | null;
  error: string | null;
  pendingFieldId: string | null;
}

export class PrototypeChatSession {
  private foundation = createPrototypeFoundation();
  private orchestrator = this.createOrchestrator();
  private aiOrchestrator = this.createAiOrchestrator();
  private readModelIntegration = this.createReadModelIntegration();
  private messages: PrototypeMessage[] = [];
  private pendingFieldId: string | null = null;
  private handoff: HandoffSummary | null = null;
  private error: string | null = null;
  private controlledExecution: AiControlledExecutionSnapshot | null = null;
  private controlledExecutionAttempted = false;

  constructor() {
    this.addAssistant(
      "This fictional prototype uses deterministic rules only. What fictional service would you like help with? Try “project help,” “home check-in,” or “consultation.”",
    );
  }

  async submit(rawText: string): Promise<PrototypeChatView> {
    const text = rawText.trim();
    if (!text) {
      this.error = "Enter a fictional message before submitting.";
      return this.view();
    }
    this.error = null;
    this.addCustomer(text);
    try {
      const executionAccepted = await this.ensureControlledExecution();
      if (!executionAccepted) return this.view();
      const state = this.readState();
      if (state.stage === CONVERSATION_STAGES.ESCALATION) {
        this.addAssistant("This fictional conversation requires human review. Routine intake is paused.");
      } else if (state.stage === CONVERSATION_STAGES.HANDOFF || state.stage === CONVERSATION_STAGES.COMPLETED) {
        this.addAssistant("The fictional intake is already ready for handoff. Reset to start another scenario.");
      } else if (state.stage === CONVERSATION_STAGES.CONFIRMATION) {
        this.handleConfirmation(text);
      } else if (!state.confirmedFacts["requested-service"] || !this.pendingFieldId) {
        this.handleServiceOrClarification(text);
      } else {
        this.handleFieldAnswer(text);
      }
    } catch (error) {
      this.error = error instanceof Error ? error.message : "The deterministic prototype could not process this message.";
      this.addAssistant("The prototype rejected that operation. Review the displayed error and reset if needed.");
    }
    return this.view();
  }

  reset(): PrototypeChatView {
    this.foundation = createPrototypeFoundation();
    this.orchestrator = this.createOrchestrator();
    this.aiOrchestrator = this.createAiOrchestrator();
    this.readModelIntegration = this.createReadModelIntegration();
    this.messages = [];
    this.pendingFieldId = null;
    this.handoff = null;
    this.error = null;
    this.controlledExecution = null;
    this.controlledExecutionAttempted = false;
    this.addAssistant("Prototype reset. What fictional service would you like help with?");
    return this.view();
  }

  view(): PrototypeChatView {
    const state = this.readState();
    const evaluated = this.orchestrator.processTurn({ type: "evaluate" }).intake;
    if (!evaluated) throw new Error("The deterministic intake result is unavailable.");
    const integration = this.readModelIntegration.project(
      state,
      this.controlledExecution,
    );
    return {
      messages: this.messages.map((message) => ({ ...message })),
      integration,
      readiness: evaluated.readiness.status,
      handoff: this.handoff ? { ...this.handoff } : null,
      error: this.error,
      pendingFieldId: this.pendingFieldId,
    };
  }

  private handleServiceOrClarification(text: string) {
    const result = this.requireIntake(this.orchestrator.processTurn({
      type: "start-intake",
      serviceInput: text,
      source: this.source("service"),
    }));
    if (result.serviceResolution.status === "resolved") {
      this.addAssistant(`Resolved fictional service: ${result.serviceResolution.service.name}.`);
      this.askNextOrCoordinate();
    } else if (result.serviceResolution.status === "ambiguous") {
      this.addAssistant(`That matches multiple fictional services: ${result.serviceResolution.candidates.map((service) => service.name).join(" or ")}. Enter one exact service name.`);
    } else if (result.serviceResolution.status === "unsupported") {
      this.addAssistant("That service is not configured for this fictional business. The request was preserved and marked for human review; no service was invented.");
    } else if (result.serviceResolution.status === "missing") {
      this.addAssistant("A fictional service is required before intake can continue.");
    } else {
      this.fail(result.validationErrors);
    }
  }

  private handleFieldAnswer(text: string) {
    const fieldId = this.pendingFieldId;
    if (!fieldId) throw new Error("No deterministic intake field is awaiting an answer.");
    const result = this.requireIntake(this.orchestrator.processTurn({
      type: "answer",
      fieldId,
      value: text,
      source: this.source(fieldId),
    }));
    this.pendingFieldId = null;
    if (result.validationErrors.length) this.fail(result.validationErrors);
    else this.askNextOrCoordinate();
  }

  private handleConfirmation(text: string) {
    if (/^(confirm|confirmed|yes)$/i.test(text)) {
      const result = this.requireIntake(this.orchestrator.processTurn({ type: "confirm-intake" }));
      if (result.validationErrors.length) return this.fail(result.validationErrors);
      const built = this.orchestrator.processTurn({ type: "build-handoff" }).handoff;
      if (!built) return this.fail(["The deterministic handoff result is unavailable."]);
      if (built.status === "failure") return this.fail(built.errors);
      this.handoff = built.summary;
      this.addAssistant("Fictional intake confirmed. The validated handoff summary is now available.");
      return;
    }
    const correction = /^correct\s+([a-z0-9-]+)\s*:\s*(.+)$/i.exec(text);
    if (!correction) {
      this.addAssistant("Type “confirm” to approve the intake, or use “correct field-id: new value” to make a fictional correction.");
      return;
    }
    const result = this.requireIntake(this.orchestrator.processTurn({
      type: "correction",
      fieldId: correction[1],
      value: correction[2],
      source: this.source("correction"),
    }));
    if (result.validationErrors.length) return this.fail(result.validationErrors);
    this.addAssistant(`Correction preserved for ${correction[1]}.`);
    this.askNextOrCoordinate();
  }

  private askNextOrCoordinate() {
    const coordinated = this.requireIntake(this.orchestrator.processTurn({ type: "coordinate-readiness" }));
    if (coordinated.stage === CONVERSATION_STAGES.CONFIRMATION) {
      this.pendingFieldId = null;
      this.addAssistant("All required fictional information is confirmed. Type “confirm” or “correct field-id: new value.”");
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

  private createAiOrchestrator() {
    return new AiFoundationPrototypeOrchestrator({
      executionManager: this.foundation.conversationStateManager,
    });
  }

  private createReadModelIntegration() {
    return new PrototypeReadModelIntegration(
      this.foundation.businessProfile,
    );
  }

  private async ensureControlledExecution() {
    if (this.controlledExecutionAttempted) {
      return Boolean(this.controlledExecution?.execution.success);
    }
    this.controlledExecutionAttempted = true;
    const result = await this.aiOrchestrator.runWithExecution("valid_intent");
    if (result.status === "failure") {
      this.error =
        "Controlled execution could not obtain a valid conversation state.";
      this.addAssistant(
        "The controlled execution stopped safely. The current conversation remains unchanged.",
      );
      return false;
    }
    this.controlledExecution = result.value;
    const projected = this.readModelIntegration.project(
      result.value.conversationState,
      result.value,
    );
    if (projected.status === "projection-failure") {
      this.error = projected.errors.join(" ")
        || "Conversation projection failed closed.";
      this.addAssistant(
        "The conversation could not be projected safely. No raw state was displayed.",
      );
      return false;
    }
    if (!result.value.execution.success) {
      this.error =
        `Controlled execution rejected: ${result.value.execution.reason}.`;
      this.addAssistant(
        "The controlled execution was rejected without changing the conversation.",
      );
      return false;
    }
    return true;
  }

  private requireIntake(result: ReturnType<PrototypeConversationOrchestrator["processTurn"]>) {
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

  private source(label: string) {
    return `prototype-ui-${label}-${this.messages.length}`;
  }

  private fail(errors: readonly string[]) {
    this.error = errors.join(" ") || "The operation failed closed.";
    this.addAssistant("The deterministic backend rejected that operation.");
  }

  private addCustomer(text: string) {
    this.messages.push({ id: this.messages.length + 1, role: "customer", text });
  }

  private addAssistant(text: string) {
    this.messages.push({ id: this.messages.length + 1, role: "assistant", text });
  }
}

export function createPrototypeChatSession() {
  return new PrototypeChatSession();
}
