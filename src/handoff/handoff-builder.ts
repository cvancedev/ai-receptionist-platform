import type { BusinessProfile } from "../domain/business-profile";
import type { ConversationState } from "../domain/conversation-state";
import type { HandoffSummary } from "../domain/handoff-summary";
import { COMPLETION_STATES, CONVERSATION_STAGES } from "../shared/constants";
import { validateBusinessProfile } from "../validation/business-profile-validation";
import { validateConversationState } from "../validation/conversation-state-validation";
import { evaluateIntakeReadiness } from "../conversation/intake-readiness";

export type HandoffBuildResult =
  | { status: "success"; summary: HandoffSummary }
  | { status: "failure"; errors: readonly string[] };

export class DeterministicHandoffBuilder {
  build(profile: BusinessProfile, state: ConversationState): HandoffBuildResult {
    const profileResult = validateBusinessProfile(profile, { id: state.businessProfileId, version: state.businessProfileVersion });
    const stateResult = validateConversationState(state);
    const errors = [...profileResult.errors, ...stateResult.errors];
    const ready = state.stage === CONVERSATION_STAGES.HANDOFF || state.stage === CONVERSATION_STAGES.COMPLETED || state.completionState === COMPLETION_STATES.READY_FOR_HANDOFF;
    if (!ready) errors.push("Conversation state is not ready for handoff.");
    const serviceId = state.confirmedFacts["requested-service"]?.value;
    const service = profile.services.find((candidate) => candidate.id === serviceId && candidate.status === "active");
    if (!service) errors.push("A valid configured service is required for handoff.");
    const readiness = evaluateIntakeReadiness(profile, state, service);
    if (readiness.status !== "ready-for-handoff") errors.push("Validated intake readiness does not permit handoff.");
    if (errors.length) return { status: "failure", errors };
    return {
      status: "success",
      summary: {
        conversationId: state.conversationId,
        businessProfileId: state.businessProfileId,
        businessProfileVersion: state.businessProfileVersion,
        stateRevision: state.revision,
        customerName: state.confirmedFacts["customer-name"]?.value ?? null,
        requestedService: service?.name ?? null,
        confirmedFacts: Object.fromEntries(Object.entries(state.confirmedFacts).map(([field, fact]) => [field, fact.value])),
        missingInformation: [...state.missingFields],
        corrections: state.corrections.map((correction) => `${correction.field}: ${correction.previousValue} -> ${correction.correctedValue}`),
        questionsAsked: [...state.askedQuestions],
        escalationReason: state.escalation.reason,
        completionStatus: state.completionState,
      },
    };
  }
}
