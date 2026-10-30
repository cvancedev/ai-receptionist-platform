import type { ModelTaskIdentifier } from "../contracts/identities";
import type { ConversationStage } from "../../shared/constants";
import type { BusinessQuestionRouting } from "../grounding/business-question-router";

/**
 * Deterministic application-owned routing for one simulated AI turn.
 *
 * The router decides whether language work is needed at all and which approved
 * task applies. The model never selects a task, a stage, or a transition; it
 * only answers the single approved task it is given.
 */
export const AI_DEMO_ROUTING_VERSION = "ai-demo-task-router/v2" as const;

export interface AiDemoRoutingInput {
  readonly stage: ConversationStage;
  readonly pendingFieldId: string | null;
  /**
   * The application's own classification of the current customer message. A
   * business-information question is answered from approved material instead of
   * being mistaken for a service request or a fact answer.
   */
  readonly businessQuestion?: BusinessQuestionRouting | null;
}

export function selectAiDemoTask(
  input: AiDemoRoutingInput,
): ModelTaskIdentifier | null {
  switch (input.stage) {
    case "initialized":
      return input.businessQuestion?.kind === "hours"
        ? "knowledge_grounded_answer"
        : "language_interpretation";
    case "clarification":
    case "intake":
      if (input.businessQuestion?.kind === "hours") return "knowledge_grounded_answer";
      return input.pendingFieldId ? "candidate_fact_extraction" : "language_interpretation";
    case "confirmation":
    case "escalation":
    case "handoff":
    case "completed":
    case "abandoned":
      return null;
  }
}
