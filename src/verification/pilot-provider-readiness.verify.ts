import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import type { BusinessProfile } from "../domain/business-profile";
import { fictionalBusinessProfile } from "../fixtures/business-profile";
import { fictionalKnowledgeRecords } from "../fixtures/knowledge";
import {
  createFakeProvider,
  type FakeProviderMode,
} from "../ai/providers/fake-local-provider";
import type {
  OfflineTransport,
  OfflineTransportRequest,
  OfflineTransportResponse,
} from "../ai/providers/transport-model-provider-adapter";
import {
  ESTIMATE_SAFETY_MARGIN_BASIS_POINTS,
  MAXIMUM_ESTIMATE_TOKENS,
  actualCostMicros,
  estimateTurnCost,
  listProviderPricing,
  resolveProviderPricing,
  type ProviderModelPricing,
} from "../server/billing/provider-pricing";
import { DurableReceptionistConversationService } from "../server/conversation/durable-receptionist-conversation-service";
import type { ReceptionistBusiness } from "../server/conversation/receptionist-conversation-service";
import { InMemoryReceptionistPersistence } from "../server/persistence/in-memory-receptionist-persistence";
import { PILOT_PROVIDER_NETWORK_MODE } from "../server/pilot/pilot-runtime-configuration";
import {
  PILOT_APPROVED_PROVIDER_MODELS,
  PILOT_APPROVED_PROVIDER_ORIGINS,
  PILOT_PROVIDER_CREDENTIAL_REFERENCE,
  PILOT_PROVIDER_ORIGIN,
  PILOT_RECOMMENDED_MODEL,
  validatePilotProviderConfiguration,
} from "../server/pilot/pilot-provider-configuration";

/**
 * Stage B2.4B.2B verification: provider readiness with zero external work.
 *
 * It proves the chosen model's pricing against the application allowlist, the
 * fail-closed provider configuration, and that provider-reported usage now
 * settles the durable charge while a missing usage record falls back to the
 * conservative estimate instead of a zero charge.
 *
 * Every provider interaction is the in-process fake. No socket is opened, no
 * environment variable is read, and no credential exists.
 */

const BUSINESS_A = fictionalBusinessProfile.id;
const BUSINESS_B = "second-fictional-business";
const JANUARY = Date.UTC(2026, 0, 15, 12, 0, 0);
/** The $10 monthly pilot cap, in integer micro-units of USD. */
const PILOT_MONTHLY_BUDGET_MICROS = 10_000_000;
const TIMEOUT_MS = 30_000;

const checks: string[] = [];

async function run(): Promise<void> {
  verifyVerifiedPricing();
  verifyConfigurationValidation();
  await verifyReportedUsageSettles();
  await verifyMissingUsageFallsBackToEstimate();
  await verifyDuplicateTurnIsChargedOnce();
  await verifyBudgetRefusalPrecedesProvider();
  await verifyUnpricedModelFailsClosed();
  await verifyProviderFailureHoldsReservation();
  verifyProviderNetworkRemainsDisabled();

  console.log(
    `Stage B2.4B.2B provider readiness verification passed: ${checks.length} check groups, `
    + "verified model pricing, fail-closed provider configuration, credential-reference "
    + "handling, reported-usage settlement, estimate fallback instead of a zero charge, "
    + "single charge for a duplicate turn, budget refusal before the provider, an unpriced "
    + "model failing closed, and disabled network execution. Offline fake provider only.",
  );
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

function verifyVerifiedPricing(): void {
  const recommended = resolveProviderPricing("openai", PILOT_RECOMMENDED_MODEL);
  assert(recommended !== null, "the recommended model is allowlisted and priced");
  if (recommended === null) return;

  // Figures read from the official model page on 2026-10-30.
  assert(recommended.inputMicrosPerMillionTokens === 100_000,
    "the recommended model's input price matches the official rate ($0.10)");
  assert(recommended.outputMicrosPerMillionTokens === 500_000,
    "the recommended model's output price matches the official rate ($0.50)");
  assert(recommended.provisional === true,
    "the price is marked provisional rather than presented as contractual");
  assert(recommended.priceSource.startsWith("https://developers.openai.com/"),
    "the price cites an official OpenAI source");
  assert(recommended.verifiedOn === "2026-10-30", "the price carries its verification date");

  const alternative = resolveProviderPricing("openai", "gpt-5.6-luna");
  assert(alternative !== null, "the same-generation alternative is priced");
  if (alternative !== null) {
    assert(alternative.inputMicrosPerMillionTokens === 200_000
      && alternative.outputMicrosPerMillionTokens === 1_200_000,
      "the alternative's rates match the official $0.20 / $1.20");
    assert(recommended.inputMicrosPerMillionTokens < alternative.inputMicrosPerMillionTokens,
      "the recommended model is cheaper than the alternative");
  }

  // The GPT-5.6 flagship exists but is not allowlisted: it costs roughly forty
  // times as much per turn and this workload does not need it. An unpriced model
  // cannot reserve spending, so it fails closed rather than running unbilled.
  assert(resolveProviderPricing("openai", "gpt-5.6-sol") === null,
    "the expensive flagship is not allowlisted");
  assert(resolveProviderPricing("openai", "gpt-6-astra") === null,
    "no other model is silently priced");
  assert(resolveProviderPricing("openai", "gpt-6-luna-not-a-model") === null,
    "a lookalike model identifier does not resolve");

  const listed = listProviderPricing();
  assert(listed.every((entry) => Number.isInteger(entry.inputMicrosPerMillionTokens)
    && Number.isInteger(entry.outputMicrosPerMillionTokens)),
    "every price is an integer in micro-units");
  assert(listed.every((entry) => entry.verifiedOn.length > 0),
    "every allowlisted price names when it was verified");

  // The estimate must price the full token budgets plus the margin, so it can
  // never be cheaper than the worst case it is meant to cover.
  const estimate = estimateTurnCost(recommended);
  assert(estimate !== null, "the estimate is computable");
  if (estimate !== null) {
    const base = actualCostMicros(recommended, estimate.inputTokens, estimate.outputTokens);
    assert(base !== null, "the base cost is computable");
    if (base !== null) {
      assert(estimate.estimatedCostMicros > base,
        "the estimate exceeds the raw worst case by the safety margin");
      const expected = base + Math.ceil(base * ESTIMATE_SAFETY_MARGIN_BASIS_POINTS / 10_000);
      assert(estimate.estimatedCostMicros === Math.ceil(
        base * (10_000 + ESTIMATE_SAFETY_MARGIN_BASIS_POINTS) / 10_000,
      ) || estimate.estimatedCostMicros === expected,
        "the margin is applied with integer arithmetic");
    }
  }

  // Every approved model bills input below the provider's 272K threshold, above
  // which a request's input price doubles and output rises by half. The budget
  // ceiling stays under it, so no estimate can under-price a surcharged request.
  for (const model of PILOT_APPROVED_PROVIDER_MODELS) {
    const pricing = resolveProviderPricing("openai", model);
    assert(pricing !== null, `the approved model ${model} is priced`);
    if (pricing === null) continue;
    assert(pricing.inputTokenBudget < 272_000,
      `${model} bills below the provider's surcharge threshold`);
    assert(MAXIMUM_ESTIMATE_TOKENS < 272_000,
      "the application's token ceiling stays below the surcharge threshold");
  }

  checks.push("verified-pricing");
}

// ---------------------------------------------------------------------------
// Provider configuration
// ---------------------------------------------------------------------------

function verifyConfigurationValidation(): void {
  // `mode` is the authorization switch, so it must be stated. It is never
  // assumed, which is why an omitted mode is refused rather than defaulted.
  assertRejected(validatePilotProviderConfiguration({}),
    "ProviderNetworkProhibited", "an omitted mode is refused rather than assumed");

  const accepted = validatePilotProviderConfiguration({ mode: "disabled" });
  assert(accepted.status === "valid", "an approved configuration validates");
  if (accepted.status !== "valid") return;

  const value = accepted.value;
  assert(value.mode === "disabled", "the default execution mode is disabled");
  assert(value.providerNetworkAuthorized === false,
    "the configuration authorizes no provider network execution");
  assert(value.origin === PILOT_PROVIDER_ORIGIN, "the approved origin is the production API origin");
  assert(value.origin === "https://api.openai.com", "the origin is the documented endpoint");
  assert(value.model === PILOT_RECOMMENDED_MODEL, "the default model is the recommended one");
  assert(value.credentialReference === PILOT_PROVIDER_CREDENTIAL_REFERENCE,
    "the default credential is named, not held");
  assert(value.provenance.credentialValueRetained === false,
    "no credential value is retained");
  assert(value.pricing.inputMicrosPerMillionTokens === 100_000,
    "the validated configuration carries the priced model");
  assert(Object.isFrozen(value), "the validated configuration is immutable");

  assertRejected(validatePilotProviderConfiguration({ mode: "enabled" }),
    "ProviderNetworkProhibited", "enabling network execution is refused");
  assertRejected(validatePilotProviderConfiguration({ mode: "live" }),
    "ProviderNetworkProhibited", "an arbitrary mode string is refused");
  assertRejected(
    validatePilotProviderConfiguration({ mode: "disabled", origin: "https://api.openai.com.evil.test" }),
    "OriginNotApproved", "a lookalike origin is refused");
  assertRejected(
    validatePilotProviderConfiguration({ mode: "disabled", origin: "https://evil.test" }),
    "OriginNotApproved", "an unapproved origin is refused");
  assertRejected(
    validatePilotProviderConfiguration({ mode: "disabled", origin: "http://api.openai.com" }),
    "OriginNotApproved", "plaintext HTTP is refused");
  assertRejected(
    validatePilotProviderConfiguration({ mode: "disabled", model: "gpt-5.6-sol" }),
    "ModelNotApproved", "the costly flagship is not an approved pilot model");
  assertRejected(
    validatePilotProviderConfiguration({ mode: "disabled", model: "gpt-6-astra" }),
    "ModelNotApproved", "an unapproved model is refused");
  assertRejected(
    validatePilotProviderConfiguration({ mode: "disabled", model: "gpt-6-luna " }),
    "InvalidInput", "a padded model identifier fails the identifier pattern");
  assertRejected(validatePilotProviderConfiguration({ mode: "disabled", unexpected: true }),
    "UnknownField", "an unknown configuration field is refused");
  assertRejected(validatePilotProviderConfiguration({ mode: "disabled", maxOutputTokens: 0 }),
    "InvalidOutputBudget", "a zero output budget is refused");
  assertRejected(
    validatePilotProviderConfiguration({ mode: "disabled", maxOutputTokens: 99_999 }),
    "InvalidOutputBudget", "an oversized output budget is refused");
  assertRejected(validatePilotProviderConfiguration({ mode: "disabled", timeoutMs: 10 }),
    "InvalidTimeout", "an unrealistically short timeout is refused");
  assertRejected(validatePilotProviderConfiguration(null),
    "InvalidInput", "a null configuration is refused");

  // A key supplied where a variable name belongs must be refused rather than
  // stored: that is how a secret could otherwise reach source control or a log.
  const keyShaped = "sk-proj-verify-synthetic-should-be-refused-000";
  assertRejected(
    validatePilotProviderConfiguration({ mode: "disabled", credentialReference: keyShaped }),
    "InvalidCredentialReference", "a key-shaped credential is refused");
  assertRejected(
    validatePilotProviderConfiguration({ mode: "disabled", credentialReference: "openai_api_key" }),
    "InvalidCredentialReference", "a lowercase variable name is refused");
  assertRejected(
    validatePilotProviderConfiguration({ mode: "disabled", credentialReference: "A" }),
    "InvalidCredentialReference", "a too-short variable name is refused");

  const serialized = JSON.stringify(accepted.value);
  assert(!serialized.toLowerCase().includes("sk-"),
    "the validated configuration contains no key material");
  assert(!serialized.includes(keyShaped), "a refused credential never appears in output");

  const custom = validatePilotProviderConfiguration({
    mode: "disabled",
    origin: "https://api.openai.com",
    model: "gpt-5.6-luna",
    credentialReference: "OPENAI_PILOT_KEY",
    maxOutputTokens: 512,
    timeoutMs: 12_000,
  });
  assert(custom.status === "valid", "an explicitly approved alternative model is accepted");
  if (custom.status === "valid") {
    assert(custom.value.model === "gpt-5.6-luna", "the approved alternative is honored");
    assert(custom.value.credentialReference === "OPENAI_PILOT_KEY",
      "a different server-side variable name is honored");
    assert(custom.value.providerNetworkAuthorized === false,
      "even a full configuration authorizes no network execution");
  }

  checks.push("provider-configuration");
}

// ---------------------------------------------------------------------------
// Usage accounting
// ---------------------------------------------------------------------------

async function verifyReportedUsageSettles(): Promise<void> {
  const harness = await createHarness();
  const outcome = await submit(harness, "project help");
  assert(outcome.status === "ok", "the priced turn succeeds");

  const reported = harness.fake.reportedUsage();
  assert(reported !== null && reported.inputUnits > 0,
    "the provider reported usage for the turn");
  if (reported === null) return;

  const usage = await harness.persistence.monthlyUsageMicros(BUSINESS_A, "2026-01");
  assert(usage !== null && usage.reservedMicros === 0, "the reservation was settled");

  const pricing = PRICING();
  const expected = actualCostMicros(pricing, reported.inputUnits, reported.outputUnits);
  assert(expected !== null, "the reported usage is priceable");
  if (expected === null || usage === null) return;

  assert(usage.settledMicros === expected,
    `the charge equals the reported usage (${usage.settledMicros} vs ${expected})`);
  const estimate = estimateTurnCost(pricing);
  assert(estimate !== null, "the estimate is computable");
  if (estimate !== null) {
    assert(usage.settledMicros !== estimate.estimatedCostMicros,
      "the reported usage replaced the reservation estimate");
    assert(usage.settledMicros < estimate.estimatedCostMicros,
      "a cheaper-than-worst-case turn is not over-billed");
  }

  checks.push("reported-usage-settles");
}

async function verifyMissingUsageFallsBackToEstimate(): Promise<void> {
  const underlying = createFakeProvider({ mode: "success" });
  // A transport that answers correctly but reports no usage at all, which is what
  // a provider omitting the field looks like.
  const withoutUsage: OfflineTransport = async (
    request: OfflineTransportRequest,
  ): Promise<OfflineTransportResponse> => {
    const response = await underlying.transport(request);
    return { ...response, usage: undefined };
  };

  const harness = await createHarness({ transport: withoutUsage });
  const outcome = await submit(harness, "project help");
  assert(outcome.status === "ok", "a turn succeeds without reported usage");

  const usage = await harness.persistence.monthlyUsageMicros(BUSINESS_A, "2026-01");
  assert(usage !== null && usage.reservedMicros === 0, "the reservation was settled");
  const estimate = estimateTurnCost(PRICING());
  assert(estimate !== null, "the estimate is computable");
  if (estimate === null || usage === null) return;

  assert(usage.settledMicros === estimate.estimatedCostMicros,
    "a missing usage settles the conservative estimate");
  assert(usage.settledMicros > 0,
    "a missing usage never settles a zero charge");

  checks.push("missing-usage-estimate");
}

async function verifyDuplicateTurnIsChargedOnce(): Promise<void> {
  const harness = await createHarness();
  const turnId = nextTurnId();
  const first = await submit(harness, "project help", turnId);
  assert(first.status === "ok", "the first submission commits");
  const reported = harness.fake.reportedUsage();
  assert(reported !== null, "the provider reported usage");
  if (reported === null) return;
  const expected = actualCostMicros(PRICING(), reported.inputUnits, reported.outputUnits);
  assert(expected !== null, "the reported usage is priceable");

  const replay = await submit(harness, "project help", turnId);
  assert(replay.status === "ok" && replay.replayed === true,
    "the duplicate is answered from its receipt");
  assert(harness.fake.invocationCount() === 1,
    "the duplicate never reaches the provider again");

  const usage = await harness.persistence.monthlyUsageMicros(BUSINESS_A, "2026-01");
  assert(usage !== null, "usage is recorded for the duplicate turn");
  if (usage === null) return;
  assert(usage.settledMicros === expected,
    "the duplicate turn is charged exactly once");
  assert(usage.reservedMicros === 0, "no reservation is left behind by the replay");

  checks.push("duplicate-charged-once");
}

// ---------------------------------------------------------------------------
// Budget and failure behavior
// ---------------------------------------------------------------------------

async function verifyBudgetRefusalPrecedesProvider(): Promise<void> {
  const estimate = estimateTurnCost(PRICING());
  assert(estimate !== null, "the estimate is computable");
  if (estimate === null) return;

  const harness = await createHarness({ budgetMicros: estimate.estimatedCostMicros - 1 });
  const outcome = await submit(harness, "project help");
  assert(outcome.status === "budget-exhausted", "a turn above the monthly cap is refused");
  assert(harness.fake.invocationCount() === 0,
    "a refused turn never reaches the provider");

  const usage = await harness.persistence.monthlyUsageMicros(BUSINESS_A, "2026-01");
  assert(usage !== null && usage.settledMicros === 0 && usage.reservedMicros === 0,
    "a refused turn records no charge and holds no reservation");

  checks.push("budget-refusal");
}

async function verifyUnpricedModelFailsClosed(): Promise<void> {
  const fake = createFakeProvider({ mode: "success" });
  let transportCalls = 0;
  const counting: OfflineTransport = async (request) => {
    transportCalls += 1;
    return fake.transport(request);
  };
  const service = new DurableReceptionistConversationService(
    [businessA()],
    {
      persistence: new InMemoryReceptionistPersistence(),
      transport: counting,
      now: () => JANUARY,
      monthlyBudgetMicrosByBusiness: { [BUSINESS_A]: PILOT_MONTHLY_BUDGET_MICROS },
      usageProviderIdentifier: "openai",
      // An unpriced model has no defensible estimate, so the turn must fail
      // closed rather than call a provider outside the budget guard.
      pricing: null,
    },
  );
  const conversationId = `conversation-${randomBytes(8).toString("hex")}`;
  const handle = await service.begin(BUSINESS_A, conversationId);
  assert(handle !== null, "the conversation opens");

  const outcome = await service.submit({
    businessId: BUSINESS_A,
    conversationId,
    businessProfileVersion: fictionalBusinessProfile.version,
    message: "project help",
    turnId: nextTurnId(),
  });
  assert(outcome.status === "internal-failure",
    "an unpriced model fails closed");
  assert(transportCalls === 0, "no provider work occurs without an allowlisted price");

  checks.push("unpriced-fails-closed");
}

async function verifyProviderFailureHoldsReservation(): Promise<void> {
  const harness = await createHarness({ mode: "unavailable" });
  const outcome = await submit(harness, "project help");
  assert(outcome.status === "provider-failure", "a provider failure is reported sanitized");
  assert(harness.fake.invocationCount() === 1, "the provider was attempted once");

  const usage = await harness.persistence.monthlyUsageMicros(BUSINESS_A, "2026-01");
  assert(usage !== null && usage.settledMicros === 0,
    "a failed turn charges nothing");
  const estimate = estimateTurnCost(PRICING());
  assert(estimate !== null, "the estimate is computable");
  if (estimate !== null && usage !== null) {
    assert(usage.reservedMicros === estimate.estimatedCostMicros,
      "the reservation is held for reconciliation rather than released, because a "
      + "failed attempt may still have been billed");
  }

  const conversation = await harness.persistence.loadConversation(harness.scope);
  assert(conversation.status === "found", "the conversation still exists");
  if (conversation.status === "found") {
    assert(conversation.conversation.state.revision === 0,
      "a failed turn mutates no committed state");
  }

  checks.push("failure-holds-reservation");
}

// ---------------------------------------------------------------------------
// Network execution stays disabled
// ---------------------------------------------------------------------------

function verifyProviderNetworkRemainsDisabled(): void {
  assert(PILOT_PROVIDER_NETWORK_MODE === "disabled",
    "the pilot provider network mode is disabled");
  assert(PILOT_APPROVED_PROVIDER_ORIGINS.length === 1,
    "exactly one provider origin is approved");
  assert(PILOT_APPROVED_PROVIDER_ORIGINS[0] === "https://api.openai.com",
    "the approved origin is the official API origin");

  // Exactly one runtime module may reach the OpenAI adapter: the controlled
  // activation gate introduced in B2.4B.2C. It is the single integration point
  // and it cannot authorize live execution, so a second, unguarded pathway
  // fails this check instead of reaching production.
  const reachable = ["src/server", "src/prototype-ui", "app", "components"]
    .flatMap((directory) => sourceFilesUnder(directory))
    .filter((file) => !file.endsWith(".verify.ts"))
    .filter((file) => {
      const text = readFileSync(file, "utf8");
      return text.includes("openai-responses-adapter")
        || text.includes("createOpenAiResponsesTransport");
    });
  assert(reachable.length === 1
    && reachable[0] === "src/server/pilot/pilot-provider-activation.ts",
    `the controlled activation gate is the only adapter integration point (${reachable.join(", ")})`);

  // The provider configuration names a variable; no key is present anywhere.
  const configurationSource = readFileSync(
    "src/server/pilot/pilot-provider-configuration.ts",
    "utf8",
  );
  assert(!/\bsk-[A-Za-z0-9_-]{10,}/.test(configurationSource),
    "the provider configuration embeds no key material");
  assert(configurationSource.includes("OPENAI_API_KEY"),
    "the provider configuration names the credential variable");

  checks.push("network-disabled");
}

function sourceFilesUnder(directory: string): readonly string[] {
  const found: string[] = [];
  const walk = (current: string): void => {
    let entries: readonly string[];
    try {
      entries = readdirSync(current);
    } catch {
      return;
    }
    for (const name of entries) {
      const path = join(current, name);
      // A non-directory entry fails the recursive read, so directories need no
      // separate stat and the walk stays synchronous and dependency-free.
      if (/\.(ts|tsx)$/.test(name)) found.push(path.split(sep).join("/"));
      else walk(path);
    }
  };
  walk(directory);
  return found;
}

// ---------------------------------------------------------------------------
// Pricing and harness
// ---------------------------------------------------------------------------

/** The allowlisted pricing the pilot would actually use for the recommended model. */
function PRICING(): ProviderModelPricing {
  const pricing = resolveProviderPricing("openai", PILOT_RECOMMENDED_MODEL);
  if (pricing === null) throw new Error("the recommended model is not priced");
  return pricing;
}

interface Harness {
  readonly persistence: InMemoryReceptionistPersistence;
  readonly service: DurableReceptionistConversationService;
  readonly fake: ReturnType<typeof createFakeProvider>;
  readonly scope: {
    businessProfileId: string;
    businessProfileVersion: number;
    conversationId: string;
  };
}

async function createHarness(options: {
  budgetMicros?: number;
  mode?: FakeProviderMode;
  transport?: OfflineTransport;
} = {}): Promise<Harness> {
  const persistence = new InMemoryReceptionistPersistence();
  const fake = createFakeProvider({ mode: options.mode ?? "success" });
  const service = new DurableReceptionistConversationService(
    [businessA(), businessB()],
    {
      persistence,
      transport: options.transport ?? fake.transport,
      now: () => JANUARY,
      monthlyBudgetMicrosByBusiness: {
        [BUSINESS_A]: options.budgetMicros ?? PILOT_MONTHLY_BUDGET_MICROS,
        [BUSINESS_B]: options.budgetMicros ?? PILOT_MONTHLY_BUDGET_MICROS,
      },
      usageProviderIdentifier: "openai",
      pricing: PRICING(),
    },
  );
  const conversationId = `conversation-${randomBytes(8).toString("hex")}`;
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
  };
}

async function submit(
  harness: Harness,
  message: string,
  turnId = nextTurnId(),
): Promise<Awaited<ReturnType<DurableReceptionistConversationService["submit"]>>> {
  return harness.service.submit({
    businessId: BUSINESS_A,
    conversationId: harness.scope.conversationId,
    businessProfileVersion: fictionalBusinessProfile.version,
    message,
    turnId,
  });
}

function nextTurnId(): string {
  return `turn-${randomBytes(12).toString("hex")}`;
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
  return { profile, knowledge: [] };
}

function assertRejected(
  result: ReturnType<typeof validatePilotProviderConfiguration>,
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
  if (!condition) throw new Error(`Stage B2.4B.2B verification failed: ${description}`);
}

const started = Date.now();
run().then(() => {
  assert(Date.now() - started < TIMEOUT_MS, "the suite completes inside its own deadline");
}).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
