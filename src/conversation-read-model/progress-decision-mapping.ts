import {
  CONVERSATION_PROGRESS_DECISIONS,
  type ConversationProgressDecisionType,
} from "../conversation-progress/contracts";
import {
  CONVERSATION_READ_MODEL_ACTIONS,
  type ConversationReadModelAction,
} from "./contracts";

export function mapProgressDecisionToReadModelAction(
  decision: unknown,
): ConversationReadModelAction | null {
  switch (decision as ConversationProgressDecisionType) {
    case CONVERSATION_PROGRESS_DECISIONS.BEGIN_INTAKE:
      return CONVERSATION_READ_MODEL_ACTIONS.BEGIN_INTAKE;
    case CONVERSATION_PROGRESS_DECISIONS.ASK_REQUIRED_FIELD:
      return CONVERSATION_READ_MODEL_ACTIONS.ASK_REQUIRED_FIELD;
    case CONVERSATION_PROGRESS_DECISIONS.CLARIFY_SERVICE:
      return CONVERSATION_READ_MODEL_ACTIONS.CLARIFY_SERVICE;
    case CONVERSATION_PROGRESS_DECISIONS.REVIEW_ESCALATION:
      return CONVERSATION_READ_MODEL_ACTIONS.REVIEW_ESCALATION;
    case CONVERSATION_PROGRESS_DECISIONS.INTAKE_COMPLETE:
      return CONVERSATION_READ_MODEL_ACTIONS.INTAKE_COMPLETE;
    case CONVERSATION_PROGRESS_DECISIONS.NONE:
      return CONVERSATION_READ_MODEL_ACTIONS.NONE;
    default:
      return null;
  }
}
