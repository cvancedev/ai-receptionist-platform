import { readdirSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { join, relative } from "node:path";
import type {
  ModelTaskDefinition,
  OutputContractDefinition,
} from "../ai/contracts/catalog";
import type { ContextPackage, PromptPackage } from "../ai/contracts/packages";
import type { ModelGatewayRequest } from "../ai/contracts/results";
import { ApplicationDecisionEngine } from "../ai/decisions/application-decision-engine";
import {
  DEMO_CURRENT_MESSAGE_ID,
  demoTranscriptById,
  type DemoTranscriptCase,
} from "../ai/demo/demo-transcripts";
import { PrototypeContextPackageBuilder } from "../ai/context/context-package-builder";
import { BoundedRawOutputParser } from "../ai/output/raw-output-parser";
import {
  renderProviderInstructions,
  type RenderedProviderPrompt,
} from "../ai/prompts/provider-instruction-renderer";
import { PrototypePromptPackageComposer } from "../ai/prompts/prompt-package-composer";
import {
  createHttpModelTransport,
  HttpTransportConfigurationError,
  HTTP_MODEL_TRANSPORT_WIRE_VERSION,
  type HttpModelTransportOptions,
} from "../ai/providers/http-model-transport";
import {
  parseJsonWithoutDuplicateKeys,
  validateProviderOutput,
} from "../ai/providers/provider-output-schema";
import {
  TransportModelProviderAdapter,
  type OfflineTransport,
  type OfflineTransportRequest,
} from "../ai/providers/transport-model-provider-adapter";
import { AI_POLICY_VERSIONS } from "../ai/registries/policy-versions";
import { OutputContractRegistry } from "../ai/registries/output-contract-registry";
import { TaskRegistry } from "../ai/registries/task-registry";
import { PrototypeProposalValidator } from "../ai/validation/proposal-validator";
import {
  createPrototypeFoundation,
  type PrototypeFoundation,
} from "../prototype";
import type {
  ConversationScope,
  ConversationStateUpdate,
} from "../conversation/conversation-state-updates";
import type { ConversationState } from "../domain/conversation-state";

/**
 * Stage B2.1 verification: a server-side HTTP transport behind the existing
 * provider adapter seam, exercised exclusively against a loopback fake
 * provider.
 *
 * No environment variable, DNS name, or provider account is used. The fake
 * provider is a local Node HTTP server bound to 127.0.0.1 with an ephemeral
 * port. The harness proves endpoint refusal, redirect refusal, timeout and
 * cancellation behavior, strict JSON and schema refusal, response-size
 * refusal, error normalization, usage preservation without content, credential
 * confinement, and the absence of any client-side import path.
 */

const CANARY = "b21-canary-provider-payload-must-not-escape";
const FAKE_CREDENTIAL = "b21-fake-credential-reference-not-a-real-key";
const MODEL = "b21-fake-model";
const PROVIDER_SOURCE = "src/ai/providers/http-model-transport.ts";
const SCHEMA_SOURCE = "src/ai/providers/provider-output-schema.ts";
const VERIFIER_SOURCE = "src/verification/http-model-transport.verify.ts";
const PACKAGE_SCRIPT = "verify:http-model-transport";

interface PreparedCase {
  readonly transcript: DemoTranscriptCase;
  readonly foundation: PrototypeFoundation;
  readonly scope: ConversationScope;
  readonly state: ConversationState;
  readonly task: ModelTaskDefinition;
  readonly contract: OutputContractDefinition;
  readonly contextPackage: ContextPackage;
  readonly promptPackage: PromptPackage;
  readonly rendered: RenderedProviderPrompt;
  readonly request: ModelGatewayRequest;
  readonly proposal: Readonly<Record<string, unknown>>;
}

interface CapturedRequest {
  readonly path: string;
  readonly authorization: string | null;
  readonly contentType: string | null;
  readonly body: string;
}

interface FakeProvider {
  readonly origin: string;
  readonly requests: readonly CapturedRequest[];
  readonly redirectTarget: { readonly origin: string; readonly hits: () => number };
  readonly close: () => Promise<void>;
}

async function run(): Promise<void> {
  const prepared = prepareCase();
  const provider = await startFakeProvider(JSON.stringify(prepared.proposal));
  const checks: string[] = [];

  try {
    verifyEndpointPolicy(provider);
    checks.push("endpoint policy");

    await verifySuccessThroughAdapter(prepared, provider);
    checks.push("adapter success and downstream acceptance");

    await verifyJsonAndSchemaRefusal(prepared, provider);
    checks.push("strict JSON and schema refusal");

    await verifyDuplicateKeyHandling(prepared, provider);
    checks.push("duplicate-key refusal");

    await verifyResponseSizeRefusal(prepared, provider);
    checks.push("response-size refusal");

    await verifyTimeoutAndCancellation(prepared, provider);
    checks.push("timeout and cancellation");

    await verifyRedirectRefusal(prepared, provider);
    checks.push("redirect refusal");

    await verifyErrorNormalizationAndCredentials(prepared, provider);
    checks.push("error normalization and credential confinement");

    await verifyProviderCannotMutateProtectedState(prepared, provider);
    checks.push("no tool or state authority");

    verifySourceBoundaries();
    checks.push("server-only source boundaries");

    verifyPackageScript();
    checks.push("deterministic script");

    verifyConversationStateUnchanged(prepared);
    checks.push("conversation state unchanged");
  } finally {
    await provider.close();
  }

  console.log(
    "Stage B2.1 HTTP model transport verification passed: loopback fake provider only, "
    + `${checks.length} check groups, ${provider.requests.length} fake-provider requests, `
    + "no real network access, no credentials.",
  );
}

function prepareCase(): PreparedCase {
  const transcript = demoTranscriptById("clean-request");
  const foundation = createPrototypeFoundation();
  const scope: ConversationScope = {
    conversationId: foundation.conversationState.conversationId,
    businessProfileId: foundation.businessProfile.id,
    businessProfileVersion: foundation.businessProfile.version,
  };

  applyRequired(foundation, {
    type: "transition-stage",
    scope,
    stage: "intake",
  });

  const stateResult = foundation.conversationStateManager.snapshot(scope);
  assert(stateResult.status === "success", "the prepared conversation state is readable");
  const state = stateResult.state;

  const tasks = new TaskRegistry();
  const contracts = new OutputContractRegistry();
  const taskResult = tasks.resolve(transcript.task, 1);
  assert(taskResult.status === "success", "the approved task resolves");
  const task = taskResult.value;
  const contractResult = contracts.resolve(task.compatibleOutputContract, 1);
  assert(contractResult.status === "success", "the approved contract resolves");
  const contract = contractResult.value;

  const identity = {
    requestId: "b21-request-001",
    traceId: "b21-trace-001",
    businessId: foundation.businessProfile.id,
    conversationId: state.conversationId,
    profileVersion: foundation.businessProfile.version,
    stateRevision: state.revision,
    taskIdentifier: task.identifier,
    taskVersion: task.version,
  } as const;

  const contextResult = new PrototypeContextPackageBuilder().build({
    identity,
    contextPackageId: "b21-context-001",
    businessIdentity: {
      id: foundation.businessProfile.id,
      displayName: foundation.businessProfile.businessName,
    },
    businessProfile: foundation.businessProfile,
    conversationState: state,
    task,
    knowledge: foundation.knowledge,
    conversationEntries: [],
    currentCustomerInput: {
      messageId: DEMO_CURRENT_MESSAGE_ID,
      conversationId: state.conversationId,
      source: "customer",
      sequence: 1,
      content: transcript.currentCustomerInput,
    },
    policyVersions: AI_POLICY_VERSIONS,
  });
  assert(contextResult.status === "success", "one bounded context package builds");
  const contextPackage = contextResult.value;

  const promptResult = new PrototypePromptPackageComposer().compose({
    promptPackageId: "b21-prompt-001",
    task,
    contextPackage,
    outputContract: contract,
    policyVersions: AI_POLICY_VERSIONS,
  });
  assert(promptResult.status === "success", "one bounded prompt package composes");

  const renderResult = renderProviderInstructions({
    promptPackage: promptResult.value,
    task,
    outputContract: contract,
    contextPackage,
  });
  assert(renderResult.status === "success", "provider instructions render");
  const rendered = renderResult.value;

  const renderedInput = JSON.parse(rendered.input) as { identity?: unknown };
  assert(renderedInput.identity !== null && typeof renderedInput.identity === "object",
    "the rendered input carries the application identity");

  return {
    transcript,
    foundation,
    scope,
    state,
    task,
    contract,
    contextPackage,
    promptPackage: promptResult.value,
    rendered,
    request: {
      identity,
      promptPackage: promptResult.value,
      outputContractIdentifier: contract.identifier,
      outputContractVersion: contract.version,
      attempt: { attemptId: "b21-attempt-001", attemptNumber: 1 },
      timeoutMs: 1_000,
      cancelled: false,
    },
    proposal: {
      ...(renderedInput.identity as Record<string, unknown>),
      ...transcript.proposalPayload,
    },
  };
}

function applyRequired(foundation: PrototypeFoundation, update: ConversationStateUpdate): void {
  const result = foundation.conversationStateManager.apply(update);
  assert(result.status === "success", "the prepared state update applies");
}

async function verifySuccessThroughAdapter(
  prepared: PreparedCase,
  provider: FakeProvider,
): Promise<void> {
  const transport = transportAt(provider.origin, "/ok", {
    credentialReference: () => FAKE_CREDENTIAL,
    model: MODEL,
    maxResponseBytes: 8_192,
  });
  const adapter = new TransportModelProviderAdapter(prepared.rendered, transport, {
    timeoutMs: 500,
  });
  const result = await adapter.execute(prepared.request);

  assert(result.status === "completed", "a valid provider envelope completes");
  assert(typeof result.rawOutput === "string" && result.rawOutput.length > 0,
    "the adapter returns raw output");
  assert(result.usage.inputUnits === 123, "input usage is preserved");
  assert(result.usage.outputUnits === 45, "output usage is preserved");
  assert(result.finishReason === "stop", "a safe finish reason is preserved");
  assert(result.error === null, "a completed result carries no error");

  const captured = provider.requests.filter((item) => item.path === "/ok").at(-1);
  assert(captured !== undefined, "the fake provider received the request");
  const payload = JSON.parse(captured.body) as Record<string, unknown>;
  assert(payload.wireVersion === HTTP_MODEL_TRANSPORT_WIRE_VERSION,
    "the request declares the transport wire version");
  assert(payload.instructions === prepared.rendered.instructions,
    "the request carries exactly the rendered instructions");
  assert(payload.input === prepared.rendered.input,
    "the request carries exactly the rendered input");
  assert(payload.schema === prepared.rendered.schema,
    "the request carries exactly the rendered schema");
  assert(payload.attemptId === prepared.request.attempt.attemptId,
    "the request carries the application attempt identity");
  assert(payload.model === MODEL, "the configured model is forwarded");
  assert(captured.authorization === `Bearer ${FAKE_CREDENTIAL}`,
    "the credential reference supplies the Authorization header");
  assert(captured.contentType === "application/json",
    "the request is JSON");
  assertNoLeak(result, "a successful adapter result");

  const parsed = new BoundedRawOutputParser().parse(result.rawOutput);
  assert(parsed.status === "success", "transport output parses through the application parser");
  const validation = validate(prepared, parsed.value);
  assert(validation.status === "valid", "transport output passes the application validator");
  const decision = new ApplicationDecisionEngine().decide(validation, prepared.contract);
  assert(decision.decision === "accepted", "transport output is accepted by the application");
  assert(decision.stateMutationAuthorized === false,
    "acceptance still authorizes no state mutation");
  assert(decision.customerReleaseAuthorized === false,
    "acceptance still authorizes no customer release");

  // No credential reference means no Authorization header at all.
  const anonymous = transportAt(provider.origin, "/ok");
  const anonymousResult = await anonymous(providerRequest(prepared));
  assert(anonymousResult.status === "completed", "the transport works without a credential reference");
  const anonymousCapture = provider.requests.filter((item) => item.path === "/ok").at(-1);
  assert(anonymousCapture?.authorization === null,
    "no default credential or empty Authorization header is sent");
}

async function verifyJsonAndSchemaRefusal(
  prepared: PreparedCase,
  provider: FakeProvider,
): Promise<void> {
  const cases: readonly { path: string; description: string }[] = [
    { path: "/invalid-json", description: "unparseable provider JSON" },
    { path: "/not-object", description: "a non-string provider output" },
    { path: "/array-envelope", description: "a non-object response envelope" },
    { path: "/schema-extra", description: "an unexpected output field" },
    { path: "/schema-missing", description: "a missing required output field" },
    { path: "/schema-type", description: "an invalid output field type" },
    { path: "/schema-long-string", description: "an over-length output string" },
    { path: "/schema-wrong-type", description: "a mismatched proposal type" },
  ];

  for (const item of cases) {
    const transport = transportAt(provider.origin, item.path);
    const result = await transport(providerRequest(prepared));
    assert(result.status === "failed", `${item.description} is refused`);
    assert(result.rawOutput === undefined, `${item.description} returns no raw output`);
    assert(result.error?.category === "provider-failure",
      `${item.description} normalizes to provider-failure`);
    assertNoLeak(result, item.description);
  }

  const badSchema = transportAt(provider.origin, "/ok");
  const badSchemaResult = await badSchema(providerRequest(prepared, { schema: "{" }));
  assert(badSchemaResult.status === "failed", "an unreadable rendered schema is refused");
  assert(badSchemaResult.error?.category === "provider-failure",
    "an unreadable rendered schema is a safe provider failure");
}

async function verifyDuplicateKeyHandling(
  prepared: PreparedCase,
  provider: FakeProvider,
): Promise<void> {
  const parserCases: readonly {
    readonly text: string;
    readonly expected: "parsed" | "duplicate-key" | "invalid";
    readonly description: string;
  }[] = [
    {
      text: "{\"a\":1,\"a\":2}",
      expected: "duplicate-key",
      description: "a repeated top-level key",
    },
    {
      text: "{\"a\":1,\"\\u0061\":2}",
      expected: "duplicate-key",
      description: "a key repeated through a unicode escape",
    },
    {
      text: "{\"a\\\"b\":1,\"a\\\"b\":2}",
      expected: "duplicate-key",
      description: "a key repeated through an escaped quote",
    },
    {
      text: "{\"\\uD83D\\uDE00\":1,\"😀\":2}",
      expected: "duplicate-key",
      description: "a key repeated as a surrogate escape and a literal",
    },
    {
      text: "{\"a\":{\"b\":1,\"b\":2}}",
      expected: "duplicate-key",
      description: "a repeated nested key",
    },
    {
      text: "{\"a\":[{\"b\":1,\"b\":2}]}",
      expected: "duplicate-key",
      description: "a repeated key inside an array object",
    },
    {
      text: "[{\"a\":1},{\"a\":2}]",
      expected: "parsed",
      description: "the same key in separate objects",
    },
    {
      text: "{\"a\":{\"b\":1},\"c\":{\"b\":2}}",
      expected: "parsed",
      description: "the same nested key in separate objects",
    },
    {
      text: "{\"a\":1,\"A\":2}",
      expected: "parsed",
      description: "case-different keys",
    },
    {
      text: "{\"a\":-1.5e+3}",
      expected: "parsed",
      description: "a valid signed exponent number",
    },
    {
      text: "{\"a\":1,}",
      expected: "invalid",
      description: "a trailing object comma",
    },
    {
      text: "{\"a\":01}",
      expected: "invalid",
      description: "a leading-zero number",
    },
    {
      text: "{\"a\":1} trailing",
      expected: "invalid",
      description: "trailing non-whitespace content",
    },
    {
      text: "{\"a\":\"unterminated}",
      expected: "invalid",
      description: "an unterminated string",
    },
    {
      text: "",
      expected: "invalid",
      description: "an empty document",
    },
  ];

  for (const item of parserCases) {
    const result = parseJsonWithoutDuplicateKeys(item.text);
    assert(result.status === item.expected,
      `${item.description} is classified as ${item.expected}`);
  }

  const validText = JSON.stringify(prepared.proposal);
  const accepted = validateProviderOutput(validText, prepared.rendered.schema);
  assert(accepted.status === "valid", "a duplicate-free provider payload remains valid");

  const duplicate = validateProviderOutput(
    `${validText.slice(0, -1)},"ambiguity":true}`,
    prepared.rendered.schema,
  );
  assert(duplicate.status === "invalid", "a duplicate output field is invalid");
  assert(duplicate.violations.includes("DuplicateFieldName"),
    "a duplicate output field is reported as DuplicateFieldName");

  const escapedDuplicate = validateProviderOutput(
    `${validText.slice(0, -1)},"\\u0061mbiguity":true}`,
    prepared.rendered.schema,
  );
  assert(escapedDuplicate.status === "invalid",
    "a duplicate output field written with a unicode escape is invalid");
  assert(escapedDuplicate.violations.includes("DuplicateFieldName"),
    "an escaped duplicate output field is reported as DuplicateFieldName");

  for (const path of [
    "/schema-duplicate-key",
    "/schema-duplicate-escaped",
    "/envelope-duplicate-key",
  ]) {
    const result = await transportAt(provider.origin, path)(providerRequest(prepared));
    assert(result.status === "failed", `${path} refuses duplicate provider keys`);
    assert(result.rawOutput === undefined, `${path} returns no raw output`);
    assert(result.error?.category === "provider-failure",
      `${path} is a safe provider failure`);
    assertNoLeak(result, path);
  }

  const healthy = await transportAt(provider.origin, "/ok")(providerRequest(prepared));
  assert(healthy.status === "completed",
    "valid responses still complete after duplicate-key refusals");
}

async function verifyResponseSizeRefusal(
  prepared: PreparedCase,
  provider: FakeProvider,
): Promise<void> {
  const transport = transportAt(provider.origin, "/oversize", { maxResponseBytes: 1_024 });
  const streamed = await transport(providerRequest(prepared));
  assert(streamed.status === "failed", "an oversized streamed response is refused");
  assert(streamed.rawOutput === undefined, "an oversized response returns no output");

  const declared = transportAt(provider.origin, "/oversize-declared", {
    maxResponseBytes: 1_024,
  });
  const declaredResult = await declared(providerRequest(prepared));
  assert(declaredResult.status === "failed", "an oversized declared response is refused");
  assert(declaredResult.error?.category === "provider-failure",
    "an oversized response is a safe provider failure");

  const healthy = await transportAt(provider.origin, "/ok")(providerRequest(prepared));
  assert(healthy.status === "completed", "the transport remains usable after size refusals");
}

async function verifyTimeoutAndCancellation(
  prepared: PreparedCase,
  provider: FakeProvider,
): Promise<void> {
  const slowTransport = transportAt(provider.origin, "/slow", { timeoutMs: 80 });
  const startedAt = Date.now();
  const timedOut = await slowTransport(providerRequest(prepared, { timeoutMs: 80 }));
  const elapsed = Date.now() - startedAt;
  assert(timedOut.status === "failed", "a slow provider fails at the deadline");
  assert(timedOut.error?.category === "timeout", "a deadline is a timeout error");
  assert(timedOut.rawOutput === undefined, "a timed-out attempt returns no output");
  assert(elapsed < 1_500, `the timeout resolves promptly (${elapsed}ms)`);

  const adapter = new TransportModelProviderAdapter(
    prepared.rendered,
    transportAt(provider.origin, "/slow", { timeoutMs: 80 }),
    { timeoutMs: 80 },
  );
  const adapterTimeout = await adapter.execute(prepared.request);
  assert(adapterTimeout.status === "failed", "the adapter also fails a slow provider safely");
  // The adapter and transport share the same deadline, so either approved
  // timeout category may win the race; both are fixed application categories.
  assert(adapterTimeout.error?.category === "timeout"
    || adapterTimeout.error?.category === "ProviderTimeout",
  "the adapter reports an approved timeout category");
  const timeoutMessages = [
    "The provider attempt exceeded the application timeout.",
    "The provider reported a failure without application authority.",
  ];
  assert(adapterTimeout.error?.message !== undefined
    && timeoutMessages.includes(adapterTimeout.error.message),
  "the adapter reports one of its fixed messages");
  assert(adapterTimeout.rawOutput === null, "the adapter discards timed-out output");

  const controller = new AbortController();
  const pending = transportAt(provider.origin, "/hang", { timeoutMs: 5_000 })(
    providerRequest(prepared, { signal: controller.signal, timeoutMs: 5_000 }),
  );
  setTimeout(() => controller.abort(), 30);
  const cancelled = await pending;
  assert(cancelled.status === "cancelled", "caller cancellation resolves as cancelled");
  assert(cancelled.finishReason === "cancelled", "cancellation is labeled without provider text");
  assert(cancelled.rawOutput === undefined, "cancellation returns no output");

  const preAborted = new AbortController();
  preAborted.abort();
  const immediate = await transportAt(provider.origin, "/hang")(
    providerRequest(prepared, { signal: preAborted.signal, timeoutMs: 5_000 }),
  );
  assert(immediate.status === "cancelled", "an already-aborted caller starts no work");
}

async function verifyRedirectRefusal(
  prepared: PreparedCase,
  provider: FakeProvider,
): Promise<void> {
  const result = await transportAt(provider.origin, "/redirect")(providerRequest(prepared));
  assert(result.status === "failed", "a redirect response is refused");
  assert(result.error?.category === "provider-failure", "a redirect is a safe provider failure");
  assert(provider.redirectTarget.hits() === 0, "no redirected endpoint is ever contacted");
}

async function verifyErrorNormalizationAndCredentials(
  prepared: PreparedCase,
  provider: FakeProvider,
): Promise<void> {
  const expected: readonly { status: number; category: string }[] = [
    { status: 400, category: "invalid-request" },
    { status: 401, category: "authentication" },
    { status: 403, category: "authentication" },
    { status: 404, category: "invalid-request" },
    { status: 408, category: "timeout" },
    { status: 429, category: "rate-limit" },
    { status: 500, category: "unavailable" },
    { status: 503, category: "unavailable" },
    { status: 418, category: "provider-failure" },
  ];
  for (const item of expected) {
    const result = await transportAt(provider.origin, `/status-${item.status}`)(
      providerRequest(prepared, { timeoutMs: 2_000 }),
    );
    assert(result.status === "failed", `HTTP ${item.status} fails safely`);
    assert(result.error?.category === item.category,
      `HTTP ${item.status} maps to ${item.category}`);
    assert(result.error?.message !== undefined && result.error.message.length > 0,
      `HTTP ${item.status} carries a fixed application message`);
    assertNoLeak(result, `HTTP ${item.status}`);
  }

  const html = await transportAt(provider.origin, "/html")(providerRequest(prepared));
  assert(html.status === "failed", "a non-JSON content type is refused");
  assertNoLeak(html, "a non-JSON content type");

  const badCredential = transportAt(provider.origin, "/ok", {
    credentialReference: () => "credential\ninjection",
  });
  const before = provider.requests.length;
  const rejected = await badCredential(providerRequest(prepared));
  assert(rejected.status === "failed", "an unsafe credential value is refused");
  assert(rejected.error?.category === "authentication", "an unsafe credential is an authentication failure");
  assert(provider.requests.length === before, "an unsafe credential is never sent");

  const throwingCredential = transportAt(provider.origin, "/ok", {
    credentialReference: () => {
      throw new Error(CANARY);
    },
  });
  const thrown = await throwingCredential(providerRequest(prepared));
  assert(thrown.status === "failed", "a failing credential reference fails closed");
  assert(thrown.error?.category === "authentication", "a failing credential reference is an authentication failure");
  assertNoLeak(thrown, "a failing credential reference");

  const badUsage = await transportAt(provider.origin, "/usage-invalid")(providerRequest(prepared));
  assert(badUsage.status === "completed", "invalid usage metadata does not discard valid output");
  assert(badUsage.usage?.inputUnits === 0 && badUsage.usage?.outputUnits === 0,
    "invalid usage units normalize to zero");

  const camelUsage = await transportAt(provider.origin, "/usage-camel")(providerRequest(prepared));
  assert(camelUsage.status === "completed", "camelCase usage metadata is accepted");
  assert(camelUsage.usage?.inputUnits === 7 && camelUsage.usage?.outputUnits === 9,
    "camelCase usage units are preserved");

  const length = await transportAt(provider.origin, "/finish-length")(providerRequest(prepared));
  assert(length.finishReason === "length", "an approved finish reason is preserved");
  const weird = await transportAt(provider.origin, "/finish-weird")(providerRequest(prepared));
  assert(weird.finishReason === null, "an unrecognized finish reason is discarded");
}

async function verifyProviderCannotMutateProtectedState(
  prepared: PreparedCase,
  provider: FakeProvider,
): Promise<void> {
  const transport = transportAt(provider.origin, "/schema-extra");
  const refused = await transport(providerRequest(prepared));
  assert(refused.status === "failed", "tool and state fields are refused at the transport boundary");
  assert(refused.rawOutput === undefined, "refused authority fields never reach the adapter");

  const adapter = new TransportModelProviderAdapter(
    prepared.rendered,
    transport,
    { timeoutMs: 500 },
  );
  const adapterResult = await adapter.execute(prepared.request);
  assert(adapterResult.status === "failed", "the adapter fails a schema-refused provider result");
  assert(adapterResult.rawOutput === null, "no refused output reaches the application");
  assert(adapterResult.error?.category === "provider-failure",
    "the adapter preserves the approved provider-failure category");
  assert(adapterResult.error?.message === "The provider reported a failure without application authority.",
    "the adapter reports a fixed, non-echoing message");
  assertNoLeak(adapterResult, "a schema-refused adapter result");

  // Defense in depth: even a transport double that bypasses the HTTP schema
  // check cannot obtain authority. The application validator and decision
  // engine still refuse the payload.
  const malicious = {
    ...prepared.proposal,
    toolCall: { name: "mutate-protected-state" },
    stateMutation: { stage: "completed" },
    customerReleased: true,
  };
  const bypass: OfflineTransport = async () => ({
    status: "completed",
    rawOutput: JSON.stringify(malicious),
    usage: { inputUnits: 10, outputUnits: 10 },
    finishReason: "stop",
  });
  const bypassAdapter = new TransportModelProviderAdapter(prepared.rendered, bypass, {
    timeoutMs: 500,
  });
  const bypassResult = await bypassAdapter.execute(prepared.request);
  assert(bypassResult.status === "completed", "the double returns a syntactically usable payload");
  const parsed = new BoundedRawOutputParser().parse(bypassResult.rawOutput);
  assert(parsed.status === "success", "the malicious payload parses for the application validator");
  const validation = validate(prepared, parsed.value);
  assert(validation.status === "invalid", "the application validator rejects authority fields");
  for (const failure of [
    "PermissionViolation",
    "ProhibitedOperation",
    "StateMutationAuthorityViolation",
    "CustomerReleaseAuthorityViolation",
  ]) {
    assert(validation.failures.some((item) => item === failure),
      `the validator reports ${failure}`);
  }
  assert(validation.rejectedFields.includes("toolCall"), "the tool field is rejected");
  const decision = new ApplicationDecisionEngine().decide(validation, prepared.contract);
  assert(decision.decision === "safe_stop", "authority-bearing output cannot mutate protected state");
  assert(decision.stateMutationAuthorized === false, "state mutation remains unauthorized");
  assert(decision.customerReleaseAuthorized === false, "customer release remains unauthorized");
}

function verifySourceBoundaries(): void {
  const packageRoot = process.cwd();
  const clientRoots = [
    "app", "components", "hooks", "lib", "services", "types", "utils",
    "src/prototype-ui", "src/ai/demo",
  ];
  const prohibited = [
    "http-model-transport",
    "provider-output-schema",
    "createHttpModelTransport",
    "HTTP_MODEL_TRANSPORT_ID",
    "credentialReference",
  ];

  for (const root of clientRoots) {
    for (const file of sourceFiles(join(packageRoot, root))) {
      const source = readFileSync(file, "utf8");
      const isClient = root === "app" || root === "components" || source.includes("\"use client\"");
      if (!isClient) continue;
      for (const identifier of prohibited) {
        assert(!source.includes(identifier),
          `${relative(packageRoot, file)} does not reference ${identifier}`);
      }
    }
  }

  for (const file of sourceFiles(join(packageRoot, "src"))) {
    const source = readFileSync(file, "utf8");
    if (!source.includes("\"use client\"")) continue;
    for (const identifier of prohibited) {
      assert(!source.includes(identifier),
        `${relative(packageRoot, file)} does not reference ${identifier}`);
    }
  }

  const demo = readFileSync(join(packageRoot, "src/ai/demo/ai-demo-turn.ts"), "utf8");
  assert(demo.includes("createSimulatedModelTransport"),
    "the browser demo still uses the simulated transport");
  assert(!demo.includes("http-model-transport"),
    "the browser demo does not import the HTTP transport");

  const transportSource = readFileSync(join(packageRoot, PROVIDER_SOURCE), "utf8");
  assert(transportSource.includes("typeof window"),
    "the transport declares a server-only guard");
  assert(!transportSource.includes("process.env"),
    "the transport reads no environment credential");
  assert(!transportSource.includes("console."),
    "the transport logs nothing");
  assert((transportSource.match(/await fetch\(/g) ?? []).length === 1,
    "the transport has exactly one network call site");
  assert(!transportSource.includes("stateMutation") && !transportSource.includes("toolCall"),
    "the transport contains no tool or state execution path");
  for (const endpoint of ["api.openai.com", "anthropic.com", "generativelanguage", "openai"]) {
    assert(!transportSource.includes(endpoint),
      `the transport names no real provider endpoint (${endpoint})`);
  }

  const schemaSource = readFileSync(join(packageRoot, SCHEMA_SOURCE), "utf8");
  assert(!schemaSource.includes("process.env"), "the schema validator reads no environment");
  assert(!schemaSource.includes("fetch("), "the schema validator performs no network work");
  assert(!schemaSource.includes("console."), "the schema validator logs nothing");

  const verifierSource = readFileSync(join(packageRoot, VERIFIER_SOURCE), "utf8");
  assert(!verifierSource.includes("https://" + "api."),
    "the verification suite names no real provider endpoint");
  assert(verifierSource.includes("127.0.0.1"), "the verification suite uses loopback only");
}

function verifyPackageScript(): void {
  const packageJson = JSON.parse(
    readFileSync(join(process.cwd(), "package.json"), "utf8"),
  ) as { scripts?: Record<string, string> };
  assert(
    packageJson.scripts?.[PACKAGE_SCRIPT]
      === "tsc -p tsconfig.prototype.json && node .prototype-build/verification/http-model-transport.verify.js",
    "the B2.1 verifier is exposed as one deterministic script",
  );
}

function verifyConversationStateUnchanged(prepared: PreparedCase): void {
  const snapshot = prepared.foundation.conversationStateManager.snapshot(prepared.scope);
  assert(snapshot.status === "success", "the conversation state is still readable");
  assert(snapshot.state.revision === prepared.state.revision,
    "provider work changed no conversation revision");
  assert(JSON.stringify(snapshot.state) === JSON.stringify(prepared.state),
    "provider work changed no protected conversation state");
}

function validate(prepared: PreparedCase, proposal: Readonly<Record<string, unknown>>) {
  return new PrototypeProposalValidator().validate({
    proposal,
    task: prepared.task,
    contract: prepared.contract,
    contextPackage: prepared.contextPackage,
    promptPackageId: prepared.promptPackage.promptPackageId,
    businessProfile: prepared.foundation.businessProfile,
  });
}

function transportAt(
  origin: string,
  path: string,
  overrides: Partial<Omit<HttpModelTransportOptions, "endpoint">> = {},
): OfflineTransport {
  return createHttpModelTransport({
    endpoint: `${origin}${path}`,
    allowInsecureLoopback: true,
    ...overrides,
  });
}

function providerRequest(
  prepared: PreparedCase,
  overrides: Partial<OfflineTransportRequest> = {},
): OfflineTransportRequest {
  return {
    instructions: prepared.rendered.instructions,
    input: prepared.rendered.input,
    schema: prepared.rendered.schema,
    attemptId: prepared.request.attempt.attemptId,
    timeoutMs: 1_000,
    signal: null,
    ...overrides,
  };
}

function verifyEndpointPolicy(provider: FakeProvider): void {
  const cases: readonly {
    readonly description: string;
    readonly options: HttpModelTransportOptions;
    readonly code: string;
  }[] = [
    {
      description: "a plaintext endpoint without loopback approval",
      options: { endpoint: `${provider.origin}/ok` },
      code: "EndpointInsecure",
    },
    {
      description: "an endpoint outside the approved origins",
      options: {
        endpoint: `${provider.origin}/ok`,
        allowInsecureLoopback: true,
        allowedOrigins: ["https://approved.example"],
      },
      code: "EndpointNotAllowed",
    },
    {
      description: "an approved origin on a different port",
      options: {
        endpoint: `${provider.origin}/ok`,
        allowInsecureLoopback: true,
        allowedOrigins: ["http://127.0.0.1:1"],
      },
      code: "EndpointNotAllowed",
    },
    {
      description: "a URL with embedded credentials",
      options: {
        endpoint: "https://user:secret@approved.example/v1",
        allowedOrigins: ["https://approved.example"],
      },
      code: "EndpointCredentials",
    },
    {
      description: "a relative endpoint",
      options: { endpoint: "/v1/messages" },
      code: "EndpointInvalid",
    },
    {
      description: "a non-HTTP endpoint",
      options: { endpoint: "ftp://approved.example/v1" },
      code: "EndpointInvalid",
    },
    {
      description: "an endpoint with a fragment",
      options: { endpoint: "https://approved.example/v1#fragment" },
      code: "EndpointInvalid",
    },
    {
      description: "an invalid response-size limit",
      options: {
        endpoint: "https://approved.example/v1",
        maxResponseBytes: 0,
      },
      code: "MaxResponseBytesInvalid",
    },
    {
      description: "an invalid timeout ceiling",
      options: {
        endpoint: "https://approved.example/v1",
        timeoutMs: 0,
      },
      code: "TimeoutInvalid",
    },
    {
      description: "an approved origin carrying a path",
      options: {
        endpoint: "https://approved.example/v1",
        allowedOrigins: ["https://approved.example/v1"],
      },
      code: "OriginNotAllowed",
    },
    {
      description: "a non-HTTP approved origin",
      options: {
        endpoint: "https://approved.example/v1",
        allowedOrigins: ["ftp://approved.example"],
      },
      code: "OriginNotAllowed",
    },
    {
      description: "the unapproved endpoint itself",
      options: {
        endpoint: "https://unapproved.example/v1",
        allowedOrigins: ["https://approved.example"],
      },
      code: "EndpointNotAllowed",
    },
  ];

  for (const item of cases) {
    let thrown: unknown = null;
    try {
      createHttpModelTransport(item.options);
    } catch (error) {
      thrown = error;
    }
    assert(thrown instanceof HttpTransportConfigurationError,
      `${item.description} is refused at construction`);
    assert((thrown as HttpTransportConfigurationError).code === item.code,
      `${item.description} reports ${item.code}`);
    assert(!(thrown as Error).message.includes(FAKE_CREDENTIAL),
      `${item.description} leaks no credential`);
  }

  const errors = JSON.stringify(cases.map((item) => {
    try {
      createHttpModelTransport(item.options);
      return null;
    } catch (error) {
      return { message: (error as Error).message, code: (error as HttpTransportConfigurationError).code };
    }
  }));
  assert(!errors.includes(CANARY), "endpoint refusal messages echo no provider text");
}

function assertNoLeak(value: unknown, description: string): void {
  const serialized = JSON.stringify(value) ?? "";
  assert(!serialized.includes(CANARY), `${description} does not echo provider text`);
  assert(!serialized.includes(FAKE_CREDENTIAL), `${description} does not echo the credential`);
}

async function startFakeProvider(validOutput: string): Promise<FakeProvider> {
  const requests: CapturedRequest[] = [];
  let redirectHits = 0;

  const redirectTarget = createServer((_request, response) => {
    redirectHits += 1;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ output: validOutput }));
  });
  const redirectOrigin = await listen(redirectTarget);

  const provider = createServer((request, response) => {
    void handleFakeRequest(request, response, {
      validOutput,
      requests,
      redirectOrigin,
    });
  });
  const origin = await listen(provider);

  return {
    origin,
    requests,
    redirectTarget: { origin: redirectOrigin, hits: () => redirectHits },
    close: async () => {
      await closeServer(provider);
      await closeServer(redirectTarget);
    },
  };
}

async function handleFakeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  context: {
    readonly validOutput: string;
    readonly requests: CapturedRequest[];
    readonly redirectOrigin: string;
  },
): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const body = Buffer.concat(chunks).toString("utf8");
  const path = (request.url ?? "/").split("?")[0];
  const authorization = typeof request.headers.authorization === "string"
    ? request.headers.authorization
    : null;
  const contentType = typeof request.headers["content-type"] === "string"
    ? request.headers["content-type"]
    : null;
  context.requests.push({ path, authorization, contentType, body });

  const validEnvelope = {
    output: context.validOutput,
    usage: { input_tokens: 123, output_tokens: 45 },
    finish_reason: "stop",
  };

  switch (path) {
    case "/ok":
    case "/echo-auth":
      sendJson(response, 200, validEnvelope);
      return;
    case "/invalid-json":
      sendJson(response, 200, { output: "{\"candidateIntent\":" });
      return;
    case "/not-object":
      sendJson(response, 200, { output: 42 });
      return;
    case "/array-envelope":
      sendJson(response, 200, [validEnvelope]);
      return;
    case "/schema-extra":
      sendJson(response, 200, {
        output: JSON.stringify({
          ...(JSON.parse(context.validOutput) as Record<string, unknown>),
          toolCall: { name: "mutate-protected-state" },
        }),
      });
      return;
    case "/schema-missing": {
      const proposal = { ...(JSON.parse(context.validOutput) as Record<string, unknown>) };
      delete proposal.ambiguity;
      sendJson(response, 200, { output: JSON.stringify(proposal) });
      return;
    }
    case "/schema-type":
      sendJson(response, 200, {
        output: JSON.stringify({
          ...(JSON.parse(context.validOutput) as Record<string, unknown>),
          ambiguity: "false",
        }),
      });
      return;
    case "/schema-long-string":
      sendJson(response, 200, {
        output: JSON.stringify({
          ...(JSON.parse(context.validOutput) as Record<string, unknown>),
          candidateIntent: "a".repeat(2_001),
        }),
      });
      return;
    case "/schema-duplicate-key": {
      const duplicate = `${context.validOutput.slice(0, -1)},"ambiguity":true}`;
      sendJson(response, 200, { output: duplicate });
      return;
    }
    case "/schema-duplicate-escaped": {
      const duplicate = `${context.validOutput.slice(0, -1)},"\\u0061mbiguity":true}`;
      sendJson(response, 200, { output: duplicate });
      return;
    }
    case "/envelope-duplicate-key": {
      const raw = `{"output":${JSON.stringify(context.validOutput)},`
        + `"output":${JSON.stringify(context.validOutput)}}`;
      sendRawJson(response, raw);
      return;
    }
    case "/schema-wrong-type":
      sendJson(response, 200, {
        output: JSON.stringify({
          ...(JSON.parse(context.validOutput) as Record<string, unknown>),
          proposalType: "conversation_summary",
        }),
      });
      return;
    case "/oversize": {
      response.on("error", () => undefined);
      response.writeHead(200, { "content-type": "application/json" });
      response.write("{\"output\":\"");
      const chunk = "a".repeat(1_024);
      for (let index = 0; index < 32; index += 1) response.write(chunk);
      response.end("\"}");
      return;
    }
    case "/oversize-declared": {
      const filler = "a".repeat(2_000);
      response.writeHead(200, {
        "content-type": "application/json",
        "content-length": String(filler.length),
      });
      response.end(filler);
      return;
    }
    case "/slow": {
      const timer = setTimeout(() => sendJson(response, 200, validEnvelope), 400);
      response.on("close", () => clearTimeout(timer));
      return;
    }
    case "/hang":
      response.on("close", () => undefined);
      return;
    case "/redirect":
      response.writeHead(302, { location: `${context.redirectOrigin}/landed` });
      response.end();
      return;
    case "/html":
      response.writeHead(200, { "content-type": "text/html" });
      response.end(`<html><body>${CANARY}</body></html>`);
      return;
    case "/usage-invalid":
      sendJson(response, 200, {
        output: context.validOutput,
        usage: { input_tokens: -5, output_tokens: "not-a-number" },
      });
      return;
    case "/usage-camel":
      sendJson(response, 200, {
        output: context.validOutput,
        usage: { inputUnits: 7, outputUnits: 9 },
      });
      return;
    case "/finish-length":
      sendJson(response, 200, { output: context.validOutput, finish_reason: "length" });
      return;
    case "/finish-weird":
      sendJson(response, 200, { output: context.validOutput, finish_reason: "provider-internal-detail" });
      return;
    default:
      break;
  }

  const statusMatch = /^\/status-(\d{3})$/.exec(path);
  if (statusMatch) {
    sendJson(response, Number(statusMatch[1]), { error: { message: CANARY } });
    return;
  }
  sendJson(response, 404, { error: { message: "unknown fake route" } });
}

function sendJson(
  response: ServerResponse,
  status: number,
  payload: unknown,
): void {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": String(Buffer.byteLength(body)),
  });
  response.end(body);
}

function sendRawJson(response: ServerResponse, body: string): void {
  response.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "content-length": String(Buffer.byteLength(body)),
  });
  response.end(body);
}

function listen(server: Server): Promise<string> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address() as AddressInfo;
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function closeServer(server: Server): Promise<void> {
  server.closeAllConnections();
  return new Promise((resolve) => server.close(() => resolve()));
}

function sourceFiles(directory: string): string[] {
  const files: string[] = [];
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      files.push(...sourceFiles(path));
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
      files.push(path);
    }
  }
  return files;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Stage B2.1 HTTP transport verification failed: ${message}.`);
  }
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
