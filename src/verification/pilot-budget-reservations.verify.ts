import { randomBytes } from "node:crypto";
import type { BusinessProfile } from "../domain/business-profile";
import { fictionalBusinessProfile } from "../fixtures/business-profile";
import { fictionalKnowledgeRecords } from "../fixtures/knowledge";
import { createFakeProvider, type FakeProviderMode } from "../ai/providers/fake-local-provider";
import {
  estimateTurnCost,
  listProviderPricing,
  resolveProviderPricing,
  utcBillingMonth,
  type EstimatedTurnCost,
  type ProviderModelPricing,
} from "../server/billing/provider-pricing";
import {
  DurableReceptionistConversationService,
} from "../server/conversation/durable-receptionist-conversation-service";
import type { ReceptionistBusiness } from "../server/conversation/receptionist-conversation-service";
import { InMemoryReceptionistPersistence } from "../server/persistence/in-memory-receptionist-persistence";

const BUSINESS_A = fictionalBusinessProfile.id;
const BUSINESS_B = "second-fictional-business";
const JANUARY = Date.UTC(2026, 0, 15, 12, 0, 0);
const FEBRUARY = Date.UTC(2026, 1, 10, 12, 0, 0);

/** Deliberately expensive fake pricing so a few turns exhaust a small cap. */
const PRICING: ProviderModelPricing = Object.freeze({
  providerIdentifier: "fake-local-provider/v1",
  modelIdentifier: "fake-local-model",
  inputMicrosPerMillionTokens: 100_000,
  outputMicrosPerMillionTokens: 500_000,
  inputTokenBudget: 4_000,
  outputTokenBudget: 512,
  provisional: true,
  priceSource: "B2.4A verification fixture (not a provider rate)",
  verifiedOn: "2026-10-30",
});

const ESTIMATE_RESULT = estimateTurnCost(PRICING);
if (ESTIMATE_RESULT === null) throw new Error("fixture pricing is invalid");
const ESTIMATE: EstimatedTurnCost = ESTIMATE_RESULT;

async function run(): Promise<void> {
  await verifyPricingAllowlist();
  await verifyReservationPrecedesProviderCall();
  await verifyBudgetRefusalPrecedesProviderCall();
  await verifyConcurrentReservationsCannotOverspend();
  await verifyDuplicateTurnReservesOnce();
  await verifySettlementReplacesReservation();
  await verifyConfirmedFailureRelease();
  await verifyUnknownOutcomeIsHeldThenReconciled();
  await verifyCrashRecoveryReleasesAbandonedReservation();
  await verifyBillingMonthBoundaries();
  await verifyCrossBusinessIsolation();
  await verifyProviderFailureCannotMutateState();
  await verifyUnknownProviderFailsClosed();
  await verifyProviderDisabledPathReservesNothing();
  await verifySensitiveDataIsNotStored();
  console.log(
    "Stage B2.4A budget verification passed: allowlisted pricing, reservation before provider "
    + "execution, pre-call budget refusal, concurrent protection, duplicate suppression, atomic "
    + "settlement, confirmed-failure release, unknown-outcome retention and reconciliation, crash "
    + "recovery, billing-month boundaries, cross-business isolation, fail-closed unknown provider, "
    + "disabled-provider behavior, and no conversation text in usage records.",
  );
}

async function verifyPricingAllowlist(): Promise<void> {
  const listed = listProviderPricing();
  assert(listed.length >= 3, "the pricing allowlist is populated");
  assert(listed.every((entry) => entry.provisional || entry.verifiedOn.length > 0),
    "every priced provider names a verification date");
  assert(resolveProviderPricing("openai", "gpt-6-luna") !== null,
    "a listed provider resolves");
  assert(resolveProviderPricing("unlisted-provider", "some-model") === null,
    "an unlisted provider resolves to null instead of a default price");
  assert(ESTIMATE.estimatedCostMicros > 0, "the fixture estimate is non-zero");
  assert(Number.isInteger(ESTIMATE.estimatedCostMicros), "the estimate is integer micro-units");
}

async function verifyReservationPrecedesProviderCall(): Promise<void> {
  const harness = await createHarness({ budgetMicros: 100_000 });
  let observedReserved = -1;
  harness.fake.setMode("success");
  harness.fake.setOnInvoke(async () => {
    const summary = await harness.persistence.monthlyUsageMicros(BUSINESS_A, "2026-01");
    observedReserved = summary?.reservedMicros ?? -1;
  });

  const outcome = await submit(harness, "project help");
  assert(outcome.status === "ok", "the priced turn succeeds");
  assert(harness.fake.invocationCount() === 1, "the provider was invoked exactly once");
  assert(observedReserved === ESTIMATE.estimatedCostMicros,
    "the reservation existed before the provider was invoked");

  const usage = await harness.persistence.monthlyUsageMicros(BUSINESS_A, "2026-01");
  assert(usage !== null && usage.reservedMicros === 0, "no reservation remains after settlement");
  assert(usage.settledMicros === ESTIMATE.estimatedCostMicros,
    "the settled cost equals the reserved estimate");
}

async function verifyBudgetRefusalPrecedesProviderCall(): Promise<void> {
  const harness = await createHarness({
    budgetMicros: ESTIMATE.estimatedCostMicros - 1,
  });
  const outcome = await submit(harness, "project help");
  assert(outcome.status === "budget-exhausted", "a turn above the cap is refused");
  assert(harness.fake.invocationCount() === 0,
    "a refused turn never reaches the provider");
  const usage = await harness.persistence.monthlyUsageMicros(BUSINESS_A, "2026-01");
  assert(usage !== null && usage.settledMicros === 0 && usage.reservedMicros === 0,
    "a refused turn records no spending");
}

async function verifyConcurrentReservationsCannotOverspend(): Promise<void> {
  const cap = ESTIMATE.estimatedCostMicros * 2 - 1;
  const persistence = new InMemoryReceptionistPersistence();
  const scope = { businessProfileId: BUSINESS_A, businessProfileVersion: 1, conversationId: "concurrent" };
  const input = {
    scope,
    billingMonth: "2026-01",
    providerIdentifier: PRICING.providerIdentifier,
    modelIdentifier: PRICING.modelIdentifier,
    inputTokens: ESTIMATE.inputTokens,
    outputTokens: ESTIMATE.outputTokens,
    estimatedCostMicros: ESTIMATE.estimatedCostMicros,
    monthlyBudgetMicros: cap,
  };
  const results = await Promise.all([
    persistence.reserveUsage({ ...input, turnId: "turn-concurrent-a" }),
    persistence.reserveUsage({ ...input, turnId: "turn-concurrent-b" }),
  ]);
  assert(results.filter((result) => result === "reserved").length === 1,
    "exactly one of two concurrent reservations is granted");
  assert(results.filter((result) => result === "budget-exhausted").length === 1,
    "the other concurrent reservation is refused");
  const usage = await persistence.monthlyUsageMicros(BUSINESS_A, "2026-01");
  assert(usage !== null && usage.reservedMicros === ESTIMATE.estimatedCostMicros,
    "concurrent reservations never exceed the cap");
}

async function verifyDuplicateTurnReservesOnce(): Promise<void> {
  const harness = await createHarness({ budgetMicros: ESTIMATE.estimatedCostMicros });
  const turnId = nextTurnId();
  const first = await submit(harness, "project help", turnId);
  assert(first.status === "ok", "the first submission commits");

  const replay = await submit(harness, "project help", turnId);
  assert(replay.status === "ok" && replay.replayed === true,
    "the duplicate submission replays the recorded turn");
  assert(harness.fake.invocationCount() === 1,
    "the duplicate never reaches the provider a second time");

  const usage = await harness.persistence.monthlyUsageMicros(BUSINESS_A, "2026-01");
  assert(usage !== null && usage.settledMicros === ESTIMATE.estimatedCostMicros,
    "the duplicate is charged exactly once");
}

async function verifySettlementReplacesReservation(): Promise<void> {
  const harness = await createHarness({ budgetMicros: 100_000 });
  const outcome = await submit(harness, "project help");
  assert(outcome.status === "ok", "the settled turn succeeds");
  const usage = await harness.persistence.monthlyUsageMicros(BUSINESS_A, "2026-01");
  assert(usage !== null && usage.reservedMicros === 0 && usage.settledMicros > 0,
    "settlement converts the reservation into a single charge");
  assert(await harness.persistence.releaseReservation(harness.scope, harness.lastTurnId)
    === "not-found", "a settled charge cannot be released");
}

async function verifyConfirmedFailureRelease(): Promise<void> {
  const persistence = new InMemoryReceptionistPersistence();
  const scope = { businessProfileId: BUSINESS_A, businessProfileVersion: 1, conversationId: "release" };
  const reserved = await persistence.reserveUsage({
    scope,
    turnId: "turn-release-probe",
    billingMonth: "2026-01",
    providerIdentifier: PRICING.providerIdentifier,
    modelIdentifier: PRICING.modelIdentifier,
    inputTokens: 10,
    outputTokens: 10,
    estimatedCostMicros: 500,
    monthlyBudgetMicros: 10_000,
  });
  assert(reserved === "reserved", "the probe reservation is created");
  assert(await persistence.releaseReservation(scope, "turn-release-probe") === "released",
    "a reservation for a confirmed failure is released");
  assert(await persistence.releaseReservation(scope, "turn-release-probe") === "not-found",
    "releasing twice is a safe no-op");
  const usage = await persistence.monthlyUsageMicros(BUSINESS_A, "2026-01");
  assert(usage !== null && usage.reservedMicros === 0, "the released reservation stops counting");
}

async function verifyUnknownOutcomeIsHeldThenReconciled(): Promise<void> {
  let clock = JANUARY;
  const harness = await createHarness({
    budgetMicros: 100_000,
    now: () => clock,
    mode: "unavailable",
  });
  const outcome = await submit(harness, "project help");
  assert(outcome.status === "provider-failure", "the provider failure is sanitized");
  const held = await harness.persistence.monthlyUsageMicros(BUSINESS_A, "2026-01");
  assert(held !== null && held.reservedMicros === ESTIMATE.estimatedCostMicros,
    "an unknown provider outcome keeps its reservation instead of releasing it");

  clock = JANUARY;
  const tooEarly = await harness.service.reconcileReservations();
  assert(tooEarly === 0, "a reservation inside the bounded window is not released");

  clock = Date.now() + 10 * 60 * 1_000;
  const released = await harness.service.reconcileReservations();
  assert(released === 1, "the abandoned reservation is released after the window");
  const after = await harness.persistence.monthlyUsageMicros(BUSINESS_A, "2026-01");
  assert(after !== null && after.reservedMicros === 0, "reconciliation restores headroom");
}

async function verifyCrashRecoveryReleasesAbandonedReservation(): Promise<void> {
  const persistence = new InMemoryReceptionistPersistence();
  const scope = { businessProfileId: BUSINESS_A, businessProfileVersion: 1, conversationId: "crash" };
  await persistence.reserveUsage({
    scope,
    turnId: "turn-crash-probe",
    billingMonth: "2026-01",
    providerIdentifier: PRICING.providerIdentifier,
    modelIdentifier: PRICING.modelIdentifier,
    inputTokens: 10,
    outputTokens: 10,
    estimatedCostMicros: ESTIMATE.estimatedCostMicros,
    monthlyBudgetMicros: ESTIMATE.estimatedCostMicros,
  });

  // A fresh service stands in for a restarted process: the reservation survives,
  // but the request that created it does not.
  const restarted = new DurableReceptionistConversationService(
    [businessA(), businessB()],
    {
      persistence,
      now: () => Date.now() + 10 * 60 * 1_000,
      monthlyBudgetMicrosByBusiness: { [BUSINESS_A]: ESTIMATE.estimatedCostMicros },
      usageProviderIdentifier: PRICING.providerIdentifier,
      pricing: PRICING,
    },
  );
  const released = await restarted.reconcileReservations({ olderThanMs: 1 });
  assert(released === 1, "startup reconciliation releases the abandoned reservation");
  const usage = await persistence.monthlyUsageMicros(BUSINESS_A, "2026-01");
  assert(usage !== null && usage.reservedMicros === 0, "the budget is usable again after recovery");
}

async function verifyBillingMonthBoundaries(): Promise<void> {
  let clock = JANUARY;
  const harness = await createHarness({
    budgetMicros: ESTIMATE.estimatedCostMicros,
    now: () => clock,
  });
  const january = await submit(harness, "project help");
  assert(january.status === "ok", "the January turn commits");
  assert((await harness.persistence.monthlyUsageMicros(BUSINESS_A, "2026-01"))?.settledMicros
    === ESTIMATE.estimatedCostMicros, "January usage is recorded in January");

  clock = FEBRUARY;
  const february = await submit(harness, "project help");
  assert(february.status === "ok",
    "February is not charged for January spending");
  const februaryUsage = await harness.persistence.monthlyUsageMicros(BUSINESS_A, "2026-02");
  assert(februaryUsage !== null && februaryUsage.settledMicros === ESTIMATE.estimatedCostMicros,
    "February usage is recorded separately");
  assert(utcBillingMonth(JANUARY) === "2026-01" && utcBillingMonth(FEBRUARY) === "2026-02",
    "billing months are derived in UTC");
}

async function verifyCrossBusinessIsolation(): Promise<void> {
  const harness = await createHarness({ budgetMicros: ESTIMATE.estimatedCostMicros });
  const outcome = await submit(harness, "project help");
  assert(outcome.status === "ok", "business A spends its budget");

  const handleB = await harness.service.begin(BUSINESS_B, `conversation-${randomBytes(6).toString("hex")}`);
  assert(handleB !== null, "the second business has its own conversation");
  const second = await harness.service.submit({
    handle: handleB,
    message: "project help",
    turnId: nextTurnId(),
  });
  assert(second.status === "ok", "business B is not constrained by business A spending");

  const usageA = await harness.persistence.monthlyUsageMicros(BUSINESS_A, "2026-01");
  const usageB = await harness.persistence.monthlyUsageMicros(BUSINESS_B, "2026-01");
  assert(usageA !== null && usageB !== null
    && usageA.settledMicros === ESTIMATE.estimatedCostMicros
    && usageB.settledMicros === ESTIMATE.estimatedCostMicros,
    "each business keeps its own accounting");
}

async function verifyProviderFailureCannotMutateState(): Promise<void> {
  const harness = await createHarness({ budgetMicros: 100_000, mode: "unavailable" });
  const outcome = await submit(harness, "project help");
  assert(outcome.status === "provider-failure", "the failed turn reports a sanitized failure");
  assert(harness.fake.invocationCount() === 1, "the provider was attempted once");
  const loaded = await harness.persistence.loadConversation(harness.scope);
  assert(loaded.status === "found" && loaded.conversation.turnNumber === 0,
    "a provider failure mutates no conversation state");
  assert(loaded.status === "found" && loaded.conversation.messages.length === 1,
    "a provider failure appends no message");
}

async function verifyUnknownProviderFailsClosed(): Promise<void> {
  const persistence = new InMemoryReceptionistPersistence();
  const fake = createFakeProvider({ mode: "success" });
  const service = new DurableReceptionistConversationService(
    [businessA()],
    {
      persistence,
      transport: fake.transport,
      now: () => JANUARY,
      monthlyBudgetMicrosByBusiness: { [BUSINESS_A]: 1_000_000 },
      usageProviderIdentifier: "unlisted-provider/v9",
    },
  );
  const handle = await service.begin(BUSINESS_A, `conversation-${randomBytes(6).toString("hex")}`);
  assert(handle !== null, "the conversation is created");
  const outcome = await service.submit({ handle, message: "project help", turnId: nextTurnId() });
  assert(outcome.status === "internal-failure",
    "an unpriceable provider fails closed instead of running outside the budget guard");
  assert(fake.invocationCount() === 0, "no provider work occurs without an allowlisted price");
}

async function verifyProviderDisabledPathReservesNothing(): Promise<void> {
  const persistence = new InMemoryReceptionistPersistence();
  const fake = createFakeProvider({ mode: "success" });
  const service = new DurableReceptionistConversationService(
    [businessA()],
    {
      persistence,
      transport: fake.transport,
      now: () => JANUARY,
      monthlyBudgetMicrosByBusiness: { [BUSINESS_A]: 10_000 },
    },
  );
  const handle = await service.begin(BUSINESS_A, `conversation-${randomBytes(6).toString("hex")}`);
  assert(handle !== null, "the conversation is created");
  const outcome = await service.submit({ handle, message: "project help", turnId: nextTurnId() });
  assert(outcome.status === "ok", "the offline path still serves a turn");
  const usage = await persistence.monthlyUsageMicros(BUSINESS_A, "2026-01");
  assert(usage !== null && usage.settledMicros === 0 && usage.reservedMicros === 0,
    "the zero-cost offline provider reserves and charges nothing");
}

async function verifySensitiveDataIsNotStored(): Promise<void> {
  const harness = await createHarness({ budgetMicros: 100_000 });
  const secret = "Jordan Example lives at 12 Fictional Lane";
  const outcome = await submit(harness, secret);
  assert(outcome.status === "ok", "the sensitive-content probe turn succeeds");
  const usage = await harness.persistence.monthlyUsageMicros(BUSINESS_A, "2026-01");
  const serialized = JSON.stringify(usage);
  assert(!serialized.includes(secret), "usage summaries contain no conversation text");
  const receipt = await harness.persistence.loadTurnReceipt(harness.scope, harness.lastTurnId);
  assert(receipt.status === "found", "the receipt exists");
  if (receipt.status !== "found") return;
  // The receipt record itself is operational metadata. Its `messages` are
  // replayed from the existing message store, which is the conversation record,
  // so the metadata projection is what must stay free of conversation text.
  const { messages: replayed, ...metadata } = receipt.receipt;
  const receiptText = JSON.stringify(metadata);
  assert(!receiptText.includes(secret), "turn receipt metadata contains no conversation text");
  assert(!receiptText.includes("Jordan"), "turn receipt metadata contains no customer name");
  assert(replayed.length > 0, "the receipt still resolves its replayed messages");
}

interface Harness {
  readonly persistence: InMemoryReceptionistPersistence;
  readonly service: DurableReceptionistConversationService;
  readonly fake: ReturnType<typeof createFakeProvider>;
  readonly scope: { businessProfileId: string; businessProfileVersion: number; conversationId: string };
  lastTurnId: string;
}

async function createHarness(options: {
  budgetMicros: number;
  mode?: FakeProviderMode;
  now?: () => number;
}): Promise<Harness> {
  const persistence = new InMemoryReceptionistPersistence();
  const fake = createFakeProvider({ mode: options.mode ?? "success" });
  const service = new DurableReceptionistConversationService(
    [businessA(), businessB()],
    {
      persistence,
      transport: fake.transport,
      now: options.now ?? (() => JANUARY),
      monthlyBudgetMicrosByBusiness: {
        [BUSINESS_A]: options.budgetMicros,
        [BUSINESS_B]: options.budgetMicros,
      },
      usageProviderIdentifier: PRICING.providerIdentifier,
      pricing: PRICING,
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
    lastTurnId: "",
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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Stage B2.4A budget verification failed: ${message}.`);
  }
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Budget verification failed.");
  process.exitCode = 1;
});
