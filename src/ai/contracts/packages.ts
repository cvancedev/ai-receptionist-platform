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
