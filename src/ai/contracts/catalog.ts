import type {
  ModelProposalIdentifier,
  ModelTaskIdentifier,
  OutputContractIdentifier,
} from "./identities";

export const AI_FAILURE_CATEGORIES = [
  "UnknownTask", "UnsupportedTaskVersion", "TaskNotAllowed",
  "UnknownOutputContract", "UnsupportedOutputContractVersion", "OutputContractMismatch",
  "UnknownProposalType", "ProposalTaskMismatch",
  "InvalidContextPackage", "ContextPackageMismatch", "InvalidPromptPackage", "PromptPackageMismatch",
  "MissingAuthorityPolicy", "InstructionConflict", "PromptOverBudget",
  "ProviderResultIncomplete", "ProviderResultRefused", "ProviderResultFailed",
  "ProviderResultCancelled", "RawOutputMalformed",
  "InvalidBusinessScope", "InvalidConversationScope", "ProfileVersionMismatch", "StateRevisionMismatch",
  "RequiredFieldMissing", "UnexpectedField", "InvalidFieldType", "InvalidEnumeration",
  "InvalidSourceReference", "PermissionViolation", "ProhibitedOperation",
  "UnknownBusinessField", "UnknownService", "InactiveServiceReference",
  "KnowledgeGroundingFailure", "UnsupportedPromise", "UnsafeCustomerText",
  "ClaimFactAuthorityViolation", "CorrectionAuthorityViolation", "EscalationAuthorityViolation",
  "CompletionAuthorityViolation", "StateMutationAuthorityViolation", "CustomerReleaseAuthorityViolation",
  "DuplicateProposalProcessing", "DuplicateStateMutation", "DuplicateResponseRelease",
  "RepairNotAllowed", "RetryNotAllowed", "RetryExhausted", "ValidationCancelled",
  "UnknownValidationFailure",
] as const;

export type AiFailureCategory = (typeof AI_FAILURE_CATEGORIES)[number];

export type ContextSection =
  | "identity" | "business" | "state" | "facts" | "claims" | "corrections"
  | "knowledge" | "history" | "current_customer_input";

export interface ModelTaskDefinition {
  identifier: ModelTaskIdentifier;
  version: number;
  status: "approved";
  compatibleProposalType: ModelProposalIdentifier;
  compatibleOutputContract: OutputContractIdentifier;
  requiredContextSections: readonly ContextSection[];
  allowedProposalBehavior: readonly string[];
  prohibitedBehavior: readonly string[];
  retryPolicyClassification: "none" | "bounded";
  costClassification: "low" | "standard" | "extended";
  latencyClassification: "interactive" | "non_blocking";
}

export type ContractFieldType =
  | "string" | "number" | "boolean" | "string_array" | "record" | "record_array";

export interface OutputContractDefinition {
  identifier: OutputContractIdentifier;
  version: number;
  compatibleTask: ModelTaskIdentifier;
  compatibleProposalType: ModelProposalIdentifier;
  requiredFields: readonly string[];
  optionalFields: readonly string[];
  allowedFields: readonly string[];
  fieldTypes: Readonly<Record<string, ContractFieldType>>;
  sourceReferenceFields: readonly string[];
  scopeFields: readonly string[];
  maxStringLength: number;
  maxArrayLength: number;
  extraFieldPolicy: "reject";
  partialAcceptancePolicy: "none" | "independent_fields";
}
