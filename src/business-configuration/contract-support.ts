import type { BusinessProfile } from "../domain/business-profile";
import type {
  BusinessProfileRevisionScope,
  BusinessProfileRevisionSnapshot,
  ConfigurationScopeResult,
  KnowledgeRevisionScope,
  KnowledgeRevisionSnapshot,
} from "./contracts";

export function validateBusinessProfileRevisionScope(
  value: unknown,
): ConfigurationScopeResult<BusinessProfileRevisionScope> {
  if (!isRecord(value) || !isCanonicalIdentifier(value.businessProfileId)) {
    return deepFreeze({
      status: "invalid",
      reason: "InvalidBusinessProfileId",
    });
  }
  if (!isPositiveInteger(value.businessProfileVersion)) {
    return deepFreeze({
      status: "invalid",
      reason: "InvalidBusinessProfileVersion",
    });
  }
  return deepFreeze({
    status: "valid",
    scope: {
      businessProfileId: value.businessProfileId,
      businessProfileVersion: value.businessProfileVersion,
    },
  });
}

export function validateKnowledgeRevisionScope(
  value: unknown,
): ConfigurationScopeResult<KnowledgeRevisionScope> {
  const profileScope = validateBusinessProfileRevisionScope(value);
  if (profileScope.status === "invalid") return profileScope;
  if (!isRecord(value) || !isCanonicalIdentifier(value.knowledgeRecordId)) {
    return deepFreeze({
      status: "invalid",
      reason: "InvalidKnowledgeRecordId",
    });
  }
  if (!isPositiveInteger(value.knowledgeRecordVersion)) {
    return deepFreeze({
      status: "invalid",
      reason: "InvalidKnowledgeRecordVersion",
    });
  }
  return deepFreeze({
    status: "valid",
    scope: {
      ...profileScope.scope,
      knowledgeRecordId: value.knowledgeRecordId,
      knowledgeRecordVersion: value.knowledgeRecordVersion,
    },
  });
}

export function detachBusinessProfileRevisionSnapshot(
  value: Readonly<BusinessProfileRevisionSnapshot>,
): Readonly<BusinessProfileRevisionSnapshot> {
  return deepFreeze({
    scope: { ...value.scope },
    revision: value.revision,
    lifecycleStatus: value.lifecycleStatus,
    profile: cloneBusinessProfile(value.profile),
  });
}

export function detachKnowledgeRevisionSnapshot(
  value: Readonly<KnowledgeRevisionSnapshot>,
): Readonly<KnowledgeRevisionSnapshot> {
  return deepFreeze({
    scope: { ...value.scope },
    revision: value.revision,
    lifecycleStatus: value.lifecycleStatus,
    record: { ...value.record },
  });
}

function cloneBusinessProfile(
  profile: Readonly<BusinessProfile>,
): BusinessProfile {
  return {
    ...profile,
    services: profile.services.map((service) => ({
      ...service,
      aliases: [...service.aliases],
      requiredIntakeFieldIds: [...service.requiredIntakeFieldIds],
      optionalIntakeFieldIds: [...service.optionalIntakeFieldIds],
    })),
    intakeRequirements: profile.intakeRequirements.map((field) => ({
      ...field,
      serviceIds: [...field.serviceIds],
    })),
    hours: {
      ...profile.hours,
      weeklySchedule: { ...profile.hours.weeklySchedule },
    },
    serviceArea: [...profile.serviceArea],
    policies: [...profile.policies],
    escalation: {
      ...profile.escalation,
      conditions: [...profile.escalation.conditions],
    },
  };
}

function isCanonicalIdentifier(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value === value.trim();
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}
