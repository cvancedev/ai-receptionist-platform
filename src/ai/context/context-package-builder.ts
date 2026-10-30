import type { BusinessProfile } from "../../domain/business-profile";
import type { ConversationState } from "../../domain/conversation-state";
import type { KnowledgeRecord } from "../../domain/knowledge-record";
import type { AiFailureCategory, ModelTaskDefinition } from "../contracts/catalog";
import type { AiOperationIdentity } from "../contracts/identities";
import type {
  ContextBusinessHours,
  ContextConversationEntry,
  ContextPackage,
  PolicyVersions,
} from "../contracts/packages";
import type { OperationResult } from "../contracts/results";
import type { BusinessHoursReference } from "../grounding/business-hours";
import { selectApprovedKnowledge } from "../grounding/knowledge-selection";
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
  /**
   * The business's hours resolved by the application for this turn. When it is
   * supplied, the package carries the resolved hours and excludes knowledge that
   * is not yet effective on the business-local day.
   */
  businessHours?: BusinessHoursReference | null;
  conversationEntries: readonly ContextConversationEntry[];
  currentCustomerInput: ContextConversationEntry;
  policyVersions: PolicyVersions;
}

export class PrototypeContextPackageBuilder {
  build(input: ContextPackageBuildInput): OperationResult<ContextPackage> {
    const failures = validateInput(input);
    if (failures.length > 0) return { status: "failure", failures };

    // The application chooses the knowledge. Scope, lifecycle, audience, and
    // effective date are enforced by the selector, which also reports what it
    // excluded so the boundaries can be verified rather than assumed.
    const selection = selectApprovedKnowledge({
      businessId: input.identity.businessId,
      knowledge: input.knowledge,
      asOfDate: input.businessHours?.status === "available"
        ? input.businessHours.asOfDate
        : null,
    });
    const approvedKnowledge = selection.selected.map((record) => ({
      id: record.id,
      version: record.version,
      businessId: record.businessId,
      category: record.category,
      sensitivity: "customer" as const,
    }));
    const businessHours = toContextBusinessHours(input.businessHours ?? null);

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
      approvedKnowledgeExcerpts: selection.selected.map((record) => ({ ...record })),
      knowledgeSelection: {
        includedIds: selection.selected.map((record) => record.id),
        excluded: selection.excluded.map((entry) => ({ ...entry })),
        totalCharacters: selection.totalCharacters,
      },
      businessHours,
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

function toContextBusinessHours(
  reference: BusinessHoursReference | null,
): ContextBusinessHours | null {
  if (!reference) return null;
  if (reference.status === "unavailable") {
    return { status: "unavailable", reason: reference.reason };
  }
  return {
    status: "available",
    version: reference.version,
    timeZone: reference.timeZone,
    asOfDate: reference.asOfDate,
    weekday: reference.weekday,
    todayStatus: reference.todayStatus,
    todaySchedule: reference.todaySchedule,
    todayOpensAt: reference.todayOpensAt,
    todayClosesAt: reference.todayClosesAt,
    weekly: reference.weekly.map((entry) => ({
      day: entry.day,
      schedule: entry.schedule,
      status: entry.status,
      opensAt: entry.opensAt,
      closesAt: entry.closesAt,
    })),
    openWeekdays: [...reference.openWeekdays],
    closedWeekdays: [...reference.closedWeekdays],
    approvedTimeTokens: [...reference.approvedTimeTokens],
    sourceKnowledgeIds: [...reference.sourceKnowledgeIds],
  };
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
