import { createHash } from "node:crypto";
import { fictionalBusinessProfile } from "../fixtures/business-profile";
import { createAiDemoChatSession } from "../prototype-ui/ai-demo-chat-session";
import type { BusinessProfile } from "../domain/business-profile";
import { digestConversationHandle } from "../server/auth/conversation-handle";
import {
  SESSION_COOKIE_NAME,
  digestSessionToken,
  type IssuedSession,
} from "../server/auth/session-authority";
import type { ReceptionistBusiness } from "../server/conversation/receptionist-conversation-service";
import { handleReceptionistTurn } from "../server/http/receptionist-turn-handler";
import {
  createPilotReceptionistRuntime,
  type PilotReceptionistRuntime,
} from "../server/pilot/pilot-runtime";
import { CERTIFIED_POSTGRESQL_MIGRATIONS, verifyCertifiedPostgresqlMigrationSources } from "../persistence/postgresql/migration-runner";
import { InMemoryReceptionistPersistence } from "../server/persistence/in-memory-receptionist-persistence";
import type {
  CommitTurnInput,
  ReceptionistPersistence,
} from "../server/persistence/receptionist-persistence";

const BUSINESS_A = fictionalBusinessProfile.id;
const BUSINESS_B = "second-fictional-business";
const WIDGET_A = "widget-fictional-alpha";
const WIDGET_B = "widget-fictional-beta";
const APP_ORIGIN = "https://pilot.example.invalid";
const SECOND_ORIGIN = "https://second.example.invalid";
const TURN_PATH = `${APP_ORIGIN}/api/receptionist/turn`;
const OPERATOR_CREDENTIAL = "fictional-pilot-operator-credential";
const DATABASE_REFERENCE = "AI_RECEPTIONIST_PILOT_DATABASE_URL";
const SESSION_TTL_MS = 15 * 60 * 1_000;
const DEFAULT_IP = "198.51.100.130";

interface ApiBody {
  readonly ok: boolean;
  readonly error?: { readonly code: string };
  readonly data?: {
    readonly businessId: string;
    readonly conversationId: string;
    readonly turn: number;
    readonly messages: readonly { readonly role: string; readonly text: string }[];
    readonly conversation: {
      readonly stage: string;
      readonly revision: number;
      readonly pendingFieldId: string | null;
      readonly readiness: string;
    };
    readonly authority: {
      readonly stateMutationAuthorized: boolean;
      readonly customerReleaseAuthorized: boolean;
      readonly externalActionAuthorized: boolean;
    };
    readonly provider: string;
    readonly networkAccessed: boolean;
  };
}

async function run(): Promise<void> {
  await verifyMigrationRegistration();
  await verifyConversationAndMessagePersistence();
  await verifySessionPersistenceAndRestartRecovery();
  await verifySessionExpirationAndRevocation();
  await verifyCrossBusinessIsolation();
  await verifyConcurrentTurnSerialization();
  await verifyAtomicCommitFailure();
  await verifyPersistenceFailureIsSanitized();
  await verifyHashedRepresentationsOnly();
  await verifyDemoCompatibility();

  console.log(
    "Stage B2.3.2A persistence verification passed: durable conversations and messages, "
    + "session survival across restart, expiration and revocation, business isolation, "
    + "serialized concurrent turns, atomic turn refusal, sanitized storage failure, "
    + "hash-only handles and tokens, and unchanged demo behavior.",
  );
}

async function verifyMigrationRegistration(): Promise<void> {
  const last = CERTIFIED_POSTGRESQL_MIGRATIONS.at(-1);
  assert(last?.version === 8 && last.name === "receptionist_persistence",
    "migration 008 is registered in the certified manifest");
  assert(CERTIFIED_POSTGRESQL_MIGRATIONS.slice(0, 7).every((migration, index) =>
    migration.version === index + 1),
  "the certified 001-007 prefix is unchanged");
  await verifyCertifiedPostgresqlMigrationSources();
}

async function verifyConversationAndMessagePersistence(): Promise<void> {
  const persistence = new InMemoryReceptionistPersistence();
  const clock = { value: 10_000_000 };
  const runtime = buildRuntime(persistence, () => clock.value);
  const session = await issueCustomer(runtime, WIDGET_A);
  const scope = {
    businessProfileId: BUSINESS_A,
    businessProfileVersion: fictionalBusinessProfile.version,
    conversationId: session.principal.conversationId,
  };

  const created = await persistence.loadConversation(scope);
  assert(created.status === "found", "the conversation is persisted at issuance");
  if (created.status !== "found") return;
  assert(created.conversation.state.revision === 0,
    "a new conversation starts at revision zero");
  assert(created.conversation.messages.length === 1
    && created.conversation.messages[0]?.role === "assistant",
  "the greeting is persisted with the conversation");
  assert(created.conversation.nextMessageId === 2,
    "the next message identity is persisted");

  const response = await turn(runtime, session, "project help");
  const body = await responseJson(response);
  assert(response.status === 200 && body.data !== undefined,
    "a durable turn is served");
  const revision = body.data?.conversation.revision ?? -1;
  assert(revision > 0, "an accepted turn advances the durable revision");

  const reloaded = await persistence.loadConversation(scope);
  assert(reloaded.status === "found", "the committed conversation can be reloaded");
  if (reloaded.status !== "found") return;
  assert(reloaded.conversation.state.revision === revision,
    "stored revision matches the served revision");
  assert(reloaded.conversation.turnNumber === 1, "the turn number is persisted");
  assert(reloaded.conversation.messages.length >= 3,
    "customer and assistant messages are appended");
  const ids = reloaded.conversation.messages.map((message) => message.messageId);
  assert(new Set(ids).size === ids.length, "stored message identities are unique");
  assert(reloaded.conversation.messages.some((message) =>
    message.role === "customer" && message.content === "project help"),
  "the customer message is persisted verbatim");
  assert(reloaded.conversation.pendingFieldId === body.data?.conversation.pendingFieldId,
    "pending field metadata matches the served conversation");
  assert(body.data?.authority.stateMutationAuthorized === false
    && body.data?.authority.customerReleaseAuthorized === false
    && body.data?.authority.externalActionAuthorized === false,
  "a durable turn keeps every authority flag false");
}

async function verifySessionPersistenceAndRestartRecovery(): Promise<void> {
  const persistence = new InMemoryReceptionistPersistence();
  const clock = { value: 20_000_000 };
  const first = buildRuntime(persistence, () => clock.value);
  const session = await issueCustomer(first, WIDGET_A);
  const firstTurn = await turn(first, session, "project help");
  const firstBody = await responseJson(firstTurn);
  assert(firstTurn.status === 200, "the first runtime serves a turn");

  // A new runtime, new authorities, and new services over the same storage is
  // the restart scenario: nothing in process memory survives.
  clock.value += 30_000;
  const restarted = buildRuntime(persistence, () => clock.value);
  const authenticated = await restarted.sessions.authenticate(
    session.token,
    session.csrfToken,
  );
  assert(authenticated.status === "authenticated",
    "the persisted session authenticates after a restart");
  if (authenticated.status !== "authenticated") return;
  assert(authenticated.principal.conversationHandle === null,
    "no raw handle is reconstructed from storage");
  assert(authenticated.principal.businessProfileVersion === fictionalBusinessProfile.version,
    "the persisted session carries its trusted business scope");
  assert(authenticated.principal.businessId === BUSINESS_A
    && authenticated.principal.conversationId === session.principal.conversationId,
  "the restarted session resolves the same conversation");

  const secondTurn = await turn(restarted, session, "I need a project consultation.");
  const secondBody = await responseJson(secondTurn);
  assert(secondTurn.status === 200, "the restarted runtime continues the conversation");
  assert(secondBody.data?.turn === (firstBody.data?.turn ?? 0) + 1,
    "the turn sequence continues across the restart");
  assert((secondBody.data?.conversation.revision ?? 0) > (firstBody.data?.conversation.revision ?? 0),
    "the revision continues from durable state");

  const loaded = await persistence.loadConversation({
    businessProfileId: BUSINESS_A,
    businessProfileVersion: fictionalBusinessProfile.version,
    conversationId: session.principal.conversationId,
  });
  assert(loaded.status === "found" && loaded.conversation.messages.length >= 5,
    "message history survives the restart");
}

async function verifySessionExpirationAndRevocation(): Promise<void> {
  const persistence = new InMemoryReceptionistPersistence();
  const clock = { value: 30_000_000 };
  const runtime = buildRuntime(persistence, () => clock.value);

  const expiring = await issueCustomer(runtime, WIDGET_A);
  clock.value += SESSION_TTL_MS + 1_000;
  const expired = await turn(runtime, expiring, "project help");
  assert(expired.status === 401, "an expired persisted session is unauthorized");

  const revoked = await issueCustomer(runtime, WIDGET_A);
  await runtime.sessions.revoke(revoked.token);
  const afterRevoke = await turn(runtime, revoked, "project help");
  assert(afterRevoke.status === 401, "a revoked persisted session is unauthorized");
  const record = await persistence.findSession(digestSessionToken(revoked.token));
  assert(record.status === "found" && record.session.revokedAt !== null,
    "revocation is recorded durably");
}

async function verifyCrossBusinessIsolation(): Promise<void> {
  const persistence = new InMemoryReceptionistPersistence();
  const runtime = buildRuntime(persistence, () => 40_000_000);
  const sessionA = await issueCustomer(runtime, WIDGET_A);
  const sessionB = await issueCustomer(runtime, WIDGET_B);
  assert(sessionB.principal.businessId === BUSINESS_B,
    "the second widget binds to the second business");

  const a = await persistence.loadConversation({
    businessProfileId: BUSINESS_A,
    businessProfileVersion: fictionalBusinessProfile.version,
    conversationId: sessionA.principal.conversationId,
  });
  const b = await persistence.loadConversation({
    businessProfileId: BUSINESS_B,
    businessProfileVersion: fictionalBusinessProfile.version,
    conversationId: sessionB.principal.conversationId,
  });
  assert(a.status === "found" && b.status === "found",
    "both business conversations are stored under their own scope");
  if (a.status !== "found" || b.status !== "found") return;

  const crossLoad = await persistence.loadConversation({
    businessProfileId: BUSINESS_A,
    businessProfileVersion: fictionalBusinessProfile.version,
    conversationId: sessionB.principal.conversationId,
  });
  assert(crossLoad.status === "not-found",
    "a conversation is not readable through another business scope");

  const crossTurn = await runtime.conversations.submit({
    businessId: BUSINESS_A,
    conversationId: sessionB.principal.conversationId,
    businessProfileVersion: fictionalBusinessProfile.version,
    message: "project help",
  });
  assert(crossTurn.status === "conversation-unavailable",
    "a mismatched business and conversation cannot start a turn");

  const bodyMismatch = await handleReceptionistTurn(makeRequest({
    body: JSON.stringify({ message: "project help", businessId: BUSINESS_B }),
    cookie: cookieOf(sessionA),
    csrf: sessionA.csrfToken,
  }), runtime);
  assert(bodyMismatch.status === 403,
    "a session cannot select another business through the request body");

  const aAfter = await persistence.loadConversation({
    businessProfileId: BUSINESS_A,
    businessProfileVersion: fictionalBusinessProfile.version,
    conversationId: sessionA.principal.conversationId,
  });
  assert(aAfter.status === "found" && aAfter.conversation.messages.length === 1,
    "refused cross-business work changes no business A state");
}

async function verifyConcurrentTurnSerialization(): Promise<void> {
  const persistence = new InMemoryReceptionistPersistence();
  const runtime = buildRuntime(persistence, () => 50_000_000);
  const session = await issueCustomer(runtime, WIDGET_A);
  const handle = session.principal.conversationHandle;
  assert(handle !== null, "the concurrent session carries a handle");

  const [first, second] = await Promise.all([
    turn(runtime, session, "project help"),
    turn(runtime, session, "I need a project consultation."),
  ]);
  assert(first.status === 200 && second.status === 200,
    "concurrent turns on one durable conversation both settle safely");

  const loaded = await persistence.loadConversation({
    businessProfileId: BUSINESS_A,
    businessProfileVersion: fictionalBusinessProfile.version,
    conversationId: session.principal.conversationId,
  });
  assert(loaded.status === "found", "the concurrent conversation is durable");
  if (loaded.status !== "found") return;
  assert(loaded.conversation.turnNumber === 2,
    "both serialized turns are recorded exactly once");
  const ids = loaded.conversation.messages.map((message) => message.messageId);
  assert(new Set(ids).size === ids.length,
    "concurrent turns produce no duplicate message identity");

  // Optimistic concurrency is enforced by the storage boundary itself.
  const scope = {
    businessProfileId: BUSINESS_A,
    businessProfileVersion: fictionalBusinessProfile.version,
    conversationId: session.principal.conversationId,
  };
  const stale = await persistence.loadConversation(scope);
  assert(stale.status === "found", "a snapshot is available for the conflict test");
  if (stale.status !== "found") return;
  const winner = await persistence.commitTurn(commitFrom(stale.conversation, []));
  const loser = await persistence.commitTurn(commitFrom(stale.conversation, []));
  assert(winner === "committed", "the first revision-scoped commit succeeds");
  assert(loser === "conflict", "a stale revision is refused rather than overwritten");
}

async function verifyAtomicCommitFailure(): Promise<void> {
  const inner = new InMemoryReceptionistPersistence();
  const persistence = failingCommitPersistence(inner);
  const runtime = buildRuntime(persistence, () => 60_000_000);
  const session = await issueCustomer(runtime, WIDGET_A);

  const response = await turn(runtime, session, "project help");
  assert(response.status === 500,
    "a failed turn commit returns a sanitized server failure");

  const loaded = await inner.loadConversation({
    businessProfileId: BUSINESS_A,
    businessProfileVersion: fictionalBusinessProfile.version,
    conversationId: session.principal.conversationId,
  });
  assert(loaded.status === "found", "the conversation still exists after a failed commit");
  if (loaded.status !== "found") return;
  assert(loaded.conversation.state.revision === 0,
    "a failed commit leaves the revision unchanged");
  assert(loaded.conversation.messages.length === 1,
    "a failed commit stores neither the customer nor the assistant message");
  assert(loaded.conversation.turnNumber === 0,
    "a failed commit advances no turn number");
}

async function verifyPersistenceFailureIsSanitized(): Promise<void> {
  const persistence = new InMemoryReceptionistPersistence();
  const runtime = buildRuntime(persistence, () => 70_000_000);
  const session = await issueCustomer(runtime, WIDGET_A);
  await persistence.close();

  const response = await turn(runtime, session, "project help");
  // Session lookup itself is unavailable, so authorization fails closed rather
  // than admitting a request against unreadable storage.
  assert(response.status === 401, "storage unavailability fails closed");
  const text = await response.text();
  assert(text.includes("\"unauthorized\""), "the failure carries a safe code");
  assert(!text.includes("Persistence"), "no storage detail is exposed");
  assert(!text.includes("postgresql"), "no database detail is exposed");
}

async function verifyHashedRepresentationsOnly(): Promise<void> {
  const persistence = new InMemoryReceptionistPersistence();
  const runtime = buildRuntime(persistence, () => 80_000_000);
  const session = await issueCustomer(runtime, WIDGET_A);
  const handle = session.principal.conversationHandle;
  assert(handle !== null, "the session carries a handle");

  const byHash = await persistence.findScopeByHandleHash(digestConversationHandle(handle));
  assert(byHash.status === "found", "the handle is stored as a digest");
  const byRaw = await persistence.findScopeByHandleHash(handle);
  assert(byRaw.status === "not-found",
    "a raw handle is not a stored reference");

  const byToken = await persistence.findSession(digestSessionToken(session.token));
  assert(byToken.status === "found", "the session is stored by token digest");
  const rawToken = await persistence.findSession(session.token);
  assert(rawToken.status === "not-found", "a raw session token is not stored");
  const rawCsrf = await persistence.findSession(session.csrfToken);
  assert(rawCsrf.status === "not-found", "a raw CSRF token is not stored");
  assert(await persistence.countSessions() === 1,
    "exactly one durable session exists");
}

async function verifyDemoCompatibility(): Promise<void> {
  const demo = createAiDemoChatSession();
  const view = await demo.submit("project help");
  assert(view.messages.length > 1, "the existing browser demo still serves a turn");
  assert(view.decision.stateMutationAuthorized === false
    && view.decision.customerReleaseAuthorized === false,
  "the existing demo still grants no release or mutation authority");
}

function buildRuntime(
  persistence: ReceptionistPersistence,
  now: () => number,
): PilotReceptionistRuntime {
  const result = createPilotReceptionistRuntime({
    configuration: {
      environment: "pilot",
      requireSecureTransport: true,
      providerNetworkExecution: "disabled",
      sessionTtlMs: SESSION_TTL_MS,
      operatorCredentialDigest: createHash("sha256")
        .update(OPERATOR_CREDENTIAL, "utf8")
        .digest("hex"),
      persistence: { mode: "durable", credentialReference: DATABASE_REFERENCE },
      businesses: [
        { businessId: BUSINESS_A, widgetId: WIDGET_A, allowedOrigins: [APP_ORIGIN] },
        { businessId: BUSINESS_B, widgetId: WIDGET_B, allowedOrigins: [SECOND_ORIGIN] },
      ],
    },
    businesses: [defaultBusiness(), secondBusiness()],
    persistence,
    databaseCredentialReference: DATABASE_REFERENCE,
    now,
    ipRateLimit: { limit: 1_000, windowMs: 60_000 },
    sessionRateLimit: { limit: 1_000, windowMs: 60_000 },
  });
  assert(result.status === "created", "the durable pilot runtime is created");
  if (result.status !== "created") throw new Error("unreachable");
  return result.runtime;
}

async function issueCustomer(
  runtime: PilotReceptionistRuntime,
  widgetId: string,
): Promise<IssuedSession> {
  const origin = widgetId === WIDGET_A ? APP_ORIGIN : SECOND_ORIGIN;
  const issued = await runtime.issueCustomerSession({ widgetId, origin });
  assert(issued.status === "issued", "a durable customer session is issued");
  if (issued.status !== "issued") throw new Error("unreachable");
  return issued.session;
}

async function turn(
  runtime: PilotReceptionistRuntime,
  session: IssuedSession,
  message: string,
): Promise<Response> {
  return handleReceptionistTurn(makeRequest({
    body: JSON.stringify({ message }),
    cookie: cookieOf(session),
    csrf: session.csrfToken,
  }), runtime);
}

function makeRequest(overrides: {
  readonly body: string;
  readonly cookie: string;
  readonly csrf: string;
}): Request {
  const headers = new Headers();
  headers.set("content-type", "application/json");
  headers.set("cookie", overrides.cookie);
  headers.set("x-csrf-token", overrides.csrf);
  headers.set("x-forwarded-for", DEFAULT_IP);
  return new Request(TURN_PATH, { method: "POST", headers, body: overrides.body });
}

function cookieOf(session: IssuedSession): string {
  return session.cookie.split(";")[0] ?? `${SESSION_COOKIE_NAME}=`;
}

async function responseJson(response: Response): Promise<ApiBody> {
  return JSON.parse(await response.text()) as ApiBody;
}

function commitFrom(
  conversation: {
    readonly scope: { businessProfileId: string; businessProfileVersion: number; conversationId: string };
    readonly state: CommitTurnInput["state"];
    readonly pendingFieldId: string | null;
    readonly handoffAvailable: boolean;
    readonly turnNumber: number;
    readonly nextMessageId: number;
  },
  messages: CommitTurnInput["messages"],
): CommitTurnInput {
  return {
    scope: conversation.scope,
    expectedRevision: conversation.state.revision,
    expectedTurnNumber: conversation.turnNumber,
    state: conversation.state,
    pendingFieldId: conversation.pendingFieldId,
    handoffAvailable: conversation.handoffAvailable,
    turnNumber: conversation.turnNumber + 1,
    nextMessageId: conversation.nextMessageId,
    messages,
  };
}

function failingCommitPersistence(
  inner: InMemoryReceptionistPersistence,
): ReceptionistPersistence {
  return new Proxy(inner, {
    get(target, property) {
      if (property === "commitTurn") {
        return async () => "failure" as const;
      }
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
  if (!condition) throw new Error(`Stage B2.3.2A persistence verification failed: ${message}.`);
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
