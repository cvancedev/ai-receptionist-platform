import type { ModelTaskIdentifier } from "../contracts/identities";
import type { ConversationStage } from "../../shared/constants";

/**
 * Deterministic application-owned routing for one simulated AI turn.
 *
 * The router decides whether language work is needed at all and which approved
 * task applies. The model never selects a task, a stage, or a transition; it
 * only answers the single approved task it is given.
 */
export const AI_DEMO_ROUTING_VERSION = "ai-demo-task-router/v1" as const;

export interface AiDemoRoutingInput {
  readonly stage: ConversationStage;
  readonly pendingFieldId: string | null;
}

export function selectAiDemoTask(
  input: AiDemoRoutingInput,
): ModelTaskIdentifier | null {
  switch (input.stage) {
    case "initialized":
      return "language_interpretation";
    case "clarification":
    case "intake":
      return input.pendingFieldId ? "candidate_fact_extraction" : "language_interpretation";
    case "confirmation":
    case "escalation":
    case "handoff":
    case "completed":
    case "abandoned":
      return null;
  }
}
