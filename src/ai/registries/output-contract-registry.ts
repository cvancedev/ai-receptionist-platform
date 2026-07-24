import type {
  AiFailureCategory,
  ContractFieldType,
  OutputContractDefinition,
} from "../contracts/catalog";
import type {
  ModelProposalIdentifier,
  ModelTaskIdentifier,
  OutputContractIdentifier,
} from "../contracts/identities";
import type { OperationResult } from "../contracts/results";
import { deepFreeze } from "../shared/immutable";

const scopeFields = [
  "proposalId", "proposalType", "requestId", "traceId", "businessId", "conversationId",
  "profileVersion", "stateRevision", "taskIdentifier", "taskVersion", "contextPackageId",
  "promptPackageId", "outputContractIdentifier", "outputContractVersion",
] as const;

const scopeTypes: Readonly<Record<string, ContractFieldType>> = Object.fromEntries(
  scopeFields.map((field) => [
    field,
    field === "profileVersion" || field === "stateRevision" || field === "taskVersion"
      || field === "outputContractVersion" ? "number" : "string",
  ]),
);

const contracts: readonly OutputContractDefinition[] = deepFreeze([
  contract("language_interpretation", "intent_interpretation",
    ["candidateIntent", "ambiguity", "unsupportedRequest", "sourceMessageReference"],
    ["candidateServiceReference", "customerObjective"],
    { candidateIntent: "string", ambiguity: "boolean", unsupportedRequest: "boolean", sourceMessageReference: "string", candidateServiceReference: "string", customerObjective: "string" },
    ["sourceMessageReference"]),
  contract("candidate_fact_extraction", "candidate_fact",
    ["fieldIdentifier", "candidateValue", "sourceMessageReference"],
    ["normalizationNote", "uncertaintyClassification"],
    { fieldIdentifier: "string", candidateValue: "string", sourceMessageReference: "string", normalizationNote: "string", uncertaintyClassification: "string" },
    ["sourceMessageReference"], "independent_fields"),
  contract("clarification_proposal", "clarification_text",
    ["customerFacingText", "reasonCategory"], ["approvedOptionReferences"],
    { customerFacingText: "string", reasonCategory: "string", approvedOptionReferences: "string_array" }),
  contract("response_drafting", "customer_response_draft",
    ["customerFacingText", "approvedActionReference"], ["groundingReferences"],
    { customerFacingText: "string", approvedActionReference: "string", groundingReferences: "string_array" },
    ["groundingReferences"]),
  contract("knowledge_grounded_answer", "knowledge_grounded_answer",
    ["customerFacingText", "knowledgeSourceReferences", "insufficientKnowledge"],
    ["limitationNote"],
    { customerFacingText: "string", knowledgeSourceReferences: "string_array", insufficientKnowledge: "boolean", limitationNote: "string" },
    ["knowledgeSourceReferences"]),
  contract("conversation_summary", "conversation_summary",
    ["confirmedFactSummary", "claimSummary", "correctionSummary", "pendingIssueSummary", "sourceRangeReferences"],
    ["contradictionSummary"],
    { confirmedFactSummary: "string_array", claimSummary: "string_array", correctionSummary: "string_array", pendingIssueSummary: "string_array", sourceRangeReferences: "string_array", contradictionSummary: "string_array" },
    ["sourceRangeReferences"], "independent_fields"),
  contract("escalation_recommendation", "escalation_recommendation",
    ["recommended", "reasonCategory", "supportingSourceReferences"],
    ["customerAcknowledgmentDraft"],
    { recommended: "boolean", reasonCategory: "string", supportingSourceReferences: "string_array", customerAcknowledgmentDraft: "string" },
    ["supportingSourceReferences"]),
  contract("unsupported_request_interpretation", "unsupported_request_interpretation",
    ["unsupportedCategory", "sourceMessageReference"],
    ["candidateNearestActiveService", "clarificationRecommended"],
    { unsupportedCategory: "string", sourceMessageReference: "string", candidateNearestActiveService: "string", clarificationRecommended: "boolean" },
    ["sourceMessageReference"]),
]);

const registry = new Map(contracts.map((definition) => [
  `${definition.identifier}@${definition.version}`,
  definition,
]));

export class OutputContractRegistry {
  resolve(
    identifier: OutputContractIdentifier | string,
    version: number,
  ): OperationResult<OutputContractDefinition> {
    const exact = registry.get(`${identifier}@${version}`);
    if (exact) return { status: "success", value: exact };
    const identifierExists = contracts.some((definition) => definition.identifier === identifier);
    const failure: AiFailureCategory = identifierExists
      ? "UnsupportedOutputContractVersion"
      : "UnknownOutputContract";
    return { status: "failure", failures: [failure] };
  }

  validateCompatibility(
    definition: OutputContractDefinition,
    task: ModelTaskIdentifier,
    proposal: ModelProposalIdentifier,
  ): OperationResult<OutputContractDefinition> {
    return definition.compatibleTask === task && definition.compatibleProposalType === proposal
      ? { status: "success", value: definition }
      : { status: "failure", failures: ["OutputContractMismatch"] };
  }

  list(): readonly OutputContractDefinition[] {
    return contracts;
  }
}

function contract(
  taskIdentifier: ModelTaskIdentifier,
  proposalType: ModelProposalIdentifier,
  proposalRequired: readonly string[],
  proposalOptional: readonly string[],
  proposalTypes: Readonly<Record<string, ContractFieldType>>,
  sourceReferenceFields: readonly string[] = [],
  partialAcceptancePolicy: OutputContractDefinition["partialAcceptancePolicy"] = "none",
): OutputContractDefinition {
  const requiredFields = [...scopeFields, ...proposalRequired];
  const optionalFields = [...proposalOptional];
  return {
    identifier: `output_${proposalType}`,
    version: 1,
    compatibleTask: taskIdentifier,
    compatibleProposalType: proposalType,
    requiredFields,
    optionalFields,
    allowedFields: [...requiredFields, ...optionalFields],
    fieldTypes: { ...scopeTypes, ...proposalTypes },
    sourceReferenceFields,
    scopeFields,
    maxStringLength: 2_000,
    maxArrayLength: 25,
    extraFieldPolicy: "reject",
    partialAcceptancePolicy,
  };
}
