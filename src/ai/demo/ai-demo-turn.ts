import type {
  ApplicationDecision,
  ProviderCompletionStatus,
  ValidationStatus,
} from "../contracts/results";
import type { ContextConversationEntry } from "../contracts/packages";
import type { ModelTaskIdentifier } from "../contracts/identities";
import type { BusinessProfile } from "../../domain/business-profile";
import type { ConversationState } from "../../domain/conversation-state";
import type { KnowledgeRecord } from "../../domain/knowledge-record";
import { PrototypeContextPackageBuilder } from "../context/context-package-builder";
import { ApplicationDecisionEngine } from "../decisions/application-decision-engine";
import { BoundedRawOutputParser } from "../output/raw-output-parser";
import { ProviderResultNormalizer } from "../output/provider-result-normalizer";
import { PrototypePromptPackageComposer } from "../prompts/prompt-package-composer";
import { renderProviderInstructions } from "../prompts/provider-instruction-renderer";
import { TransportModelProviderAdapter, type OfflineTransport } from "../providers/transport-model-provider-adapter";
import { AI_POLICY_VERSIONS } from "../registries/policy-versions";
import { OutputContractRegistry } from "../registries/output-contract-registry";
import { TaskRegistry } from "../registries/task-registry";
import { deepFreeze } from "../shared/immutable";
import { PrototypeProposalValidator } from "../validation/proposal-validator";
import { createSimulatedModelTransport } from "./simulated-model-transport";
import { selectAiDemoTask } from "./turn-task-router";

/**
 * One bounded AI turn for the demo: route, build, render, call the simulated
 * transport, then normalize, parse, validate, and classify. This module never
 * touches conversation state, persistence, handoff, or release; the caller
 * applies an accepted result through the certified deterministic engine.
 */
export const AI_DEMO_TURN_VERSION = "ai-demo-turn/v1" as const;
const AI_DEMO_TIMEOUT_MS = 2_000;

const PROVIDER_RESULT_REASONS:
Record<Exclude<ProviderCompletionStatus, "completed">, string> = {
  refused: "ProviderResultRefused",
  incomplete: "ProviderResultIncomplete",
  failed: "ProviderResultFailed",
  cancelled: "ProviderResultCancelled",
};

export interface AiDemoTurnInput {
  readonly businessProfile: BusinessProfile;
  readonly knowledge: readonly KnowledgeRecord[];
  readonly conversationState: ConversationState;
  readonly conversationEntries: readonly ContextConversationEntry[];
  readonly currentCustomerInput: ContextConversationEntry;
  readonly pendingFieldId: string | null;
  readonly identifiers: {
    readonly requestId: string;
    readonly traceId: string;
    readonly contextPackageId: string;
    readonly promptPackageId: string;
  };
  readonly transport?: OfflineTransport;
}

export interface AiDemoTurnResult {
  readonly performed: boolean;
  readonly taskIdentifier: ModelTaskIdentifier | null;
  readonly decision: ApplicationDecision | null;
  readonly validationStatus: ValidationStatus | null;
  readonly failures: readonly string[];
  readonly acceptedFields: readonly string[];
  readonly rejectedFields: readonly string[];
  readonly proposal: Readonly<Record<string, unknown>> | null;
  readonly failureReason: string | null;
}

export async function runAiDemoTurn(
  input: AiDemoTurnInput,
): Promise<AiDemoTurnResult> {
  const state = input.conversationState;
  const taskIdentifier = selectAiDemoTask({
    stage: state.stage,
    pendingFieldId: input.pendingFieldId,
  });
  if (!taskIdentifier) return settled({ performed: false });

  const tasks = new TaskRegistry();
  const contracts = new OutputContractRegistry();
  const taskResult = tasks.resolve(taskIdentifier, 1);
  if (taskResult.status === "failure") {
    return settled({ performed: true, taskIdentifier, failureReason: taskResult.failures[0] });
  }
  const task = taskResult.value;

  const contractResult = contracts.resolve(task.compatibleOutputContract, 1);
  if (contractResult.status === "failure") {
    return settled({ performed: true, taskIdentifier, failureReason: contractResult.failures[0] });
  }
  const contract = contractResult.value;

  const identity = {
    requestId: input.identifiers.requestId,
    traceId: input.identifiers.traceId,
    businessId: input.businessProfile.id,
    conversationId: state.conversationId,
    profileVersion: input.businessProfile.version,
    stateRevision: state.revision,
    taskIdentifier: task.identifier,
    taskVersion: task.version,
  } as const;

  const contextResult = new PrototypeContextPackageBuilder().build({
    identity,
    contextPackageId: input.identifiers.contextPackageId,
    businessIdentity: {
      id: input.businessProfile.id,
      displayName: input.businessProfile.businessName,
    },
    businessProfile: input.businessProfile,
    conversationState: state,
    task,
    knowledge: input.knowledge,
    conversationEntries: input.conversationEntries,
    currentCustomerInput: input.currentCustomerInput,
    policyVersions: AI_POLICY_VERSIONS,
  });
  if (contextResult.status === "failure") {
    return settled({ performed: true, taskIdentifier, failureReason: contextResult.failures[0] });
  }

  const promptResult = new PrototypePromptPackageComposer().compose({
    promptPackageId: input.identifiers.promptPackageId,
    task,
    contextPackage: contextResult.value,
    outputContract: contract,
    policyVersions: AI_POLICY_VERSIONS,
  });
  if (promptResult.status === "failure") {
    return settled({ performed: true, taskIdentifier, failureReason: promptResult.failures[0] });
  }

  const renderResult = renderProviderInstructions({
    promptPackage: promptResult.value,
    task,
    outputContract: contract,
    contextPackage: contextResult.value,
  });
  if (renderResult.status === "failure") {
    return settled({ performed: true, taskIdentifier, failureReason: renderResult.failures[0] });
  }

  const adapter = new TransportModelProviderAdapter(
    renderResult.value,
    input.transport ?? createSimulatedModelTransport(input.businessProfile),
    { timeoutMs: AI_DEMO_TIMEOUT_MS },
  );
  const adapterResult = await adapter.execute({
    identity,
    promptPackage: promptResult.value,
    outputContractIdentifier: contract.identifier,
    outputContractVersion: contract.version,
    attempt: { attemptId: `attempt-${input.identifiers.requestId}-1`, attemptNumber: 1 },
    timeoutMs: AI_DEMO_TIMEOUT_MS,
    cancelled: false,
  });
  const normalized = new ProviderResultNormalizer().normalize(adapterResult);

  if (normalized.status !== "completed") {
    return settled({
      performed: true,
      taskIdentifier,
      failureReason: normalized.error?.category ?? PROVIDER_RESULT_REASONS[normalized.status],
    });
  }

  const parseResult = new BoundedRawOutputParser().parse(normalized.rawOutput);
  if (parseResult.status === "failure") {
    return settled({
      performed: true,
      taskIdentifier,
      failureReason: parseResult.failures[0],
    });
  }

  const validation = new PrototypeProposalValidator().validate({
    proposal: parseResult.value,
    task,
    contract,
    contextPackage: contextResult.value,
    promptPackageId: promptResult.value.promptPackageId,
    businessProfile: input.businessProfile,
  });
  const decision = new ApplicationDecisionEngine().decide(validation, contract);
  const accepted = validation.status === "valid";

  return settled({
    performed: true,
    taskIdentifier,
    decision,
    validationStatus: validation.status,
    failures: validation.failures,
    acceptedFields: validation.acceptedFields,
    rejectedFields: validation.rejectedFields,
    proposal: accepted ? parseResult.value : null,
    failureReason: accepted ? null : (validation.failures[0] ?? validation.status),
  });
}

interface PartialResult {
  readonly performed: boolean;
  readonly taskIdentifier?: ModelTaskIdentifier | null;
  readonly decision?: ApplicationDecision | null;
  readonly validationStatus?: ValidationStatus | null;
  readonly failures?: readonly string[];
  readonly acceptedFields?: readonly string[];
  readonly rejectedFields?: readonly string[];
  readonly proposal?: Readonly<Record<string, unknown>> | null;
  readonly failureReason?: string | null;
}

function settled(result: PartialResult): AiDemoTurnResult {
  return deepFreeze({
    performed: result.performed,
    taskIdentifier: result.taskIdentifier ?? null,
    decision: result.decision ?? null,
    validationStatus: result.validationStatus ?? null,
    failures: result.failures ?? [],
    acceptedFields: result.acceptedFields ?? [],
    rejectedFields: result.rejectedFields ?? [],
    proposal: result.proposal ?? null,
    failureReason: result.failureReason ?? null,
  });
}
