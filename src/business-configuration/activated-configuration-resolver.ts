import type { BusinessProfile } from "../domain/business-profile";
import type { KnowledgeRecord } from "../domain/knowledge-record";
import { validateBusinessProfile } from "../validation/business-profile-validation";
import { validateKnowledge } from "../validation/knowledge-validation";
import type {
  ActiveConfigurationSnapshot,
  AtomicConfigurationActivationStore,
} from "./activation-contracts";
import type {
  BusinessProfileVersionRepository,
  ConfigurationRepositoryFailureReason,
  KnowledgeVersionRepository,
} from "./contracts";

export type ActivatedConfigurationSelection =
  | { readonly mode: "current" }
  | {
      readonly mode: "pinned";
      readonly businessProfileVersion: number;
    };

export interface ActivatedConfigurationResolutionRequest {
  readonly businessProfileId: string;
  readonly effectiveAt: string;
  readonly audience: "customer";
  readonly selection: ActivatedConfigurationSelection;
}

export interface ResolvedActivatedConfiguration {
  readonly activation: Readonly<ActiveConfigurationSnapshot>;
  readonly businessProfile: Readonly<BusinessProfile>;
  readonly knowledge: readonly Readonly<KnowledgeRecord>[];
}

export type ActivatedConfigurationResolutionFailureReason =
  | "InvalidInput"
  | "ConfigurationUnavailable"
  | "ProfileUnavailable"
  | "ProfileInvalid"
  | "KnowledgeUnavailable"
  | "KnowledgeInvalid"
  | "KnowledgeIneligible"
  | "ConfigurationConflict";

export type ActivatedConfigurationResolutionResult =
  | {
      readonly status: "success";
      readonly value: Readonly<ResolvedActivatedConfiguration>;
    }
  | {
      readonly status: "failure";
      readonly reason: ActivatedConfigurationResolutionFailureReason;
      readonly errors: readonly string[];
    };

export interface ActivatedConfigurationResolverDependencies {
  readonly activations: AtomicConfigurationActivationStore;
  readonly businessProfiles: BusinessProfileVersionRepository<"asynchronous">;
  readonly knowledge: KnowledgeVersionRepository<"asynchronous">;
}

/** Application-owned reconstruction of one exact activated configuration. */
export class ActivatedConfigurationResolver {
  constructor(
    private readonly dependencies: Readonly<ActivatedConfigurationResolverDependencies>,
  ) {}

  async resolve(
    request: Readonly<ActivatedConfigurationResolutionRequest>,
  ): Promise<ActivatedConfigurationResolutionResult> {
    if (!isValidRequest(request)) {
      return failure("InvalidInput", [
        "Activated configuration resolution input is invalid.",
      ]);
    }

    const activation = request.selection.mode === "current"
      ? await this.dependencies.activations.readActive(request.businessProfileId)
      : await this.dependencies.activations.readForProfileVersion(
          request.businessProfileId,
          request.selection.businessProfileVersion,
        );
    if (activation.status === "failure") {
      return failure("ConfigurationUnavailable", [
        "Activated configuration is unavailable in the requested scope.",
      ]);
    }

    const profileScope = {
      businessProfileId: activation.value.businessProfileId,
      businessProfileVersion: activation.value.businessProfileVersion,
    };
    if (
      profileScope.businessProfileId !== request.businessProfileId
      || (request.selection.mode === "pinned"
        && profileScope.businessProfileVersion
          !== request.selection.businessProfileVersion)
    ) {
      return failure("ConfigurationUnavailable", [
        "Activated configuration scope is inconsistent.",
      ]);
    }

    const profile = await this.dependencies.businessProfiles.readRevision(
      profileScope,
    );
    if (profile.status === "failure") {
      return failureForRepository(profile.reason, "profile");
    }
    if (
      profile.value.lifecycleStatus !== "ready-for-review"
      && profile.value.lifecycleStatus !== "active"
    ) {
      return failure("ProfileInvalid", [
        "Activated Business Profile evidence is inconsistent.",
      ]);
    }
    const activeProfile: BusinessProfile = {
      ...structuredClone(profile.value.profile),
      status: "active",
    };
    const profileValidation = validateBusinessProfile(activeProfile, {
      id: profileScope.businessProfileId,
      version: profileScope.businessProfileVersion,
    });
    if (!profileValidation.valid) {
      return failure("ProfileInvalid", profileValidation.errors);
    }

    const resolvedKnowledge: KnowledgeRecord[] = [];
    for (const scope of activation.value.knowledge) {
      if (
        scope.businessProfileId !== profileScope.businessProfileId
        || scope.businessProfileVersion !== profileScope.businessProfileVersion
      ) {
        return failure("KnowledgeInvalid", [
          "Activated knowledge scope is inconsistent.",
        ]);
      }
      const stored = await this.dependencies.knowledge.readRevision(scope);
      if (stored.status === "failure") {
        return failureForRepository(stored.reason, "knowledge");
      }
      if (
        stored.value.lifecycleStatus !== "approved"
        && stored.value.lifecycleStatus !== "active"
      ) {
        return failure("KnowledgeIneligible", [
          "Activated knowledge is no longer eligible for conversation use.",
        ]);
      }
      if (
        stored.value.record.audience !== "customer"
        && stored.value.record.audience !== "both"
      ) {
        return failure("KnowledgeIneligible", [
          "Activated knowledge is not permitted for the customer audience.",
        ]);
      }
      if (
        Date.parse(stored.value.record.effectiveDate)
          > Date.parse(request.effectiveAt)
      ) {
        return failure("KnowledgeIneligible", [
          "Activated knowledge is not effective for this conversation.",
        ]);
      }
      resolvedKnowledge.push({
        ...stored.value.record,
        lifecycleState: "active",
      });
    }

    const knowledgeValidation = validateKnowledge(
      resolvedKnowledge,
      profileScope.businessProfileId,
    );
    if (!knowledgeValidation.valid) {
      return failure("KnowledgeInvalid", knowledgeValidation.errors);
    }
    if (hasMaterialConflict(resolvedKnowledge)) {
      return failure("ConfigurationConflict", [
        "Activated knowledge contains a material conflict.",
      ]);
    }

    return {
      status: "success",
      value: deepFreeze({
        activation: cloneActivation(activation.value),
        businessProfile: activeProfile,
        knowledge: resolvedKnowledge,
      }),
    };
  }
}

function failureForRepository(
  reason: ConfigurationRepositoryFailureReason,
  subject: "profile" | "knowledge",
): ActivatedConfigurationResolutionResult {
  if (reason === "InvalidStoredRecord" || reason === "IncompatibleStoredRecord") {
    return failure(subject === "profile" ? "ProfileInvalid" : "KnowledgeInvalid", [
      `Activated ${subject} record is invalid.`,
    ]);
  }
  if (reason === "PersistenceFailure") {
    return failure("ConfigurationUnavailable", [
      "Activated configuration persistence is unavailable.",
    ]);
  }
  return failure(subject === "profile" ? "ProfileUnavailable" : "KnowledgeUnavailable", [
    `Activated ${subject} record is unavailable.`,
  ]);
}

function cloneActivation(
  activation: Readonly<ActiveConfigurationSnapshot>,
): ActiveConfigurationSnapshot {
  return {
    ...activation,
    knowledge: activation.knowledge.map((scope) => ({ ...scope })),
  };
}

function hasMaterialConflict(records: readonly Readonly<KnowledgeRecord>[]): boolean {
  const claims = new Map<string, string>();
  for (const record of records) {
    const identity = `${normalize(record.category)}:${normalize(record.title)}`;
    const content = normalize(record.content);
    const prior = claims.get(identity);
    if (prior !== undefined && prior !== content) return true;
    claims.set(identity, content);
  }
  return false;
}

function isValidRequest(
  request: Readonly<ActivatedConfigurationResolutionRequest>,
): boolean {
  return request.businessProfileId.length > 0
    && request.businessProfileId === request.businessProfileId.trim()
    && request.audience === "customer"
    && request.effectiveAt.trim().length > 0
    && !Number.isNaN(Date.parse(request.effectiveAt))
    && (request.selection.mode === "current"
      || (request.selection.mode === "pinned"
        && Number.isInteger(request.selection.businessProfileVersion)
        && request.selection.businessProfileVersion > 0));
}

function failure(
  reason: ActivatedConfigurationResolutionFailureReason,
  errors: readonly string[],
): ActivatedConfigurationResolutionResult {
  return deepFreeze({ status: "failure", reason, errors: [...errors] });
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
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
