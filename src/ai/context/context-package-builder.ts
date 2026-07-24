import type { BusinessProfile } from "../../domain/business-profile";
import type { ConversationState } from "../../domain/conversation-state";
import type { KnowledgeRecord } from "../../domain/knowledge-record";
import type { AiFailureCategory, ModelTaskDefinition } from "../contracts/catalog";
import type { AiOperationIdentity } from "../contracts/identities";
import type {
  ContextConversationEntry,
  ContextPackage,
  PolicyVersions,
} from "../contracts/packages";
import type { OperationResult } from "../contracts/results";
import { deepFreeze } from "../shared/immutable";

const CONTEXT_SIZE_LIMIT = 12_000;

export interface ContextPackageBuildInput {
  identity: AiOperationIdentity;
  contextPackageId: string;
  businessIdentity: { id: string; displayName: string };
  businessProfile: BusinessProfile;
  conversationState: ConversationState;
  task: ModelTaskDefinition;
  knowledge: readonly KnowledgeRecord[];
  conversationEntries: readonly ContextConversationEntry[];
  currentCustomerInput: ContextConversationEntry;
  policyVersions: PolicyVersions;
}

export class PrototypeContextPackageBuilder {
  build(input: ContextPackageBuildInput): OperationResult<ContextPackage> {
    const failures = validateInput(input);
    if (failures.length > 0) return { status: "failure", failures };

    const approvedKnowledge = input.knowledge
      .filter((record) =>
        record.businessProfileId === input.identity.businessId
        && record.lifecycleState === "active"
        && (record.audience === "customer" || record.audience === "both"))
      .map((record) => ({
        id: record.id,
        version: record.version,
        businessId: record.businessProfileId,
        category: record.category,
        sensitivity: "customer" as const,
      }));

    const packageWithoutBudget = {
      ...input.identity,
      contextPackageId: input.contextPackageId,
      contextContractVersion: input.policyVersions.contextContractVersion,
      businessIdentity: { ...input.businessIdentity },
      deterministicState: {
        stage: input.conversationState.stage,
        missingFields: [...input.conversationState.missingFields],
        askedQuestions: [...input.conversationState.askedQuestions],
        escalationStatus: input.conversationState.escalation.status,
        completionStatus: input.conversationState.completionState,
      },
      confirmedFacts: structuredClone(input.conversationState.confirmedFacts),
      customerClaims: structuredClone(input.conversationState.customerClaims),
      corrections: structuredClone(input.conversationState.corrections),
      approvedKnowledge,
      eligibleConversationEntries: input.conversationEntries.map((entry) => ({ ...entry })),
      currentCustomerInput: { ...input.currentCustomerInput },
      policyVersions: { ...input.policyVersions },
      provenance: {
        profileId: input.businessProfile.id,
        knowledgeSourceIds: approvedKnowledge.map((record) => record.id),
        stateRevision: input.conversationState.revision,
      },
      includedSections: [...input.task.requiredContextSections],
    };
    const estimatedSize = JSON.stringify(packageWithoutBudget).length;
    if (estimatedSize > CONTEXT_SIZE_LIMIT) {
      return { status: "failure", failures: ["InvalidContextPackage"] };
    }

    const contextPackage: ContextPackage = {
      ...packageWithoutBudget,
      budget: {
        sizeLimit: CONTEXT_SIZE_LIMIT,
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
    return { status: "success", value: deepFreeze(contextPackage) };
  }
}

function validateInput(input: ContextPackageBuildInput): AiFailureCategory[] {
  const failures: AiFailureCategory[] = [];
  if (!input.identity.businessId || input.businessIdentity.id !== input.identity.businessId
    || input.businessProfile.id !== input.identity.businessId
    || input.conversationState.businessProfileId !== input.identity.businessId) {
    failures.push("InvalidBusinessScope");
  }
  if (!input.identity.conversationId
    || input.conversationState.conversationId !== input.identity.conversationId
    || input.currentCustomerInput.conversationId !== input.identity.conversationId
    || input.conversationEntries.some((entry) => entry.conversationId !== input.identity.conversationId)) {
    failures.push("InvalidConversationScope");
  }
  if (input.businessProfile.status !== "active") failures.push("InvalidContextPackage");
  if (input.businessProfile.version !== input.identity.profileVersion
    || input.conversationState.businessProfileVersion !== input.identity.profileVersion) {
    failures.push("ProfileVersionMismatch");
  }
  if (input.conversationState.revision !== input.identity.stateRevision) {
    failures.push("StateRevisionMismatch");
  }
  if (input.task.identifier !== input.identity.taskIdentifier
    || input.task.version !== input.identity.taskVersion) {
    failures.push("ContextPackageMismatch");
  }
  if (!input.policyVersions.contextContractVersion || !input.policyVersions.validatorVersion) {
    failures.push("InvalidContextPackage");
  }
  return unique(failures);
}

function unique(failures: readonly AiFailureCategory[]): AiFailureCategory[] {
  return [...new Set(failures)];
}
