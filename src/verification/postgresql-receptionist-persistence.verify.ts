import { createHash, randomBytes } from "node:crypto";
import { Pool } from "pg";
import type { BusinessProfile } from "../domain/business-profile";
import { fictionalBusinessProfile } from "../fixtures/business-profile";
import {
  SESSION_COOKIE_NAME,
  digestSessionToken,
  type IssuedSession,
} from "../server/auth/session-authority";
import { digestConversationHandle } from "../server/auth/conversation-handle";
import type { ReceptionistBusiness } from "../server/conversation/receptionist-conversation-service";
import { handleReceptionistTurn } from "../server/http/receptionist-turn-handler";
import { handleReceptionistSessionIssue } from "../server/http/receptionist-session-handler";
import {
  createPilotReceptionistRuntime,
  type PilotReceptionistRuntime,
} from "../server/pilot/pilot-runtime";
import { PostgresqlReceptionistPersistence } from "../persistence/postgresql/postgresql-receptionist-persistence";
import { applyPostgresqlMigrations } from "../persistence/postgresql/migration-runner";

const BUSINESS_A = fictionalBusinessProfile.id;
const BUSINESS_B = "second-fictional-business";
const WIDGET_A = "widget-postgres-alpha";
const WIDGET_B = "widget-postgres-beta";
const APP_ORIGIN = "https://pilot.example.invalid";
const SECOND_ORIGIN = "https://second.example.invalid";
const TURN_PATH = `${APP_ORIGIN}/api/receptionist/turn`;
const SESSION_PATH = `${APP_ORIGIN}/api/receptionist/session`;
const OPERATOR_CREDENTIAL = "fictional-postgres-operator-credential";
const DATABASE_REFERENCE = "AI_RECEPTIONIST_PILOT_DATABASE_URL";
const SESSION_TTL_MS = 15 * 60 * 1_000;

async function run(): Promise<void> {
  const connectionString = requiredUrl();
  const schema = `b232a_${randomBytes(6).toString("hex")}`;
  const admin = new Pool({ connectionString });
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await applyPostgresqlMigrations({ connectionString, schema });

    const history = await admin.query(
      `SELECT version FROM "${schema}".app_schema_migrations ORDER BY version`,
    );
    assert(history.rows.map((row) => row.version).join(",") === "1,2,3,4,5,6,7,8",
      "the live schema history includes migration 008");

    await verifyDurableTurnAndRestart(connectionString, schema);
    await verifyHttpIssuance(connectionString, schema);
    await verifySessionExpirationAndRevocation(connectionString, schema);
    await verifyIsolationAndConflicts(connectionString, schema);
    await verifyConcurrentCommitAtomicity(connectionString, schema);
    await verifyClosedStoreFailuresClosed(connectionString, schema);

    console.log(
      "Stage B2.3.2B live PostgreSQL verification passed: durable HTTP issuance and turns, "
      + "session survival across restart, expiration and revocation, business isolation, "
      + "revision conflicts, concurrent commit atomicity, and closed-store fail-closed behavior.",
    );
  } finally {
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => undefined);
    await admin.end();
  }
}

async function verifyDurableTurnAndRestart(
  connectionString: string,
  schema: string,
): Promise<void> {
  const persistence = new PostgresqlReceptionistPersistence({ connectionString, schema });
  const clock = { value: 100_000_000 };
  const first = buildRuntime(persistence, () => clock.value);
  const session = await issueCustomer(first, WIDGET_A);
  const scope = {
    businessProfileId: BUSINESS_A,
    businessProfileVersion: fictionalBusinessProfile.version,
    conversationId: session.principal.conversationId,
  };

  const created = await persistence.loadConversation(scope);
  assert(created.status === "found" && created.conversation.state.revision === 0,
    "the conversation is durable at issuance");
  assert(created.status === "found" && created.conversation.messages.length === 1,
    "the greeting is durable");

  const firstTurn = await turn(first, session, "project help");
  assert(firstTurn.status === 200, "the first durable turn is served");
  const firstBody = await responseJson(firstTurn);
  const revision = firstBody.data?.conversation.revision ?? -1;
  assert(revision > 0, "the turn advances durable state");

  const loaded = await persistence.loadConversation(scope);
  assert(loaded.status === "found" && loaded.conversation.state.revision === revision,
    "committed state is readable");
  assert(loaded.status === "found" && loaded.conversation.messages.length >= 3,
    "customer and assistant messages are durable");

  const byHash = await persistence.findScopeByHandleHash(
    digestConversationHandle(session.principal.conversationHandle ?? ""),
  );
  assert(byHash.status === "found", "the handle digest resolves its scope");

  clock.value += 20_000;
  const restartedPersistence = new PostgresqlReceptionistPersistence({ connectionString, schema });
  const restarted = buildRuntime(restartedPersistence, () => clock.value);
  const authenticated = await restarted.sessions.authenticate(session.token, session.csrfToken);
  assert(authenticated.status === "authenticated",
    "the session survives a full adapter restart");
  if (authenticated.status !== "authenticated") return;
  assert(authenticated.principal.conversationHandle === null,
    "no raw handle is reconstructed from PostgreSQL");

  const secondTurn = await turn(restarted, session, "I need a project consultation.");
  const secondBody = await responseJson(secondTurn);
  assert(secondTurn.status === 200, "the restarted runtime serves the next turn");
  assert(secondBody.data?.turn === (firstBody.data?.turn ?? 0) + 1,
    "the turn sequence continues after restart");
  assert((secondBody.data?.conversation.revision ?? 0) > revision,
    "the revision continues from PostgreSQL");

  await restartedPersistence.close();
  await persistence.close();
}

async function verifyHttpIssuance(
  connectionString: string,
  schema: string,
): Promise<void> {
  const persistence = new PostgresqlReceptionistPersistence({ connectionString, schema });
  try {
    const runtime = buildRuntime(persistence, () => 105_000_000);
    const headers = new Headers();
    headers.set("content-type", "application/json");
    headers.set("origin", APP_ORIGIN);
    headers.set("x-forwarded-for", "198.51.100.160");
    const issue = await handleReceptionistSessionIssue(new Request(SESSION_PATH, {
      method: "POST",
      headers,
      body: JSON.stringify({ widgetId: WIDGET_A }),
    }), runtime, { requireSecureTransport: false });
    assert(issue.status === 201, "the pilot HTTP issuance endpoint creates a durable session");
    const cookie = issue.headers.get("set-cookie");
    if (cookie === null) throw new Error("the issuance endpoint set no cookie");
    const issued = JSON.parse(await issue.text()) as {
      readonly mode?: string;
      readonly simulated?: boolean;
      readonly data?: { readonly csrfToken?: string; readonly expiresAt?: number };
    };
    assert(issued.mode === "pilot" && issued.simulated === true,
      "durable issuance reports pilot mode and simulated responses");
    assert(typeof issued.data?.csrfToken === "string",
      "durable issuance returns a CSRF token");

    const turnHeaders = new Headers();
    turnHeaders.set("content-type", "application/json");
    turnHeaders.set("cookie", cookie.split(";")[0] ?? "");
    turnHeaders.set("x-csrf-token", issued.data?.csrfToken ?? "");
    turnHeaders.set("x-forwarded-for", "198.51.100.160");
    const turnResponse = await handleReceptionistTurn(new Request(TURN_PATH, {
      method: "POST",
      headers: turnHeaders,
      body: JSON.stringify({ message: "project help" }),
    }), runtime);
    assert(turnResponse.status === 200, "a durable HTTP turn is served after issuance");
    const body = await responseJson(turnResponse);
    assert((body.data?.conversation.revision ?? 0) > 0,
      "the HTTP turn commits durable state");
  } finally {
    await persistence.close();
  }
}

async function verifySessionExpirationAndRevocation(
  connectionString: string,
  schema: string,
): Promise<void> {
  const persistence = new PostgresqlReceptionistPersistence({ connectionString, schema });
  const clock = { value: 110_000_000 };
  try {
    const runtime = buildRuntime(persistence, () => clock.value);
    const expiring = await issueCustomer(runtime, WIDGET_A);
    clock.value += SESSION_TTL_MS + 1_000;
    const expired = await turn(runtime, expiring, "project help");
    assert(expired.status === 401, "an expired durable session is unauthorized");

    const revoked = await issueCustomer(runtime, WIDGET_A);
    await runtime.sessions.revoke(revoked.token);
    const afterRevoke = await turn(runtime, revoked, "project help");
    assert(afterRevoke.status === 401, "a revoked durable session is unauthorized");
    const record = await persistence.findSession(digestSessionToken(revoked.token));
    assert(record.status === "found" && record.session.revokedAt !== null,
      "revocation is recorded durably");
  } finally {
    await persistence.close();
  }
}

async function verifyIsolationAndConflicts(
  connectionString: string,
  schema: string,
): Promise<void> {
  const persistence = new PostgresqlReceptionistPersistence({ connectionString, schema });
  try {
    const runtime = buildRuntime(persistence, () => 120_000_000);
    const sessionA = await issueCustomer(runtime, WIDGET_A);
    const sessionB = await issueCustomer(runtime, WIDGET_B);

    const crossLoad = await persistence.loadConversation({
      businessProfileId: BUSINESS_A,
      businessProfileVersion: fictionalBusinessProfile.version,
      conversationId: sessionB.principal.conversationId,
    });
    assert(crossLoad.status === "not-found",
      "another business scope cannot read the conversation");

    const crossTurn = await runtime.conversations.submit({
      businessId: BUSINESS_A,
      conversationId: sessionB.principal.conversationId,
      businessProfileVersion: fictionalBusinessProfile.version,
      message: "project help",
    });
    assert(crossTurn.status === "conversation-unavailable",
      "another business scope cannot start a turn");

    const scope = {
      businessProfileId: BUSINESS_A,
      businessProfileVersion: fictionalBusinessProfile.version,
      conversationId: sessionA.principal.conversationId,
    };
    const snapshot = await persistence.loadConversation(scope);
    assert(snapshot.status === "found", "a snapshot is available for the conflict test");
    if (snapshot.status !== "found") return;

    const first = await persistence.commitTurn({
      scope,
      expectedRevision: snapshot.conversation.state.revision,
      expectedTurnNumber: snapshot.conversation.turnNumber,
      state: snapshot.conversation.state,
      pendingFieldId: snapshot.conversation.pendingFieldId,
      handoffAvailable: snapshot.conversation.handoffAvailable,
      turnNumber: snapshot.conversation.turnNumber + 1,
      nextMessageId: snapshot.conversation.nextMessageId,
      messages: [],
    });
    const second = await persistence.commitTurn({
      scope,
      expectedRevision: snapshot.conversation.state.revision,
      expectedTurnNumber: snapshot.conversation.turnNumber,
      state: snapshot.conversation.state,
      pendingFieldId: snapshot.conversation.pendingFieldId,
      handoffAvailable: snapshot.conversation.handoffAvailable,
      turnNumber: snapshot.conversation.turnNumber + 1,
      nextMessageId: snapshot.conversation.nextMessageId,
      messages: [],
    });
    assert(first === "committed", "the first revision-scoped commit succeeds");
    assert(second === "conflict", "a stale revision is refused");
  } finally {
    await persistence.close();
  }
}

async function verifyConcurrentCommitAtomicity(
  connectionString: string,
  schema: string,
): Promise<void> {
  const persistence = new PostgresqlReceptionistPersistence({ connectionString, schema });
  try {
    const runtime = buildRuntime(persistence, () => 125_000_000);
    const session = await issueCustomer(runtime, WIDGET_A);
    const scope = {
      businessProfileId: BUSINESS_A,
      businessProfileVersion: fictionalBusinessProfile.version,
      conversationId: session.principal.conversationId,
    };
    const snapshot = await persistence.loadConversation(scope);
    assert(snapshot.status === "found", "a snapshot is available for the concurrency test");
    if (snapshot.status !== "found") return;
    const base = snapshot.conversation;

    const attempt = () => persistence.commitTurn({
      scope,
      expectedRevision: base.state.revision,
      expectedTurnNumber: base.turnNumber,
      state: base.state,
      pendingFieldId: base.pendingFieldId,
      handoffAvailable: base.handoffAvailable,
      turnNumber: base.turnNumber + 1,
      nextMessageId: base.nextMessageId + 1,
      messages: [{
        messageId: base.nextMessageId,
        role: "customer",
        content: "concurrent update",
      }],
    });
    const results = await Promise.all([attempt(), attempt()]);
    assert(results.filter((result) => result === "committed").length === 1,
      "exactly one of two concurrent commits wins");
    assert(results.filter((result) => result === "conflict").length === 1,
      "the losing concurrent commit is refused as a conflict");

    const after = await persistence.loadConversation(scope);
    assert(after.status === "found", "state is readable after concurrent commits");
    if (after.status !== "found") return;
    assert(after.conversation.turnNumber === base.turnNumber + 1,
      "the turn number advances exactly once");
    assert(after.conversation.nextMessageId === base.nextMessageId + 1,
      "the message sequence advances exactly once");
    assert(
      after.conversation.messages.filter((message) => message.content === "concurrent update").length === 1,
      "only the winning turn's message is durable",
    );
  } finally {
    await persistence.close();
  }
}

async function verifyClosedStoreFailuresClosed(
  connectionString: string,
  schema: string,
): Promise<void> {
  const persistence = new PostgresqlReceptionistPersistence({ connectionString, schema });
  const runtime = buildRuntime(persistence, () => 130_000_000);
  const session = await issueCustomer(runtime, WIDGET_A);
  await persistence.close();

  const response = await turn(runtime, session, "project help");
  assert(response.status === 401, "a closed store fails authorization closed");
  const text = await response.text();
  assert(!text.includes("Persistence"), "no storage detail is exposed");
  assert(!text.includes("postgres"), "no database detail is exposed");
}

function buildRuntime(
  persistence: PostgresqlReceptionistPersistence,
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
  assert(result.status === "created", "the PostgreSQL pilot runtime is created");
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
  const headers = new Headers();
  headers.set("content-type", "application/json");
  headers.set("cookie", session.cookie.split(";")[0] ?? `${SESSION_COOKIE_NAME}=`);
  headers.set("x-csrf-token", session.csrfToken);
  headers.set("x-forwarded-for", "198.51.100.150");
  return handleReceptionistTurn(new Request(TURN_PATH, {
    method: "POST",
    headers,
    body: JSON.stringify({ message }),
  }), runtime);
}

async function responseJson(response: Response): Promise<{
  readonly data?: {
    readonly turn: number;
    readonly conversation: { readonly revision: number };
  };
}> {
  return JSON.parse(await response.text()) as {
    readonly data?: {
      readonly turn: number;
      readonly conversation: { readonly revision: number };
    };
  };
}

function requiredUrl(): string {
  const value = process.env.TEST_DATABASE_URL?.trim();
  if (!value) {
    throw new Error(
      "TEST_DATABASE_URL is required for PostgreSQL receptionist verification.",
    );
  }
  return value;
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
    throw new Error(`Stage B2.3.2A PostgreSQL verification failed: ${message}.`);
  }
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "PostgreSQL verification failed.");
  process.exitCode = 1;
});
