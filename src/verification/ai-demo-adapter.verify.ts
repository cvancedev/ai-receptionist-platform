import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AiFailureCategory } from "../ai/contracts/catalog";
import type { ContextPackage, PromptPackage } from "../ai/contracts/packages";
import type { ModelGatewayRequest, ProviderAdapterResult } from "../ai/contracts/results";
import {
  FICTIONAL_DEMO_TRANSCRIPTS,
  DEMO_CURRENT_MESSAGE_ID,
  demoTranscriptById,
  type DemoStateSetup,
  type DemoTranscriptCase,
} from "../ai/demo/demo-transcripts";
import { ApplicationDecisionEngine } from "../ai/decisions/application-decision-engine";
import { PrototypeContextPackageBuilder } from "../ai/context/context-package-builder";
import { BoundedRawOutputParser } from "../ai/output/raw-output-parser";
import { ProviderResultNormalizer } from "../ai/output/provider-result-normalizer";
import {
  renderProviderInstructions,
  RENDERED_PROVIDER_PROMPT_BRAND,
  PROVIDER_INSTRUCTION_CHARACTER_LIMIT,
  type RenderedProviderPrompt,
} from "../ai/prompts/provider-instruction-renderer";
import { PrototypePromptPackageComposer } from "../ai/prompts/prompt-package-composer";
import {
  TRANSPORT_ADAPTER_DEFAULT_TIMEOUT_MS,
  TRANSPORT_ADAPTER_ID,
  TRANSPORT_ADAPTER_MAX_RAW_OUTPUT,
  TransportModelProviderAdapter,
  type OfflineTransport,
  type OfflineTransportResponse,
  type TransportModelProviderAdapterOptions,
} from "../ai/providers/transport-model-provider-adapter";
import { AI_POLICY_VERSIONS } from "../ai/registries/policy-versions";
import { OutputContractRegistry } from "../ai/registries/output-contract-registry";
import { TaskRegistry } from "../ai/registries/task-registry";
import { PrototypeProposalValidator } from "../ai/validation/proposal-validator";
import type {
  ConversationScope,
  ConversationStateUpdate,
} from "../conversation/conversation-state-updates";
import { createPrototypeFoundation } from "../prototype";
import type { BusinessProfile } from "../domain/business-profile";

const CANARY = "canary-provider-detail-must-not-escape";
const NEW_SOURCE_FILES = [
  "src/ai/demo/demo-transcripts.ts",
  "src/ai/prompts/provider-instruction-renderer.ts",
  "src/ai/providers/transport-model-provider-adapter.ts",
];

const exercisedModes: string[] = [];

interface PreparedCase {
  readonly transcript: DemoTranscriptCase;
  readonly businessProfile: BusinessProfile;
  readonly contextPackage: ContextPackage;
  readonly promptPackage: PromptPackage;
  readonly rendered: RenderedProviderPrompt;
  readonly request: ModelGatewayRequest;
}

async function run(): Promise<void> {
  const tasks = new TaskRegistry();
  const contracts = new OutputContractRegistry();
  const prepared = FICTIONAL_DEMO_TRANSCRIPTS.map((transcript) =>
    prepare(transcript, tasks, contracts));

  verifyCorpus(prepared, tasks);
  await verifyTranscriptOutcomes(prepared, tasks, contracts);
  await verifyProviderFailureModes(prepared[0]);
  verifyDeterminismAndBudget(prepared);
  verifyPromptScopeCompleteness(prepared);
  verifyHarnessCannotFabricate(prepared[0], tasks, contracts);
  verifyStateRealism(prepared);
  verifyPromptInjectionIsolation(prepared);
  verifyOfflineSourceBoundaries();

  console.log(
    `Stage A AI demo adapter verification passed: ${prepared.length} fictional transcripts, `
    + `${exercisedModes.length} offline security and failure checks, complete preassigned scope, `
    + "renderer deterministic, no network.",
  );
}

function prepare(
  transcript: DemoTranscriptCase,
  tasks: TaskRegistry,
  contracts: OutputContractRegistry,
): PreparedCase {
  const foundation = createPrototypeFoundation();
  const scope: ConversationScope = {
    conversationId: foundation.conversationState.conversationId,
    businessProfileId: foundation.businessProfile.id,
    businessProfileVersion: foundation.businessProfile.version,
  };
  applyStateSetup(foundation.conversationStateManager, scope, transcript.stateSetup);

  const stateResult = foundation.conversationStateManager.snapshot(scope);
  assert(stateResult.status === "success", `${transcript.id} has a readable conversation state`);
  const state = stateResult.state;

  const taskResult = tasks.resolve(transcript.task, 1);
  assert(taskResult.status === "success", `${transcript.id} resolves an approved task`);
  const task = taskResult.value;

  const contractResult = contracts.resolve(task.compatibleOutputContract, 1);
  assert(contractResult.status === "success", `${transcript.id} resolves an approved contract`);
  const contract = contractResult.value;

  const identity = {
    requestId: `ai-request-${transcript.id}`,
    traceId: `ai-trace-${transcript.id}`,
    businessId: foundation.businessProfile.id,
    conversationId: state.conversationId,
    profileVersion: foundation.businessProfile.version,
    stateRevision: state.revision,
    taskIdentifier: task.identifier,
    taskVersion: task.version,
  } as const;

  const conversationEntries = transcript.history.map((turn, index) => ({
    messageId: `message-history-${String(index + 1).padStart(3, "0")}`,
    conversationId: state.conversationId,
    source: turn.speaker,
    sequence: index + 1,
    content: turn.text,
  }));

  const contextResult = new PrototypeContextPackageBuilder().build({
    identity,
    contextPackageId: `context-${transcript.id}`,
    businessIdentity: {
      id: foundation.businessProfile.id,
      displayName: foundation.businessProfile.businessName,
    },
    businessProfile: foundation.businessProfile,
    conversationState: state,
    task,
    knowledge: foundation.knowledge,
    conversationEntries,
    currentCustomerInput: {
      messageId: DEMO_CURRENT_MESSAGE_ID,
      conversationId: state.conversationId,
      source: "customer",
      sequence: transcript.history.length + 1,
      content: transcript.currentCustomerInput,
    },
    policyVersions: AI_POLICY_VERSIONS,
  });
  assert(contextResult.status === "success", `${transcript.id} builds one bounded context package`);
  const contextPackage = contextResult.value;

  const promptResult = new PrototypePromptPackageComposer().compose({
    promptPackageId: `prompt-${transcript.id}`,
    task,
    contextPackage,
    outputContract: contract,
    policyVersions: AI_POLICY_VERSIONS,
  });
  assert(promptResult.status === "success", `${transcript.id} composes one bounded prompt package`);
  const promptPackage = promptResult.value;

  const renderResult = renderProviderInstructions({
    promptPackage,
    task,
    outputContract: contract,
    contextPackage,
  });
  assert(renderResult.status === "success", `${transcript.id} renders provider instructions`);
  const rendered = renderResult.value;

  return {
    transcript,
    businessProfile: foundation.businessProfile,
    contextPackage,
    promptPackage,
    rendered,
    request: {
      identity,
      promptPackage,
      outputContractIdentifier: contract.identifier,
      outputContractVersion: contract.version,
      attempt: { attemptId: `attempt-${transcript.id}-1`, attemptNumber: 1 },
      timeoutMs: 1_000,
      cancelled: false,
    },
  };
}

function applyStateSetup(
  manager: ReturnType<typeof createPrototypeFoundation>["conversationStateManager"],
  scope: ConversationScope,
  setup: DemoStateSetup | undefined,
): void {
  if (!setup) return;
  if (setup.stage !== "initialized") {
    applyRequired(manager, { type: "transition-stage", scope, stage: setup.stage });
  }
  for (const questionId of setup.askedQuestions ?? []) {
    applyRequired(manager, { type: "mark-question-asked", scope, questionId });
  }
  for (const fact of setup.confirmedFacts ?? []) {
    applyRequired(manager, {
      type: "confirm-fact",
      scope,
      field: fact.field,
      value: fact.value,
      source: fact.source,
    });
  }
}

function applyRequired(
  manager: ReturnType<typeof createPrototypeFoundation>["conversationStateManager"],
  update: ConversationStateUpdate,
): void {
  const result = manager.apply(update);
  if (result.status === "success") return;
  const detail = result.status === "failure"
    ? result.errors.join(" ")
    : result.reason;
  throw new Error(`Fictional fixture state setup was rejected: ${detail}.`);
}

/**
 * Builds the model's answer using only the rendered prompt and the case's
 * authored payload. Every scope field comes from the prompt's identity block;
 * the harness has no other source, so a missing field cannot be hidden.
 */
function answerFromRenderedPrompt(
  rendered: RenderedProviderPrompt,
  payload: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const parsed = JSON.parse(rendered.input) as {
    identity?: Readonly<Record<string, unknown>>;
  };
  const identity = parsed.identity;
  if (!identity || typeof identity !== "object") {
    throw new Error("The rendered prompt carries no preassigned identity block.");
  }
  return { ...identity, ...payload };
}

function verifyCorpus(
  prepared: readonly PreparedCase[],
  tasks: TaskRegistry,
): void {
  assert(prepared.length >= 6, "the fictional corpus holds at least six transcripts");
  assert(Object.isFrozen(FICTIONAL_DEMO_TRANSCRIPTS), "the corpus array is frozen");
  const ids = new Set(prepared.map((entry) => entry.transcript.id));
  assert(ids.size === prepared.length, "fictional transcript identifiers are unique");
  for (const entry of prepared) {
    const transcript = entry.transcript;
    assert(transcript.persona.length > 0 && transcript.purpose.length > 0,
      `${transcript.id} documents its fictional persona and purpose`);
    assert(tasks.resolve(transcript.task, 1).status === "success",
      `${transcript.id} names one approved task`);
    assert(Object.keys(transcript.proposalPayload).length > 0,
      `${transcript.id} carries an authored proposal payload`);
    assert(Object.isFrozen(transcript), `${transcript.id} is deep-frozen`);
    assert(Object.isFrozen(transcript.proposalPayload),
      `${transcript.id} payload is deep-frozen`);
    assert(Object.isFrozen(transcript.history), `${transcript.id} history is deep-frozen`);
    if (transcript.stateSetup) {
      assert(Object.isFrozen(transcript.stateSetup),
        `${transcript.id} state setup is deep-frozen`);
    }
  }
  assert(demoTranscriptById("clean-request").task === "language_interpretation",
    "corpus lookup returns the requested transcript");
}

async function verifyTranscriptOutcomes(
  prepared: readonly PreparedCase[],
  tasks: TaskRegistry,
  contracts: OutputContractRegistry,
): Promise<void> {
  const normalizer = new ProviderResultNormalizer();
  const parser = new BoundedRawOutputParser();
  const validator = new PrototypeProposalValidator();
  const decisionEngine = new ApplicationDecisionEngine();

  for (const entry of prepared) {
    const taskResult = tasks.resolve(entry.transcript.task, 1);
    assert(taskResult.status === "success", `${entry.transcript.id} task is resolvable`);
    const task = taskResult.value;
    const contractResult = contracts.resolve(task.compatibleOutputContract, 1);
    assert(contractResult.status === "success", `${entry.transcript.id} contract is resolvable`);
    const contract = contractResult.value;

    const proposal = answerFromRenderedPrompt(
      entry.rendered,
      entry.transcript.proposalPayload,
    );
    const rawOutput = JSON.stringify(proposal);

    const adapter = new TransportModelProviderAdapter(
      entry.rendered,
      completedTransport(rawOutput),
      deterministicClock(),
    );
    const adapterResult = await adapter.execute(entry.request);
    assert(adapterResult.status === "completed",
      `${entry.transcript.id} adapter returns a completed transport result`);
    assert(adapterResult.rawOutput === rawOutput,
      `${entry.transcript.id} adapter preserves raw output unchanged`);
    assert(adapterResult.adapterId === TRANSPORT_ADAPTER_ID,
      `${entry.transcript.id} adapter reports its stable identifier`);
    assert(adapterResult.requestId === entry.request.identity.requestId
      && adapterResult.traceId === entry.request.identity.traceId,
    `${entry.transcript.id} adapter preserves request identity`);
    assert(adapterResult.attemptId === entry.request.attempt.attemptId,
      `${entry.transcript.id} adapter preserves attempt identity`);

    const normalized = normalizer.normalize(adapterResult);
    assert(normalized.normalizedAt === "prototype-deterministic",
      `${entry.transcript.id} normalizes deterministically`);

    const parseResult = parser.parse(normalized.rawOutput);
    assert(parseResult.status === "success", `${entry.transcript.id} proposal parses`);
    if (parseResult.status !== "success") continue;

    const validation = validator.validate({
      proposal: parseResult.value,
      task,
      contract,
      contextPackage: entry.contextPackage,
      promptPackageId: entry.promptPackage.promptPackageId,
      businessProfile: entry.businessProfile,
    });

    assert(validation.status === entry.transcript.expectedValidationStatus,
      `${entry.transcript.id} validation is ${entry.transcript.expectedValidationStatus}`);
    const actualFailures = [...validation.failures].sort();
    const expectedFailures = [...entry.transcript.expectedFailures].sort();
    assert(actualFailures.length === expectedFailures.length
      && actualFailures.every((failure, index) => failure === expectedFailures[index]),
    `${entry.transcript.id} failure set is exactly [${expectedFailures.join(", ")}] `
      + `but was [${actualFailures.join(", ")}]`);
    if (validation.status === "valid") {
      assert(validation.stages.every((stage) => stage.passed),
        `${entry.transcript.id} reports no failing validation stage`);
    }

    const decision = decisionEngine.decide(validation, contract);
    assert(decision.decision === entry.transcript.expectedDecision,
      `${entry.transcript.id} decision is ${entry.transcript.expectedDecision}`);
    assert(decision.stateMutationAuthorized === false,
      `${entry.transcript.id} decision authorizes no state mutation`);
    assert(decision.customerReleaseAuthorized === false,
      `${entry.transcript.id} decision authorizes no customer release`);
    if (entry.transcript.expectedDecision === "accepted") {
      assert(decision.reasons.includes("validation-passed"),
        `${entry.transcript.id} records the passing validation reason`);
    }
    if (entry.transcript.expectedDecision === "safe_stop") {
      assert(decision.reasons.includes("StateMutationAuthorityViolation"),
        `${entry.transcript.id} stops on the authority violation`);
    }
  }
}

async function verifyProviderFailureModes(entry: PreparedCase | undefined): Promise<void> {
  assert(entry, "the corpus contains at least one prepared transcript");
  if (!entry) return;

  markMode("refusal");
  const refusal = await adapterFor(entry, async () => ({
    status: "refused",
    finishReason: "refusal",
    usage: { inputUnits: 12 },
  })).execute(entry.request);
  assert(refusal.status === "refused" && refusal.rawOutput === null && refusal.error === null,
    "a provider refusal is preserved without output or error payload");
  assert(refusal.usage.inputUnits === 12 && refusal.usage.outputUnits === 0,
    "a provider refusal keeps bounded usage");
  assert(refusal.finishReason === "refusal", "an allowlisted finish reason is preserved");

  markMode("provider-failure");
  const providerFailure = await adapterFor(entry, async () => ({
    status: "failed",
    finishReason: "secret-finish-reason",
    error: { category: "provider-secret-detail", message: CANARY },
  })).execute(entry.request);
  assert(providerFailure.status === "failed" && providerFailure.rawOutput === null,
    "a provider failure yields no output");
  assert(providerFailure.error?.category === "ProviderFailure",
    "an unlisted provider category is replaced with a bounded category");
  assert(providerFailure.finishReason === "provider-reported",
    "an unlisted finish reason is replaced with a bounded value");
  assert(!JSON.stringify(providerFailure).includes(CANARY),
    "a provider failure never echoes provider detail");
  assert(!JSON.stringify(providerFailure).includes("secret-finish-reason"),
    "a provider failure never echoes an unlisted finish reason");

  markMode("allowed-provider-category");
  const allowedFailure = await adapterFor(entry, async () => ({
    status: "failed",
    error: { category: "rate-limit" },
  })).execute(entry.request);
  assert(allowedFailure.status === "failed" && allowedFailure.error?.category === "rate-limit",
    "an allowlisted provider category is preserved");

  markMode("malformed-output");
  const malformed = await adapterFor(entry, completedTransport('{"proposalType":'))
    .execute(entry.request);
  assert(malformed.status === "completed",
    "malformed output still arrives as a completed transport result");
  const malformedParse = new BoundedRawOutputParser().parse(malformed.rawOutput);
  assert(malformedParse.status === "failure"
    && malformedParse.failures.includes("RawOutputMalformed"),
  "malformed output fails closed at the bounded parser");

  markMode("timeout-mid-flight");
  const scheduler = controlledScheduler();
  let capturedSignal: AbortSignal | null = null;
  let settle: ((response: OfflineTransportResponse) => void) | null = null;
  const slowAdapter = new TransportModelProviderAdapter(
    entry.rendered,
    (transportRequest) => {
      capturedSignal = transportRequest.signal;
      return new Promise<OfflineTransportResponse>((resolve) => { settle = resolve; });
    },
    { ...scheduler.options, now: () => 1_000 },
  );
  const pendingTimeout = slowAdapter.execute(entry.request);
  await flushMicrotasks();
  const startedSignal = capturedSignal as AbortSignal | null;
  assert(startedSignal, "the transport starts before the deadline");
  scheduler.fire();
  const timeout = await pendingTimeout;
  assert(timeout.status === "failed" && timeout.error?.category === "ProviderTimeout",
    "a mid-flight timeout fails the attempt with a sanitized category");
  assert(startedSignal?.aborted === true,
    "the timeout aborts the signal handed to the transport");
  assert(scheduler.cleared, "the timeout timer is cleared after the attempt");

  markMode("timeout-discards-late-success");
  const lateSettle = settle as ((response: OfflineTransportResponse) => void) | null;
  assert(lateSettle, "the transport exposes its completion");
  lateSettle?.({ status: "completed", rawOutput: "{}" });
  await flushMicrotasks();
  assert(timeout.status === "failed" && timeout.rawOutput === null,
    "a success arriving after the deadline is discarded");

  markMode("timeout-before-start");
  let transportCalls = 0;
  const preExpired = await new TransportModelProviderAdapter(
    entry.rendered,
    async () => {
      transportCalls += 1;
      return { status: "completed", rawOutput: "{}" };
    },
    {
      now: () => 1_000,
      scheduleTimeout: (callback) => {
        callback();
        return () => {};
      },
    },
  ).execute(entry.request);
  assert(preExpired.status === "failed"
    && preExpired.error?.category === "ProviderTimeout",
  "an already-expired deadline fails the attempt");
  assert(transportCalls === 0,
    "an already-expired deadline never starts provider work");

  markMode("timeout-ceiling");
  const seenTimeouts: number[] = [];
  const recordTimeout: OfflineTransport = async (transportRequest) => {
    seenTimeouts.push(transportRequest.timeoutMs);
    return { status: "completed", rawOutput: "{}" };
  };
  await new TransportModelProviderAdapter(entry.rendered, recordTimeout, {
    timeoutMs: 250,
    now: () => 1_000,
  }).execute({ ...entry.request, timeoutMs: 5_000 });
  await new TransportModelProviderAdapter(entry.rendered, recordTimeout, {
    timeoutMs: 250,
    now: () => 1_000,
  }).execute({ ...entry.request, timeoutMs: 100 });
  assert(seenTimeouts[0] === 250,
    "the configured timeout ceiling clamps a larger request timeout");
  assert(seenTimeouts[1] === 100,
    "a smaller request timeout is kept below the configured ceiling");

  markMode("oversized-output");
  const oversized = await adapterFor(
    entry,
    completedTransport("x".repeat(TRANSPORT_ADAPTER_MAX_RAW_OUTPUT + 1)),
  ).execute(entry.request);
  assert(oversized.status === "failed"
    && oversized.error?.category === "ProviderOutputTooLarge",
  "oversized provider output fails closed");
  assert(oversized.rawOutput === null, "oversized provider output is discarded");

  markMode("unreadable-output");
  for (const rawOutput of [42, null, "", undefined]) {
    const unreadable = await adapterFor(entry, async () => ({
      status: "completed",
      rawOutput: rawOutput as unknown as string,
    })).execute(entry.request);
    assert(unreadable.status === "failed"
      && unreadable.error?.category === "ProviderOutputUnreadable",
    "a completed response without a text payload fails closed");
  }

  markMode("invalid-response-envelope");
  for (const response of [undefined, null, 42, "text", [] as unknown]) {
    const invalidResponse = await outcomeOf(adapterFor(
      entry,
      async () => response as unknown as OfflineTransportResponse,
    ).execute(entry.request));
    assert(!("threw" in invalidResponse),
      "a malformed transport return never throws out of the adapter");
    if (!("threw" in invalidResponse)) {
      assert(invalidResponse.status === "failed"
        && invalidResponse.error?.category === "ProviderResponseInvalid",
      "a malformed transport return fails with a bounded category");
      assert(invalidResponse.rawOutput === null,
        "a malformed transport return produces no output");
    }
  }

  markMode("unknown-completion-status");
  const unknownStatus = await adapterFor(entry, async () => ({
    status: "exploded" as unknown as "failed",
  })).execute(entry.request);
  assert(unknownStatus.status === "failed"
    && unknownStatus.error?.category === "ProviderResponseInvalid",
  "an unknown completion status fails closed");

  markMode("throwing-transport");
  const thrown = await adapterFor(entry, async () => {
    throw new Error(CANARY);
  }).execute(entry.request);
  assert(thrown.status === "failed" && thrown.error?.category === "TransportError",
    "a throwing transport becomes a sanitized failure");
  assert(!JSON.stringify(thrown).includes(CANARY), "a throwing transport never leaks its message");

  markMode("cancelled-before-transport");
  const cancelled = await adapterFor(entry, completedTransport("{}"))
    .execute({ ...entry.request, cancelled: true });
  assert(cancelled.status === "cancelled" && cancelled.rawOutput === null,
    "a cancelled request performs no transport work");
  assert(cancelled.finishReason === "cancelled-before-transport",
    "a pre-start cancellation records a bounded reason");
  assert(cancelled.usage.inputUnits === 0 && cancelled.usage.outputUnits === 0,
    "a cancelled request reports no usage");

  markMode("cancelled-pre-aborted-signal");
  const preAborted = new AbortController();
  preAborted.abort();
  const preAbortedResult = await adapterFor(entry, completedTransport("{}"), {
    signal: preAborted.signal,
  }).execute(entry.request);
  assert(preAbortedResult.status === "cancelled",
    "an already-aborted caller signal never starts provider work");

  markMode("cancelled-mid-flight");
  const externalController = new AbortController();
  let midFlightSignal: AbortSignal | null = null;
  const midFlight = new TransportModelProviderAdapter(
    entry.rendered,
    (transportRequest) => {
      midFlightSignal = transportRequest.signal;
      return new Promise<OfflineTransportResponse>(() => {});
    },
    { signal: externalController.signal, now: () => 1_000 },
  );
  const pendingCancellation = midFlight.execute(entry.request);
  await flushMicrotasks();
  externalController.abort();
  const cancelledMidFlight = await pendingCancellation;
  assert(cancelledMidFlight.status === "cancelled"
    && cancelledMidFlight.finishReason === "cancelled-mid-flight",
  "a mid-flight cancellation is reported as cancelled");
  const abortedSignal = midFlightSignal as AbortSignal | null;
  assert(abortedSignal?.aborted === true,
    "a mid-flight cancellation aborts the transport signal");
  assert(cancelledMidFlight.usage.inputUnits === 0,
    "a mid-flight cancellation reports no usage");

  markMode("prompt-integrity");
  const forgedPrompts: [string, RenderedProviderPrompt][] = [
    ["empty instructions", { ...entry.rendered, instructions: "" }],
    ["size mismatch", { ...entry.rendered, estimatedCharacters: entry.rendered.estimatedCharacters + 1 }],
    ["over budget", { ...entry.rendered, instructions: "x".repeat(PROVIDER_INSTRUCTION_CHARACTER_LIMIT) }],
    ["missing brand", withoutBrand(entry.rendered)],
    ["wrong task version", { ...entry.rendered, taskVersion: 2 }],
  ];
  for (const [label, forged] of forgedPrompts) {
    const integrity = await outcomeOf(new TransportModelProviderAdapter(
      forged,
      completedTransport("{}"),
      deterministicClock(),
    ).execute(entry.request));
    assert(!("threw" in integrity), `a ${label} prompt never throws`);
    if (!("threw" in integrity)) {
      assert(integrity.status === "failed"
        && integrity.error?.category === "PromptIntegrityMismatch",
      `a ${label} prompt is refused`);
      assert(integrity.rawOutput === null, `a ${label} prompt produces no output`);
    }
  }

  markMode("request-identity-mismatch");
  const mismatch = await adapterFor(entry, completedTransport("{}")).execute({
    ...entry.request,
    identity: { ...entry.request.identity, requestId: "ai-request-other" },
  });
  assert(mismatch.status === "failed"
    && mismatch.error?.category === "PromptIntegrityMismatch",
  "a rendered prompt bound to another request is refused");

  markMode("usage-clamping");
  const clamped = await adapterFor(entry, async () => ({
    status: "completed",
    rawOutput: "{}",
    usage: { inputUnits: -5, outputUnits: Number.NaN },
  })).execute(entry.request);
  assert(clamped.usage.inputUnits === 0 && clamped.usage.outputUnits === 0,
    "negative and non-finite usage is clamped to zero");

  markMode("output-ceiling-config");
  const hugeCeiling = await adapterFor(entry, completedTransport(
    "x".repeat(TRANSPORT_ADAPTER_MAX_RAW_OUTPUT + 1),
  ), { maxRawOutputCharacters: TRANSPORT_ADAPTER_MAX_RAW_OUTPUT * 10 })
    .execute(entry.request);
  assert(hugeCeiling.status === "failed"
    && hugeCeiling.error?.category === "ProviderOutputTooLarge",
  "a raised output ceiling is clamped to the application maximum");

  assert(TRANSPORT_ADAPTER_DEFAULT_TIMEOUT_MS > 0,
    "the adapter declares a bounded default timeout");
  const uniqueModes = new Set(exercisedModes);
  assert(uniqueModes.size === exercisedModes.length,
    "each offline failure mode is exercised once");
  assert(uniqueModes.size >= 15,
    "the suite exercises at least fifteen offline security and failure checks");
}

function verifyDeterminismAndBudget(prepared: readonly PreparedCase[]): void {
  for (const entry of prepared) {
    const again = renderProviderInstructions({
      promptPackage: entry.promptPackage,
      task: taskFor(entry.transcript.task),
      outputContract: contractFor(entry.transcript.task),
      contextPackage: entry.contextPackage,
    });
    assert(again.status === "success", `${entry.transcript.id} re-renders`);
    if (again.status !== "success") continue;
    assert(JSON.stringify(again.value) === JSON.stringify(entry.rendered),
      `${entry.transcript.id} renders identically twice`);
    assert(entry.rendered.estimatedCharacters === entry.rendered.instructions.length
      + entry.rendered.input.length + entry.rendered.schema.length,
    `${entry.transcript.id} budget counts each rendered part exactly once`);
    assert(!entry.rendered.instructions.includes(entry.rendered.schema),
      `${entry.transcript.id} instructions do not duplicate the schema`);
    assert(entry.rendered.estimatedCharacters <= PROVIDER_INSTRUCTION_CHARACTER_LIMIT,
      `${entry.transcript.id} stays inside the instruction budget`);
    assert(entry.rendered.instructions.includes("JSON")
      && entry.rendered.instructions.includes(entry.transcript.task),
    `${entry.transcript.id} instructions name the task and the response format`);
    assert(entry.rendered.rendererVersion === "provider-instruction-renderer/v2",
      `${entry.transcript.id} records the renderer version`);
    assert(entry.rendered.taskIdentifier === entry.transcript.task
      && entry.rendered.taskVersion === 1,
    `${entry.transcript.id} rendered prompt is bound to the approved task`);
    const schema = JSON.parse(entry.rendered.schema) as { allowed: string[] };
    for (const field of contractFor(entry.transcript.task).allowedFields) {
      assert(schema.allowed.includes(field), `${entry.transcript.id} schema declares ${field}`);
    }
  }

  const base = prepared[0];
  assert(base, "the corpus is not empty");
  if (!base) return;
  const task = taskFor("language_interpretation");
  const contract = contractFor("language_interpretation");

  const invalid = renderProviderInstructions({
    promptPackage: base.promptPackage,
    task,
    outputContract: contract,
    contextPackage: {
      ...base.contextPackage,
      validation: { ...base.contextPackage.validation, valid: false },
    },
  });
  assert(invalid.status === "failure"
    && invalid.failures.includes("InvalidContextPackage"),
  "an invalid context package is never rendered");

  const padded = {
    ...base.contextPackage,
    currentCustomerInput: {
      ...base.contextPackage.currentCustomerInput,
      content: "x".repeat(PROVIDER_INSTRUCTION_CHARACTER_LIMIT + 1),
    },
  };
  const overBudget = renderProviderInstructions({
    promptPackage: base.promptPackage,
    task,
    outputContract: contract,
    contextPackage: padded,
  });
  assert(overBudget.status === "failure"
    && overBudget.failures.includes("PromptOverBudget"),
  "an oversized context package fails the instruction budget closed");
}

function verifyPromptScopeCompleteness(
  prepared: readonly PreparedCase[],
): void {
  for (const entry of prepared) {
    const contract = contractFor(entry.transcript.task);

    const parsed = JSON.parse(entry.rendered.input) as {
      identity?: Readonly<Record<string, unknown>>;
    };
    assert(parsed.identity, `${entry.transcript.id} renders a preassigned identity`);
    if (!parsed.identity) continue;

    const identityKeys = Object.keys(parsed.identity).sort();
    const scopeKeys = [...contract.scopeFields].sort();
    assert(identityKeys.length === scopeKeys.length
      && identityKeys.every((key, index) => key === scopeKeys[index]),
    `${entry.transcript.id} preassigns exactly the contract scope fields`);

    assert(parsed.identity.promptPackageId === entry.promptPackage.promptPackageId,
      `${entry.transcript.id} preassigns the prompt package identifier`);
    assert(parsed.identity.contextPackageId === entry.contextPackage.contextPackageId,
      `${entry.transcript.id} preassigns the context package identifier`);
    assert(parsed.identity.proposalId === `proposal-${entry.promptPackage.promptPackageId}`,
      `${entry.transcript.id} preassigns a derived proposal identifier`);
    assert(parsed.identity.proposalType === contract.compatibleProposalType,
      `${entry.transcript.id} preassigns the proposal type`);
    assert(parsed.identity.outputContractIdentifier === contract.identifier
      && parsed.identity.outputContractVersion === contract.version,
    `${entry.transcript.id} preassigns the output contract identifiers`);

    for (const field of contract.requiredFields) {
      if (contract.scopeFields.includes(field)) continue;
      assert(!Object.prototype.hasOwnProperty.call(parsed.identity, field),
        `${entry.transcript.id} never prefills the model-owned field ${field}`);
    }
  }
}

function verifyHarnessCannotFabricate(
  entry: PreparedCase | undefined,
  tasks: TaskRegistry,
  contracts: OutputContractRegistry,
): void {
  assert(entry, "the corpus contains at least one prepared transcript");
  if (!entry) return;
  const taskResult = tasks.resolve(entry.transcript.task, 1);
  assert(taskResult.status === "success", "the fabrication check resolves its task");
  const task = taskResult.value;
  const contractResult = contracts.resolve(task.compatibleOutputContract, 1);
  assert(contractResult.status === "success", "the fabrication check resolves its contract");
  const contract = contractResult.value;

  const parsed = JSON.parse(entry.rendered.input) as {
    identity: Record<string, unknown>;
  };
  const stripped = { ...parsed.identity };
  delete stripped.promptPackageId;
  const fabricated = { ...stripped, ...entry.transcript.proposalPayload };

  const parseResult = new BoundedRawOutputParser().parse(JSON.stringify(fabricated));
  assert(parseResult.status === "success", "the stripped answer is still valid JSON");
  if (parseResult.status !== "success") return;

  const validation = new PrototypeProposalValidator().validate({
    proposal: parseResult.value,
    task,
    contract,
    contextPackage: entry.contextPackage,
    promptPackageId: entry.promptPackage.promptPackageId,
    businessProfile: entry.businessProfile,
  });
  assert(validation.status === "invalid",
    "removing a preassigned scope field makes the answer invalid");
  for (const failure of ["RequiredFieldMissing", "PromptPackageMismatch"] as const) {
    assert(validation.failures.includes(failure as AiFailureCategory),
      `the harness cannot hide a missing ${failure}`);
  }
}

function verifyStateRealism(prepared: readonly PreparedCase[]): void {
  for (const entry of prepared) {
    const setup = entry.transcript.stateSetup;
    const parsed = JSON.parse(entry.rendered.input) as {
      conversationState: {
        stage: string;
        askedQuestions: string[];
      };
      confirmedFacts: Record<string, { value: string }>;
    };
    if (!setup) {
      assert(parsed.conversationState.stage === "initialized",
        `${entry.transcript.id} starts from the initialized stage`);
      assert(parsed.conversationState.askedQuestions.length === 0,
        `${entry.transcript.id} starts with no asked questions`);
      continue;
    }
    assert(parsed.conversationState.stage === setup.stage,
      `${entry.transcript.id} renders its documented stage`);
    assert(JSON.stringify(parsed.conversationState.askedQuestions)
      === JSON.stringify(setup.askedQuestions ?? []),
    `${entry.transcript.id} renders its documented asked questions`);
    for (const fact of setup.confirmedFacts ?? []) {
      assert(parsed.confirmedFacts[fact.field]?.value === fact.value,
        `${entry.transcript.id} renders its confirmed ${fact.field}`);
    }
    assert(entry.contextPackage.stateRevision > 0,
      `${entry.transcript.id} advanced its revision through the certified state manager`);
  }
}

function verifyPromptInjectionIsolation(prepared: readonly PreparedCase[]): void {
  const hostile = prepared.find(
    (entry) => entry.transcript.id === "hostile-state-mutation",
  );
  assert(hostile, "the corpus contains the hostile transcript");
  if (!hostile) return;
  assert(!hostile.rendered.instructions.includes(hostile.transcript.currentCustomerInput),
    "customer text never enters the instruction block");
  assert(hostile.rendered.input.includes(hostile.transcript.currentCustomerInput),
    "customer text is carried as untrusted input data");
  for (const entry of prepared) {
    assert(!entry.rendered.instructions.includes("Ignore your rules"),
      "no transcript can move text into the instructions");
  }
}

function verifyOfflineSourceBoundaries(): void {
  for (const path of NEW_SOURCE_FILES) {
    const source = readFileSync(join(process.cwd(), path), "utf8");
    for (const prohibited of [
      "fetch(", "process.env", "XMLHttpRequest", "WebSocket",
      "openai", "anthropic", "generative-ai", "apiKey", "Authorization",
    ]) {
      assert(!source.includes(prohibited), `${path} adds no ${prohibited} path`);
    }
  }
  const scripts = (JSON.parse(
    readFileSync(join(process.cwd(), "package.json"), "utf8"),
  ) as { scripts: Record<string, string> }).scripts;
  assert(
    scripts["verify:ai-demo-adapter"]
      === "tsc -p tsconfig.prototype.json && node .prototype-build/verification/ai-demo-adapter.verify.js",
    "the Stage A verifier is exposed as one deterministic script",
  );
}

function adapterFor(
  entry: PreparedCase,
  transport: OfflineTransport,
  options: TransportModelProviderAdapterOptions = deterministicClock(),
): TransportModelProviderAdapter {
  return new TransportModelProviderAdapter(entry.rendered, transport, options);
}

function completedTransport(rawOutput: string): OfflineTransport {
  return async () => ({
    status: "completed",
    rawOutput,
    usage: { inputUnits: 1_200, outputUnits: 180 },
    finishReason: "stop",
    error: null,
  });
}

function deterministicClock(): TransportModelProviderAdapterOptions {
  return { now: () => 1_000, timeoutMs: 1_000 };
}

function withoutBrand(rendered: RenderedProviderPrompt): RenderedProviderPrompt {
  const copy = { ...rendered } as Record<PropertyKey, unknown>;
  delete copy[RENDERED_PROVIDER_PROMPT_BRAND];
  return copy as unknown as RenderedProviderPrompt;
}

function controlledScheduler(): {
  options: TransportModelProviderAdapterOptions;
  fire: () => void;
  readonly cleared: boolean;
} {
  let fireTimer: (() => void) | null = null;
  let cleared = false;
  return {
    options: {
      scheduleTimeout: (callback: () => void) => {
        fireTimer = callback;
        return () => { cleared = true; };
      },
    },
    fire: () => {
      if (!fireTimer) throw new Error("The adapter scheduled no timeout.");
      fireTimer();
    },
    get cleared() { return cleared; },
  };
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

async function outcomeOf(
  promise: Promise<ProviderAdapterResult>,
): Promise<ProviderAdapterResult | { threw: unknown }> {
  try {
    return await promise;
  } catch (error) {
    return { threw: error };
  }
}

function markMode(name: string): void {
  exercisedModes.push(name);
}

function taskFor(identifier: DemoTranscriptCase["task"]) {
  const result = new TaskRegistry().resolve(identifier, 1);
  if (result.status !== "success") throw new Error(`Unresolved task: ${identifier}.`);
  return result.value;
}

function contractFor(identifier: DemoTranscriptCase["task"]) {
  const task = taskFor(identifier);
  const result = new OutputContractRegistry().resolve(task.compatibleOutputContract, 1);
  if (result.status !== "success") throw new Error(`Unresolved contract for: ${identifier}.`);
  return result.value;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Stage A AI demo adapter verification failed: ${message}.`);
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
