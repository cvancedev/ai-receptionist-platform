import { BUSINESS_PROFILE_STATUSES } from "../domain/business-profile";
import {
  CONFIGURATION_AUTHORIZATION_DECISIONS,
  CONFIGURATION_OPERATIONS,
  CONFIGURATION_SUBJECTS,
  CONFIGURATION_VALIDATION_STAGES,
  type BusinessProfileRevisionSnapshot,
  type BusinessProfileVersionRepository,
  type ConfigurationRepositoryResult,
  type KnowledgeRevisionSnapshot,
  type KnowledgeVersionRepository,
} from "../business-configuration/contracts";
import {
  detachBusinessProfileRevisionSnapshot,
  detachKnowledgeRevisionSnapshot,
  validateBusinessProfileRevisionScope,
  validateKnowledgeRevisionScope,
} from "../business-configuration/contract-support";
import { fictionalBusinessProfile } from "../fixtures/business-profile";
import { fictionalKnowledgeRecords } from "../fixtures/knowledge";
import { LIFECYCLE_STATES } from "../shared/constants";
import { validateBusinessProfile } from "../validation/business-profile-validation";
import { validateKnowledge } from "../validation/knowledge-validation";

function verifyAllowlistedVocabulary() {
  assertExactValues(
    CONFIGURATION_SUBJECTS,
    ["business-profile", "knowledge-record"],
    "configuration subjects",
  );
  assertExactValues(
    CONFIGURATION_VALIDATION_STAGES,
    ["draft-structure", "activation-eligibility", "conversation-use"],
    "validation stages",
  );
  assertExactValues(
    CONFIGURATION_OPERATIONS,
    [
      "create-draft",
      "validate",
      "submit-for-review",
      "approve",
      "activate",
      "suspend",
      "inspect",
    ],
    "configuration operations",
  );
  assertExactValues(
    CONFIGURATION_AUTHORIZATION_DECISIONS,
    ["authorized", "denied"],
    "authorization decisions",
  );
  assertExactValues(
    BUSINESS_PROFILE_STATUSES,
    [
      "draft",
      "incomplete",
      "ready-for-review",
      "active",
      "suspended",
      "archived",
    ],
    "Business Profile lifecycle statuses",
  );
  assertExactValues(
    Object.values(LIFECYCLE_STATES),
    [
      "draft",
      "under-review",
      "approved",
      "active",
      "expired",
      "superseded",
      "suspended",
      "archived",
      "rejected",
    ],
    "knowledge lifecycle states",
  );
}

function verifyExactScopesFailClosed() {
  const validProfile = validateBusinessProfileRevisionScope(profileScope());
  assert(validProfile.status === "valid", "exact profile scope is valid");
  assertDeeplyFrozen(validProfile, "validated profile scope");

  for (const candidate of [
    null,
    {},
    { ...profileScope(), businessProfileId: "" },
    { ...profileScope(), businessProfileId: " padded " },
    { ...profileScope(), businessProfileVersion: 0 },
    { ...profileScope(), businessProfileVersion: 1.5 },
  ]) {
    assert(
      validateBusinessProfileRevisionScope(candidate).status === "invalid",
      "malformed profile scope fails closed",
    );
  }

  const validKnowledge = validateKnowledgeRevisionScope(knowledgeScope());
  assert(validKnowledge.status === "valid", "exact knowledge scope is valid");
  assertDeeplyFrozen(validKnowledge, "validated knowledge scope");

  for (const candidate of [
    null,
    profileScope(),
    { ...knowledgeScope(), knowledgeRecordId: "" },
    { ...knowledgeScope(), knowledgeRecordId: " padded " },
    { ...knowledgeScope(), knowledgeRecordVersion: 0 },
    { ...knowledgeScope(), knowledgeRecordVersion: Number.NaN },
  ]) {
    assert(
      validateKnowledgeRevisionScope(candidate).status === "invalid",
      "malformed knowledge scope fails closed",
    );
  }
}

function verifyDetachedImmutableResults() {
  const profileSource: BusinessProfileRevisionSnapshot = {
    scope: profileScope(),
    revision: 1,
    lifecycleStatus: fictionalBusinessProfile.status,
    profile: fictionalBusinessProfile,
  };
  const profileResult = detachBusinessProfileRevisionSnapshot(profileSource);
  assert(profileResult !== profileSource, "profile result is detached");
  assert(
    profileResult.profile !== profileSource.profile
      && profileResult.profile.services !== profileSource.profile.services
      && profileResult.profile.services[0] !== profileSource.profile.services[0],
    "nested profile data is detached",
  );
  assertDeeplyFrozen(profileResult, "profile result");

  const knowledgeSource: KnowledgeRevisionSnapshot = {
    scope: knowledgeScope(),
    revision: 1,
    lifecycleStatus: fictionalKnowledgeRecords[0].lifecycleState,
    record: fictionalKnowledgeRecords[0],
  };
  const knowledgeResult = detachKnowledgeRevisionSnapshot(knowledgeSource);
  assert(knowledgeResult !== knowledgeSource, "knowledge result is detached");
  assert(
    knowledgeResult.record !== knowledgeSource.record,
    "knowledge record is detached",
  );
  assertDeeplyFrozen(knowledgeResult, "knowledge result");
}

function verifyNarrowTechnologyNeutralContracts() {
  const profileRepository: BusinessProfileVersionRepository =
    new ContractOnlyProfileRepository();
  const knowledgeRepository: KnowledgeVersionRepository =
    new ContractOnlyKnowledgeRepository();

  for (const repository of [profileRepository, knowledgeRepository]) {
    const capabilities = repository as unknown as Record<string, unknown>;
    for (const prohibited of [
      "delete",
      "query",
      "execute",
      "transaction",
      "activate",
      "approve",
      "authorize",
      "release",
      "dispatch",
      "retry",
    ]) {
      assert(
        typeof capabilities[prohibited] === "undefined",
        `repository exposes no ${prohibited} capability`,
      );
    }
  }

  assert(
    profileRepository.readRevision(profileScope()).status === "failure"
      && knowledgeRepository.readRevision(knowledgeScope()).status === "failure",
    "contract outcomes are explicit rather than thrown or boolean",
  );
}

function verifyValidationAuthorityCompatibility() {
  assert(
    validateBusinessProfile(fictionalBusinessProfile, {
      id: profileScope().businessProfileId,
      version: profileScope().businessProfileVersion,
    }).valid,
    "existing active Business Profile validation remains authoritative",
  );
  assert(
    !validateBusinessProfile({ ...fictionalBusinessProfile, status: "draft" }).valid,
    "draft remains ineligible for existing conversation use",
  );
  assert(
    validateKnowledge(
      fictionalKnowledgeRecords,
      fictionalBusinessProfile.id,
    ).valid,
    "existing knowledge structure and scope validation remains authoritative",
  );
  assert(
    validateKnowledge(
      [
        {
          ...fictionalKnowledgeRecords[0],
          lifecycleState: LIFECYCLE_STATES.DRAFT,
        },
      ],
      fictionalBusinessProfile.id,
    ).valid,
    "knowledge structure validation does not claim conversation-use eligibility",
  );
  assert(
    !validateKnowledge(
      [
        {
          ...fictionalKnowledgeRecords[0],
          businessProfileId: "another-fictional-business",
        },
      ],
      fictionalBusinessProfile.id,
    ).valid,
    "existing knowledge validation rejects cross-business scope",
  );
}

function verifyIndustryLabelsHaveNoAuthority() {
  const profileWithIndustryLikeName = {
    ...fictionalBusinessProfile,
    businessName: "Fictional Moving Company",
  };
  assert(
    JSON.stringify(profileWithIndustryLikeName.services)
      === JSON.stringify(fictionalBusinessProfile.services)
      && JSON.stringify(profileWithIndustryLikeName.intakeRequirements)
        === JSON.stringify(fictionalBusinessProfile.intakeRequirements),
    "an industry-like label creates no services, fields, rules, or workflows",
  );
}

class ContractOnlyProfileRepository implements BusinessProfileVersionRepository {
  readonly operationMode = "synchronous";

  createDraft(): ConfigurationRepositoryResult<BusinessProfileRevisionSnapshot> {
    return unavailable();
  }

  readRevision(): ConfigurationRepositoryResult<BusinessProfileRevisionSnapshot> {
    return unavailable();
  }

  recordLifecycleTransition(): ConfigurationRepositoryResult<BusinessProfileRevisionSnapshot> {
    return unavailable();
  }
}

class ContractOnlyKnowledgeRepository implements KnowledgeVersionRepository {
  readonly operationMode = "synchronous";

  createDraft(): ConfigurationRepositoryResult<KnowledgeRevisionSnapshot> {
    return unavailable();
  }

  readRevision(): ConfigurationRepositoryResult<KnowledgeRevisionSnapshot> {
    return unavailable();
  }

  recordLifecycleTransition(): ConfigurationRepositoryResult<KnowledgeRevisionSnapshot> {
    return unavailable();
  }
}

verifyAllowlistedVocabulary();
verifyExactScopesFailClosed();
verifyDetachedImmutableResults();
verifyNarrowTechnologyNeutralContracts();
verifyValidationAuthorityCompatibility();
verifyIndustryLabelsHaveNoAuthority();

function unavailable<Snapshot>(): ConfigurationRepositoryResult<Snapshot> {
  return {
    status: "failure",
    reason: "PersistenceFailure",
    errors: ["No persistence implementation exists in Milestone 7.1."],
  };
}

function profileScope() {
  return {
    businessProfileId: fictionalBusinessProfile.id,
    businessProfileVersion: fictionalBusinessProfile.version,
  };
}

function knowledgeScope() {
  return {
    ...profileScope(),
    knowledgeRecordId: fictionalKnowledgeRecords[0].id,
    knowledgeRecordVersion: fictionalKnowledgeRecords[0].version,
  };
}

function assertExactValues(
  actual: readonly string[],
  expected: readonly string[],
  label: string,
) {
  assert(
    actual.length === expected.length
      && actual.every((value, index) => value === expected[index]),
    `${label} are allowlisted and exhaustive`,
  );
}

function assertDeeplyFrozen(value: unknown, label: string) {
  if (!value || typeof value !== "object") return;
  assert(Object.isFrozen(value), `${label} is deeply immutable`);
  for (const child of Object.values(value)) {
    assertDeeplyFrozen(child, label);
  }
}

function assert(condition: unknown, label: string): asserts condition {
  if (!condition) {
    throw new Error(`Business Configuration contract verification failed: ${label}`);
  }
}
