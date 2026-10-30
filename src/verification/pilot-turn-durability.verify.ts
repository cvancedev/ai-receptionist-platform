import { randomBytes } from "node:crypto";
import type { BusinessProfile } from "../domain/business-profile";
import { fictionalBusinessProfile } from "../fixtures/business-profile";
import {
  SESSION_COOKIE_NAME,
  type IssuedSession,
} from "../server/auth/session-authority";
import {
  createInitialConversationState,
  type ReceptionistBusiness,
} from "../server/conversation/receptionist-conversation-service";
import { handleReceptionistTurn } from "../server/http/receptionist-turn-handler";
import {
  createPilotReceptionistRuntime,
  type PilotReceptionistRuntime,
} from "../server/pilot/pilot-runtime";
import { composePilotRuntime } from "../server/pilot/pilot-runtime-provider";
import {
  InMemoryReceptionistPersistence,
} from "../server/persistence/in-memory-receptionist-persistence";
import {
  DEFAULT_MONTHLY_BUDGET_MICROS,
  type CommitTurnInput,
  type ConversationPersistenceScope,
  type ReceptionistPersistence,
} from "../server/persistence/receptionist-persistence";
import {
  createReceptionistRuntime,
  type ReceptionistTurnRuntime,
} from "../server/runtime/receptionist-runtime";

const BUSINESS_A = fictionalBusinessProfile.id;
const BUSINESS_B = "second-fictional-business";
const WIDGET_A = "widget-durability-alpha";
const WIDGET_B = "widget-durability-beta";
const APP_ORIGIN = "https://pilot.example.invalid";
const SECOND_ORIGIN = "https://second.example.invalid";
const TURN_PATH = `${APP_ORIGIN}/api/receptionist/turn`;
const PILOT_DATABASE_REFERENCE = "AI_RECEPTIONIST_PILOT_DATABASE_URL";
const SESSION_TTL_MS = 15 * 60 * 1_000;
const CLOCK = 1_000_000;

interface TurnBody {
  readonly ok: boolean;
  readonly mode?: string;
  readonly simulated?: boolean;
  readonly error?: { readonly code: string };
  readonly data?: {
    readonly turnId: string;
    readonly replayed: boolean;
    readonly turn: number;
    readonly messages: readonly { readonly role: string; readonly text: string }[];
    readonly conversation: {
      readonly revision: number;
      readonly stage: string;
      readonly readiness: string;
    };
  };
}

interface Harness {
  readonly persistence: InMemoryReceptionistPersistence;
  readonly runtime: PilotReceptionistRuntime;
  readonly session: IssuedSession;
  readonly scope: ConversationPersistenceScope;
}

async function run(): Promise<void> {
  await verifyIdenticalRetryReplays();
  await verifyReplayAfterRestartAndLaterTurns();
  await verifyConcurrentIdenticalRequests();
  await verifyConcurrentDifferentRequestsConflict();
  await verifyIdentifierReuseWithDifferentContent();
  await verifyTransactionRollback();
  await verifyBusinessAndConversationIsolation();
  await verifyAtomicUsageAndBudget();
  await verifyConflictAndBudgetHttpMapping();
  await verifyOutdatedSchemaFailsClosed();
  await verifyDemoCompatibility();

  console.log(
    "Stage B2.3.3 turn durability verification passed: identical retry replay, replay "
    + "across restart and later turns, concurrent duplicate and conflicting turns, "
    + "identifier reuse refusal, transactional rollback, business and conversation "
    + "isolation, atomic usage, budget refusal, sanitized conflict mapping, outdated "
    + "schema fail-closed behavior, and unchanged demo compatibility.",
  );
}

async function verifyIdenticalRetryReplays(): Promise<void> {
  const harness = await createHarness();
  const turnId = nextTurnId();
  const first = await turn(harness.runtime, harness.session, "project help", turnId);
  const firstBody = await bodyOf(first);
  assert(first.status === 200 && firstBody.data?.replayed === false,
    "the first submission commits a new turn");
  const revision = firstBody.data?.conversation.revision ?? -1;
  const messagesAfterFirst = await messageCount(harness);

  const retry = await turn(harness.runtime, harness.session, "project help", turnId);
  const retryBody = await bodyOf(retry);
  assert(retry.status === 200 && retryBody.data?.replayed === true,
    "an identical retry is answered from its recorded receipt");
  assert(retryBody.data?.turn === firstBody.data?.turn,
    "the replay reports the recorded turn number");
  assert(retryBody.data?.conversation.revision === revision,
    "the replay reports the recorded revision");
  assert(JSON.stringify(retryBody.data?.messages) === JSON.stringify(firstBody.data?.messages),
    "the replay returns the recorded messages exactly");
  assert(await messageCount(harness) === messagesAfterFirst,
    "a replay appends no duplicate messages");
  const loaded = await harness.persistence.loadConversation(harness.scope);
  assert(loaded.status === "found" && loaded.conversation.turnNumber === 1,
    "a replay does not advance the durable turn number");

  const receipt = await harness.persistence.loadTurnReceipt(harness.scope, turnId);
  assert(receipt.status === "found" && receipt.receipt.turnNumber === 1,
    "the receipt is durable and business scoped");
  assert(await harness.persistence.monthlyUsageMicros(BUSINESS_A, null) !== null,
    "usage accounting is available for the business");
}

async function verifyReplayAfterRestartAndLaterTurns(): Promise<void> {
  const harness = await createHarness();
  const firstTurnId = nextTurnId();
  const first = await turn(harness.runtime, harness.session, "project help", firstTurnId);
  const firstBody = await bodyOf(first);
  assert(first.status === 200, "the first turn is committed before the restart");

  const secondTurnId = nextTurnId();
  const second = await turn(harness.runtime, harness.session, "what does it cost?", secondTurnId);
  const secondBody = await bodyOf(second);
  assert(second.status === 200, "a later turn commits after the first");
  assert((secondBody.data?.conversation.revision ?? 0)
    > (firstBody.data?.conversation.revision ?? 0),
  "the later turn advances the revision");

  // A new runtime over the same durable store models a process restart.
  const restarted = buildRuntime(harness.persistence);
  const authenticated = await restarted.sessions.authenticate(
    harness.session.token,
    harness.session.csrfToken,
  );
  assert(authenticated.status === "authenticated" && authenticated.principal.conversationHandle === null,
    "the session survives the restart without a raw handle");

  const replay = await turn(restarted, harness.session, "project help", firstTurnId);
  const replayBody = await bodyOf(replay);
  assert(replay.status === 200 && replayBody.data?.replayed === true,
    "an old turn replays after a restart");
  assert(replayBody.data?.conversation.revision === firstBody.data?.conversation.revision,
    "replay returns the originally recorded revision, not the latest state");
  assert(replayBody.data?.turn === firstBody.data?.turn,
    "replay returns the originally recorded turn number");

  const loaded = await harness.persistence.loadConversation(harness.scope);
  assert(loaded.status === "found"
    && loaded.conversation.state.revision === secondBody.data?.conversation.revision
    && loaded.conversation.turnNumber === 2,
  "replaying an old turn cannot roll durable state backwards");
}

async function verifyConcurrentIdenticalRequests(): Promise<void> {
  const harness = await createHarness();
  const turnId = nextTurnId();
  const [left, right] = await Promise.all([
    turn(harness.runtime, harness.session, "project help", turnId),
    turn(harness.runtime, harness.session, "project help", turnId),
  ]);
  const leftBody = await bodyOf(left);
  const rightBody = await bodyOf(right);
  assert(left.status === 200 && right.status === 200,
    "both concurrent duplicates settle without an error");
  assert((leftBody.data?.replayed === true) !== (rightBody.data?.replayed === true),
    "exactly one concurrent duplicate commits and the other replays");
  assert(leftBody.data?.turn === rightBody.data?.turn,
    "both duplicates report the same committed turn");
  assert(leftBody.data?.conversation.revision === rightBody.data?.conversation.revision,
    "both duplicates report the same committed revision");

  const loaded = await harness.persistence.loadConversation(harness.scope);
  assert(loaded.status === "found" && loaded.conversation.turnNumber === 1,
    "concurrent duplicates advance the turn number exactly once");
  const appended = leftBody.data?.messages.length ?? -1;
  const finalMessageCount = await messageCount(harness);
  assert(appended > 0 && finalMessageCount === 1 + appended,
    `concurrent duplicates append one turn's messages exactly once (count ${finalMessageCount})`);
}

async function verifyConcurrentDifferentRequestsConflict(): Promise<void> {
  const harness = await createHarness();
  const snapshot = await harness.persistence.loadConversation(harness.scope);
  assert(snapshot.status === "found", "a snapshot is available for the conflict test");
  if (snapshot.status !== "found") return;

  const [left, right] = await Promise.all([
    harness.persistence.commitTurn(commitInput(snapshot.conversation, nextTurnId(), 0, DEFAULT_MONTHLY_BUDGET_MICROS)),
    harness.persistence.commitTurn(commitInput(snapshot.conversation, nextTurnId(), 0, DEFAULT_MONTHLY_BUDGET_MICROS)),
  ]);
  assert([left, right].filter((result) => result === "committed").length === 1,
    "exactly one stale-revision turn commits");
  assert([left, right].filter((result) => result === "conflict").length === 1,
    "the other stale-revision turn is a conflict");

  const loaded = await harness.persistence.loadConversation(harness.scope);
  assert(loaded.status === "found" && loaded.conversation.turnNumber === 1,
    "only one conflicting turn is recorded");
  const ids = loaded.status === "found"
    ? loaded.conversation.messages.map((message) => message.messageId)
    : [];
  assert(new Set(ids).size === ids.length,
    "the losing turn appends no duplicate message identity");
}

async function verifyIdentifierReuseWithDifferentContent(): Promise<void> {
  const harness = await createHarness();
  const turnId = nextTurnId();
  const first = await turn(harness.runtime, harness.session, "project help", turnId);
  assert(first.status === 200, "the identifier is first used for a committed turn");
  const messagesBefore = await messageCount(harness);
  const revisionBefore = (await bodyOf(first)).data?.conversation.revision;

  const reused = await turn(harness.runtime, harness.session, "different message", turnId);
  const reusedBody = await bodyOf(reused);
  assert(reused.status === 409 && reusedBody.error?.code === "turn_conflict",
    "reusing an identifier with different content is refused as a turn conflict");
  assert(await messageCount(harness) === messagesBefore,
    "identifier reuse cannot append messages");
  const loaded = await harness.persistence.loadConversation(harness.scope);
  assert(loaded.status === "found"
    && loaded.conversation.state.revision === revisionBefore
    && loaded.conversation.turnNumber === 1,
  "identifier reuse cannot mutate durable state");
}

async function verifyTransactionRollback(): Promise<void> {
  const inner = new InMemoryReceptionistPersistence();
  const failing = failOnceThenCommit(inner);
  const runtime = buildRuntime(failing);
  const session = await issueCustomer(runtime, WIDGET_A);
  const scope = scopeOf(session);

  const turnId = nextTurnId();
  const response = await turn(runtime, session, "project help", turnId);
  assert(response.status === 500, "a failed turn transaction returns a sanitized failure");

  const receipt = await inner.loadTurnReceipt(scope, turnId);
  assert(receipt.status === "not-found",
    "a failed transaction leaves no receipt");
  const usage = await inner.monthlyUsageMicros(BUSINESS_A, null);
  assert(usage !== null && usage.settledMicros === 0 && usage.reservedMicros === 0,
    "a failed transaction leaves no usage charge");
  const loaded = await inner.loadConversation(scope);
  assert(loaded.status === "found"
    && loaded.conversation.state.revision === 0
    && loaded.conversation.turnNumber === 0,
  "a failed transaction leaves state unchanged");

  const retry = await turn(runtime, session, "project help", turnId);
  assert(retry.status === 200, "the same identifier succeeds after a failed transaction");
}

async function verifyBusinessAndConversationIsolation(): Promise<void> {
  const harness = await createHarness();
  const sessionB = await issueCustomer(harness.runtime, WIDGET_B);
  const scopeB = scopeOf(sessionB);
  assert(scopeB.businessProfileId === BUSINESS_B,
    "the second widget binds to the second business");

  const turnId = nextTurnId();
  const committed = await turn(harness.runtime, harness.session, "project help", turnId);
  assert(committed.status === 200, "the receipt is created for business A");

  const crossBusiness = await harness.persistence.loadTurnReceipt(scopeB, turnId);
  assert(crossBusiness.status === "not-found",
    "another business cannot read the receipt");

  const secondConversation = await issueCustomer(harness.runtime, WIDGET_A);
  const scopeOtherConversation = scopeOf(secondConversation);
  const crossConversation = await harness.persistence.loadTurnReceipt(
    scopeOtherConversation,
    turnId,
  );
  assert(crossConversation.status === "not-found",
    "another conversation cannot read the receipt");

  const independent = await turn(
    harness.runtime,
    secondConversation,
    "project help",
    turnId,
  );
  const independentBody = await bodyOf(independent);
  assert(independent.status === 200 && independentBody.data?.replayed === false,
    "the same identifier in another conversation is an independent turn");

  const loadedB = await harness.persistence.loadConversation(scopeB);
  assert(loadedB.status === "found" && loadedB.conversation.turnNumber === 0,
    "cross-business attempts cannot mutate the other conversation");
}

async function verifyAtomicUsageAndBudget(): Promise<void> {
  const persistence = new InMemoryReceptionistPersistence();
  await persistence.createConversation(seedFor("budget-conversation"));

  const scope: ConversationPersistenceScope = {
    businessProfileId: BUSINESS_A,
    businessProfileVersion: fictionalBusinessProfile.version,
    conversationId: "budget-conversation",
  };
  const snapshot = await persistence.loadConversation(scope);
  assert(snapshot.status === "found", "the budget conversation is seeded");

  const turnId = nextTurnId();
  const input = commitInput(snapshot.conversation, turnId, 5, 10);
  assert(await persistence.commitTurn(input) === "committed",
    "a cost-bearing turn commits atomically");
  assert(await persistence.commitTurn({ ...input, requestDigest: input.requestDigest }) === "replayed",
    "retrying the cost-bearing turn replays instead of charging again");

  const usage = await persistence.monthlyUsageMicros(BUSINESS_A, null);
  assert(usage !== null && usage.settledMicros === 5,
    "usage is recorded exactly once for the committed turn");

  const afterFirst = await persistence.loadConversation(scope);
  assert(afterFirst.status === "found", "the committed conversation is readable");
  if (afterFirst.status !== "found") return;
  const exhausted = await persistence.commitTurn(
    commitInput(afterFirst.conversation, nextTurnId(), 6, 10),
  );
  assert(exhausted === "budget-exhausted",
    "a turn that would exceed the monthly cap is refused");
  const afterExhaustion = await persistence.loadConversation(scope);
  assert(afterExhaustion.status === "found"
    && afterExhaustion.conversation.turnNumber === afterFirst.conversation.turnNumber,
  "a budget refusal writes no state change");
  const usageAfter = await persistence.monthlyUsageMicros(BUSINESS_A, null);
  assert(usageAfter !== null && usageAfter.settledMicros === 5,
    "a budget refusal writes no usage charge");
}

async function verifyConflictAndBudgetHttpMapping(): Promise<void> {
  const demo = createReceptionistRuntime();
  const session = demo.issueSession(BUSINESS_A, "customer:durability");
  const budgetRuntime = stubOutcome(demo, { status: "budget-exhausted" });
  const budget = await turn(budgetRuntime, session, "project help", nextTurnId());
  const budgetBody = await bodyOf(budget);
  assert(budget.status === 402 && budgetBody.error?.code === "budget_exhausted",
    "a budget refusal maps to a sanitized 402");

  const staleRuntime = stubOutcome(demo, { status: "conflict", reason: "stale" });
  const stale = await turn(staleRuntime, session, "project help", nextTurnId());
  assert(stale.status === 409
    && (await bodyOf(stale)).error?.code === "conversation_conflict",
  "a stale conflict maps to a sanitized 409");

  const mismatchRuntime = stubOutcome(demo, { status: "conflict", reason: "turn-mismatch" });
  const mismatch = await turn(mismatchRuntime, session, "project help", nextTurnId());
  assert(mismatch.status === 409
    && (await bodyOf(mismatch)).error?.code === "turn_conflict",
  "an identifier-reuse conflict maps to a sanitized 409");
}

async function verifyOutdatedSchemaFailsClosed(): Promise<void> {
  const configuration = {
    environment: "pilot",
    requireSecureTransport: true,
    providerNetworkExecution: "disabled",
    sessionTtlMs: SESSION_TTL_MS,
    persistence: { mode: "durable", credentialReference: PILOT_DATABASE_REFERENCE },
    businesses: [
      { businessId: BUSINESS_A, widgetId: WIDGET_A, allowedOrigins: [APP_ORIGIN] },
      { businessId: BUSINESS_B, widgetId: WIDGET_B, allowedOrigins: [SECOND_ORIGIN] },
    ],
  };
  const businesses = [defaultBusiness(), secondBusiness()];

  for (const version of [8, 0, null]) {
    const outdated = withSchemaVersion(new InMemoryReceptionistPersistence(), version);
    const composed = await composePilotRuntime({
      configuration,
      businesses,
      environment: { [PILOT_DATABASE_REFERENCE]: "postgresql://example.invalid/pilot" },
      persistenceFactory: () => outdated,
    });
    assert(composed.status === "rejected" && composed.reason === "SchemaOutdated",
      `schema version ${String(version)} is refused at composition`);
  }

  const current = await composePilotRuntime({
    configuration,
    businesses,
    environment: { [PILOT_DATABASE_REFERENCE]: "postgresql://example.invalid/pilot" },
    persistenceFactory: () => new InMemoryReceptionistPersistence(),
  });
  assert(current.status === "created", "the current schema version composes the pilot");
}

async function verifyDemoCompatibility(): Promise<void> {
  const demo = createReceptionistRuntime();
  const session = demo.issueSession(BUSINESS_A, "customer:demo");
  const response = await turn(demo, session, "project help", null);
  const body = await bodyOf(response);
  assert(response.status === 200, "the demonstration still serves a turn without a client identifier");
  assert(body.mode === "demo" && body.simulated === true,
    "the demonstration remains clearly labelled");
  assert(body.data?.replayed === false && body.data?.turnId.startsWith("auto-"),
    "the demonstration generates a local identifier and claims no replay");
}

async function createHarness(): Promise<Harness> {
  const persistence = new InMemoryReceptionistPersistence();
  const runtime = buildRuntime(persistence);
  const session = await issueCustomer(runtime, WIDGET_A);
  return { persistence, runtime, session, scope: scopeOf(session) };
}

function buildRuntime(persistence: ReceptionistPersistence): PilotReceptionistRuntime {
  const result = createPilotReceptionistRuntime({
    configuration: {
      environment: "pilot",
      requireSecureTransport: true,
      providerNetworkExecution: "disabled",
      sessionTtlMs: SESSION_TTL_MS,
      persistence: { mode: "durable", credentialReference: PILOT_DATABASE_REFERENCE },
      businesses: [
        {
          businessId: BUSINESS_A,
          widgetId: WIDGET_A,
          allowedOrigins: [APP_ORIGIN],
          monthlyBudgetMicros: DEFAULT_MONTHLY_BUDGET_MICROS,
        },
        {
          businessId: BUSINESS_B,
          widgetId: WIDGET_B,
          allowedOrigins: [SECOND_ORIGIN],
          monthlyBudgetMicros: DEFAULT_MONTHLY_BUDGET_MICROS,
        },
      ],
    },
    businesses: [defaultBusiness(), secondBusiness()],
    persistence,
    databaseCredentialReference: PILOT_DATABASE_REFERENCE,
    now: () => CLOCK,
    ipRateLimit: { limit: 1_000, windowMs: 60_000 },
    sessionRateLimit: { limit: 1_000, windowMs: 60_000 },
  });
  assert(result.status === "created", "the durability pilot runtime is created");
  if (result.status !== "created") throw new Error("unreachable");
  return result.runtime;
}

async function issueCustomer(
  runtime: PilotReceptionistRuntime,
  widgetId: string,
): Promise<IssuedSession> {
  const issued = await runtime.issueCustomerSession({
    widgetId,
    origin: widgetId === WIDGET_A ? APP_ORIGIN : SECOND_ORIGIN,
  });
  assert(issued.status === "issued", "a durability customer session is issued");
  if (issued.status !== "issued") throw new Error("unreachable");
  return issued.session;
}

async function turn(
  runtime: ReceptionistTurnRuntime,
  session: IssuedSession,
  message: string,
  turnId: string | null,
): Promise<Response> {
  const headers = new Headers();
  headers.set("content-type", "application/json");
  headers.set("cookie", session.cookie.split(";")[0] ?? `${SESSION_COOKIE_NAME}=`);
  headers.set("x-csrf-token", session.csrfToken);
  headers.set("x-forwarded-for", "198.51.100.210");
  return handleReceptionistTurn(new Request(TURN_PATH, {
    method: "POST",
    headers,
    body: JSON.stringify(turnId === null ? { message } : { message, turnId }),
  }), runtime);
}

function stubOutcome(
  runtime: ReturnType<typeof createReceptionistRuntime>,
  outcome: { readonly status: "budget-exhausted" }
    | { readonly status: "conflict"; readonly reason: "stale" | "turn-mismatch" },
): ReceptionistTurnRuntime {
  return {
    ...runtime,
    conversations: {
      hasBusiness: runtime.conversations.hasBusiness.bind(runtime.conversations),
      submit: async () => Object.freeze(outcome),
    },
  } as unknown as ReceptionistTurnRuntime;
}

function scopeOf(session: IssuedSession): ConversationPersistenceScope {
  return {
    businessProfileId: session.principal.businessId,
    businessProfileVersion: session.principal.businessProfileVersion
      ?? fictionalBusinessProfile.version,
    conversationId: session.principal.conversationId,
  };
}

async function messageCount(harness: Harness): Promise<number> {
  const loaded = await harness.persistence.loadConversation(harness.scope);
  assert(loaded.status === "found", "the conversation is readable");
  return loaded.status === "found" ? loaded.conversation.messages.length : -1;
}

async function bodyOf(response: Response): Promise<TurnBody> {
  return JSON.parse(await response.text()) as TurnBody;
}

function nextTurnId(): string {
  return `turn-${randomBytes(12).toString("hex")}`;
}

function commitInput(
  conversation: {
    readonly scope: ConversationPersistenceScope;
    readonly state: CommitTurnInput["state"];
    readonly pendingFieldId: string | null;
    readonly handoffAvailable: boolean;
    readonly turnNumber: number;
    readonly nextMessageId: number;
  },
  turnId: string,
  costMicros: number,
  budgetMicros: number,
): CommitTurnInput {
  return {
    scope: conversation.scope,
    turnId,
    requestDigest: randomBytes(32).toString("hex"),
    outcomeCode: "accepted",
    stage: conversation.state.stage,
    readiness: "not-ready",
    durationMs: 1,
    usage: {
      providerIdentifier: "simulated-offline-model-transport/v1",
      modelIdentifier: null,
      inputTokens: 0,
      outputTokens: 0,
      costMicros,
    },
    monthlyBudgetMicros: budgetMicros,
    billingMonth: "1970-01",
    expectedRevision: conversation.state.revision,
    expectedTurnNumber: conversation.turnNumber,
    state: conversation.state,
    pendingFieldId: conversation.pendingFieldId,
    handoffAvailable: conversation.handoffAvailable,
    turnNumber: conversation.turnNumber + 1,
    nextMessageId: conversation.nextMessageId + 1,
    messages: [{
      messageId: conversation.nextMessageId,
      role: "customer",
      content: "budget probe",
    }],
  };
}

function seedFor(
  conversationId: string,
): Parameters<InMemoryReceptionistPersistence["createConversation"]>[0] {
  const state = createInitialConversationState(defaultBusiness(), conversationId);
  assert(state !== null, "the initial conversation state is available");
  if (state === null) throw new Error("unreachable");
  return {
    scope: {
      businessProfileId: BUSINESS_A,
      businessProfileVersion: fictionalBusinessProfile.version,
      conversationId,
    },
    handleHash: randomBytes(32).toString("hex"),
    state,
    greeting: { messageId: 1, role: "assistant", content: "Fictional greeting." },
  };
}

function failOnceThenCommit(
  inner: InMemoryReceptionistPersistence,
): ReceptionistPersistence {
  let failed = false;
  return new Proxy(inner, {
    get(target, property) {
      if (property === "commitTurn" && !failed) {
        return async () => {
          failed = true;
          return "failure" as const;
        };
      }
      const value = Reflect.get(target, property) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as ReceptionistPersistence;
}

function withSchemaVersion(
  persistence: InMemoryReceptionistPersistence,
  version: number | null,
): ReceptionistPersistence {
  return new Proxy(persistence, {
    get(target, property) {
      if (property === "readSchemaVersion") return async () => version;
      const value = Reflect.get(target, property) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as ReceptionistPersistence;
}

function defaultBusiness(): ReceptionistBusiness {
  return { profile: fictionalBusinessProfile, knowledge: [] };
}

function secondBusiness(): ReceptionistBusiness {
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
    throw new Error(`Stage B2.3.3 turn durability verification failed: ${message}.`);
  }
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Turn durability verification failed.");
  process.exitCode = 1;
});
