import type {
  BusinessProfileRevisionScope,
  ConfigurationChangeContext,
  KnowledgeRevisionScope,
} from "./contracts";

export interface KnowledgeActivationSelection {
  readonly scope: Readonly<KnowledgeRevisionScope>;
  readonly expectedRevision: number;
}

export interface ConfigurationActivationRequest {
  readonly profileScope: Readonly<BusinessProfileRevisionScope>;
  readonly knowledge: readonly Readonly<KnowledgeActivationSelection>[];
  readonly expectedActiveRevision: number;
  readonly activatedAt: string;
  readonly context: Readonly<ConfigurationChangeContext>;
}

export interface ApprovedKnowledgeActivation {
  readonly scope: Readonly<KnowledgeRevisionScope>;
  readonly expectedRevision: number;
  readonly expectedLifecycleState: "approved";
  readonly resultingLifecycleState: "active";
}

export interface ApprovedConfigurationActivation {
  readonly profileScope: Readonly<BusinessProfileRevisionScope>;
  readonly expectedProfileRevision: number;
  readonly expectedProfileLifecycleStatus: "ready-for-review";
  readonly resultingProfileLifecycleStatus: "active";
  readonly knowledge: readonly Readonly<ApprovedKnowledgeActivation>[];
  readonly expectedActiveRevision: number;
  readonly activatedAt: string;
  readonly eligibility: Readonly<{
    readonly status: "eligible";
    readonly validatedAt: string;
  }>;
  readonly context: Readonly<ConfigurationChangeContext>;
}

export interface ActiveConfigurationSnapshot {
  readonly businessProfileId: string;
  readonly businessProfileVersion: number;
  readonly activationRevision: number;
  readonly requestId: string;
  readonly activatedAt: string;
  readonly priorActivationRevision: number | null;
  readonly priorBusinessProfileVersion: number | null;
  readonly knowledge: readonly Readonly<KnowledgeRevisionScope>[];
}

export type ConfigurationActivationFailureReason =
  | "InvalidInput"
  | "AuthorizationDenied"
  | "ActivationIneligible"
  | "ConfigurationConflict"
  | "ProfileUnavailable"
  | "KnowledgeUnavailable"
  | "LifecycleConflict"
  | "StaleRevision"
  | "DuplicateActivationRequest"
  | "ConflictingActivationRequest"
  | "InvalidStoredRecord"
  | "IncompatibleStoredRecord"
  | "TransactionFailure"
  | "InfrastructureFailure"
  | "CommitFailure";

export type ConfigurationActivationResult =
  | {
      readonly status: "success";
      readonly value: Readonly<ActiveConfigurationSnapshot>;
    }
  | {
      readonly status: "failure";
      readonly reason: ConfigurationActivationFailureReason;
      readonly errors: readonly string[];
    };

export type ActiveConfigurationReadFailureReason =
  | "InvalidScope"
  | "NotFound"
  | "InvalidStoredRecord"
  | "IncompatibleStoredRecord"
  | "InfrastructureFailure";

export type ActiveConfigurationReadResult =
  | {
      readonly status: "success";
      readonly value: Readonly<ActiveConfigurationSnapshot>;
    }
  | {
      readonly status: "failure";
      readonly reason: ActiveConfigurationReadFailureReason;
      readonly errors: readonly string[];
    };

/**
 * Technology-neutral storage boundary for one application-approved activation.
 * It cannot validate configuration meaning, authorize an actor, choose a
 * configuration, retrieve conversation knowledge, or mutate conversation state.
 */
export interface AtomicConfigurationActivationStore {
  activateApproved(
    activation: Readonly<ApprovedConfigurationActivation>,
  ): Promise<ConfigurationActivationResult>;
  readActive(
    businessProfileId: string,
  ): Promise<ActiveConfigurationReadResult>;
  readForProfileVersion(
    businessProfileId: string,
    businessProfileVersion: number,
  ): Promise<ActiveConfigurationReadResult>;
}
