import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { OPENAI_RESPONSES_PATH } from "../ai/providers/openai-responses-adapter";
import { fictionalBusinessProfile } from "../fixtures/business-profile";
import { fictionalKnowledgeRecords } from "../fixtures/knowledge";
import {
  actualCostMicros,
  estimateTurnCost,
  resolveProviderPricing,
  type ProviderModelPricing,
} from "../server/billing/provider-pricing";
import { DurableReceptionistConversationService } from "../server/conversation/durable-receptionist-conversation-service";
import type { ReceptionistBusiness } from "../server/conversation/receptionist-conversation-service";
import { InMemoryReceptionistPersistence } from "../server/persistence/in-memory-receptionist-persistence";
import {
  createPilotProviderActivation,
  describeProviderActivation,
  LIVE_PROVIDER_AUTHORIZED,
  LOOPBACK_VERIFICATION_PROVIDER_DESCRIPTOR,
  PILOT_PROVIDER_CREDENTIAL_VARIABLE,
} from "../server/pilot/pilot-provider-activation";
import { PILOT_RECOMMENDED_MODEL } from "../server/pilot/pilot-provider-configuration";
import {
  createPilotReceptionistRuntime,
  type PilotReceptionistRuntime,
} from "../server/pilot/pilot-runtime";

/**
 * Stage B2.4B.2C verification: controlled provider activation, offline only.
 *
 * The real OpenAI Responses adapter is driven against a loopback fake endpoint,
 * reached through the same activation gate the pilot runtime uses, so the
 * reservation, settlement, grounding and replay behavior is proven for the
 * provider that will eventually be live.
 *
 * No external request is possible: the fake binds 127.0.0.1 on an ephemeral
 * port, and the activation gate refuses any non-loopback endpoint. No real key
 * exists here; the credential is synthetic and never printed.
 */

const BUSINESS_A = fictionalBusinessProfile.id;
const BUSINESS_B = "second-fictional-business";
const WIDGET_A = "widget-b24b2c-alpha";
const WIDGET_B = "widget-b24b2c-beta";
const APP_ORIGIN = "https://fictional.example";
const SECOND_ORIGIN = "https://second.fictional.example";
const PILOT_DATABASE_REFERENCE = "AI_RECEPTIONIST_PILOT_DATABASE_URL";
const OPERATOR_CREDENTIAL = "b24b2c-operator-credential-not-a-provider-key";
/** Clearly synthetic: refused nowhere, but it is not and never was a real key. */
const SYNTHETIC_CREDENTIAL = "sk-verify-synthetic-b24b2c-not-a-real-key-000000";
const HOURS_QUESTION = "What time do you close today?";
const JANUARY = Date.UTC(2026, 0, 15, 12, 0, 0);

const CHECKS: string[] = [];

async function run(): Promise<void> {
  verifyDefaultDisabled();
  verifyLiveNeverAuthorized();
  await verifyLoopbackOnly();
  verifyCredentialHandling();
  await verifyOfflineAcceptanceThroughPilotRuntime();
  await verifyNegativeResponses();
  await verifyCancellation();
  await verifyReplayDoesNotReachProviderTwice();
  await verifyBudgetRefusalPrecedesProvider();
  await verifyConcurrentUsageAttribution();
  verifyNoClientModeSelection();
  verifyNoSecretsInSource();

  console.log(
    `Stage B2.4B.2C provider activation verification passed: ${CHECKS.length} check groups, `
    + "default-disabled activation, live authorization refused, loopback-only endpoint "
    + "enforcement, credential containment, an offline grounded hours answer through the "
    + "pilot runtime, strict-schema and refusal and timeout and cancellation and "
    + "missing-usage behavior, replay without a second provider call, budget refusal "
    + "before the provider, per-business usage attribution under concurrency, no "
    + "client-selectable mode, and no key material in source. Loopback fake only.",
  );
}

// ---------------------------------------------------------------------------
// Activation states
// ---------------------------------------------------------------------------

function verifyDefaultDisabled(): void {
  const omitted = createPilotProviderActivation(undefined);
  assert(omitted.status === "activated", "an omitted activation resolves to disabled");
  if (omitted.status !== "activated") return;
  assert(omitted.value.mode === "disabled", "the default mode is disabled");
  assert(omitted.value.transport === undefined,
    "disabled supplies no transport, so the offline simulator serves turns");
  assert(omitted.value.provider.networkAccessed === false,
    "disabled reports that no network is accessed");
  assert(omitted.value.usageProviderIdentifier === "simulated-offline-model-transport/v1",
    "disabled keeps the offline provider identity");
  assert(omitted.value.pricing === null, "disabled carries no priced provider");

  const explicit = createPilotProviderActivation({ mode: "disabled" });
  assert(explicit.status === "activated", "an explicit disabled activation is accepted");
  if (explicit.status === "activated") {
    assert(explicit.value.mode === "disabled", "an explicit disabled stays disabled");
  }

  const described = describeProviderActivation(omitted);
  assert(described.mode === "disabled" && described.networkAccessed === false,
    "the operator summary reports disabled and no network");
  assert(described.credentialConfigured === false,
    "the operator summary reports no credential for disabled");

  assertRejected(createPilotProviderActivation({ mode: "enabled" }),
    "UnknownMode", "an unknown mode is refused");
  assertRejected(createPilotProviderActivation({ mode: "" }),
    "UnknownMode", "an empty mode is refused");
  assertRejected(createPilotProviderActivation({ mode: "disabled", extra: true }),
    "UnknownField", "an unknown field is refused");
  assertRejected(createPilotProviderActivation("disabled"),
    "InvalidInput", "a non-record activation is refused");

  CHECKS.push("default-disabled");
}

function verifyLiveNeverAuthorized(): void {
  assert(LIVE_PROVIDER_AUTHORIZED === false,
    "live activation is not authorized in this stage");

  // Even a perfectly specified live activation is refused, because the state is
  // gated on a compile-time constant rather than on anything configurable.
  assertRejected(
    createPilotProviderActivation({
      mode: "live",
      baseUrl: "https://api.openai.com",
      model: PILOT_RECOMMENDED_MODEL,
      credential: () => SYNTHETIC_CREDENTIAL,
    }),
    "LiveNotAuthorized",
    "live activation is refused even when fully specified",
  );
  assertRejected(createPilotProviderActivation({ mode: "live" }),
    "LiveNotAuthorized", "bare live activation is refused");

  CHECKS.push("live-refused");
}

async function verifyLoopbackOnly(): Promise<void> {
  const fake = await startFakeOpenAi();
  try {
    // The production endpoint must be refused as an offline-verification target,
    // so this mode can never become an accidental production call.
    assertRejected(
      createPilotProviderActivation({
        mode: "offline-verification",
        baseUrl: "https://api.openai.com",
        credential: () => SYNTHETIC_CREDENTIAL,
      }),
      "LoopbackRequired",
      "the production OpenAI origin is refused for offline verification",
    );
    assertRejected(
      createPilotProviderActivation({
        mode: "offline-verification",
        baseUrl: "https://example.com",
        credential: () => SYNTHETIC_CREDENTIAL,
      }),
      "LoopbackRequired",
      "a routable host is refused",
    );
    assertRejected(
      createPilotProviderActivation({
        mode: "offline-verification",
        baseUrl: "http://10.0.0.5:8080",
        credential: () => SYNTHETIC_CREDENTIAL,
      }),
      "LoopbackRequired",
      "a private-network host is refused",
    );
    assertRejected(
      createPilotProviderActivation({
        mode: "offline-verification",
        baseUrl: `${fake.origin}/v1`,
        credential: () => SYNTHETIC_CREDENTIAL,
      }),
      "LoopbackRequired",
      "a loopback URL with a path is refused",
    );

    const accepted = createPilotProviderActivation({
      mode: "offline-verification",
      baseUrl: fake.origin,
      credential: () => SYNTHETIC_CREDENTIAL,
    });
    assert(accepted.status === "activated", "a loopback endpoint is accepted");
    if (accepted.status !== "activated") return;
    assert(accepted.value.mode === "offline-verification", "the mode is reported truthfully");
    assert(accepted.value.transport !== undefined, "a transport is supplied");
    assert(accepted.value.provider.identifier
      === LOOPBACK_VERIFICATION_PROVIDER_DESCRIPTOR.identifier,
      "the provider descriptor names the real adapter");
    assert(accepted.value.provider.networkAccessed === false,
      "a loopback verification run reports that no network was accessed");
    assert(accepted.value.provenance.loopbackOnly === true, "the activation is loopback-only");
    assert(accepted.value.provenance.liveAuthorized === false,
      "the activation states that live is not authorized");
    assert(accepted.value.pricing !== null, "the priced identity is resolved");
    assert(typeof accepted.value.transport === "function",
      "a callable transport is supplied");
    // No request is issued here: the adapter is exercised end to end through a
    // real turn in the acceptance check below, which is the only composition
    // that can produce a valid rendered schema.
    assert(fake.requestCount() === 0,
      "creating an activation performs no provider work");
  } finally {
    await fake.close();
  }

  CHECKS.push("loopback-only");
}

function verifyCredentialHandling(): void {
  assert(PILOT_PROVIDER_CREDENTIAL_VARIABLE === "AI_RECEPTIONIST_OPENAI_API_KEY",
    "the dedicated credential variable is named once");

  assertRejected(
    createPilotProviderActivation({ mode: "offline-verification" }),
    "LoopbackRequired",
    "a missing endpoint is refused before the credential is considered",
  );

  const loopback = "http://127.0.0.1:1";
  assertRejected(
    createPilotProviderActivation({ mode: "offline-verification", baseUrl: loopback }),
    "CredentialUnavailable",
    "a missing credential is refused at activation, not at call time",
  );
  assertRejected(
    createPilotProviderActivation({
      mode: "offline-verification",
      baseUrl: loopback,
      credential: () => null,
    }),
    "CredentialInvalid",
    "a null credential is refused",
  );
  assertRejected(
    createPilotProviderActivation({
      mode: "offline-verification",
      baseUrl: loopback,
      credential: () => "   ",
    }),
    "CredentialInvalid",
    "a whitespace credential is refused",
  );
  assertRejected(
    createPilotProviderActivation({
      mode: "offline-verification",
      baseUrl: loopback,
      credential: () => "sk-synthetic\nsk-synthetic",
    }),
    "CredentialInvalid",
    "a multi-line pasted credential is refused",
  );

  const accepted = createPilotProviderActivation({
    mode: "offline-verification",
    baseUrl: loopback,
    credential: () => SYNTHETIC_CREDENTIAL,
  });
  assert(accepted.status === "activated", "a well-formed credential is accepted");
  if (accepted.status === "activated") {
    const serialized = JSON.stringify(accepted.value);
    assert(!serialized.includes(SYNTHETIC_CREDENTIAL),
      "the activation result never carries the credential value");
    assert(!serialized.toLowerCase().includes("authorization"),
      "the activation result carries no authorization header");
    assert(accepted.value.provenance.credentialValueRetained === false,
      "the activation states that no credential value is retained");
    assert(accepted.value.credentialVariable === PILOT_PROVIDER_CREDENTIAL_VARIABLE,
      "only the variable name is exposed");
  }

  CHECKS.push("credential-handling");
}

// ---------------------------------------------------------------------------
// Offline acceptance through the composed pilot runtime
// ---------------------------------------------------------------------------

async function verifyOfflineAcceptanceThroughPilotRuntime(): Promise<void> {  const fake = await startFakeOpenAi();
  try {
    const { runtime, persistence } = buildPilotRuntime(fake.origin);
    assert(runtime.providerActivation.mode === "offline-verification",
      "the runtime reports the offline-verification mode");
    assert(runtime.provider.networkAccessed === false,
      "the runtime reports that no network is accessed");

    const session = await runtime.issueCustomerSession({
      widgetId: WIDGET_A,
      origin: APP_ORIGIN,
    });
    assert(session.status === "issued", "a customer session is issued through the configured widget");
    if (session.status !== "issued") return;

    const turnId = `turn-${randomBytes(12).toString("hex")}`;
    const outcome = await runtime.conversations.submit({
      businessId: BUSINESS_A,
      conversationId: session.session.principal.conversationId,
      businessProfileVersion: fictionalBusinessProfile.version,
      message: HOURS_QUESTION,
      turnId,
    });
    assert(outcome.status === "ok", "the hours turn is served");
    if (outcome.status !== "ok") return;
    assert(outcome.decision === "answered",
      "the business-information question produces the answered decision");

    const released = outcome.messages
      .filter((entry) => entry.role === "assistant")
      .map((entry) => entry.text)
      .join(" ");
    assert(released.length > 0, "the customer receives a reply");
    assertGroundedInApprovedHours(released, "the released answer");

    assert(fake.requestCount() === 1, "exactly one provider request was made");
    assert(fake.requests[0]?.path === OPENAI_RESPONSES_PATH,
      "the request used the Responses endpoint");
    assert(fake.requests[0]?.authorization === `Bearer ${SYNTHETIC_CREDENTIAL}`,
      "the synthetic credential is sent only as the bearer header");

    // The request carries the application's rendered instructions and input, and
    // no credential or API key appears anywhere in it.
    const body = String(fake.requests[0]?.body);
    assert(!body.includes(SYNTHETIC_CREDENTIAL), "the request body carries no credential");
    assert(body.includes("knowledge_grounded_answer") || body.includes("identity"),
      "the request carries the application-owned prompt envelope");

    // Usage is recorded against this conversation and the reservation settles.
    const month = utcMonth(JANUARY);
    const usage = await persistence.monthlyUsageMicros(BUSINESS_A, month);
    assert(usage !== null, "usage is recorded for the business");
    if (usage !== null) {
      const expected = actualCostMicros(
        PRICING(),
        USAGE_A.inputUnits,
        USAGE_A.outputUnits,
      );
      assert(expected !== null, "the reported usage is priceable");
      assert(usage.reservedMicros === 0, "the reservation settled into a charge");
      assert(usage.settledMicros === expected,
        `the turn settled its reported usage (${usage.settledMicros} vs ${expected})`);
      assert(usage.settledMicros > 0, "a priced provider records a real charge");
    }

    // The receipt names the answered outcome and stays free of conversation text.
    const receipt = await persistence.loadTurnReceipt(
      {
        businessProfileId: BUSINESS_A,
        businessProfileVersion: fictionalBusinessProfile.version,
        conversationId: session.session.principal.conversationId,
      },
      turnId,
    );
    assert(receipt.status === "found", "the turn receipt is durable");
    if (receipt.status === "found") {
      assert(receipt.receipt.outcomeCode === "answered",
        "the receipt records the answered outcome");
      const { messages, ...metadata } = receipt.receipt;
      const serialized = JSON.stringify(metadata);
      assert(!serialized.includes("5:00 PM"), "the receipt metadata holds no answer text");
      assert(!serialized.includes(SYNTHETIC_CREDENTIAL), "the receipt holds no credential");
      assert(messages.length > 0, "the receipt still resolves its replayed messages");
    }
  } finally {
    await fake.close();
  }

  CHECKS.push("offline-acceptance");
}

async function verifyNegativeResponses(): Promise<void> {
  const cases: readonly {
    readonly mode: FakeMode;
    readonly description: string;
    readonly expectOk: boolean;
  }[] = [
    { mode: "malformed-json", description: "malformed JSON is refused", expectOk: false },
    { mode: "schema-violation", description: "a schema violation is refused", expectOk: false },
    { mode: "refusal", description: "a provider refusal fails the turn safely", expectOk: false },
    { mode: "http-500", description: "a provider error fails the turn safely", expectOk: false },
    { mode: "slow", description: "a provider timeout fails the turn safely", expectOk: false },
    { mode: "missing-usage", description: "a missing usage still answers", expectOk: true },
  ];

  for (const entry of cases) {
    const fake = await startFakeOpenAi();
    try {
      fake.setMode(entry.mode);
      const harness = await createDurableHarness(fake.origin, { timeoutMs: 1_000 });
      const turnId = `turn-${randomBytes(12).toString("hex")}`;
      const outcome = await harness.service.submit({
        businessId: BUSINESS_A,
        conversationId: harness.conversationId,
        businessProfileVersion: fictionalBusinessProfile.version,
        message: HOURS_QUESTION,
        turnId,
      });

      if (entry.expectOk) {
        assert(outcome.status === "ok", entry.description);
        const usage = await harness.persistence.monthlyUsageMicros(BUSINESS_A, "2026-01");
        assert(usage !== null, `${entry.description}: usage is recorded`);
        if (usage !== null) {
          const estimate = estimateTurnCost(PRICING());
          assert(estimate !== null, "the estimate is computable");
          if (estimate !== null) {
            assert(usage.settledMicros === estimate.estimatedCostMicros,
              `${entry.description}: the estimate settles when usage is absent`);
            assert(usage.settledMicros > 0,
              `${entry.description}: a missing usage never settles zero`);
          }
        }
      } else {
        assert(outcome.status !== "ok", entry.description);
        // No fabricated business hours may reach a customer through a failure.
        if (outcome.status === "ok") {
          throw new Error("unreachable");
        }
        const usage = await harness.persistence.monthlyUsageMicros(BUSINESS_A, "2026-01");
        assert(usage !== null && usage.settledMicros === 0,
          `${entry.description}: a failed turn charges nothing`);
      }
    } finally {
      await fake.close();
    }
  }

  CHECKS.push("negative-responses");
}

/**
 * Cancellation is enforced by the adapter itself, so it is exercised at the
 * transport boundary with a minimal but genuinely parseable rendered schema.
 */
async function verifyCancellation(): Promise<void> {
  const fake = await startFakeOpenAi();
  try {
    fake.setMode("slow");
    const activation = createPilotProviderActivation({
      mode: "offline-verification",
      baseUrl: fake.origin,
      credential: () => SYNTHETIC_CREDENTIAL,
      timeoutMs: 5_000,
    });
    assert(activation.status === "activated", "the cancellation activation is created");
    if (activation.status !== "activated" || !activation.value.transport) return;

    const controller = new AbortController();
    const pending = activation.value.transport({
      instructions: "Answer only from approved business hours.",
      input: JSON.stringify({ identity: { businessId: BUSINESS_A } }),
      schema: GROUNDED_ANSWER_SCHEMA,
      attemptId: "attempt-verify-cancellation",
      timeoutMs: 5_000,
      signal: controller.signal,
    });
    // Abort while the fake is still delaying its response.
    setTimeout(() => controller.abort(), 75);
    const response = await pending;
    assert(response.status === "cancelled",
      `an aborted attempt is reported as cancelled (received ${response.status})`);

    // A pre-aborted signal performs no work at all.
    const alreadyAborted = new AbortController();
    alreadyAborted.abort();
    const before = fake.requestCount();
    const immediate = await activation.value.transport({
      instructions: "Answer only from approved business hours.",
      input: JSON.stringify({ identity: { businessId: BUSINESS_A } }),
      schema: GROUNDED_ANSWER_SCHEMA,
      attemptId: "attempt-verify-pre-aborted",
      timeoutMs: 5_000,
      signal: alreadyAborted.signal,
    });
    assert(immediate.status === "cancelled",
      "a pre-aborted attempt is cancelled without running");
    assert(fake.requestCount() === before,
      "a pre-aborted attempt sends no request");
  } finally {
    await fake.close();
  }

  CHECKS.push("cancellation");
}

async function verifyReplayDoesNotReachProviderTwice(): Promise<void> {
  const fake = await startFakeOpenAi();
  try {
    const harness = await createDurableHarness(fake.origin);
    const turnId = `turn-${randomBytes(12).toString("hex")}`;
    const first = await harness.service.submit({
      businessId: BUSINESS_A,
      conversationId: harness.conversationId,
      businessProfileVersion: fictionalBusinessProfile.version,
      message: HOURS_QUESTION,
      turnId,
    });
    assert(first.status === "ok", "the first turn commits");
    const afterFirst = await harness.persistence.monthlyUsageMicros(BUSINESS_A, "2026-01");
    assert(afterFirst !== null, "the first turn settles");

    const replay = await harness.service.submit({
      businessId: BUSINESS_A,
      conversationId: harness.conversationId,
      businessProfileVersion: fictionalBusinessProfile.version,
      message: HOURS_QUESTION,
      turnId,
    });
    assert(replay.status === "ok" && replay.replayed === true,
      "the duplicate replays from its receipt");
    assert(fake.requestCount() === 1,
      "the duplicate never reaches the provider a second time");

    const afterReplay = await harness.persistence.monthlyUsageMicros(BUSINESS_A, "2026-01");
    assert(afterReplay !== null && afterFirst !== null
      && afterReplay.settledMicros === afterFirst.settledMicros,
    "the replay adds no charge");
  } finally {
    await fake.close();
  }

  CHECKS.push("replay-once");
}

async function verifyBudgetRefusalPrecedesProvider(): Promise<void> {
  const estimate = estimateTurnCost(PRICING());
  assert(estimate !== null, "the estimate is computable");
  if (estimate === null) return;

  const fake = await startFakeOpenAi();
  try {
    const harness = await createDurableHarness(fake.origin, {
      monthlyBudgetMicros: estimate.estimatedCostMicros - 1,
    });
    const outcome = await harness.service.submit({
      businessId: BUSINESS_A,
      conversationId: harness.conversationId,
      businessProfileVersion: fictionalBusinessProfile.version,
      message: HOURS_QUESTION,
      turnId: `turn-${randomBytes(12).toString("hex")}`,
    });
    assert(outcome.status === "budget-exhausted",
      "a turn above the monthly cap is refused");
    assert(fake.requestCount() === 0,
      "a budget-refused turn never reaches the provider");

    const usage = await harness.persistence.monthlyUsageMicros(BUSINESS_A, "2026-01");
    assert(usage !== null && usage.settledMicros === 0 && usage.reservedMicros === 0,
      "a refused turn records no charge and holds no reservation");
  } finally {
    await fake.close();
  }

  CHECKS.push("budget-refusal");
}

async function verifyConcurrentUsageAttribution(): Promise<void> {
  const fake = await startFakeOpenAi();
  try {
    const persistence = new InMemoryReceptionistPersistence();
    const activation = createPilotProviderActivation({
      mode: "offline-verification",
      baseUrl: fake.origin,
      credential: () => SYNTHETIC_CREDENTIAL,
    });
    assert(activation.status === "activated", "the activation is created");
    if (activation.status !== "activated") return;

    const service = new DurableReceptionistConversationService(
      [businessA(), businessB()],
      {
        persistence,
        transport: activation.value.transport,
        now: () => JANUARY,
        monthlyBudgetMicrosByBusiness: {
          [BUSINESS_A]: 10_000_000,
          [BUSINESS_B]: 10_000_000,
        },
        usageProviderIdentifier: activation.value.usageProviderIdentifier,
        pricing: activation.value.pricing,
      },
    );

    const conversationA = `conversation-${randomBytes(8).toString("hex")}`;
    const conversationB = `conversation-${randomBytes(8).toString("hex")}`;
    assert(await service.begin(BUSINESS_A, conversationA) !== null, "conversation A opens");
    assert(await service.begin(BUSINESS_B, conversationB) !== null, "conversation B opens");

    // Both turns run concurrently: the fake reports different usage per business,
    // so a swapped record would change the settled totals.
    const [a, b] = await Promise.all([
      service.submit({
        businessId: BUSINESS_A,
        conversationId: conversationA,
        businessProfileVersion: fictionalBusinessProfile.version,
        message: HOURS_QUESTION,
        turnId: `turn-${randomBytes(12).toString("hex")}`,
      }),
      service.submit({
        businessId: BUSINESS_B,
        conversationId: conversationB,
        businessProfileVersion: fictionalBusinessProfile.version,
        message: HOURS_QUESTION,
        turnId: `turn-${randomBytes(12).toString("hex")}`,
      }),
    ]);
    assert(a.status === "ok" && b.status === "ok", "both concurrent turns succeed");

    const usageA = await persistence.monthlyUsageMicros(BUSINESS_A, "2026-01");
    const usageB = await persistence.monthlyUsageMicros(BUSINESS_B, "2026-01");
    assert(usageA !== null && usageB !== null, "both businesses record usage");

    const pricing = PRICING();
    const expectedA = actualCostMicros(pricing, USAGE_A.inputUnits, USAGE_A.outputUnits);
    const expectedB = actualCostMicros(pricing, USAGE_B.inputUnits, USAGE_B.outputUnits);
    assert(expectedA !== null && expectedB !== null, "both reported usages are priceable");
    if (usageA === null || usageB === null || expectedA === null || expectedB === null) return;

    assert(expectedA !== expectedB, "the fixture reports distinct usage per business");
    assert(usageA.settledMicros === expectedA,
      `business A settled its own usage (${usageA.settledMicros} vs ${expectedA})`);
    assert(usageB.settledMicros === expectedB,
      `business B settled its own usage (${usageB.settledMicros} vs ${expectedB})`);
    assert(usageA.reservedMicros === 0 && usageB.reservedMicros === 0,
      "no reservation is left behind by either turn");
  } finally {
    await fake.close();
  }

  CHECKS.push("concurrent-attribution");
}

// ---------------------------------------------------------------------------
// Static guarantees
// ---------------------------------------------------------------------------

function verifyNoClientModeSelection(): void {
  // The activation is creation input. No request handler may read a mode, and no
  // client-supplied field may pick the provider.
  for (const file of [
    "src/server/http/receptionist-turn-handler.ts",
    "app/api/receptionist/turn/route.ts",
    "app/api/receptionist/session/route.ts",
  ]) {
    const text = readFileSync(file, "utf8");
    assert(!text.includes("providerActivation"),
      `${file} does not accept a provider activation`);
    assert(!text.includes("offline-verification"),
      `${file} cannot select an activation mode`);
  }

  const activationSource = readFileSync(
    "src/server/pilot/pilot-provider-activation.ts",
    "utf8",
  );
  assert(!/\brequest\b\.\w+/.test(activationSource),
    "the activation gate reads no request field");
  assert(activationSource.includes("LIVE_PROVIDER_AUTHORIZED = false as const"),
    "live authorization is a literal false in source");

  CHECKS.push("no-client-mode");
}

function verifyNoSecretsInSource(): void {
  for (const file of [
    "src/server/pilot/pilot-provider-activation.ts",
    "src/verification/pilot-provider-activation.verify.ts",
    "src/server/pilot/pilot-provider-configuration.ts",
  ]) {
    const text = readFileSync(file, "utf8");
    const matches = text.match(/sk-(proj-)?[A-Za-z0-9_-]{20,}/g) ?? [];
    for (const match of matches) {
      assert(match.includes("synthetic"),
        `${file} contains only clearly synthetic key-shaped strings`);
    }
    assert(!/process\.env\.\w+\s*\?\?/m.test(text) || !text.includes("process.env."),
      `${file} does not fall back to an ambient key`);
  }

  // The credential is read through one documented accessor, which never logs.
  const activationSource = readFileSync(
    "src/server/pilot/pilot-provider-activation.ts",
    "utf8",
  );
  assert(!/console\.(log|error|warn|info)/.test(activationSource),
    "the activation gate logs nothing, so a credential cannot leak through a log");

  CHECKS.push("no-secrets");
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

/**
 * A minimal rendered contract that the adapter can parse. It exists only to
 * reach the transport boundary, so it is not used for any application decision.
 */
const GROUNDED_ANSWER_SCHEMA = JSON.stringify({
  type: "object",
  proposalType: "knowledge_grounded_answer",
  required: [
    "proposalType",
    "customerFacingText",
    "knowledgeSourceReferences",
    "insufficientKnowledge",
  ],
  allowed: [
    "proposalType",
    "customerFacingText",
    "knowledgeSourceReferences",
    "insufficientKnowledge",
  ],
  fieldTypes: {
    proposalType: "string",
    customerFacingText: "string",
    knowledgeSourceReferences: "string_array",
    insufficientKnowledge: "boolean",
  },
  limits: { maxStringLength: 2_000, maxArrayLength: 16 },
});

const USAGE_A = Object.freeze({ inputUnits: 400, outputUnits: 40 });
const USAGE_B = Object.freeze({ inputUnits: 800, outputUnits: 80 });

type FakeMode =
  | "success"
  | "malformed-json"
  | "schema-violation"
  | "refusal"
  | "slow"
  | "missing-usage"
  | "http-500"
  | "invented-hours";

interface CapturedRequest {
  readonly path: string;
  readonly authorization: string | null;
  readonly body: string;
}

interface FakeOpenAi {
  readonly origin: string;
  readonly requests: readonly CapturedRequest[];
  requestCount(): number;
  setMode(mode: FakeMode): void;
  close(): Promise<void>;
}

async function startFakeOpenAi(): Promise<FakeOpenAi> {
  const requests: CapturedRequest[] = [];
  let mode: FakeMode = "success";

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
        body,
      });

      if (path !== OPENAI_RESPONSES_PATH) {
        sendJson(response, 404, { error: { message: "unknown path" } });
        return;
      }

      switch (mode) {
        case "http-500":
          sendJson(response, 500, { error: { message: "synthetic provider failure" } });
          return;
        case "slow":
          await new Promise((resolve) => setTimeout(resolve, 1_500));
          sendJson(response, 200, envelope(body, "success"));
          return;
        case "malformed-json":
          sendJson(response, 200, envelopeWithText(body, '{"customerFacingText":'));
          return;
        case "schema-violation":
          sendJson(response, 200, envelopeWithObject(body, {
            proposalType: "knowledge_grounded_answer",
            customerFacingText: "Friendly Home Services closes today at 5:00 PM.",
            knowledgeSourceReferences: ["regular-hours"],
            insufficientKnowledge: false,
            unexpectedField: "must be refused",
          }));
          return;
        case "refusal":
          sendJson(response, 200, {
            id: "resp_verify_refusal",
            object: "response",
            status: "completed",
            model: PILOT_RECOMMENDED_MODEL,
            output: [{
              id: "msg_verify_refusal",
              type: "message",
              role: "assistant",
              status: "completed",
              content: [{ type: "refusal", refusal: "I cannot help with that." }],
            }],
            usage: { input_tokens: USAGE_A.inputUnits, output_tokens: USAGE_A.outputUnits },
          });
          return;
        case "missing-usage":
          sendJson(response, 200, envelope(body, "success", null));
          return;
        case "invented-hours":
          sendJson(response, 200, envelope(body, "invented-hours"));
          return;
        case "success":
        default:
          sendJson(response, 200, envelope(body, "success"));
          return;
      }
    })();
  });

  const origin = await listen(server);
  return {
    origin,
    requests,
    requestCount: () => requests.length,
    setMode: (next) => {
      mode = next;
    },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

function envelope(
  body: string,
  variant: "success" | "invented-hours",
  usage: { readonly inputUnits: number; readonly outputUnits: number } | null = usageFor(body),
) {
  const text = variant === "invented-hours"
    ? "The business is open today from 7:00 AM to 11:00 PM."
    : "Friendly Home Services closes today at 5:00 PM.";
  return envelopeWithObject(body, {
    ...identityFrom(body),
    proposalType: "knowledge_grounded_answer",
    customerFacingText: text,
    knowledgeSourceReferences: ["regular-hours"],
    insufficientKnowledge: false,
  }, usage);
}

function envelopeWithObject(
  body: string,
  proposal: Record<string, unknown>,
  usage: { readonly inputUnits: number; readonly outputUnits: number } | null = usageFor(body),
) {
  return envelopeWithText(body, JSON.stringify(proposal), usage);
}

function envelopeWithText(
  _body: string,
  text: string,
  usage: { readonly inputUnits: number; readonly outputUnits: number } | null = {
    inputUnits: USAGE_A.inputUnits,
    outputUnits: USAGE_A.outputUnits,
  },
) {
  return {
    id: "resp_verify_synthetic",
    object: "response",
    created_at: 1_761_900_000,
    status: "completed",
    model: PILOT_RECOMMENDED_MODEL,
    output: [{
      id: "msg_verify_synthetic",
      type: "message",
      role: "assistant",
      status: "completed",
      content: [{ type: "output_text", text, annotations: [] }],
    }],
    usage: usage === null
      ? undefined
      : { input_tokens: usage.inputUnits, output_tokens: usage.outputUnits },
  };
}

/** Different usage per business, so a swapped record changes the totals. */
function usageFor(body: string): { readonly inputUnits: number; readonly outputUnits: number } {
  const identity = identityFrom(body);
  const businessId = typeof identity.businessId === "string" ? identity.businessId : "";
  return businessId === BUSINESS_A ? USAGE_A : USAGE_B;
}

function identityFrom(body: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(body) as { input?: unknown };
    const input = typeof parsed.input === "string" ? parsed.input : "";
    const inner = JSON.parse(input) as { identity?: Record<string, unknown> };
    return inner.identity ?? {};
  } catch {
    return {};
  }
}

function sendJson(
  response: import("node:http").ServerResponse,
  status: number,
  value: unknown,
): void {
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

interface DurableHarness {
  readonly persistence: InMemoryReceptionistPersistence;
  readonly service: DurableReceptionistConversationService;
  readonly conversationId: string;
}

async function createDurableHarness(
  baseUrl: string,
  options: { readonly monthlyBudgetMicros?: number; readonly timeoutMs?: number } = {},
): Promise<DurableHarness> {
  const activation = createPilotProviderActivation({
    mode: "offline-verification",
    baseUrl,
    credential: () => SYNTHETIC_CREDENTIAL,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  });
  assert(activation.status === "activated", "the verification activation is created");
  if (activation.status !== "activated") throw new Error("unreachable");

  const persistence = new InMemoryReceptionistPersistence();
  const service = new DurableReceptionistConversationService(
    [businessA(), businessB()],
    {
      persistence,
      transport: activation.value.transport,
      now: () => JANUARY,
      monthlyBudgetMicrosByBusiness: {
        [BUSINESS_A]: options.monthlyBudgetMicros ?? 10_000_000,
        [BUSINESS_B]: options.monthlyBudgetMicros ?? 10_000_000,
      },
      usageProviderIdentifier: activation.value.usageProviderIdentifier,
      pricing: activation.value.pricing,
    },
  );
  const conversationId = `conversation-${randomBytes(8).toString("hex")}`;
  assert(await service.begin(BUSINESS_A, conversationId) !== null, "the conversation opens");
  return { persistence, service, conversationId };
}

function buildPilotRuntime(baseUrl: string): {
  readonly runtime: PilotReceptionistRuntime;
  readonly persistence: InMemoryReceptionistPersistence;
} {
  const persistence = new InMemoryReceptionistPersistence();
  const result = createPilotReceptionistRuntime({
    configuration: {
      environment: "pilot",
      requireSecureTransport: true,
      providerNetworkExecution: "disabled",
      sessionTtlMs: 30 * 60 * 1_000,
      operatorCredentialDigest: sha256(OPERATOR_CREDENTIAL),
      persistence: {
        mode: "durable",
        credentialReference: PILOT_DATABASE_REFERENCE,
      },
      businesses: [
        { businessId: BUSINESS_A, widgetId: WIDGET_A, allowedOrigins: [APP_ORIGIN] },
        { businessId: BUSINESS_B, widgetId: WIDGET_B, allowedOrigins: [SECOND_ORIGIN] },
      ],
    },
    businesses: [businessA(), businessB()],
    persistence,
    databaseCredentialReference: PILOT_DATABASE_REFERENCE,
    // Pinned so the billing month is deterministic. Business-hours resolution
    // still uses the real clock, which is why the answer is checked against the
    // approved schedule rather than a fixed weekday.
    now: () => JANUARY,
    providerActivation: {
      mode: "offline-verification",
      baseUrl,
      credential: () => SYNTHETIC_CREDENTIAL,
    },
    ipRateLimit: { limit: 1_000, windowMs: 60_000 },
    sessionRateLimit: { limit: 1_000, windowMs: 60_000 },
    maximumRequestBytes: 8_192,
  });
  if (result.status !== "created") {
    throw new Error(
      `Stage B2.4B.2C verification failed: the pilot runtime is created from the activation (${result.reason})`,
    );
  }
  return { runtime: result.runtime, persistence };
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** UTC billing month, matching the application's own convention. */
function utcMonth(epochMs: number): string {
  const date = new Date(epochMs);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Any time the answer states must exist in the approved schedule. */
function assertGroundedInApprovedHours(text: string, description: string): void {
  const approved = new Set<string>();
  for (const range of Object.values(fictionalBusinessProfile.hours.weeklySchedule)) {
    for (const match of String(range).matchAll(/\d{1,2}:\d{2}\s*[AP]M/g)) {
      approved.add(match[0].replace(/\s+/g, " ").toUpperCase());
    }
  }
  for (const match of text.matchAll(/\d{1,2}:\d{2}\s*[AP]M/g)) {
    const normalized = match[0].replace(/\s+/g, " ").toUpperCase();
    assert(approved.has(normalized),
      `${description} states only approved times (found ${normalized})`);
  }
}

function businessA(): ReceptionistBusiness {
  return { profile: fictionalBusinessProfile, knowledge: fictionalKnowledgeRecords };
}

function businessB(): ReceptionistBusiness {
  return {
    profile: {
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
    },
    // Knowledge is business-scoped, so business B gets its own copies rather
    // than business A's records: the constructor refuses a record owned by
    // another business.
    knowledge: fictionalKnowledgeRecords.map((record) => ({
      ...record,
      businessProfileId: BUSINESS_B,
    })),
  };
}

function PRICING(): ProviderModelPricing {
  const pricing = resolveProviderPricing("openai", PILOT_RECOMMENDED_MODEL);
  if (pricing === null) throw new Error("the recommended model is not priced");
  return pricing;
}

function assertRejected(
  result: ReturnType<typeof createPilotProviderActivation>,
  reason: string,
  description: string,
): void {
  assert(result.status === "rejected", description);
  if (result.status === "rejected") {
    assert(result.reason === reason,
      `${description} (expected ${reason}, received ${result.reason})`);
  }
}

function assert(condition: boolean, description: string): void {
  if (!condition) throw new Error(`Stage B2.4B.2C verification failed: ${description}`);
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
