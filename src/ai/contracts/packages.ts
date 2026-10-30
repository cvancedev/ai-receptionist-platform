import type {
  ConversationCorrection,
  ConfirmedFact,
  CustomerClaim,
} from "../../domain/conversation-state";
import type { ContextSection, OutputContractDefinition } from "./catalog";
import type { AiOperationIdentity, ModelTaskIdentifier } from "./identities";

export interface PolicyVersions {
  applicationAuthorityPolicyVersion: string;
  promptPolicyVersion: string;
  contextContractVersion: string;
  responseStylePolicyVersion: string;
  validatorVersion: string;
  composerVersion: string;
}

export interface PackageBudgetMetadata {
  sizeLimit: number;
  estimatedSize: number;
  requiredSectionsPreserved: boolean;
}

export interface PackageValidationMetadata {
  valid: boolean;
  validatedAt: string;
  validatorVersion: string;
  failures: readonly string[];
}

export interface ContextKnowledgeReference {
  id: string;
  version: number;
  businessId: string;
  category: string;
  sensitivity: "customer";
}

/**
 * An approved knowledge record whose text the application is willing to show a
 * model. Only records selected by the application appear here, and the text is
 * shown in full so a claim can be checked against its actual source.
 */
export interface ContextKnowledgeExcerpt {
  id: string;
  version: number;
  businessId: string;
  title: string;
  category: string;
  source: string;
  effectiveDate: string;
  content: string;
}

/**
 * The business's configured hours resolved for one business-local day, or the
 * reason they could not be resolved. The same value grounds the answer and
 * validates it afterwards.
 */
export type ContextBusinessHours =
  | {
      readonly status: "available";
      readonly version: string;
      readonly timeZone: string;
      readonly asOfDate: string;
      readonly weekday: string;
      readonly todayStatus: "open" | "closed";
      readonly todaySchedule: string;
      readonly todayOpensAt: string | null;
      readonly todayClosesAt: string | null;
      readonly weekly: readonly {
        readonly day: string;
        readonly schedule: string;
        readonly status: "open" | "closed";
        readonly opensAt: string | null;
        readonly closesAt: string | null;
      }[];
      readonly openWeekdays: readonly string[];
      readonly closedWeekdays: readonly string[];
      readonly approvedTimeTokens: readonly string[];
      readonly sourceKnowledgeIds: readonly string[];
    }
  | { readonly status: "unavailable"; readonly reason: string };

export interface ContextKnowledgeSelectionMetadata {
  readonly includedIds: readonly string[];
  readonly excluded: readonly { readonly id: string; readonly reason: string }[];
  readonly totalCharacters: number;
}

export interface ContextConversationEntry {
  messageId: string;
  conversationId: string;
  source: "customer" | "application";
  sequence: number;
  content: string;
}

export interface ContextPackage extends AiOperationIdentity {
  contextPackageId: string;
  contextContractVersion: string;
  businessIdentity: { id: string; displayName: string };
  deterministicState: {
    stage: string;
    missingFields: readonly string[];
    askedQuestions: readonly string[];
    escalationStatus: string;
    completionStatus: string;
  };
  confirmedFacts: Readonly<Record<string, ConfirmedFact>>;
  customerClaims: readonly CustomerClaim[];
  corrections: readonly ConversationCorrection[];
  approvedKnowledge: readonly ContextKnowledgeReference[];
  approvedKnowledgeExcerpts: readonly ContextKnowledgeExcerpt[];
  knowledgeSelection: ContextKnowledgeSelectionMetadata;
  businessHours: ContextBusinessHours | null;
  eligibleConversationEntries: readonly ContextConversationEntry[];
  currentCustomerInput: ContextConversationEntry;
  policyVersions: PolicyVersions;
  provenance: {
    profileId: string;
    knowledgeSourceIds: readonly string[];
    stateRevision: number;
  };
  includedSections: readonly ContextSection[];
  budget: PackageBudgetMetadata;
  validation: PackageValidationMetadata;
}

export interface PromptPackage extends AiOperationIdentity {
  contextPackageId: string;
  promptPackageId: string;
  taskDefinitionReference: string;
  authorityPolicyReference: string;
  permissionPolicyReference: string;
  prohibitionPolicyReference: string;
  outputContractReference: {
    identifier: OutputContractDefinition["identifier"];
    version: number;
  };
  approvedContextPackageReference: {
    contextPackageId: string;
    includedSections: readonly ContextSection[];
  };
  responseStylePolicyReference: string;
  promptPolicyVersion: string;
  composerVersion: string;
  budget: PackageBudgetMetadata;
  provenance: { taskIdentifier: ModelTaskIdentifier; contextPackageId: string };
  validation: PackageValidationMetadata;
}
