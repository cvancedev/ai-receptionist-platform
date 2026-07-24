import type { BusinessProfile } from "../../domain/business-profile";
import type { AiFailureCategory, ContractFieldType, ModelTaskDefinition, OutputContractDefinition } from "../contracts/catalog";
import { isModelProposalIdentifier } from "../contracts/identities";
import type { ContextPackage } from "../contracts/packages";
import type { AiValidationResult, ValidationStageResult } from "../contracts/results";
import { deepFreeze } from "../shared/immutable";

export interface ProposalValidationInput {
  proposal: Readonly<Record<string, unknown>>;
  task: ModelTaskDefinition;
  contract: OutputContractDefinition;
  contextPackage: ContextPackage;
  promptPackageId: string;
  businessProfile: BusinessProfile;
}

export class PrototypeProposalValidator {
  validate(input: ProposalValidationInput): AiValidationResult {
    const structural = structuralFailures(input);
    const scope = scopeFailures(input);
    const semantic = semanticFailures(input);
    const authority = authorityFailures(input.proposal);
    const failures = unique([...structural.failures, ...scope, ...semantic, ...authority]);
    const rejectedFields = uniqueStrings([...structural.rejectedFields, ...rejectedFieldsForAuthority(input.proposal)]);
    const acceptedFields = Object.keys(input.proposal)
      .filter((field) => input.contract.allowedFields.includes(field) && !rejectedFields.includes(field));
    const stages: ValidationStageResult[] = [
      stage("structural", structural.failures),
      stage("scope-and-revision", scope),
      stage("semantic-and-grounding", semantic),
      stage("authority", authority),
    ];
    return deepFreeze({
      status: failures.length === 0 ? "valid" : "invalid",
      failures,
      warnings: [],
      acceptedFields,
      rejectedFields,
      stages,
      policyVersions: { validatorVersion: input.contextPackage.policyVersions.validatorVersion },
      traceId: input.contextPackage.traceId,
      proposal: input.proposal,
    });
  }
}

function structuralFailures(input: ProposalValidationInput): {
  failures: AiFailureCategory[];
  rejectedFields: string[];
} {
  const failures: AiFailureCategory[] = [];
  const rejectedFields: string[] = [];
  const proposalType = input.proposal.proposalType;
  if (!isModelProposalIdentifier(proposalType)) failures.push("UnknownProposalType");
  else if (proposalType !== input.contract.compatibleProposalType
    || proposalType !== input.task.compatibleProposalType) {
    failures.push("ProposalTaskMismatch");
  }
  if (input.contract.compatibleTask !== input.task.identifier
    || input.contract.identifier !== input.task.compatibleOutputContract) {
    failures.push("OutputContractMismatch");
  }
  for (const field of input.contract.requiredFields) {
    if (!(field in input.proposal)) {
      failures.push("RequiredFieldMissing");
      rejectedFields.push(field);
    }
  }
  for (const field of Object.keys(input.proposal)) {
    if (!input.contract.allowedFields.includes(field)) {
      failures.push("UnexpectedField");
      rejectedFields.push(field);
      continue;
    }
    const expectedType = input.contract.fieldTypes[field];
    if (expectedType && !matchesType(input.proposal[field], expectedType)) {
      failures.push("InvalidFieldType");
      rejectedFields.push(field);
    }
    const value = input.proposal[field];
    if (typeof value === "string" && value.length > input.contract.maxStringLength) {
      failures.push("InvalidFieldType");
      rejectedFields.push(field);
    }
    if (Array.isArray(value) && value.length > input.contract.maxArrayLength) {
      failures.push("InvalidFieldType");
      rejectedFields.push(field);
    }
  }
  return { failures: unique(failures), rejectedFields: uniqueStrings(rejectedFields) };
}

function scopeFailures(input: ProposalValidationInput): AiFailureCategory[] {
  const proposal = input.proposal;
  const context = input.contextPackage;
  const failures: AiFailureCategory[] = [];
  if (proposal.requestId !== context.requestId || proposal.traceId !== context.traceId
    || proposal.contextPackageId !== context.contextPackageId) {
    failures.push("ContextPackageMismatch");
  }
  if (proposal.promptPackageId !== input.promptPackageId) failures.push("PromptPackageMismatch");
  if (proposal.businessId !== context.businessId) failures.push("InvalidBusinessScope");
  if (proposal.conversationId !== context.conversationId) failures.push("InvalidConversationScope");
  if (proposal.profileVersion !== context.profileVersion) failures.push("ProfileVersionMismatch");
  if (proposal.stateRevision !== context.stateRevision) failures.push("StateRevisionMismatch");
  if (proposal.taskIdentifier !== input.task.identifier || proposal.taskVersion !== input.task.version) {
    failures.push("ProposalTaskMismatch");
  }
  if (proposal.outputContractIdentifier !== input.contract.identifier
    || proposal.outputContractVersion !== input.contract.version) {
    failures.push("OutputContractMismatch");
  }
  return unique(failures);
}

function semanticFailures(input: ProposalValidationInput): AiFailureCategory[] {
  const failures: AiFailureCategory[] = [];
  const proposal = input.proposal;
  const profile = input.businessProfile;
  const context = input.contextPackage;
  const candidateService = proposal.candidateServiceReference ?? proposal.candidateNearestActiveService;
  if (typeof candidateService === "string") {
    const service = profile.services.find((item) => item.id === candidateService);
    if (!service) failures.push("UnknownService");
    else if (service.status !== "active") failures.push("InactiveServiceReference");
  }
  if (typeof proposal.fieldIdentifier === "string") {
    const known = proposal.fieldIdentifier === "requested-service"
      || profile.intakeRequirements.some((field) => field.id === proposal.fieldIdentifier);
    if (!known) failures.push("UnknownBusinessField");
  }

  const messageIds = new Set([
    context.currentCustomerInput.messageId,
    ...context.eligibleConversationEntries.map((entry) => entry.messageId),
  ]);
  for (const field of ["sourceMessageReference", "sourceRangeReferences", "supportingSourceReferences"]) {
    const value = proposal[field];
    const references = typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
    if (references.some((reference) => typeof reference !== "string" || !messageIds.has(reference))) {
      failures.push("InvalidSourceReference");
    }
  }
  const knowledgeIds = new Set(context.approvedKnowledge.map((record) => record.id));
  for (const field of ["knowledgeSourceReferences", "groundingReferences"]) {
    const value = proposal[field];
    if (Array.isArray(value)
      && value.some((reference) => typeof reference !== "string" || !knowledgeIds.has(reference))) {
      failures.push("KnowledgeGroundingFailure");
    }
  }
  if (typeof proposal.customerFacingText === "string") {
    if (/\b(guarantee|confirmed appointment|definitely available)\b/i.test(proposal.customerFacingText)) {
      failures.push("UnsupportedPromise");
    }
    if (/\bI (updated|changed|mutated|completed)\b/i.test(proposal.customerFacingText)) {
      failures.push("StateMutationAuthorityViolation");
    }
    if (/\bI (sent|delivered)\b/i.test(proposal.customerFacingText)) {
      failures.push("CustomerReleaseAuthorityViolation");
    }
  }
  if (proposal.proposalType === "conversation_summary"
    && Array.isArray(proposal.confirmedFactSummary)
    && proposal.confirmedFactSummary.some((item) => typeof item === "string" && /unconfirmed claim/i.test(item))) {
    failures.push("ClaimFactAuthorityViolation");
  }
  return unique(failures);
}

function authorityFailures(proposal: Readonly<Record<string, unknown>>): AiFailureCategory[] {
  const failures: AiFailureCategory[] = [];
  if ("stateMutation" in proposal) failures.push("StateMutationAuthorityViolation", "ProhibitedOperation");
  if ("customerReleased" in proposal) failures.push("CustomerReleaseAuthorityViolation", "ProhibitedOperation");
  if ("escalationActivated" in proposal) failures.push("EscalationAuthorityViolation", "ProhibitedOperation");
  if ("completionMarked" in proposal) failures.push("CompletionAuthorityViolation", "ProhibitedOperation");
  if ("correctionApplied" in proposal) failures.push("CorrectionAuthorityViolation", "ProhibitedOperation");
  if ("factConfirmed" in proposal) failures.push("ClaimFactAuthorityViolation", "ProhibitedOperation");
  if ("toolCall" in proposal) failures.push("PermissionViolation", "ProhibitedOperation");
  return unique(failures);
}

function rejectedFieldsForAuthority(proposal: Readonly<Record<string, unknown>>): string[] {
  return ["stateMutation", "customerReleased", "escalationActivated", "completionMarked",
    "correctionApplied", "factConfirmed", "toolCall"].filter((field) => field in proposal);
}

function matchesType(value: unknown, expected: ContractFieldType): boolean {
  switch (expected) {
    case "string": return typeof value === "string";
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "boolean": return typeof value === "boolean";
    case "string_array": return Array.isArray(value) && value.every((item) => typeof item === "string");
    case "record": return value !== null && typeof value === "object" && !Array.isArray(value);
    case "record_array": return Array.isArray(value)
      && value.every((item) => item !== null && typeof item === "object" && !Array.isArray(item));
  }
}

function stage(name: string, failures: readonly AiFailureCategory[]): ValidationStageResult {
  return { stage: name, passed: failures.length === 0, failures: unique(failures) };
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function uniqueStrings(values: readonly string[]): string[] {
  return unique(values);
}
