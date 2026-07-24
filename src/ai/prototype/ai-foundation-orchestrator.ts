import type { AiFailureCategory, OutputContractDefinition } from "../contracts/catalog";
import type { ModelTaskIdentifier } from "../contracts/identities";
import type {
  AiFoundationSnapshot,
  AiValidationResult,
  NormalizedProviderResult,
  OperationResult,
  ValidationStatus,
} from "../contracts/results";
import { ConversationStateManager } from "../../conversation/conversation-state-manager";
import { initializedConversationState } from "../../fixtures/conversation";
import { CONVERSATION_STAGES } from "../../shared/constants";
import { PrototypeContextPackageBuilder } from "../context/context-package-builder";
import { ApplicationDecisionEngine } from "../decisions/application-decision-engine";
import type { AiControlledExecutionResult } from "../execution/contracts";
import { DeterministicStateExecutor } from "../execution/state-executor";
import { PrototypeModelGateway } from "../gateway/model-gateway";
import { BoundedRawOutputParser } from "../output/raw-output-parser";
import { ProviderResultNormalizer } from "../output/provider-result-normalizer";
import {
  MockModelProviderAdapter,
  type MockProviderScenario,
} from "../providers/mock-model-provider-adapter";
import { PrototypePromptPackageComposer } from "../prompts/prompt-package-composer";
import { OutputContractRegistry } from "../registries/output-contract-registry";
import { AI_POLICY_VERSIONS } from "../registries/policy-versions";
import { TaskRegistry } from "../registries/task-registry";
import { deepFreeze } from "../shared/immutable";
import { DuplicateProcessingGuard } from "../validation/duplicate-processing-guard";
import { PrototypeProposalValidator } from "../validation/proposal-validator";
import { createAiPrototypeFixture } from "./fixtures";

export class AiFoundationPrototypeOrchestrator {
  private readonly executionManager = createExecutionManager();
  private readonly stateExecutor = new DeterministicStateExecutor(
    this.executionManager,
  );

  constructor(
    private readonly duplicateGuard = new DuplicateProcessingGuard(),
    private readonly tasks = new TaskRegistry(),
    private readonly contracts = new OutputContractRegistry(),
    private readonly contextBuilder = new PrototypeContextPackageBuilder(),
    private readonly promptComposer = new PrototypePromptPackageComposer(),
    private readonly normalizer = new ProviderResultNormalizer(),
    private readonly parser = new BoundedRawOutputParser(),
    private readonly proposalValidator = new PrototypeProposalValidator(),
    private readonly decisionEngine = new ApplicationDecisionEngine(),
  ) {}

  async run(scenario: MockProviderScenario): Promise<OperationResult<AiFoundationSnapshot>> {
    const taskIdentifier = taskForScenario(scenario);
    const fixture = createAiPrototypeFixture(taskIdentifier, scenario);
    const taskResult = this.tasks.resolve(taskIdentifier, 1);
    if (taskResult.status === "failure") return taskResult;
    const task = taskResult.value;

    const contextResult = this.contextBuilder.build({
      identity: fixture.identity,
      contextPackageId: fixture.contextPackageId,
      businessIdentity: fixture.businessIdentity,
      businessProfile: fixture.businessProfile,
      conversationState: fixture.conversationState,
      task,
      knowledge: fixture.knowledge,
      conversationEntries: fixture.conversationEntries,
      currentCustomerInput: fixture.currentCustomerInput,
      policyVersions: AI_POLICY_VERSIONS,
    });
    if (contextResult.status === "failure") return contextResult;

    const contractResult = this.contracts.resolve(task.compatibleOutputContract, 1);
    if (contractResult.status === "failure") return contractResult;
    const contract = contractResult.value;

    const promptResult = this.promptComposer.compose({
      promptPackageId: fixture.promptPackageId,
      task,
      contextPackage: contextResult.value,
      outputContract: contract,
      policyVersions: AI_POLICY_VERSIONS,
    });
    if (promptResult.status === "failure") return promptResult;

    const gateway = new PrototypeModelGateway(new MockModelProviderAdapter(scenario));
    const gatewayResult = await gateway.request({
      identity: fixture.identity,
      promptPackage: promptResult.value,
      outputContractIdentifier: contract.identifier,
      outputContractVersion: contract.version,
      attempt: { attemptId: `attempt-${scenario}-1`, attemptNumber: 1 },
      timeoutMs: 1_000,
      cancelled: false,
    });
    if (gatewayResult.status === "failure") return gatewayResult;

    const normalized = this.normalizer.normalize(gatewayResult.value);
    let validation = this.validateProviderResult(
      normalized,
      task,
      contract,
      contextResult.value,
      promptResult.value.promptPackageId,
      fixture.businessProfile,
    );
    if (validation.status === "valid" && validation.proposal) {
      const proposalId = validation.proposal.proposalId;
      if (typeof proposalId !== "string") {
        validation = appendFailure(validation, "RequiredFieldMissing", "duplicate-processing");
      } else {
        const duplicateResult = this.duplicateGuard.registerProposal(proposalId);
        if (duplicateResult.status === "failure") {
          validation = appendFailure(
            validation,
            "DuplicateProposalProcessing",
            "duplicate-processing",
          );
        }
      }
    }
    const decision = this.decisionEngine.decide(validation, contract);
    const snapshot: AiFoundationSnapshot = {
      identity: {
        ...fixture.identity,
        contextPackageId: contextResult.value.contextPackageId,
        promptPackageId: promptResult.value.promptPackageId,
        outputContractIdentifier: contract.identifier,
        outputContractVersion: contract.version,
      },
      providerStatus: normalized.status,
      validation,
      decision,
      stateMutationOccurred: false,
      customerResponseReleased: false,
      networkAccessed: false,
    };
    return { status: "success", value: deepFreeze(snapshot) };
  }

  async runWithExecution(
    scenario: MockProviderScenario,
  ): Promise<AiControlledExecutionResult> {
    const foundation = await this.run(scenario);
    if (foundation.status === "failure") {
      return { status: "failure", reason: "ExecutionStateUnavailable" };
    }
    const snapshot = foundation.value;
    const proposalId = snapshot.validation.proposal?.proposalId;
    const execution = this.stateExecutor.execute({
      executionId: typeof proposalId === "string"
        ? `execution-${proposalId}`
        : `execution-${snapshot.identity.requestId}`,
      transitionIdentifier: "begin_intake_after_language_interpretation",
      transitionVersion: 1,
      expectedCurrentStage: CONVERSATION_STAGES.INITIALIZED,
      expectedStateRevision: snapshot.identity.stateRevision,
      identity: snapshot.identity,
      applicationDecision: snapshot.decision,
      validation: snapshot.validation,
    });
    const state = this.executionManager.snapshot({
      conversationId: snapshot.identity.conversationId,
      businessProfileId: snapshot.identity.businessId,
      businessProfileVersion: snapshot.identity.profileVersion,
    });
    if (state.status === "failure") {
      return { status: "failure", reason: "ExecutionStateUnavailable" };
    }
    return {
      status: "success",
      value: deepFreeze({
        foundationDecision: snapshot.decision,
        execution,
        conversationState: state.state,
      }),
    };
  }

  duplicateSnapshot() {
    return this.duplicateGuard.snapshot();
  }

  private validateProviderResult(
    normalized: NormalizedProviderResult,
    task: ReturnType<TaskRegistry["list"]>[number],
    contract: OutputContractDefinition,
    contextPackage: ReturnType<PrototypeContextPackageBuilder["build"]> extends OperationResult<infer T> ? T : never,
    promptPackageId: string,
    businessProfile: ReturnType<typeof createAiPrototypeFixture>["businessProfile"],
  ): AiValidationResult {
    if (normalized.status !== "completed") {
      return providerStatusValidation(normalized);
    }
    const parseResult = this.parser.parse(normalized.rawOutput);
    if (parseResult.status === "failure") {
      return failureValidation(
        "invalid",
        parseResult.failures,
        normalized.traceId,
        "raw-parsing",
      );
    }
    return this.proposalValidator.validate({
      proposal: parseResult.value,
      task,
      contract,
      contextPackage,
      promptPackageId,
      businessProfile,
    });
  }
}

function createExecutionManager() {
  const manager = new ConversationStateManager();
  const initialized = manager.initialize({
    conversationId: initializedConversationState.conversationId,
    businessProfileId: initializedConversationState.businessProfileId,
    businessProfileVersion: initializedConversationState.businessProfileVersion,
    requiredFields: initializedConversationState.missingFields,
    authorizedEscalationDestination:
      initializedConversationState.authorizedEscalationDestination,
  });
  if (initialized.status === "failure") {
    throw new Error("The controlled execution fixture could not be initialized.");
  }
  return manager;
}

function taskForScenario(scenario: MockProviderScenario): ModelTaskIdentifier {
  if (scenario === "valid_candidate_fact" || scenario === "unknown_field") {
    return "candidate_fact_extraction";
  }
  if (scenario === "knowledge_grounding_failure") return "knowledge_grounded_answer";
  if (scenario === "valid_escalation" || scenario === "escalation_authority_violation") {
    return "escalation_recommendation";
  }
  if (scenario === "completion_authority_violation") return "conversation_summary";
  if (scenario === "state_mutation_authority_violation"
    || scenario === "customer_release_authority_violation") return "response_drafting";
  return "language_interpretation";
}

function providerStatusValidation(result: NormalizedProviderResult): AiValidationResult {
  const mapping: Record<Exclude<NormalizedProviderResult["status"], "completed">, {
    status: ValidationStatus;
    failure: AiFailureCategory;
  }> = {
    refused: { status: "invalid", failure: "ProviderResultRefused" },
    incomplete: { status: "retryable", failure: "ProviderResultIncomplete" },
    failed: { status: "retryable", failure: "ProviderResultFailed" },
    cancelled: { status: "cancelled", failure: "ProviderResultCancelled" },
  };
  const mapped = mapping[result.status as Exclude<NormalizedProviderResult["status"], "completed">];
  return failureValidation(mapped.status, [mapped.failure], result.traceId, "provider-result");
}

function failureValidation(
  status: ValidationStatus,
  failures: readonly AiFailureCategory[],
  traceId: string,
  stage: string,
): AiValidationResult {
  return deepFreeze({
    status,
    failures,
    warnings: [],
    acceptedFields: [],
    rejectedFields: [],
    stages: [{ stage, passed: false, failures }],
    policyVersions: { validatorVersion: AI_POLICY_VERSIONS.validatorVersion },
    traceId,
    proposal: null,
  });
}

function appendFailure(
  validation: AiValidationResult,
  failure: AiFailureCategory,
  stageName: string,
): AiValidationResult {
  return deepFreeze({
    ...validation,
    status: "invalid",
    failures: [...new Set([...validation.failures, failure])],
    stages: [
      ...validation.stages,
      { stage: stageName, passed: false, failures: [failure] },
    ],
  });
}
