import {
  BUSINESS_PROFILE_STATUSES,
  type BusinessProfile,
} from "../domain/business-profile";
import type { BusinessProfileRevisionScope } from "../business-configuration/contracts";
import { detachBusinessProfileRevisionSnapshot } from "../business-configuration/contract-support";
import { validateBusinessProfileStructure } from "./business-profile-validation";

export type BusinessProfileDecodeResult =
  | { readonly status: "success"; readonly profile: Readonly<BusinessProfile> }
  | { readonly status: "failure"; readonly errors: readonly string[] };

export function decodeBusinessProfile(
  value: unknown,
  scope: Readonly<BusinessProfileRevisionScope>,
): BusinessProfileDecodeResult {
  if (!isBusinessProfile(value)) return failure("Persisted Business Profile has an invalid structure.");
  const validation = validateBusinessProfileStructure(value, {
    id: scope.businessProfileId,
    version: scope.businessProfileVersion,
  });
  if (!validation.valid) return { status: "failure", errors: validation.errors };
  const snapshot = detachBusinessProfileRevisionSnapshot({
    scope,
    revision: 0,
    lifecycleStatus: value.status,
    profile: value,
  });
  return { status: "success", profile: snapshot.profile };
}

function isBusinessProfile(value: unknown): value is BusinessProfile {
  if (!isRecord(value) || !hasExactKeys(value, ["id", "version", "businessName", "services", "intakeRequirements", "hours", "serviceArea", "policies", "escalation", "status"])) return false;
  return typeof value.id === "string"
    && Number.isInteger(value.version)
    && typeof value.businessName === "string"
    && Array.isArray(value.services) && value.services.every(isService)
    && Array.isArray(value.intakeRequirements) && value.intakeRequirements.every(isField)
    && isHours(value.hours)
    && isStringArray(value.serviceArea)
    && isStringArray(value.policies)
    && isEscalation(value.escalation)
    && typeof value.status === "string"
    && BUSINESS_PROFILE_STATUSES.includes(value.status as BusinessProfile["status"]);
}

function isService(value: unknown): boolean {
  return isRecord(value) && hasExactKeys(value, ["id", "name", "description", "aliases", "status", "requiredIntakeFieldIds", "optionalIntakeFieldIds", "unsupportedMessage"])
    && ["id", "name", "description", "unsupportedMessage"].every((key) => typeof value[key] === "string")
    && isStringArray(value.aliases) && (value.status === "active" || value.status === "inactive")
    && isStringArray(value.requiredIntakeFieldIds) && isStringArray(value.optionalIntakeFieldIds);
}

function isField(value: unknown): boolean {
  return isRecord(value) && hasOnlyKeys(value, ["id", "label", "questionId", "question", "required", "fieldType", "serviceIds", "confirmationBehavior", "clarificationQuestion"])
    && ["id", "label", "questionId", "question"].every((key) => typeof value[key] === "string")
    && typeof value.required === "boolean"
    && (value.fieldType === "text" || value.fieldType === "service")
    && isStringArray(value.serviceIds)
    && value.confirmationBehavior === "application-confirmed"
    && (value.clarificationQuestion === undefined || typeof value.clarificationQuestion === "string");
}

function isHours(value: unknown): boolean {
  return isRecord(value) && hasExactKeys(value, ["timeZone", "weeklySchedule"])
    && typeof value.timeZone === "string" && isRecord(value.weeklySchedule)
    && Object.values(value.weeklySchedule).every((item) => typeof item === "string");
}

function isEscalation(value: unknown): boolean {
  return isRecord(value) && hasExactKeys(value, ["destination", "conditions"])
    && typeof value.destination === "string" && isStringArray(value.conditions);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) { return hasOnlyKeys(value, keys) && keys.every((key) => key in value); }
function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]) { return Object.keys(value).every((key) => keys.includes(key)); }
function isStringArray(value: unknown): value is string[] { return Array.isArray(value) && value.every((item) => typeof item === "string"); }
function failure(message: string): BusinessProfileDecodeResult { return { status: "failure", errors: [message] }; }
