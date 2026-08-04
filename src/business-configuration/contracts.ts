import type {
  BusinessProfile,
  BusinessProfileStatus,
} from "../domain/business-profile";
import type { KnowledgeRecord } from "../domain/knowledge-record";
import type { LifecycleState } from "../shared/constants";

export const CONFIGURATION_SUBJECTS = [
  "business-profile",
  "knowledge-record",
] as const;

export type ConfigurationSubject = (typeof CONFIGURATION_SUBJECTS)[number];

export const CONFIGURATION_VALIDATION_STAGES = [
  "draft-structure",
  "activation-eligibility",
  "conversation-use",
] as const;

export type ConfigurationValidationStage =
  (typeof CONFIGURATION_VALIDATION_STAGES)[number];

export const CONFIGURATION_OPERATIONS = [
  "create-draft",
  "validate",
  "submit-for-review",
  "approve",
  "activate",
  "suspend",
  "inspect",
] as const;

export type ConfigurationOperation =
  (typeof CONFIGURATION_OPERATIONS)[number];

export const CONFIGURATION_AUTHORIZATION_DECISIONS = [
  "authorized",
  "denied",
] as const;

export type ConfigurationAuthorizationDecision =
  (typeof CONFIGURATION_AUTHORIZATION_DECISIONS)[number];

export interface BusinessProfileRevisionScope {
  readonly businessProfileId: string;
  readonly businessProfileVersion: number;
}

export interface KnowledgeRevisionScope
  extends BusinessProfileRevisionScope {
  readonly knowledgeRecordId: string;
  readonly knowledgeRecordVersion: number;
}

export interface ConfigurationAuthorizationContext {
  readonly actorId: string;
  readonly decisionId: string;
  readonly decision: ConfigurationAuthorizationDecision;
}

export interface ConfigurationAuditContext {
  readonly auditEventId: string;
  readonly operation: ConfigurationOperation;
  readonly subject: ConfigurationSubject;
  readonly reason: string;
}

export interface ConfigurationChangeContext {
  readonly requestId: string;
  readonly expectedRevision: number;
  readonly authorization: Readonly<ConfigurationAuthorizationContext>;
  readonly audit: Readonly<ConfigurationAuditContext>;
}

export interface BusinessProfileRevisionSnapshot {
  readonly scope: Readonly<BusinessProfileRevisionScope>;
  readonly revision: number;
  readonly lifecycleStatus: BusinessProfileStatus;
  readonly profile: Readonly<BusinessProfile>;
}

export interface KnowledgeRevisionSnapshot {
  readonly scope: Readonly<KnowledgeRevisionScope>;
  readonly revision: number;
  readonly lifecycleStatus: LifecycleState;
  readonly record: Readonly<KnowledgeRecord>;
}

export type ConfigurationScopeFailureReason =
  | "InvalidBusinessProfileId"
  | "InvalidBusinessProfileVersion"
  | "InvalidKnowledgeRecordId"
  | "InvalidKnowledgeRecordVersion";

export type ConfigurationScopeResult<Scope> =
  | { readonly status: "valid"; readonly scope: Readonly<Scope> }
  | {
      readonly status: "invalid";
      readonly reason: ConfigurationScopeFailureReason;
    };

export type ConfigurationValidationResult<
  Stage extends ConfigurationValidationStage = ConfigurationValidationStage,
> =
  | {
      readonly status: "eligible";
      readonly stage: Stage;
      readonly warnings: readonly string[];
    }
  | {
      readonly status: "ineligible";
      readonly stage: Stage;
      readonly errors: readonly string[];
      readonly warnings: readonly string[];
    };

export type ConfigurationRepositoryFailureReason =
  | "InvalidScope"
  | "RevisionNotFound"
  | "RevisionAlreadyExists"
  | "RevisionConflict"
  | "RejectedInput"
  | "InvalidStoredRecord"
  | "IncompatibleStoredRecord"
  | "PersistenceFailure";

export type ConfigurationRepositoryResult<Snapshot> =
  | { readonly status: "success"; readonly value: Readonly<Snapshot> }
  | {
      readonly status: "failure";
      readonly reason: ConfigurationRepositoryFailureReason;
      readonly errors: readonly string[];
    };

export type ConfigurationRepositoryOperationMode =
  | "synchronous"
  | "asynchronous";

export type ConfigurationRepositoryOperation<
  Mode extends ConfigurationRepositoryOperationMode,
  Result,
> = Mode extends "asynchronous" ? Promise<Result> : Result;

export interface CreateBusinessProfileDraftInput {
  readonly scope: Readonly<BusinessProfileRevisionScope>;
  readonly profile: Readonly<BusinessProfile>;
  readonly context: Readonly<ConfigurationChangeContext>;
}

export interface TransitionBusinessProfileLifecycleInput {
  readonly scope: Readonly<BusinessProfileRevisionScope>;
  readonly targetStatus: BusinessProfileStatus;
  readonly context: Readonly<ConfigurationChangeContext>;
}

export interface CreateKnowledgeDraftInput {
  readonly scope: Readonly<KnowledgeRevisionScope>;
  readonly record: Readonly<KnowledgeRecord>;
  readonly context: Readonly<ConfigurationChangeContext>;
}

export interface TransitionKnowledgeLifecycleInput {
  readonly scope: Readonly<KnowledgeRevisionScope>;
  readonly targetStatus: LifecycleState;
  readonly context: Readonly<ConfigurationChangeContext>;
}

/**
 * Technology-neutral storage boundary for already-authorized Business Profile
 * revision operations. Implementations do not validate configuration meaning,
 * decide lifecycle eligibility, authorize actors, or select an active profile.
 */
export interface BusinessProfileVersionRepository<
  Mode extends ConfigurationRepositoryOperationMode = "synchronous",
> {
  readonly operationMode: Mode;
  createDraft(
    input: Readonly<CreateBusinessProfileDraftInput>,
  ): ConfigurationRepositoryOperation<
    Mode,
    ConfigurationRepositoryResult<BusinessProfileRevisionSnapshot>
  >;
  readRevision(
    scope: Readonly<BusinessProfileRevisionScope>,
  ): ConfigurationRepositoryOperation<
    Mode,
    ConfigurationRepositoryResult<BusinessProfileRevisionSnapshot>
  >;
  recordLifecycleTransition(
    input: Readonly<TransitionBusinessProfileLifecycleInput>,
  ): ConfigurationRepositoryOperation<
    Mode,
    ConfigurationRepositoryResult<BusinessProfileRevisionSnapshot>
  >;
}

/**
 * Technology-neutral storage boundary for already-authorized knowledge
 * revision operations. Implementations do not approve content, decide
 * lifecycle eligibility, retrieve conversation knowledge, or activate a
 * Business Profile.
 */
export interface KnowledgeVersionRepository<
  Mode extends ConfigurationRepositoryOperationMode = "synchronous",
> {
  readonly operationMode: Mode;
  createDraft(
    input: Readonly<CreateKnowledgeDraftInput>,
  ): ConfigurationRepositoryOperation<
    Mode,
    ConfigurationRepositoryResult<KnowledgeRevisionSnapshot>
  >;
  readRevision(
    scope: Readonly<KnowledgeRevisionScope>,
  ): ConfigurationRepositoryOperation<
    Mode,
    ConfigurationRepositoryResult<KnowledgeRevisionSnapshot>
  >;
  recordLifecycleTransition(
    input: Readonly<TransitionKnowledgeLifecycleInput>,
  ): ConfigurationRepositoryOperation<
    Mode,
    ConfigurationRepositoryResult<KnowledgeRevisionSnapshot>
  >;
}

/**
 * Application-owned validation boundary. Separate methods prevent draft shape,
 * activation eligibility, and conversation-use eligibility from becoming one
 * ambiguous boolean or a persistence concern.
 */
export interface BusinessConfigurationValidationBoundary {
  validateBusinessProfileDraftStructure(
    scope: Readonly<BusinessProfileRevisionScope>,
    profile: Readonly<BusinessProfile>,
  ): ConfigurationValidationResult<"draft-structure">;
  evaluateBusinessProfileActivation(
    scope: Readonly<BusinessProfileRevisionScope>,
    profile: Readonly<BusinessProfile>,
  ): ConfigurationValidationResult<"activation-eligibility">;
  validateBusinessProfileForConversationUse(
    scope: Readonly<BusinessProfileRevisionScope>,
    profile: Readonly<BusinessProfile>,
  ): ConfigurationValidationResult<"conversation-use">;
  validateKnowledgeDraftStructure(
    scope: Readonly<KnowledgeRevisionScope>,
    record: Readonly<KnowledgeRecord>,
  ): ConfigurationValidationResult<"draft-structure">;
  evaluateKnowledgeActivation(
    scope: Readonly<KnowledgeRevisionScope>,
    record: Readonly<KnowledgeRecord>,
  ): ConfigurationValidationResult<"activation-eligibility">;
  validateKnowledgeForConversationUse(
    scope: Readonly<KnowledgeRevisionScope>,
    record: Readonly<KnowledgeRecord>,
  ): ConfigurationValidationResult<"conversation-use">;
}
