import type { BusinessProfile, ServiceDefinition } from "../domain/business-profile";
import type { ConversationState } from "../domain/conversation-state";
import type { IntakeReadinessResult } from "../domain/intake";
import { COMPLETION_STATES, CONVERSATION_STAGES } from "../shared/constants";
import { validateBusinessProfile } from "../validation/business-profile-validation";
import { validateConversationState } from "../validation/conversation-state-validation";
import { escalationBlocksCompletion } from "./conversation-state-selectors";
import { resolveIntakeFields } from "./intake-field-resolution";

export function evaluateIntakeReadiness(profile: BusinessProfile, state: ConversationState, service?: ServiceDefinition): IntakeReadinessResult {
  const profileResult = validateBusinessProfile(profile, { id: state.businessProfileId, version: state.businessProfileVersion });
  const stateResult = validateConversationState(state);
  const errors = [...profileResult.errors, ...stateResult.errors];
  if (errors.length) return { status: "blocked", unresolvedFields: [...state.missingFields], errors };
  if (!service) return { status: "not-ready", unresolvedFields: [...state.missingFields], reason: "A configured service is not resolved." };
  const fields = resolveIntakeFields(profile, service, state);
  if (!fields) return { status: "blocked", unresolvedFields: [...state.missingFields], errors: ["Intake field configuration is invalid."] };
  if (escalationBlocksCompletion(state)) return { status: "escalation-required", unresolvedFields: fields.unresolvedRequired.map((field) => field.id), reason: "Required escalation is unresolved." };
  if (fields.unresolvedRequired.length) return { status: "not-ready", unresolvedFields: fields.unresolvedRequired.map((field) => field.id), reason: "Required intake information remains unresolved." };
  const conflictingRequired = fields.required.filter((field) => {
    const fact = state.confirmedFacts[field.id];
    const latestClaim = [...state.customerClaims].reverse().find((claim) => claim.field === field.id);
    return Boolean(fact && latestClaim && latestClaim.sequence > fact.sequence && latestClaim.value !== fact.value);
  });
  if (conflictingRequired.length) return { status: "not-ready", unresolvedFields: conflictingRequired.map((field) => field.id), reason: "A required answer has an unresolved conflicting claim." };
  if (state.stage === CONVERSATION_STAGES.HANDOFF || state.completionState === COMPLETION_STATES.READY_FOR_HANDOFF) {
    return { status: "ready-for-handoff", unresolvedFields: [], reason: "Confirmation and handoff requirements are satisfied." };
  }
  return { status: "ready-for-confirmation", unresolvedFields: [], reason: "All required intake information is confirmed." };
}
