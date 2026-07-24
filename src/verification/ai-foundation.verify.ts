import { PrototypeContextPackageBuilder } from "../ai/context/context-package-builder";
import { ApplicationDecisionEngine } from "../ai/decisions/application-decision-engine";
import { PrototypeModelGateway } from "../ai/gateway/model-gateway";
import { BoundedRawOutputParser } from "../ai/output/raw-output-parser";
import { MockModelProviderAdapter } from "../ai/providers/mock-model-provider-adapter";
import { AiFoundationPrototypeOrchestrator } from "../ai/prototype/ai-foundation-orchestrator";
import { createAiPrototypeFixture } from "../ai/prototype/fixtures";
import { PrototypePromptPackageComposer } from "../ai/prompts/prompt-package-composer";
import { OutputContractRegistry } from "../ai/registries/output-contract-registry";
import { AI_POLICY_VERSIONS } from "../ai/registries/policy-versions";
import { TaskRegistry } from "../ai/registries/task-registry";
import { DuplicateProcessingGuard } from "../ai/validation/duplicate-processing-guard";
import type { AiFailureCategory } from "../ai/contracts/catalog";
import type { AiValidationResult } from "../ai/contracts/results";
import { initializedConversationState } from "../fixtures/conversation";

void verifyAiFoundation();

async function verifyAiFoundation() {
  verifyRegistries();
  verifyPackageConstruction();
  verifyParserBoundaries();
  verifyDecisionClassification();
  verifyDuplicateGuardCategories();
  await verifySuccessFlow();
  await verifyValidationFailures();
  await verifyProviderOutcomes();
  await verifyDuplicateProposalProcessing();
  await verifyDeterminismAndInvariants();
}

function verifyRegistries() {
  const tasks = new TaskRegistry();
  const contracts = new OutputContractRegistry();
  assert(tasks.list().length === 8, "task registry contains all eight approved MVP tasks");
  assert(contracts.list().length === 8, "output contract registry contains all eight MVP contracts");
  assert(tasks.resolve("language_interpretation", 1).status === "success", "approved task lookup succeeds");
  assertFailure(tasks.resolve("invented_task", 1), "UnknownTask", "unknown task fails closed");
  assertFailure(tasks.resolve("language_interpretation", 99), "UnsupportedTaskVersion", "unsupported task version fails closed");
  assertFailure(contracts.resolve("output_invented", 1), "UnknownOutputContract", "unknown output contract fails closed");
  assertFailure(contracts.resolve("output_intent_interpretation", 99), "UnsupportedOutputContractVersion", "unsupported contract version fails closed");

  const intentContract = contracts.resolve("output_intent_interpretation", 1);
  assert(intentContract.status === "success", "intent contract resolves");
  assertFailure(
    contracts.validateCompatibility(intentContract.value, "candidate_fact_extraction", "candidate_fact"),
    "OutputContractMismatch",
    "incompatible output contract fails closed",
  );
}

function verifyPackageConstruction() {
  const setup = createPackages("language_interpretation", "package-verification");
  assert(Object.isFrozen(setup.contextPackage), "context package is immutable");
  assert(Object.isFrozen(setup.promptPackage), "prompt package is immutable");
  assert(setup.contextPackage.confirmedFacts !== setup.fixture.conversationState.confirmedFacts, "context package clones authoritative facts");
  assert(setup.promptPackage.authorityPolicyReference === "application-authority-policy/v1", "prompt package references authority policy without production prose");
  assert(setup.promptPackage.outputContractReference.identifier === "output_intent_interpretation", "prompt package binds the approved output contract");

  const invalidScope = new PrototypeContextPackageBuilder().build({
    identity: setup.fixture.identity,
    contextPackageId: "invalid-context",
    businessIdentity: { ...setup.fixture.businessIdentity, id: "other-business" },
    businessProfile: setup.fixture.businessProfile,
    conversationState: setup.fixture.conversationState,
    task: setup.task,
    knowledge: setup.fixture.knowledge,
    conversationEntries: setup.fixture.conversationEntries,
    currentCustomerInput: setup.fixture.currentCustomerInput,
    policyVersions: AI_POLICY_VERSIONS,
  });
  assertFailure(invalidScope, "InvalidBusinessScope", "invalid context business scope fails closed");

  const contracts = new OutputContractRegistry();
  const incompatible = contracts.resolve("output_candidate_fact", 1);
  assert(incompatible.status === "success", "incompatible fixture contract resolves for comparison");
  const badPrompt = new PrototypePromptPackageComposer().compose({
    promptPackageId: "bad-prompt",
    task: setup.task,
    contextPackage: setup.contextPackage,
    outputContract: incompatible.value,
    policyVersions: AI_POLICY_VERSIONS,
  });
  assertFailure(badPrompt, "OutputContractMismatch", "prompt composition rejects incompatible contract");
}

function verifyParserBoundaries() {
  const parser = new BoundedRawOutputParser();
  assert(parser.parse('{"safe":"data"}').status === "success", "bounded parser accepts one plain JSON object");
  assertFailure(parser.parse('{"safe":"data"} trailing'), "RawOutputMalformed", "parser rejects trailing prose");
  assertFailure(parser.parse("[1,2,3]"), "RawOutputMalformed", "parser rejects arrays");
  assertFailure(parser.parse('{"__proto__":{"polluted":true}}'), "RawOutputMalformed", "parser rejects dangerous object keys");
  assertFailure(parser.parse("not json"), "RawOutputMalformed", "parser rejects malformed JSON");
}

function verifyDecisionClassification() {
  const engine = new ApplicationDecisionEngine();
  const contract = new OutputContractRegistry().resolve("output_candidate_fact", 1);
  assert(contract.status === "success", "candidate fact contract resolves for decisions");
  const valid = validation("valid", [], ["candidateValue"], [], "candidate_fact");
  assert(engine.decide(valid, contract.value).decision === "accepted", "valid proposal is classified accepted");
  const retryable = validation("retryable", ["ProviderResultFailed"]);
  assert(engine.decide(retryable, contract.value).decision === "retry_approved", "retryable provider failure is classified retry approved");
  const partial = validation("invalid", ["InvalidFieldType"], ["candidateValue"], ["normalizationNote"], "candidate_fact");
  assert(engine.decide(partial, contract.value).decision === "partially_accepted", "contract-supported independent fields may be partially accepted");
  const clarification = validation("invalid", ["RequiredFieldMissing"]);
  assert(engine.decide(clarification, contract.value).decision === "clarification_required", "missing required proposal data requests clarification");
  const unsafe = validation("invalid", ["StateMutationAuthorityViolation"]);
  assert(engine.decide(unsafe, contract.value).decision === "safe_stop", "authority violation stops safely");
  const cancelled = validation("cancelled", ["ProviderResultCancelled"]);
  assert(engine.decide(cancelled, contract.value).decision === "cancelled", "cancelled validation remains cancelled");
}

function verifyDuplicateGuardCategories() {
  const guard = new DuplicateProcessingGuard();
  assert(guard.registerStateOperation("operation-attempt").status === "success", "state-operation attempt identity can be recorded without mutation");
  assertFailure(guard.registerStateOperation("operation-attempt"), "DuplicateStateMutation", "duplicate state-operation attempt fails closed");
  assert(guard.registerResponseRelease("release-attempt").status === "success", "release attempt identity can be recorded without release");
  assertFailure(guard.registerResponseRelease("release-attempt"), "DuplicateResponseRelease", "duplicate release attempt fails closed");
}

async function verifySuccessFlow() {
  const intent = await run("valid_intent");
  assert(intent.providerStatus === "completed", "valid mock provider result completes");
  assert(intent.validation.status === "valid", "valid intent proposal passes layered validation");
  assert(intent.decision.decision === "accepted", "valid intent proposal receives accepted decision");

  const fact = await run("valid_candidate_fact");
  assert(fact.validation.status === "valid", "valid candidate fact passes structural and semantic validation");
  assert(fact.decision.decision === "accepted", "valid candidate fact receives accepted decision");

  const escalation = await run("valid_escalation");
  assert(escalation.decision.decision === "escalation_recommended", "eligible escalation remains a recommendation");
  assert(!escalation.stateMutationOccurred, "escalation recommendation does not activate escalation");
}

async function verifyValidationFailures() {
  await expectFailure("malformed_output", "RawOutputMalformed");
  await expectFailure("unknown_proposal_type", "UnknownProposalType");
  await expectFailure("unexpected_action_field", "ProhibitedOperation");
  await expectFailure("business_scope_mismatch", "InvalidBusinessScope");
  await expectFailure("conversation_scope_mismatch", "InvalidConversationScope");
  await expectFailure("profile_version_mismatch", "ProfileVersionMismatch");
  await expectFailure("state_revision_mismatch", "StateRevisionMismatch");
  await expectFailure("unknown_field", "UnknownBusinessField");
  await expectFailure("inactive_service", "InactiveServiceReference");
  await expectFailure("invalid_source_reference", "InvalidSourceReference");
  await expectFailure("knowledge_grounding_failure", "KnowledgeGroundingFailure");
  await expectFailure("escalation_authority_violation", "EscalationAuthorityViolation");
  await expectFailure("completion_authority_violation", "CompletionAuthorityViolation");
  await expectFailure("state_mutation_authority_violation", "StateMutationAuthorityViolation");
  await expectFailure("customer_release_authority_violation", "CustomerReleaseAuthorityViolation");

  const setup = createPackages("language_interpretation", "prompt-scope");
  const gateway = new PrototypeModelGateway(new MockModelProviderAdapter("valid_intent"));
  const result = await gateway.request({
    identity: { ...setup.fixture.identity, conversationId: "other-conversation" },
    promptPackage: setup.promptPackage,
    outputContractIdentifier: setup.contract.identifier,
    outputContractVersion: setup.contract.version,
    attempt: { attemptId: "attempt-invalid-prompt", attemptNumber: 1 },
    timeoutMs: 1_000,
    cancelled: false,
  });
  assertFailure(result, "PromptPackageMismatch", "gateway rejects invalid prompt scope");
}

async function verifyProviderOutcomes() {
  const refusal = await run("refusal");
  assertHasFailure(refusal.validation, "ProviderResultRefused", "provider refusal is explicit");
  assert(refusal.decision.decision === "rejected", "provider refusal is not accepted");

  const incomplete = await run("incomplete");
  assertHasFailure(incomplete.validation, "ProviderResultIncomplete", "incomplete result is explicit");
  assert(incomplete.decision.decision === "retry_approved", "incomplete fixture is bounded retry eligible");

  const failed = await run("provider_failure");
  assertHasFailure(failed.validation, "ProviderResultFailed", "provider failure is explicit");
  assert(failed.decision.decision === "retry_approved", "provider failure is bounded retry eligible");

  const cancelled = await run("cancellation");
  assertHasFailure(cancelled.validation, "ProviderResultCancelled", "provider cancellation is explicit");
  assert(cancelled.decision.decision === "cancelled", "cancellation remains terminal");
}

async function verifyDuplicateProposalProcessing() {
  const orchestrator = new AiFoundationPrototypeOrchestrator();
  const first = await orchestrator.run("valid_intent");
  const second = await orchestrator.run("valid_intent");
  assert(first.status === "success" && second.status === "success", "duplicate fixture executions return classified snapshots");
  assert(first.value.decision.decision === "accepted", "first proposal processing is accepted");
  assertHasFailure(second.value.validation, "DuplicateProposalProcessing", "repeated proposal identity fails duplicate guard");
  assert(second.value.decision.decision === "rejected", "duplicate proposal is not applied");
  assert(orchestrator.duplicateSnapshot().proposalCount === 1, "duplicate guard stores one proposal identity in memory");
}

async function verifyDeterminismAndInvariants() {
  const stateBefore = JSON.stringify(initializedConversationState);
  const first = await run("valid_intent");
  const second = await run("valid_intent");
  assert(JSON.stringify(first) === JSON.stringify(second), "repeated deterministic fixtures produce equivalent semantic results");
  assert(JSON.stringify(initializedConversationState) === stateBefore, "immutable authoritative fixture is not mutated");
  for (const snapshot of [first, second]) {
    assert(Object.isFrozen(snapshot), "orchestrator result snapshot is immutable");
    assert(!snapshot.stateMutationOccurred, "no authoritative state mutation occurs");
    assert(!snapshot.customerResponseReleased, "no customer response is released");
    assert(!snapshot.networkAccessed, "no network access occurs");
  }
  assert(!("providerCredential" in first), "no provider credentials are required");
}

function createPackages(taskIdentifier: Parameters<typeof createAiPrototypeFixture>[0], suffix: string) {
  const tasks = new TaskRegistry();
  const contracts = new OutputContractRegistry();
  const fixture = createAiPrototypeFixture(taskIdentifier, suffix);
  const taskResult = tasks.resolve(taskIdentifier, 1);
  assert(taskResult.status === "success", "fixture task resolves");
  const task = taskResult.value;
  const contractResult = contracts.resolve(task.compatibleOutputContract, 1);
  assert(contractResult.status === "success", "fixture output contract resolves");
  const contract = contractResult.value;
  const contextResult = new PrototypeContextPackageBuilder().build({
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
  assert(contextResult.status === "success", "fixture context package builds");
  const contextPackage = contextResult.value;
  const promptResult = new PrototypePromptPackageComposer().compose({
    promptPackageId: fixture.promptPackageId,
    task,
    contextPackage,
    outputContract: contract,
    policyVersions: AI_POLICY_VERSIONS,
  });
  assert(promptResult.status === "success", "fixture prompt package composes");
  return { fixture, task, contract, contextPackage, promptPackage: promptResult.value };
}

async function run(
  scenario: Parameters<AiFoundationPrototypeOrchestrator["run"]>[0],
) {
  const result = await new AiFoundationPrototypeOrchestrator().run(scenario);
  assert(result.status === "success", `scenario ${scenario} returns a read-only decision snapshot`);
  return result.value;
}

async function expectFailure(
  scenario: Parameters<AiFoundationPrototypeOrchestrator["run"]>[0],
  failure: AiFailureCategory,
) {
  const snapshot = await run(scenario);
  assertHasFailure(snapshot.validation, failure, `${scenario} returns ${failure}`);
  assert(snapshot.decision.decision !== "accepted", `${scenario} cannot be accepted`);
  assert(!snapshot.stateMutationOccurred && !snapshot.customerResponseReleased, `${scenario} causes no effect`);
}

function validation(
  status: AiValidationResult["status"],
  failures: readonly AiFailureCategory[],
  acceptedFields: readonly string[] = [],
  rejectedFields: readonly string[] = [],
  proposalType?: string,
): AiValidationResult {
  return {
    status,
    failures,
    warnings: [],
    acceptedFields,
    rejectedFields,
    stages: [],
    policyVersions: { validatorVersion: AI_POLICY_VERSIONS.validatorVersion },
    traceId: "decision-verification",
    proposal: proposalType ? { proposalType } : null,
  };
}

function assertHasFailure(
  result: AiValidationResult,
  failure: AiFailureCategory,
  label: string,
) {
  assert(result.failures.includes(failure), label);
}

function assertFailure(
  result: { status: string; failures?: readonly AiFailureCategory[] },
  failure: AiFailureCategory,
  label: string,
) {
  assert(result.status === "failure" && result.failures?.includes(failure), label);
}

function assert(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(`AI foundation verification failed: ${label}`);
}
