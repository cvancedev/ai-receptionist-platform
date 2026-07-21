import type { DeterministicIntakeResult } from "../domain/intake";
import type { QuestionSelectionResult } from "../domain/intake";
import type { HandoffBuildResult } from "../handoff/handoff-builder";
import { DeterministicHandoffBuilder } from "../handoff/handoff-builder";
import { DeterministicConversationEngine } from "../conversation/conversation-engine";
import type { BusinessProfile } from "../domain/business-profile";
import type { ConversationStateManager } from "../conversation/conversation-state-manager";

export type ConversationTurnRequest =
  | { type: "evaluate" }
  | { type: "start-intake"; serviceInput: string; source: string }
  | { type: "answer"; fieldId: string; value: string; source: string }
  | { type: "correction"; fieldId: string; value: string; source: string }
  | { type: "select-question" }
  | { type: "coordinate-readiness" }
  | { type: "confirm-intake" }
  | { type: "build-handoff" };

export interface ConversationTurnResult {
  intake?: DeterministicIntakeResult;
  handoff?: HandoffBuildResult;
  question?: QuestionSelectionResult;
}

/** Coordinates deterministic prototype operations without model decision-making. */
export class PrototypeConversationOrchestrator {
  private readonly engine: DeterministicConversationEngine;
  private readonly handoffBuilder = new DeterministicHandoffBuilder();

  constructor(
    private readonly profile: BusinessProfile,
    private readonly manager: ConversationStateManager,
    private readonly conversationId: string,
  ) {
    this.engine = new DeterministicConversationEngine(profile, manager, conversationId);
  }

  processTurn(request: ConversationTurnRequest): ConversationTurnResult {
    switch (request.type) {
      case "evaluate":
        return { intake: this.engine.evaluate() };
      case "start-intake":
        return { intake: this.engine.initializeIntake(request.serviceInput, request.source) };
      case "answer":
        return { intake: this.engine.applyAnswer(request.fieldId, request.value, request.source) };
      case "correction":
        return { intake: this.engine.correctAnswer(request.fieldId, request.value, request.source) };
      case "select-question":
        return {
          question: this.engine.selectAndMarkNextQuestion(),
          intake: this.engine.evaluate(),
        };
      case "coordinate-readiness":
        return { intake: this.engine.coordinateReadiness() };
      case "confirm-intake":
        return { intake: this.engine.confirmIntake() };
      case "build-handoff": {
        const state = this.manager.snapshot({
          conversationId: this.conversationId,
          businessProfileId: this.profile.id,
          businessProfileVersion: this.profile.version,
        });
        return {
          handoff:
            state.status === "success"
              ? this.handoffBuilder.build(this.profile, state.state)
              : { status: "failure", errors: state.errors },
        };
      }
    }
  }
}
