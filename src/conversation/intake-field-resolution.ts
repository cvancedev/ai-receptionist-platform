import type { BusinessProfile, IntakeFieldDefinition, ServiceDefinition } from "../domain/business-profile";
import type { ConversationState } from "../domain/conversation-state";

export interface IntakeFieldResolution {
  required: readonly IntakeFieldDefinition[];
  optional: readonly IntakeFieldDefinition[];
  unresolvedRequired: readonly IntakeFieldDefinition[];
  resolvedRequired: readonly IntakeFieldDefinition[];
  optionalUnresolved: readonly IntakeFieldDefinition[];
}

export function resolveIntakeFields(
  profile: BusinessProfile,
  service: ServiceDefinition,
  state: ConversationState,
): IntakeFieldResolution | null {
  if (!profile.services.some((candidate) => candidate.id === service.id && candidate.status === "active")) return null;
  const globals = profile.intakeRequirements.filter((field) => field.required && field.serviceIds.length === 0);
  const required = uniqueFields([
    ...globals,
    ...service.requiredIntakeFieldIds.map((id) => profile.intakeRequirements.find((field) => field.id === id)),
  ]);
  const optional = uniqueFields(
    service.optionalIntakeFieldIds.map((id) => profile.intakeRequirements.find((field) => field.id === id)),
  );
  if (required.length !== new Set([...globals.map((field) => field.id), ...service.requiredIntakeFieldIds]).size) return null;
  const resolvedRequired = required.filter((field) => Boolean(state.confirmedFacts[field.id]));
  const unresolvedRequired = required.filter((field) => !state.confirmedFacts[field.id]);
  return {
    required,
    optional,
    unresolvedRequired,
    resolvedRequired,
    optionalUnresolved: optional.filter((field) => !state.confirmedFacts[field.id]),
  };
}

function uniqueFields(fields: readonly (IntakeFieldDefinition | undefined)[]) {
  const found = new Map<string, IntakeFieldDefinition>();
  for (const field of fields) if (field) found.set(field.id, field);
  return [...found.values()];
}
