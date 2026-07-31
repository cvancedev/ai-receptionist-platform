import {
  CONVERSATION_PROGRESS_SERVICE_STATUSES,
  DEFAULT_CONVERSATION_PROGRESS_POLICY,
} from "../conversation-progress/contracts";
import { resolveIntakeFields } from "../conversation/intake-field-resolution";
import { evaluateIntakeReadiness } from "../conversation/intake-readiness";
import type { BusinessProfile } from "../domain/business-profile";
import type { ConversationState } from "../domain/conversation-state";
import { CONVERSATION_STAGES } from "../shared/constants";
import type { ConversationReadModelProjectionContext } from "./contracts";

/** Application-owned fictional profile/state context for read-model projection. */
export function buildPrototypeProjectionContext(
  profile: Readonly<BusinessProfile>,
  stateInput: unknown,
): ConversationReadModelProjectionContext | null {
  if (!isProjectionState(stateInput)) return null;
  const requestedServiceId =
    stateInput.confirmedFacts["requested-service"]?.value;
  const service = profile.services.find(
    (candidate) =>
      candidate.id === requestedServiceId
      && candidate.status === "active",
  );
  if (!service) {
    const configuredFieldIds = new Set([
      "requested-service",
      ...profile.intakeRequirements.map((field) => field.id),
    ]);
    return {
      requiredFieldIds: unique([
        "requested-service",
        ...stateInput.missingFields.filter(
          (field) => configuredFieldIds.has(field),
        ),
      ]),
      resolvedServiceId: null,
      serviceResolutionStatus: requestedServiceId
        ? CONVERSATION_PROGRESS_SERVICE_STATUSES.UNSUPPORTED
        : stateInput.stage === CONVERSATION_STAGES.CLARIFICATION
          ? CONVERSATION_PROGRESS_SERVICE_STATUSES.AMBIGUOUS
          : CONVERSATION_PROGRESS_SERVICE_STATUSES.UNRESOLVED,
      reopenedRequiredFieldIds: [],
      completionEligible: false,
      progressPolicy: DEFAULT_CONVERSATION_PROGRESS_POLICY,
    };
  }
  const fields = resolveIntakeFields(profile, service, stateInput);
  if (!fields) return null;
  const requiredFieldIds = unique([
    "requested-service",
    ...fields.required.map((field) => field.id),
  ]);
  const readiness = evaluateIntakeReadiness(profile, stateInput, service);
  return {
    requiredFieldIds,
    resolvedServiceId: service.id,
    serviceResolutionStatus:
      CONVERSATION_PROGRESS_SERVICE_STATUSES.RESOLVED,
    reopenedRequiredFieldIds: unique(
      stateInput.corrections
        .map((correction) => correction.field)
        .filter(
          (field) =>
            requiredFieldIds.includes(field)
            && stateInput.missingFields.includes(field),
        ),
    ),
    completionEligible:
      readiness.status === "ready-for-confirmation"
      || readiness.status === "ready-for-handoff",
    progressPolicy: DEFAULT_CONVERSATION_PROGRESS_POLICY,
  };
}

function isProjectionState(value: unknown): value is ConversationState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<ConversationState>;
  return (
    candidate.confirmedFacts !== null
    && typeof candidate.confirmedFacts === "object"
    && !Array.isArray(candidate.confirmedFacts)
  );
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}
