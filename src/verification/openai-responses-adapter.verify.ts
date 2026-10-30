import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import type { BusinessProfile } from "../domain/business-profile";
import type { KnowledgeRecord } from "../domain/knowledge-record";
import { fictionalBusinessProfile } from "../fixtures/business-profile";
import { initializedConversationState } from "../fixtures/conversation";
import { fictionalKnowledgeRecords } from "../fixtures/knowledge";
import type { AiOperationIdentity } from "../ai/contracts/identities";
import { PrototypeContextPackageBuilder } from "../ai/context/context-package-builder";
import { renderProviderInstructions } from "../ai/prompts/provider-instruction-renderer";
import { PrototypePromptPackageComposer } from "../ai/prompts/prompt-package-composer";
import {
  OPENAI_RESPONSES_DEFAULT_MODEL,
  OPENAI_RESPONSES_MAXIMUM_BODY_BYTES,
  OPENAI_RESPONSES_PATH,
  OPENAI_RESPONSES_SCHEMA_NAME,
  buildOpenAiResponsesRequest,
  createOpenAiResponsesTransport,
  parseOpenAiResponsesResponse,
  type OpenAiResponsesTransportOptions,
} from "../ai/providers/openai-responses-adapter";
import { AI_POLICY_VERSIONS } from "../ai/registries/policy-versions";
import { OutputContractRegistry } from "../ai/registries/output-contract-registry";
import { TaskRegistry } from "../ai/registries/task-registry";
import { resolveBusinessHours } from "../ai/grounding/business-hours";
import type { OfflineTransportRequest } from "../ai/providers/transport-model-provider-adapter";
import {
  actualCostMicros,
  estimateTurnCost,
  resolveProviderPricing,
  type EstimatedTurnCost,
  type ProviderModelPricing,
} from "../server/billing/provider-pricing";
import { DurableReceptionistConversationService } from "../server/conversation/durable-receptionist-conversation-service";
import type { ReceptionistBusiness } from "../server/conversation/receptionist-conversation-service";
import { InMemoryReceptionistPersistence } from "../server/persistence/in-memory-receptionist-persistence";
import { PILOT_PROVIDER_NETWORK_MODE } from "../server/pilot/pilot-runtime-configuration";

/**
 * Stage B2.4B.2A verification: the OpenAI Responses adapter, exercised only
 * against a loopback fake that speaks OpenAI's request and response shapes.
 *
 * Nothing leaves the machine. There is no DNS lookup, no provider account, no
 * real credential, and no external request: the fake server binds to 127.0.0.1
 * on an ephemeral port, and every other origin is refused by configuration.
 */

const BUSINESS_A = fictionalBusinessProfile.id;
const BUSINESS_B = "second-fictional-business";
const CREDENTIAL = "sk-verify-synthetic-openai-not-a-real-key-000000";
const MODEL = OPENAI_RESPONSES_DEFAULT_MODEL;
const HOURS_QUESTION = "Hello, what time does your business close today?";
/** Friday 30 October 2026, 10:00 in America/New_York (EDT). */
const FRIDAY = Date.UTC(2026, 9, 30, 14, 0, 0);
const REPORTED_INPUT_TOKENS = 812;
const REPORTED_OUTPUT_TOKENS = 41;

/**
 * Verification-only prices. They are fixture numbers used to exercise the
 * reservation lifecycle, not a provider rate, and the allowlist deliberately
 * has no entry for this model yet.
 */
const FIXTURE_PRICING: ProviderModelPricing = Object.freeze({
  providerIdentifier: "openai",
  modelIdentifier: MODEL,
  inputMicrosPerMillionTokens: 250_000,
  outputMicrosPerMillionTokens: 1_000_000,
  inputTokenBudget: 4_000,
  outputTokenBudget: 512,
  provisional: true,
  priceSource: "B2.4B.2A verification fixture (not a provider rate)",
  verifiedOn: "2026-10-30",
});

const ESTIMATE_RESULT = estimateTurnCost(FIXTURE_PRICING);
if (ESTIMATE_RESULT === null) throw new Error("fixture pricing is invalid");
const FIXTURE_ESTIMATE: EstimatedTurnCost = ESTIMATE_RESULT;

async function run(): Promise<void> {
  await verifyRequestTranslation();
  await verifyGroundedHoursThroughAdapter();
  await verifyTokenAccounting();
  await verifyMissingUsageFallsBackToEstimate();
  await verifyInvalidJson();
  await verifyRefusal();
  await verifyTruncation();
  await verifyTimeout();
  await verifyCancellation();
  await verifyDuplicateRequests();
  await verifyBudgetRefusalBeforeTransport();
  await verifyCrossBusinessIsolation();
  await verifyCredentialConfinement();
  await verifyResponseShapeRefusals();
  await verifyConfigurationRefusals();
  await verifyNoExternalNetworkOrActivation();
  console.log(
    "Stage B2.4B.2A OpenAI Responses adapter verification passed: envelope translation, strict "
    + "JSON schema formatting, grounded hours answer through the durable turn, reported token "
    + "accounting, estimate fallback when usage is missing, invalid JSON, refusal, truncation, "
    + "timeout, cancellation, duplicate suppression, budget refusal before transport, "
    + "cross-business isolation, credential confinement, envelope shape refusal, endpoint "
    + "configuration refusal, and no external network or provider activation.",
  );
}

async function verifyRequestTranslation(): Promise<void> {
  const prepared = prepareCase();
  const built = buildOpenAiResponsesRequest(
    { ...prepared.request, schema: prepared.rendered.schema },
    { model: MODEL, maxOutputTokens: 512 },
  );
  assert(built.status === "built", `the request builds (${built.status === "rejected" ? built.failure : ""})`);
  if (built.status !== "built") return;

  const body = JSON.parse(built.body) as Record<string, unknown>;
  assert(body.model === MODEL, "the allowlisted model identifier is sent");
  assert(body.instructions === prepared.rendered.instructions,
    "the application's instructions are sent unchanged");
  assert(body.input === prepared.rendered.input, "the application's input is sent unchanged");
  assert(body.max_output_tokens === 512, "the output token budget is bounded");
  assert(body.store === false, "provider-side storage is disabled");
  assert(!("tools" in body), "no tools are offered to the provider");
  assert(!("stream" in body), "a complete response is requested, not a stream");

  const text = body.text as { format: Record<string, unknown> } | undefined;
  assert(text !== undefined && typeof text === "object", "structured output is requested");
  const format = text?.format as Record<string, unknown>;
  assert(format.type === "json_schema", "the response format is a JSON schema");
  assert(format.strict === true, "the schema is strict");
  assert(format.name === OPENAI_RESPONSES_SCHEMA_NAME, "the schema carries an allowed name");
  assert(/^[A-Za-z0-9_-]{1,64}$/.test(String(format.name)), "the schema name matches the provider rule");

  const schema = format.schema as Record<string, unknown>;
  assert(schema.type === "object", "the schema describes an object");
  assert(schema.additionalProperties === false, "the schema forbids additional properties");
  const properties = schema.properties as Record<string, Record<string, unknown>>;
  const required = schema.required as string[];
  assert(required.length === Object.keys(properties).length,
    "every advertised property is required, as strict mode demands");
  assert(required.includes("proposalId") && required.includes("customerFacingText")
    && required.includes("knowledgeSourceReferences") && required.includes("insufficientKnowledge"),
  "the contract's required fields are all advertised");
  assert(!("limitationNote" in properties),
    "an optional contract field is not advertised, so the model cannot invent it");
  assert(properties.customerFacingText?.maxLength === 2_000, "string limits are carried into the schema");
  assert(properties.knowledgeSourceReferences?.maxItems === 25, "array limits are carried into the schema");
  assert(built.body.length <= OPENAI_RESPONSES_MAXIMUM_BODY_BYTES, "the request body is bounded");
  assert(!built.body.includes(CREDENTIAL), "no credential is placed in the body");
  assert(!built.body.includes("attempt-"), "internal attempt identifiers are not leaked to the provider");

  // Optional fields present in a proposal are still accepted by the validator;
  // they are simply not requested from the model.
  const unusable = buildOpenAiResponsesRequest(
    { ...prepared.request, schema: "{}" },
    { model: MODEL, maxOutputTokens: 512 },
  );
  assert(unusable.status === "rejected" && unusable.failure === "SchemaUnreadable",
    "an unreadable schema is refused instead of being sent");
  assert(buildOpenAiResponsesRequest({ ...prepared.request, input: "" }).status === "rejected",
    "an empty input is refused");
  assert(buildOpenAiResponsesRequest(
    { ...prepared.request, schema: prepared.rendered.schema },
    { model: "not a model", maxOutputTokens: 512 },
  ).status === "rejected", "an invalid model identifier is refused");
  assert(buildOpenAiResponsesRequest(
    { ...prepared.request, schema: prepared.rendered.schema },
    { model: MODEL, maxOutputTokens: 1_000_000 },
  ).status === "rejected", "an out-of-range output budget is refused");
}

async function verifyGroundedHoursThroughAdapter(): Promise<void> {
  const harness = await createHarness({ useDurable: true });
  try {
    harness.fake.setMode("success");
    const outcome = await submit(harness, HOURS_QUESTION);
    assert(outcome.status === "ok", `the grounded turn succeeds (${outcome.status})`);
    if (outcome.status !== "ok") return;
    assert(outcome.decision === "answered", "the turn is reported as an answered question");
    const answer = outcome.messages[outcome.messages.length - 1]?.text ?? "";
    assert(answer.includes("5:00 PM"), "the customer receives the approved closing time");
    assert(harness.fake.requests.length === 1, "the provider was called exactly once");

    const received = harness.fake.requests[0];
    assert(received.path === OPENAI_RESPONSES_PATH, "the request targets the Responses endpoint");
    assert(received.contentType === "application/json", "the request declares JSON");
    assert(received.authorization === `Bearer ${CREDENTIAL}`,
      "the synthetic credential is sent only as the bearer header");
    const body = JSON.parse(received.body) as Record<string, unknown>;
    const input = String(body.input);
    assert(input.includes("Friendly Home Services"), "the approved business identity is sent");
    assert(input.includes("8:00 AM-5:00 PM"), "the approved hours text is sent");
    assert(input.includes(HOURS_QUESTION), "the customer's question is sent as data");
    assert(!input.includes(CREDENTIAL), "the credential is never part of the prompt");
    assert(String(body.instructions).includes("You are the language layer"),
      "the application's own instructions are used");
  } finally {
    await harness.close();
  }
}

async function verifyTokenAccounting(): Promise<void> {
  const harness = await createHarness({ useDurable: true });
  try {
    harness.fake.setMode("success");
    harness.fake.setUsage(REPORTED_INPUT_TOKENS, REPORTED_OUTPUT_TOKENS);
    const outcome = await submit(harness, HOURS_QUESTION);
    assert(outcome.status === "ok", "the accounting turn succeeds");

    const usage = await harness.persistence.monthlyUsageMicros(BUSINESS_A, "2026-10");
    assert(usage !== null && usage.reservedMicros === 0, "the reservation was settled");
    const expected = actualCostMicros(FIXTURE_PRICING, REPORTED_INPUT_TOKENS, REPORTED_OUTPUT_TOKENS);
    assert(usage.settledMicros === expected,
      `the reported token counts settle the reported cost (${usage.settledMicros} vs ${expected})`);

    const receipt = await harness.persistence.loadTurnReceipt(harness.scope, harness.lastTurnId);
    assert(receipt.status === "found", "the turn receipt exists");
    if (receipt.status === "found") {
      // The receipt's messages are replayed from the conversation store, which is
      // the conversation record. The operational metadata is what must stay free
      // of credentials and conversation text.
      const { messages: replayed, ...metadata } = receipt.receipt;
      const serializedMetadata = JSON.stringify(metadata);
      assert(!serializedMetadata.includes(CREDENTIAL), "the receipt metadata holds no credential");
      assert(!serializedMetadata.includes("5:00 PM"), "the receipt metadata holds no conversation text");
      assert(replayed.length > 0, "the receipt still resolves its replayed messages");
    }
  } finally {
    await harness.close();
  }
}

async function verifyMissingUsageFallsBackToEstimate(): Promise<void> {
  const harness = await createHarness({ useDurable: true });
  try {
    harness.fake.setMode("missing-usage");
    const outcome = await submit(harness, HOURS_QUESTION);
    assert(outcome.status === "ok", "a response without usage still yields an answer");
    const usage = await harness.persistence.monthlyUsageMicros(BUSINESS_A, "2026-10");
    assert(usage !== null, "usage is recorded");
    assert(usage.settledMicros === FIXTURE_ESTIMATE.estimatedCostMicros,
      "the conservative estimate is settled instead of a guessed zero");
  } finally {
    await harness.close();
  }
}

async function verifyInvalidJson(): Promise<void> {
  const harness = await createHarness({ useDurable: true });
  try {
    harness.fake.setMode("invalid-json");
    const outcome = await submit(harness, HOURS_QUESTION);
    assert(outcome.status === "provider-failure", "malformed model JSON fails the turn safely");
    const usage = await harness.persistence.monthlyUsageMicros(BUSINESS_A, "2026-10");
    assert(usage !== null && usage.settledMicros === 0, "a failed turn records no charge");
  } finally {
    await harness.close();
  }
}

async function verifyRefusal(): Promise<void> {
  const harness = await createHarness({ useDurable: true });
  try {
    harness.fake.setMode("refusal");
    const outcome = await submit(harness, HOURS_QUESTION);
    assert(outcome.status === "provider-failure", "a provider refusal fails the turn safely");
  } finally {
    await harness.close();
  }
}

async function verifyTruncation(): Promise<void> {
  const harness = await createHarness({ useDurable: true });
  try {
    harness.fake.setMode("truncated");
    const outcome = await submit(harness, HOURS_QUESTION);
    assert(outcome.status === "provider-failure", "a truncated response is never released");
    const parsed = parseOpenAiResponsesResponse(JSON.stringify(truncatedEnvelope()));
    assert(parsed.status === "incomplete" && parsed.finishReason === "length",
      "truncation is reported as an incomplete response with a length finish reason");
  } finally {
    await harness.close();
  }
}

async function verifyTimeout(): Promise<void> {
  const harness = await createHarness({ useDurable: true, timeoutMs: 150 });
  try {
    harness.fake.setMode("slow");
    const started = Date.now();
    const outcome = await submit(harness, HOURS_QUESTION);
    assert(outcome.status === "provider-failure", "a timed-out attempt fails the turn safely");
    assert(Date.now() - started < 5_000, "the application's own deadline terminated the attempt");
  } finally {
    await harness.close();
  }
}

async function verifyCancellation(): Promise<void> {
  const harness = await createHarness({ useDurable: true });
  try {
    harness.fake.setMode("slow");
    const controller = new AbortController();
    const transport = createOpenAiResponsesTransport({
      baseUrl: harness.fake.origin,
      allowInsecureLoopback: true,
      credentialReference: () => CREDENTIAL,
      model: MODEL,
      timeoutMs: 5_000,
    });
    const request: OfflineTransportRequest = {
      instructions: "instructions",
      input: "input",
      schema: prepareCase().rendered.schema,
      attemptId: "attempt-cancel-1",
      timeoutMs: 5_000,
      signal: controller.signal,
    };
    const pending = transport(request);
    setTimeout(() => controller.abort(), 50);
    const result = await pending;
    assert(result.status === "cancelled", "a caller cancellation yields a cancelled result");
    assert(result.rawOutput === undefined || result.rawOutput === null,
      "a cancelled attempt produces no output");
  } finally {
    await harness.close();
  }
}

async function verifyDuplicateRequests(): Promise<void> {
  const harness = await createHarness({ useDurable: true });
  try {
    harness.fake.setMode("success");
    const turnId = nextTurnId();
    const first = await submit(harness, HOURS_QUESTION, turnId);
    const second = await submit(harness, HOURS_QUESTION, turnId);
    assert(first.status === "ok" && second.status === "ok",
      `the duplicated turn replays successfully (${first.status} then ${second.status})`);
    if (second.status === "ok") {
      assert(second.replayed === true, "the duplicate is answered from its receipt");
    }
    assert(harness.fake.requests.length === 1,
      "a duplicate turn identifier reaches the provider exactly once");
  } finally {
    await harness.close();
  }
}

async function verifyBudgetRefusalBeforeTransport(): Promise<void> {
  const harness = await createHarness({
    useDurable: true,
    budgetMicros: FIXTURE_ESTIMATE.estimatedCostMicros - 1,
  });
  try {
    harness.fake.setMode("success");
    const outcome = await submit(harness, HOURS_QUESTION);
    assert(outcome.status === "budget-exhausted", "a turn above the monthly cap is refused");
    assert(harness.fake.requests.length === 0,
      "a refused turn never reaches the provider endpoint");
  } finally {
    await harness.close();
  }
}

async function verifyCrossBusinessIsolation(): Promise<void> {
  const persistence = new InMemoryReceptionistPersistence();
  const fake = await startFakeOpenAi();
  try {
    fake.setMode("success");
    const service = new DurableReceptionistConversationService(
      [businessA(), businessB()],
      {
        persistence,
        transport: openAiTransport(fake.origin),
        now: () => FRIDAY,
        monthlyBudgetMicrosByBusiness: { [BUSINESS_A]: 1_000_000, [BUSINESS_B]: 1_000_000 },
        usageProviderIdentifier: FIXTURE_PRICING.providerIdentifier,
        pricing: FIXTURE_PRICING,
      },
    );
    const conversationA = `conversation-${randomBytes(6).toString("hex")}`;
    const handleA = await service.begin(BUSINESS_A, conversationA);
    assert(handleA !== null, "business A's conversation is created");
    const outcome = await service.submit({
      businessId: BUSINESS_A,
      conversationId: conversationA,
      businessProfileVersion: fictionalBusinessProfile.version,
      message: HOURS_QUESTION,
      turnId: nextTurnId(),
    });
    assert(outcome.status === "ok", "business A's turn succeeds");

    const body = fake.requests[0]?.body ?? "";
    assert(body.includes(BUSINESS_A), "the request names the authenticated business");
    assert(!body.includes(BUSINESS_B), "the request never names another business");
    assert(!body.includes("Second Fictional Services"),
      "another business's business identity never reaches the provider");

    // A conversation belonging to B cannot be driven with A's identity.
    const crossBusiness = await service.submit({
      businessId: BUSINESS_B,
      conversationId: conversationA,
      businessProfileVersion: fictionalBusinessProfile.version,
      message: HOURS_QUESTION,
      turnId: nextTurnId(),
    });
    assert(crossBusiness.status === "conversation-unavailable",
      "a conversation outside the requested business is refused");
    assert(fake.requests.length === 1, "the refused cross-business turn reaches no provider");
  } finally {
    await fake.close();
  }
}

async function verifyCredentialConfinement(): Promise<void> {
  const harness = await createHarness({ useDurable: true });
  try {
    harness.fake.setMode("success");
    const outcome = await submit(harness, HOURS_QUESTION);
    assert(outcome.status === "ok", "the credential-confinement turn succeeds");
    const serialized = JSON.stringify(outcome);
    assert(!serialized.includes(CREDENTIAL), "the credential never appears in a turn outcome");

    const received = harness.fake.requests[0];
    assert(received.body.includes(HOURS_QUESTION), "the request body carries the conversation");
    assert(!received.body.includes(CREDENTIAL), "the credential is confined to the authorization header");

    const failureHarness = await createHarness({ useDurable: true });
    try {
      failureHarness.fake.setMode("http-500");
      const failure = await submit(failureHarness, HOURS_QUESTION);
      assert(failure.status === "provider-failure", "a provider failure is sanitized");
      assert(!JSON.stringify(failure).includes(CREDENTIAL),
        "a sanitized provider failure never contains the credential");
      assert(!JSON.stringify(failure).includes("sk-"), "a sanitized failure never echoes a key-shaped string");
    } finally {
      await failureHarness.close();
    }
  } finally {
    await harness.close();
  }
}

async function verifyResponseShapeRefusals(): Promise<void> {
  const schema = prepareCase().rendered.schema;
  const cases: ReadonlyArray<{ readonly label: string; readonly body: string; readonly failure: string }> = [
    {
      label: "a duplicate member name",
      body: '{"status":"completed","status":"in_progress","output":[]}',
      failure: "EnvelopeDuplicateField",
    },
    {
      label: "a function call",
      body: JSON.stringify({
        status: "completed",
        output: [{ type: "function_call", name: "run_sql" }],
      }),
      failure: "UnexpectedToolOutput",
    },
    {
      label: "an unknown output item",
      body: JSON.stringify({
        status: "completed",
        output: [{ type: "output_audio", audio: "…" }],
      }),
      failure: "UnexpectedOutputItem",
    },
    {
      label: "a non-terminal status",
      body: JSON.stringify({ status: "in_progress", output: [] }),
      failure: "NonTerminalStatus",
    },
    {
      label: "two text parts",
      body: JSON.stringify({
        status: "completed",
        output: [
          { type: "message", content: [{ type: "output_text", text: "{}" }] },
          { type: "message", content: [{ type: "output_text", text: "{}" }] },
        ],
      }),
      failure: "OutputTextAmbiguous",
    },
    {
      label: "no text at all",
      body: JSON.stringify({ status: "completed", output: [] }),
      failure: "MissingOutputText",
    },
    {
      label: "a provider-reported failure",
      body: JSON.stringify({ status: "failed", error: { code: "server_error" }, output: [] }),
      failure: "ProviderReportedFailure",
    },
    {
      label: "an unknown status",
      body: JSON.stringify({ status: "teleported", output: [] }),
      failure: "EnvelopeUnexpectedShape",
    },
  ];
  for (const entry of cases) {
    const parsed = parseOpenAiResponsesResponse(entry.body);
    assert(parsed.status === "failed" && parsed.failure === entry.failure,
      `${entry.label} is refused as ${entry.failure}`);
  }

  const unreadable = parseOpenAiResponsesResponse("{not json");
  assert(unreadable.status === "unreadable", "an unreadable envelope is refused");

  // A well-formed envelope whose text violates the contract schema is refused by
  // the transport before the application ever sees a proposal.
  const fake = await startFakeOpenAi();
  try {
    fake.setMode("schema-violation");
    const transport = openAiTransport(fake.origin);
    const result = await transport({
      instructions: "instructions",
      input: "input",
      schema,
      attemptId: "attempt-schema-1",
      timeoutMs: 2_000,
      signal: null,
    });
    assert(result.status === "failed", "an output that violates the schema is refused");
    assert(result.error?.category === "provider-failure",
      "the schema refusal is reported as a provider failure");
  } finally {
    await fake.close();
  }

  const oversized = await startFakeOpenAi();
  try {
    oversized.setMode("oversized");
    const transport = createOpenAiResponsesTransport({
      baseUrl: oversized.origin,
      allowInsecureLoopback: true,
      credentialReference: () => CREDENTIAL,
      model: MODEL,
      maxResponseBytes: 2_048,
      timeoutMs: 2_000,
    });
    const result = await transport({
      instructions: "instructions",
      input: "input",
      schema,
      attemptId: "attempt-oversized-1",
      timeoutMs: 2_000,
      signal: null,
    });
    assert(result.status === "failed", "an oversized response is refused");
  } finally {
    await oversized.close();
  }

  const redirecting = await startFakeOpenAi();
  try {
    redirecting.setMode("redirect");
    const transport = openAiTransport(redirecting.origin);
    const result = await transport({
      instructions: "instructions",
      input: "input",
      schema,
      attemptId: "attempt-redirect-1",
      timeoutMs: 2_000,
      signal: null,
    });
    assert(result.status === "failed", "a redirect is refused rather than followed");
  } finally {
    await redirecting.close();
  }
}

async function verifyConfigurationRefusals(): Promise<void> {
  const expectRefusal = (
    label: string,
    options: OpenAiResponsesTransportOptions,
  ): void => {
    let refused = false;
    try {
      createOpenAiResponsesTransport(options);
    } catch {
      refused = true;
    }
    assert(refused, `${label} is refused at construction`);
  };

  expectRefusal("a plaintext non-loopback endpoint", {
    baseUrl: "http://api.example.com",
    credentialReference: () => CREDENTIAL,
  });
  expectRefusal("an endpoint whose origin is not allowlisted", {
    baseUrl: "http://127.0.0.1:9",
    allowInsecureLoopback: true,
    allowedOrigins: ["https://api.openai.com"],
  });
  expectRefusal("an origin list containing credentials", {
    baseUrl: "http://127.0.0.1:9",
    allowInsecureLoopback: true,
    allowedOrigins: ["http://user:pass@127.0.0.1"],
  });
  expectRefusal("an over-large response ceiling", {
    baseUrl: "http://127.0.0.1:9",
    allowInsecureLoopback: true,
    maxResponseBytes: 10_000_000,
  });
  expectRefusal("an over-long timeout ceiling", {
    baseUrl: "http://127.0.0.1:9",
    allowInsecureLoopback: true,
    timeoutMs: 600_000,
  });
  expectRefusal("an invalid model", {
    baseUrl: "http://127.0.0.1:9",
    allowInsecureLoopback: true,
    model: "../../etc/passwd",
  });
  expectRefusal("an out-of-range output budget", {
    baseUrl: "http://127.0.0.1:9",
    allowInsecureLoopback: true,
    maxOutputTokens: 100_000,
  });
  expectRefusal("a non-function credential reference", {
    baseUrl: "http://127.0.0.1:9",
    allowInsecureLoopback: true,
    credentialReference: "sk-nope" as unknown as () => string,
  });

  // The default origin is the public API origin, and the endpoint path cannot be
  // redirected elsewhere.
  const publicOrigin = createOpenAiResponsesTransport({
    baseUrl: "https://api.openai.com",
    credentialReference: () => CREDENTIAL,
  });
  assert(typeof publicOrigin === "function", "the default configuration targets the public origin");
  let pathRefused = false;
  try {
    // A base URL with a path would move the endpoint away from /v1/responses.
    createOpenAiResponsesTransport({
      baseUrl: "https://api.openai.com/v1/chat/completions",
      credentialReference: () => CREDENTIAL,
    });
  } catch {
    pathRefused = true;
  }
  assert(pathRefused, "a base URL that changes the endpoint path is refused");
}

async function verifyNoExternalNetworkOrActivation(): Promise<void> {
  assert(PILOT_PROVIDER_NETWORK_MODE === "disabled",
    "provider network execution remains disabled in pilot configuration");

  const adapterSource = readFileSync(
    join(process.cwd(), "src/ai/providers/openai-responses-adapter.ts"),
    "utf8",
  );
  assert(!/from\s+"openai"/.test(adapterSource), "the adapter carries no provider SDK");
  assert(!/process\.env/.test(adapterSource), "the adapter reads no environment variable");
  assert(!/console\.(log|info|warn|error)/.test(adapterSource), "the adapter logs nothing");

  const compositionFiles = [
    "src/server/pilot/pilot-runtime-provider.ts",
    "src/server/pilot/pilot-runtime.ts",
    "src/server/pilot/pilot-runtime-configuration.ts",
    "src/server/http/receptionist-turn-handler.ts",
    "app/api/receptionist/turn/route.ts",
  ];
  for (const file of compositionFiles) {
    const source = readFileSync(join(process.cwd(), file), "utf8");
    assert(!/openai-responses-adapter/.test(source),
      `${file} does not reference the OpenAI adapter`);
  }

  const clientFiles = listFiles("src/prototype-ui").concat(listFiles("components"));
  for (const file of clientFiles) {
    const source = readFileSync(join(process.cwd(), file), "utf8");
    assert(!/openai-responses-adapter/.test(source),
      `${file} does not import the OpenAI adapter`);
  }

  assert(resolveProviderPricing("openai", MODEL) === null,
    "this model is not yet on the price allowlist, because no rate has been verified");

  // With the real allowlist (no entry for this model) the turn must fail closed
  // before the transport is reached, so an unverified price can never permit a
  // paid call.
  let transportCalls = 0;
  const persistence = new InMemoryReceptionistPersistence();
  const conversationId = `conversation-${randomBytes(6).toString("hex")}`;
  const durable = new DurableReceptionistConversationService(
    [businessA()],
    {
      persistence,
      transport: async () => {
        transportCalls += 1;
        return { status: "completed", rawOutput: "{}" };
      },
      now: () => FRIDAY,
      monthlyBudgetMicrosByBusiness: { [BUSINESS_A]: 1_000_000 },
      usageProviderIdentifier: "openai",
    },
  );
  const handle = await durable.begin(BUSINESS_A, conversationId);
  assert(handle !== null, "an unpriced provider conversation still opens");
  if (handle !== null) {
    const outcome = await durable.submit({
      businessId: BUSINESS_A,
      conversationId,
      businessProfileVersion: fictionalBusinessProfile.version,
      message: HOURS_QUESTION,
      turnId: nextTurnId(),
    });
    assert(outcome.status === "internal-failure",
      "an unpriced provider fails closed instead of running outside the budget guard");
    assert(transportCalls === 0, "no provider work occurs without an allowlisted price");
  }
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

type FakeMode =
  | "success"
  | "invalid-json"
  | "missing-usage"
  | "refusal"
  | "truncated"
  | "slow"
  | "schema-violation"
  | "oversized"
  | "redirect"
  | "http-500";

interface CapturedRequest {
  readonly path: string;
  readonly authorization: string | null;
  readonly contentType: string | null;
  readonly body: string;
}

interface FakeOpenAi {
  readonly origin: string;
  readonly requests: readonly CapturedRequest[];
  setMode(mode: FakeMode): void;
  setUsage(inputUnits: number, outputUnits: number): void;
  /** The usage the fake reported, as the runtime would surface it. */
  reportedUsage(): { inputTokens: number; outputTokens: number } | null;
  close(): Promise<void>;
}

interface Harness {
  readonly persistence: InMemoryReceptionistPersistence;
  readonly service: DurableReceptionistConversationService;
  readonly fake: FakeOpenAi;
  readonly scope: { businessProfileId: string; businessProfileVersion: number; conversationId: string };
  lastTurnId: string;
  close(): Promise<void>;
}

async function createHarness(options: {
  readonly useDurable: true;
  readonly budgetMicros?: number;
  readonly timeoutMs?: number;
}): Promise<Harness> {
  const persistence = new InMemoryReceptionistPersistence();
  const fake = await startFakeOpenAi();
  const conversationId = `conversation-${randomBytes(8).toString("hex")}`;
  const service = new DurableReceptionistConversationService(
    [businessA()],
    {
      persistence,
      transport: openAiTransport(fake.origin, options.timeoutMs),
      now: () => FRIDAY,
      monthlyBudgetMicrosByBusiness: {
        [BUSINESS_A]: options.budgetMicros ?? 1_000_000,
      },
      usageProviderIdentifier: FIXTURE_PRICING.providerIdentifier,
      pricing: FIXTURE_PRICING,
      // The runtime supplies reported usage from the provider result; here the
      // fake is the source of the numbers the provider reported.
      reportedUsage: () => fake.reportedUsage(),
    },
  );
  const handle = await service.begin(BUSINESS_A, conversationId);
  assert(handle !== null, "the conversation is created");
  return {
    persistence,
    service,
    fake,
    scope: {
      businessProfileId: BUSINESS_A,
      businessProfileVersion: fictionalBusinessProfile.version,
      conversationId,
    },
    lastTurnId: "",
    close: () => fake.close(),
  };
}

async function submit(
  harness: Harness,
  message: string,
  turnId = nextTurnId(),
): Promise<Awaited<ReturnType<DurableReceptionistConversationService["submit"]>>> {
  harness.lastTurnId = turnId;
  return harness.service.submit({
    businessId: BUSINESS_A,
    conversationId: harness.scope.conversationId,
    businessProfileVersion: fictionalBusinessProfile.version,
    message,
    turnId,
  });
}

function openAiTransport(origin: string, timeoutMs = 2_000) {
  return createOpenAiResponsesTransport({
    baseUrl: origin,
    allowInsecureLoopback: true,
    credentialReference: () => CREDENTIAL,
    model: MODEL,
    maxOutputTokens: 512,
    timeoutMs,
  });
}

async function startFakeOpenAi(): Promise<FakeOpenAi> {
  const requests: CapturedRequest[] = [];
  let mode: FakeMode = "success";
  let usage: { readonly inputUnits: number; readonly outputUnits: number } | null = {
    inputUnits: REPORTED_INPUT_TOKENS,
    outputUnits: REPORTED_OUTPUT_TOKENS,
  };
  // Whether the most recent response actually carried usage, which is what the
  // runtime would report to the settlement step.
  let usageInLastResponse = true;

  const server: Server = createServer((request, response) => {
    void (async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks).toString("utf8");
      const path = (request.url ?? "/").split("?")[0];
      requests.push({
        path,
        authorization: typeof request.headers.authorization === "string"
          ? request.headers.authorization
          : null,
        contentType: typeof request.headers["content-type"] === "string"
          ? request.headers["content-type"]
          : null,
        body,
      });

      if (path !== OPENAI_RESPONSES_PATH) {
        sendJson(response, 404, { error: { message: "unknown path" } });
        return;
      }

      switch (mode) {
        case "redirect":
          response.writeHead(307, { location: "/v1/responses" });
          response.end();
          return;
        case "http-500":
          sendJson(response, 500, { error: { message: "synthetic provider failure" } });
          return;
        case "slow":
          await new Promise((resolve) => setTimeout(resolve, 1_500));
          sendJson(response, 200, completedEnvelope(body, usage));
          return;
        case "oversized":
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify({ status: "completed", padding: "x".repeat(8_192) }));
          return;
        case "invalid-json":
          sendJson(response, 200, completedEnvelopeWithText(body, '{"customerFacingText":', usage));
          return;
        case "missing-usage":
          usageInLastResponse = false;
          sendJson(response, 200, completedEnvelope(body, null));
          return;
        case "refusal":
          sendJson(response, 200, {
            id: "resp_verify_refusal",
            object: "response",
            status: "completed",
            output: [{
              type: "message",
              role: "assistant",
              content: [{ type: "refusal", refusal: "I can't help with that." }],
            }],
            usage: usage === null ? undefined : { input_tokens: usage.inputUnits, output_tokens: usage.outputUnits },
          });
          return;
        case "truncated":
          sendJson(response, 200, truncatedEnvelope());
          return;
        case "schema-violation":
          sendJson(response, 200, completedEnvelopeWithText(
            body,
            JSON.stringify({ ...identityFrom(body), proposalType: "knowledge_grounded_answer", unexpectedField: true }),
            usage,
          ));
          return;
        case "success":
        default:
          usageInLastResponse = usage !== null;
          sendJson(response, 200, completedEnvelope(body, usage));
          return;
      }
    })().catch(() => {
      try {
        sendJson(response, 500, { error: { message: "fake failure" } });
      } catch {
        // The socket may already be closed.
      }
    });
  });

  const origin = await listen(server);
  return {
    origin,
    requests,
    setMode: (next: FakeMode) => {
      mode = next;
    },
    setUsage: (inputUnits: number, outputUnits: number) => {
      usage = { inputUnits, outputUnits };
    },
    reportedUsage: () => (usage === null || !usageInLastResponse
      ? null
      : { inputTokens: usage.inputUnits, outputTokens: usage.outputUnits }),
    close: () => closeServer(server),
  };
}

function identityFrom(input: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(input) as { identity?: Record<string, unknown> };
    return parsed.identity ?? {};
  } catch {
    return {};
  }
}

function completedEnvelope(body: string, usage: { readonly inputUnits: number; readonly outputUnits: number } | null) {
  const identity = identityFrom(String((JSON.parse(body) as Record<string, unknown>).input ?? ""));
  const proposal = {
    ...identity,
    proposalType: "knowledge_grounded_answer",
    customerFacingText: "Friendly Home Services is open today from 8:00 AM to 5:00 PM.",
    knowledgeSourceReferences: ["regular-hours"],
    insufficientKnowledge: false,
  };
  return completedEnvelopeWithText(body, JSON.stringify(proposal), usage);
}

function completedEnvelopeWithText(
  _body: string,
  text: string,
  usage: { readonly inputUnits: number; readonly outputUnits: number } | null,
) {
  return {
    id: "resp_verify_synthetic",
    object: "response",
    created_at: 1_761_900_000,
    status: "completed",
    model: MODEL,
    output: [{
      id: "msg_verify_synthetic",
      type: "message",
      role: "assistant",
      status: "completed",
      content: [{ type: "output_text", text, annotations: [] }],
    }],
    usage: usage === null
      ? undefined
      : {
          input_tokens: usage.inputUnits,
          output_tokens: usage.outputUnits,
          total_tokens: usage.inputUnits + usage.outputUnits,
        },
  };
}

function truncatedEnvelope() {
  return {
    id: "resp_verify_truncated",
    object: "response",
    status: "incomplete",
    model: MODEL,
    incomplete_details: { reason: "max_output_tokens" },
    output: [{
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text: "{\"customerFacingText\":\"Friendly Home" }],
    }],
    usage: { input_tokens: 100, output_tokens: 512, total_tokens: 612 },
  };
}

function sendJson(response: import("node:http").ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

function listen(server: Server): Promise<string> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
}

function listFiles(directory: string): string[] {
  const results: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(join(process.cwd(), current), { withFileTypes: true })) {
      const next = `${current}/${entry.name}`;
      if (entry.isDirectory()) walk(next);
      else if (/\.(ts|tsx)$/.test(entry.name)) results.push(next);
    }
  };
  walk(directory);
  return results;
}

function prepareCase() {
  const taskResult = new TaskRegistry().resolve("knowledge_grounded_answer", 1);
  assert(taskResult.status === "success", "the knowledge task resolves");
  if (taskResult.status !== "success") throw new Error("unreachable");
  const task = taskResult.value;
  const contractResult = new OutputContractRegistry().resolve(task.compatibleOutputContract, 1);
  assert(contractResult.status === "success", "the knowledge contract resolves");
  if (contractResult.status !== "success") throw new Error("unreachable");
  const contract = contractResult.value;

  const conversationId = "fictional-conversation-openai-001";
  const state = { ...initializedConversationState, conversationId };
  const identity: AiOperationIdentity = {
    requestId: "verify-request-openai",
    traceId: "verify-trace-openai",
    businessId: fictionalBusinessProfile.id,
    conversationId,
    profileVersion: fictionalBusinessProfile.version,
    stateRevision: state.revision,
    taskIdentifier: task.identifier,
    taskVersion: task.version,
  };
  const hours = resolveBusinessHours({ profile: fictionalBusinessProfile, nowMs: FRIDAY });
  const contextResult = new PrototypeContextPackageBuilder().build({
    identity,
    contextPackageId: "verify-context-openai",
    businessIdentity: {
      id: fictionalBusinessProfile.id,
      displayName: fictionalBusinessProfile.businessName,
    },
    businessProfile: fictionalBusinessProfile,
    conversationState: state,
    task,
    knowledge: fictionalKnowledgeRecords,
    businessHours: hours,
    conversationEntries: [],
    currentCustomerInput: {
      messageId: "verify-message-openai",
      conversationId,
      source: "customer",
      sequence: 1,
      content: HOURS_QUESTION,
    },
    policyVersions: AI_POLICY_VERSIONS,
  });
  assert(contextResult.status === "success", "the context package builds");
  if (contextResult.status !== "success") throw new Error("unreachable");

  const promptResult = new PrototypePromptPackageComposer().compose({
    promptPackageId: "verify-prompt-openai",
    task,
    contextPackage: contextResult.value,
    outputContract: contract,
    policyVersions: AI_POLICY_VERSIONS,
  });
  assert(promptResult.status === "success", "the prompt package composes");
  if (promptResult.status !== "success") throw new Error("unreachable");

  const rendered = renderProviderInstructions({
    promptPackage: promptResult.value,
    task,
    outputContract: contract,
    contextPackage: contextResult.value,
  });
  assert(rendered.status === "success", "the provider instructions render");
  if (rendered.status !== "success") throw new Error("unreachable");

  const request: OfflineTransportRequest = {
    instructions: rendered.value.instructions,
    input: rendered.value.input,
    schema: rendered.value.schema,
    attemptId: "attempt-openai-1",
    timeoutMs: 2_000,
    signal: null,
  };
  return { rendered: rendered.value, request };
}

function businessA(): ReceptionistBusiness {
  return { profile: fictionalBusinessProfile, knowledge: fictionalKnowledgeRecords };
}

function businessB(): ReceptionistBusiness {
  const profile: BusinessProfile = {
    ...fictionalBusinessProfile,
    id: BUSINESS_B,
    businessName: "Second Fictional Services",
    services: fictionalBusinessProfile.services.map((service) => ({ ...service })),
    intakeRequirements: fictionalBusinessProfile.intakeRequirements.map((field) => ({ ...field })),
    hours: {
      timeZone: fictionalBusinessProfile.hours.timeZone,
      weeklySchedule: { ...fictionalBusinessProfile.hours.weeklySchedule },
    },
    serviceArea: [...fictionalBusinessProfile.serviceArea],
    policies: [...fictionalBusinessProfile.policies],
    escalation: {
      destination: fictionalBusinessProfile.escalation.destination,
      conditions: [...fictionalBusinessProfile.escalation.conditions],
    },
  };
  const knowledge: readonly KnowledgeRecord[] = [{
    ...fictionalKnowledgeRecords[1],
    id: "second-business-hours",
    businessProfileId: BUSINESS_B,
    content: "Second Fictional Services is available Monday-Friday, 9:00 AM-1:00 PM Eastern Time.",
  }];
  return { profile, knowledge };
}

function nextTurnId(): string {
  return `turn-${randomBytes(12).toString("hex")}`;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Stage B2.4B.2A OpenAI adapter verification failed: ${message}.`);
  }
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "OpenAI adapter verification failed.");
  process.exitCode = 1;
});
