import type { AiFailureCategory, ModelTaskDefinition, OutputContractDefinition } from "../contracts/catalog";
import type { ContextPackage, PolicyVersions, PromptPackage } from "../contracts/packages";
import type { OperationResult } from "../contracts/results";
import { deepFreeze } from "../shared/immutable";

const PROMPT_SIZE_LIMIT = 16_000;

export interface PromptPackageCompositionInput {
  promptPackageId: string;
  task: ModelTaskDefinition;
  contextPackage: ContextPackage;
  outputContract: OutputContractDefinition;
  policyVersions: PolicyVersions;
}

export class PrototypePromptPackageComposer {
  compose(input: PromptPackageCompositionInput): OperationResult<PromptPackage> {
    const failures = validateComposition(input);
    if (failures.length > 0) return { status: "failure", failures };

    const base = {
      requestId: input.contextPackage.requestId,
      traceId: input.contextPackage.traceId,
      businessId: input.contextPackage.businessId,
      conversationId: input.contextPackage.conversationId,
      profileVersion: input.contextPackage.profileVersion,
      stateRevision: input.contextPackage.stateRevision,
      taskIdentifier: input.task.identifier,
      taskVersion: input.task.version,
      contextPackageId: input.contextPackage.contextPackageId,
      promptPackageId: input.promptPackageId,
      taskDefinitionReference: `task-${input.task.identifier}/v${input.task.version}`,
      authorityPolicyReference: input.policyVersions.applicationAuthorityPolicyVersion,
      permissionPolicyReference: `permission-${input.task.identifier}/v${input.task.version}`,
      prohibitionPolicyReference: `prohibition-${input.task.identifier}/v${input.task.version}`,
      outputContractReference: {
        identifier: input.outputContract.identifier,
        version: input.outputContract.version,
      },
      approvedContextPackageReference: {
        contextPackageId: input.contextPackage.contextPackageId,
        includedSections: [...input.contextPackage.includedSections],
      },
      responseStylePolicyReference: input.policyVersions.responseStylePolicyVersion,
      promptPolicyVersion: input.policyVersions.promptPolicyVersion,
      composerVersion: input.policyVersions.composerVersion,
      provenance: {
        taskIdentifier: input.task.identifier,
        contextPackageId: input.contextPackage.contextPackageId,
      },
    };
    const estimatedSize = JSON.stringify(base).length + input.contextPackage.budget.estimatedSize;
    if (estimatedSize > PROMPT_SIZE_LIMIT) {
      return { status: "failure", failures: ["PromptOverBudget"] };
    }

    const promptPackage: PromptPackage = {
      ...base,
      budget: {
        sizeLimit: PROMPT_SIZE_LIMIT,
        estimatedSize,
        requiredSectionsPreserved: true,
      },
      validation: {
        valid: true,
        validatedAt: "prototype-deterministic",
        validatorVersion: input.policyVersions.validatorVersion,
        failures: [],
      },
    };
    return { status: "success", value: deepFreeze(promptPackage) };
  }
}

function validateComposition(input: PromptPackageCompositionInput): AiFailureCategory[] {
  const failures: AiFailureCategory[] = [];
  const context = input.contextPackage;
  if (!context.validation.valid) failures.push("InvalidContextPackage");
  if (context.taskIdentifier !== input.task.identifier || context.taskVersion !== input.task.version) {
    failures.push("ContextPackageMismatch");
  }
  if (input.outputContract.compatibleTask !== input.task.identifier
    || input.outputContract.compatibleProposalType !== input.task.compatibleProposalType
    || input.outputContract.identifier !== input.task.compatibleOutputContract) {
    failures.push("OutputContractMismatch");
  }
  if (input.task.requiredContextSections.some((section) => !context.includedSections.includes(section))) {
    failures.push("InvalidContextPackage");
  }
  if (!input.policyVersions.applicationAuthorityPolicyVersion) failures.push("MissingAuthorityPolicy");
  if (!input.policyVersions.promptPolicyVersion || !input.policyVersions.composerVersion
    || !input.policyVersions.responseStylePolicyVersion) {
    failures.push("InvalidPromptPackage");
  }
  if (context.profileVersion <= 0 || context.stateRevision < 0) failures.push("PromptPackageMismatch");
  return [...new Set(failures)];
}
