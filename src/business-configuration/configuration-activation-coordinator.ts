import type {
  BusinessProfileRevisionSnapshot,
  BusinessProfileVersionRepository,
  ConfigurationRepositoryResult,
  KnowledgeRevisionSnapshot,
  KnowledgeVersionRepository,
} from "./contracts";
import {
  validateBusinessProfileRevisionScope,
  validateKnowledgeRevisionScope,
} from "./contract-support";
import type {
  ActiveConfigurationReadResult,
  AtomicConfigurationActivationStore,
  ConfigurationActivationFailureReason,
  ConfigurationActivationRequest,
  ConfigurationActivationResult,
} from "./activation-contracts";
import { validateBusinessProfileStructure } from "../validation/business-profile-validation";
import { validateKnowledge } from "../validation/knowledge-validation";

export interface ConfigurationActivationCoordinatorDependencies {
  readonly businessProfiles: BusinessProfileVersionRepository<"asynchronous">;
  readonly knowledge: KnowledgeVersionRepository<"asynchronous">;
  readonly activationStore: AtomicConfigurationActivationStore;
}

export class ConfigurationActivationCoordinator {
  constructor(
    private readonly dependencies: Readonly<ConfigurationActivationCoordinatorDependencies>,
  ) {}

  async activate(
    request: Readonly<ConfigurationActivationRequest>,
  ): Promise<ConfigurationActivationResult> {
    const inputFailure = validateRequest(request);
    if (inputFailure) return inputFailure;
    if (request.context.authorization.decision !== "authorized") {
      return failure("AuthorizationDenied", [
        "Configuration activation is not authorized.",
      ]);
    }

    const profile = await this.dependencies.businessProfiles.readRevision(
      request.profileScope,
    );
    const profileFailure = requireProfile(profile, request.context.expectedRevision);
    if (profileFailure) return profileFailure;
    if (profile.status !== "success") {
      return failure("ProfileUnavailable", [
        "Business Profile revision is unavailable for activation.",
      ]);
    }

    const knowledgeSnapshots: KnowledgeRevisionSnapshot[] = [];
    for (const selection of request.knowledge) {
      const result = await this.dependencies.knowledge.readRevision(selection.scope);
      const knowledgeFailure = requireKnowledge(result, selection.expectedRevision);
      if (knowledgeFailure) return knowledgeFailure;
      if (result.status !== "success") {
        return failure("KnowledgeUnavailable", [
          "Knowledge revision is unavailable for activation.",
        ]);
      }
      knowledgeSnapshots.push(result.value);
    }

    const eligibility = evaluateEligibility(
      profile.value,
      knowledgeSnapshots,
      request.activatedAt,
    );
    if (eligibility.status === "failure") return eligibility;

    return this.dependencies.activationStore.activateApproved({
      profileScope: request.profileScope,
      expectedProfileRevision: request.context.expectedRevision,
      expectedProfileLifecycleStatus: "ready-for-review",
      resultingProfileLifecycleStatus: "active",
      knowledge: request.knowledge.map((selection) => ({
        scope: selection.scope,
        expectedRevision: selection.expectedRevision,
        expectedLifecycleState: "approved",
        resultingLifecycleState: "active",
      })),
      expectedActiveRevision: request.expectedActiveRevision,
      activatedAt: request.activatedAt,
      eligibility: { status: "eligible", validatedAt: request.activatedAt },
      context: request.context,
    });
  }

  readActive(businessProfileId: string): Promise<ActiveConfigurationReadResult> {
    return this.dependencies.activationStore.readActive(businessProfileId);
  }
}

function validateRequest(
  request: Readonly<ConfigurationActivationRequest>,
): ConfigurationActivationResult | null {
  const profileScope = validateBusinessProfileRevisionScope(request.profileScope);
  if (profileScope.status === "invalid") {
    return failure("InvalidInput", ["Business Profile scope is invalid."]);
  }
  if (
    !Number.isInteger(request.context.expectedRevision)
    || request.context.expectedRevision < 0
    || !Number.isInteger(request.expectedActiveRevision)
    || request.expectedActiveRevision < 0
    || request.knowledge.length === 0
    || !isValidTimestamp(request.activatedAt)
    || !isCanonicalIdentifier(request.context.requestId)
    || !isCanonicalIdentifier(request.context.authorization.actorId)
    || !isCanonicalIdentifier(request.context.authorization.decisionId)
    || !isCanonicalIdentifier(request.context.audit.auditEventId)
    || !request.context.audit.reason.trim()
    || request.context.audit.operation !== "activate"
    || request.context.audit.subject !== "business-profile"
  ) {
    return failure("InvalidInput", ["Configuration activation input is invalid."]);
  }

  const identities = new Set<string>();
  for (const selection of request.knowledge) {
    const scope = validateKnowledgeRevisionScope(selection.scope);
    if (
      scope.status === "invalid"
      || scope.scope.businessProfileId !== profileScope.scope.businessProfileId
      || scope.scope.businessProfileVersion
        !== profileScope.scope.businessProfileVersion
      || !Number.isInteger(selection.expectedRevision)
      || selection.expectedRevision < 0
    ) {
      return failure("InvalidInput", ["Knowledge activation scope is invalid."]);
    }
    const identity = `${scope.scope.knowledgeRecordId}:${scope.scope.knowledgeRecordVersion}`;
    if (identities.has(identity)) {
      return failure("InvalidInput", ["Knowledge activation selection is duplicated."]);
    }
    identities.add(identity);
  }
  return null;
}

function requireProfile(
  result: ConfigurationRepositoryResult<BusinessProfileRevisionSnapshot>,
  expectedRevision: number,
): ConfigurationActivationResult | null {
  if (result.status === "failure") {
    return failure(
      storedFailure(result.reason) ?? "ProfileUnavailable",
      ["Business Profile revision is unavailable for activation."],
    );
  }
  if (result.value.revision !== expectedRevision) {
    return failure("StaleRevision", ["Business Profile revision is stale."]);
  }
  return null;
}

function requireKnowledge(
  result: ConfigurationRepositoryResult<KnowledgeRevisionSnapshot>,
  expectedRevision: number,
): ConfigurationActivationResult | null {
  if (result.status === "failure") {
    return failure(
      storedFailure(result.reason) ?? "KnowledgeUnavailable",
      ["Knowledge revision is unavailable for activation."],
    );
  }
  if (result.value.revision !== expectedRevision) {
    return failure("StaleRevision", ["Knowledge revision is stale."]);
  }
  return null;
}

function evaluateEligibility(
  profile: Readonly<BusinessProfileRevisionSnapshot>,
  knowledge: readonly Readonly<KnowledgeRevisionSnapshot>[],
  activatedAt: string,
): ConfigurationActivationResult | { readonly status: "eligible" } {
  if (profile.lifecycleStatus !== "ready-for-review") {
    return failure("LifecycleConflict", [
      "Business Profile is not ready for activation.",
    ]);
  }
  const profileValidation = validateBusinessProfileStructure(profile.profile, {
    id: profile.scope.businessProfileId,
    version: profile.scope.businessProfileVersion,
  });
  if (!profileValidation.valid) {
    return failure("ActivationIneligible", profileValidation.errors);
  }
  const activationTime = Date.parse(activatedAt);
  const records = knowledge.map(({ record }) => record);
  const knowledgeValidation = validateKnowledge(
    records,
    profile.scope.businessProfileId,
  );
  if (!knowledgeValidation.valid) {
    return failure("ActivationIneligible", knowledgeValidation.errors);
  }
  for (const snapshot of knowledge) {
    if (snapshot.lifecycleStatus !== "approved") {
      return failure("LifecycleConflict", [
        "Knowledge selection contains an unapproved revision.",
      ]);
    }
    if (Date.parse(snapshot.record.effectiveDate) > activationTime) {
      return failure("ActivationIneligible", [
        "Knowledge selection is not yet effective.",
      ]);
    }
  }
  if (hasMaterialConflict(records)) {
    return failure("ConfigurationConflict", [
      "Knowledge selection contains a material conflict.",
    ]);
  }
  return { status: "eligible" };
}

function hasMaterialConflict(
  records: readonly Readonly<KnowledgeRevisionSnapshot["record"]>[],
): boolean {
  const claims = new Map<string, string>();
  for (const record of records) {
    const identity = `${normalize(record.category)}:${normalize(record.title)}`;
    const content = normalize(record.content);
    const existing = claims.get(identity);
    if (existing !== undefined && existing !== content) return true;
    claims.set(identity, content);
  }
  return false;
}

function storedFailure(
  reason: string,
): ConfigurationActivationFailureReason | null {
  if (reason === "InvalidStoredRecord") return "InvalidStoredRecord";
  if (reason === "IncompatibleStoredRecord") return "IncompatibleStoredRecord";
  if (reason === "PersistenceFailure") return "InfrastructureFailure";
  return null;
}

function failure(
  reason: ConfigurationActivationFailureReason,
  errors: readonly string[],
): ConfigurationActivationResult {
  return { status: "failure", reason, errors };
}

function isCanonicalIdentifier(value: string): boolean {
  return value.length > 0 && value === value.trim();
}

function isValidTimestamp(value: string): boolean {
  return value.trim().length > 0 && !Number.isNaN(Date.parse(value));
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}
