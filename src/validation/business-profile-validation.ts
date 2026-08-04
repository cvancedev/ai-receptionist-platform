import type { BusinessProfile } from "../domain/business-profile";
import type { ValidationResult } from "./types";

export function validateBusinessProfile(
  profile: BusinessProfile,
  expected?: { id: string; version: number },
): ValidationResult {
  const result = validateBusinessProfileStructure(profile, expected);
  const errors = [...result.errors];
  if (profile.status !== "active") errors.push("Only an active Business Profile may drive intake.");
  return { valid: errors.length === 0, errors, warnings: result.warnings };
}

export function validateBusinessProfileStructure(
  profile: BusinessProfile,
  expected?: { id: string; version: number },
): ValidationResult {
  const errors: string[] = [];
  if (!profile.id.trim() || !profile.businessName.trim()) errors.push("Business identity is required.");
  if (!Number.isInteger(profile.version) || profile.version < 1) errors.push("Profile version must be positive.");
  if (!profile.services.some((service) => service.status === "active")) errors.push("At least one active service is required.");
  if (expected && (profile.id !== expected.id || profile.version !== expected.version)) errors.push("Business Profile scope does not match.");
  const serviceIds = profile.services.map((service) => service.id);
  const fieldIds = profile.intakeRequirements.map((field) => field.id);
  addDuplicateError(serviceIds, "service identifiers", errors);
  addDuplicateError(serviceIds.map(normalize), "normalized service identifiers", errors);
  addDuplicateError(profile.services.map((service) => normalize(service.name)), "normalized service names", errors);
  addDuplicateError(fieldIds, "intake field identifiers", errors);
  for (const service of profile.services) {
    if (!service.id.trim() || !service.name.trim()) errors.push("Every service requires an identifier and name.");
    const aliases = service.aliases.map(normalize);
    addDuplicateError(aliases, `aliases for '${service.id}'`, errors);
    addDuplicateError(service.requiredIntakeFieldIds, `required fields for '${service.id}'`, errors);
    addDuplicateError(service.optionalIntakeFieldIds, `optional fields for '${service.id}'`, errors);
    for (const fieldId of [...service.requiredIntakeFieldIds, ...service.optionalIntakeFieldIds]) {
      const field = profile.intakeRequirements.find((candidate) => candidate.id === fieldId);
      if (!field) errors.push(`Service '${service.id}' references unknown field '${fieldId}'.`);
      else if (field.serviceIds.length > 0 && !field.serviceIds.includes(service.id)) errors.push(`Field '${fieldId}' does not apply to service '${service.id}'.`);
    }
    for (const fieldId of service.requiredIntakeFieldIds) {
      const field = profile.intakeRequirements.find((candidate) => candidate.id === fieldId);
      if (field && !field.required) errors.push(`Required service field '${fieldId}' must be marked required.`);
    }
    for (const fieldId of service.optionalIntakeFieldIds) {
      const field = profile.intakeRequirements.find((candidate) => candidate.id === fieldId);
      if (field?.required) errors.push(`Optional service field '${fieldId}' cannot be marked required.`);
    }
  }
  for (const field of profile.intakeRequirements) {
    if (!field.id.trim() || !field.label.trim()) errors.push("Every intake field requires an identifier and label.");
    if (field.required && (!field.questionId.trim() || !field.question.trim())) errors.push(`Required field '${field.id}' requires an approved question.`);
    for (const serviceId of field.serviceIds) {
      if (!serviceIds.includes(serviceId)) errors.push(`Field '${field.id}' references unknown service '${serviceId}'.`);
    }
  }
  if (!profile.escalation.destination.trim()) errors.push("An escalation destination is required.");
  return { valid: errors.length === 0, errors, warnings: [] };
}

function addDuplicateError(values: readonly string[], label: string, errors: string[]) {
  if (new Set(values).size !== values.length) errors.push(`Duplicate ${label} are not allowed.`);
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}
