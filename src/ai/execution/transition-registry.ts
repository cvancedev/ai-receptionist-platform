import { CONVERSATION_STAGES } from "../../shared/constants";
import { deepFreeze } from "../shared/immutable";
import type { StateTransitionDefinition } from "./contracts";

const transitions: readonly StateTransitionDefinition[] = deepFreeze([
  {
    identifier: "begin_intake_after_language_interpretation",
    version: 1,
    currentStage: CONVERSATION_STAGES.INITIALIZED,
    nextStage: CONVERSATION_STAGES.INTAKE,
    requiredTaskIdentifier: "language_interpretation",
    requiredProposalType: "intent_interpretation",
    requiredDecision: "accepted",
    requiredConditions: [
      "approved-application-decision",
      "validated-proposal",
      "matching-business-conversation-profile-and-revision",
      "matching-task-and-proposal-policy",
      "unique-execution",
    ],
  },
]);

export type TransitionResolution =
  | { status: "success"; definition: StateTransitionDefinition }
  | { status: "failure"; reason: "UnknownTransition" };

export class StateTransitionRegistry {
  resolve(identifier: string, version: number): TransitionResolution {
    const definition = transitions.find(
      (candidate) =>
        candidate.identifier === identifier && candidate.version === version,
    );
    return definition
      ? { status: "success", definition }
      : { status: "failure", reason: "UnknownTransition" };
  }

  list(): readonly StateTransitionDefinition[] {
    return transitions;
  }
}
