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
import { detectBusinessInformationQuestion } from "../grounding/business-question-router";
import { resolveBusinessHours, type BusinessHoursReference } from "../grounding/business-hours";
import {
  GROUNDED_ANSWER_FALLBACK,
  validateGroundedAnswer,
  type GroundedAnswerVerdict,
} from "../grounding/grounded-answer-validation";
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
  /**
   * The instant used to resolve the business's local day for hours questions.
   * Supplying it keeps a turn reproducible in verification; callers in the demo
   * and server runtimes pass the current time.
   */
  readonly businessHoursNowMs?: number;
}

/** The application's verdict on one model-drafted business answer. */
export interface AiDemoGroundedAnswer {
  readonly verdict: GroundedAnswerVerdict;
  readonly failures: readonly string[];
  /** Always safe to display: supported text, or the application's fallback. */
  readonly text: string;
  readonly sourceReferences: readonly string[];
}

/** Provider-reported token counts for one turn, when the provider reports them. */
export interface AiDemoTurnUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
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
  readonly groundedAnswer: AiDemoGroundedAnswer | null;
  readonly failureReason: string | null;
  /**
   * Reported usage, or null when the provider reported none. Settlement bills a
   * reported usage and otherwise falls back to the application's conservative
   * estimate; it never substitutes zero for an unreported amount.
   */
  readonly usage: AiDemoTurnUsage | null;
}

export async function runAiDemoTurn(
  input: AiDemoTurnInput,
): Promise<AiDemoTurnResult> {
  const state = input.conversationState;
  const businessQuestion = detectBusinessInformationQuestion(input.currentCustomerInput.content);
  const businessHours: BusinessHoursReference = resolveBusinessHours({
    profile: input.businessProfile,
    nowMs: input.businessHoursNowMs ?? Date.now(),
    knowledge: input.knowledge,
  });
  const taskIdentifier = selectAiDemoTask({
    stage: state.stage,
    pendingFieldId: input.pendingFieldId,
    businessQuestion,
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
    businessHours,
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

  // The transport collapses an absent usage record to zero units, and every real
  // request consumes at least one input token, so zero input units means "not
  // reported". Passing that through as a zero charge would under-bill a priced
  // provider, so it is reported as absent and the caller settles its estimate.
  const usage: AiDemoTurnUsage | null = normalized.usage.inputUnits > 0
    ? {
        inputTokens: normalized.usage.inputUnits,
        outputTokens: normalized.usage.outputUnits,
      }
    : null;

  if (normalized.status !== "completed") {
    return settled({
      performed: true,
      taskIdentifier,
      failureReason: normalized.error?.category ?? PROVIDER_RESULT_REASONS[normalized.status],
      usage,
    });
  }

  const parseResult = new BoundedRawOutputParser().parse(normalized.rawOutput);
  if (parseResult.status === "failure") {
    return settled({
      performed: true,
      taskIdentifier,
      failureReason: parseResult.failures[0],
      usage,
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

  // A business answer is released only after the application has checked it
  // against its own approved material. The model's text never reaches a customer
  // on its own authority. When the proposal itself is rejected, the application
  // still answers the question with its own limitation sentence rather than
  // leaving the customer without a reply.
  const grounding = taskIdentifier === "knowledge_grounded_answer"
    ? accepted
      ? validateGroundedAnswer({
          proposal: parseResult.value,
          contextPackage: contextResult.value,
          businessHours,
          businessProfile: input.businessProfile,
        })
      : {
          verdict: "rejected" as const,
          failures: validation.failures,
          authorizedText: GROUNDED_ANSWER_FALLBACK,
          sourceReferences: [] as readonly string[],
        }
    : null;
  const released = grounding === null || grounding.verdict === "supported";

  return settled({
    performed: true,
    taskIdentifier,
    decision,
    validationStatus: validation.status,
    failures: accepted ? grounding?.failures ?? [] : validation.failures,
    acceptedFields: validation.acceptedFields,
    rejectedFields: validation.rejectedFields,
    proposal: accepted && released ? parseResult.value : null,
    groundedAnswer: grounding
      ? {
          verdict: grounding.verdict,
          failures: grounding.failures,
          text: grounding.authorizedText,
          sourceReferences: grounding.sourceReferences,
        }
      : null,
    failureReason: accepted
      ? released ? null : (grounding?.failures[0] ?? "KnowledgeGroundingFailure")
      : (validation.failures[0] ?? validation.status),
    usage,
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
  readonly groundedAnswer?: AiDemoGroundedAnswer | null;
  readonly failureReason?: string | null;
  readonly usage?: AiDemoTurnUsage | null;
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
    groundedAnswer: result.groundedAnswer ?? null,
    failureReason: result.failureReason ?? null,
    usage: result.usage ?? null,
  });
}
