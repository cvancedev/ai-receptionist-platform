import { createHash, randomBytes } from "node:crypto";
import { readdirSync, readFileSync, type Dirent } from "node:fs";
import { join, relative, sep } from "node:path";
import type { BusinessProfile } from "../domain/business-profile";
import type { OfflineTransport } from "../ai/providers/transport-model-provider-adapter";
import { fictionalBusinessProfile } from "../fixtures/business-profile";
import { SESSION_COOKIE_NAME, type IssuedSession } from "../server/auth/session-authority";
import type { ReceptionistBusiness } from "../server/conversation/receptionist-conversation-service";
import { handleReceptionistTurn } from "../server/http/receptionist-turn-handler";
import {
  DEFAULT_ISSUANCE_RATE_LIMIT,
  handleReceptionistSessionIssue,
} from "../server/http/receptionist-session-handler";
import { pilotUnavailableResponse } from "../server/http/pilot-unavailable-response";
import {
  createPilotReceptionistRuntime,
  type PilotReceptionistRuntime,
} from "../server/pilot/pilot-runtime";
import {
  PILOT_CONFIGURATION_ENV,
  composePilotRuntime,
  resetPilotRuntimeCache,
  resolveReceptionistHttpRuntime,
} from "../server/pilot/pilot-runtime-provider";
import type {
  CommitTurnInput,
  ConversationPersistenceScope,
  ConversationSeed,
  PersistedSessionRecord,
  ReceptionistPersistence,
} from "../server/persistence/receptionist-persistence";
import { InMemoryReceptionistPersistence } from "../server/persistence/in-memory-receptionist-persistence";
import {
  createReceptionistRuntime,
  type ReceptionistRuntime,
} from "../server/runtime/receptionist-runtime";
import type { RateLimitPolicy } from "../server/security/request-rate-limiter";

const BUSINESS_A = fictionalBusinessProfile.id;
const BUSINESS_B = "second-fictional-business";
const WIDGET_A = "widget-http-alpha";
const WIDGET_B = "widget-http-beta";
const APP_ORIGIN = "https://pilot.example.invalid";
const SECOND_ORIGIN = "https://second.example.invalid";
const OTHER_ORIGIN = "https://other.example.invalid";
const SESSION_PATH = `${APP_ORIGIN}/api/receptionist/session`;
const TURN_PATH = `${APP_ORIGIN}/api/receptionist/turn`;
const PILOT_DATABASE_REFERENCE = "AI_RECEPTIONIST_PILOT_DATABASE_URL";
const OPERATOR_CREDENTIAL = "fictional-http-operator-credential";
const SESSION_TTL_MS = 60_000;
const DEFAULT_IP = "203.0.113.40";

function nextTurnId(): string {
  return `turn-${randomBytes(12).toString("hex")}`;
}

interface SessionApiBody {
  readonly ok: boolean;
  readonly mode?: string;
  readonly simulated?: boolean;
  readonly error?: { readonly code: string; readonly message: string };
  readonly data?: {
    readonly csrfToken?: string;
    readonly expiresAt?: number;
    readonly provider?: string;
    readonly networkAccessed?: boolean;
    readonly authority?: {
      readonly stateMutationAuthorized: boolean;
      readonly customerReleaseAuthorized: boolean;
      readonly externalActionAuthorized: boolean;
    };
  };
}

interface TurnApiBody {
  readonly ok: boolean;
  readonly mode?: string;
  readonly simulated?: boolean;
  readonly error?: { readonly code: string; readonly message: string };
  readonly data?: {
    readonly businessId: string;
    readonly conversationId: string;
    readonly turn: number;
    readonly conversation: { readonly revision: number };
    readonly provider: string;
    readonly networkAccessed: boolean;
  };
}

interface RequestOverrides {
  readonly url?: string;
  readonly body?: string;
  readonly cookie?: string | null;
  readonly csrf?: string | null;
  readonly origin?: string | null;
  readonly fetchSite?: string | null;
  readonly contentType?: string | null;
  readonly ip?: string;
  readonly method?: string;
  readonly contentLength?: string | null;
  readonly forwardedProto?: string | null;
}

async function run(): Promise<void> {
  await verifyProviderResolution();
  await verifyAuthorizedIssuanceAndTurn();
  await verifyInvalidWidgetIdentifiers();
  await verifyOriginRestrictions();
  await verifyCsrfProtection();
  await verifyExpiredAndRevokedSessions();
  await verifyCrossBusinessIsolation();
  await verifyDurableRecoveryAndRestart();
  await verifyConcurrentTurns();
  await verifyPersistenceFailuresFailClosed();
  await verifyIssuanceRateLimit();
  await verifyMalformedAndOversizedRequests();
  await verifyModeReporting();
  await verifyInsecureProductionTransport();
  verifyServerBoundaries();

  console.log(
    "Stage B2.3.2B pilot HTTP verification passed: authorized issuance, origin and "
    + "widget restrictions, CSRF, expired and revoked sessions, business isolation, "
    + "durable recovery across restart, concurrent turns, fail-closed storage "
    + "failures, issuance rate limiting, bounded input, and explicit mode reporting.",
  );
}

async function verifyProviderResolution(): Promise<void> {
  resetPilotRuntimeCache();
  const none = await resolveReceptionistHttpRuntime({});
  assert(none.status === "demo", "no pilot configuration serves the demonstration");

  const invalidJson = await resolveReceptionistHttpRuntime({
    [PILOT_CONFIGURATION_ENV]: "{not json",
  });
  assert(invalidJson.status === "pilot-unavailable",
    "unparseable pilot configuration never falls back to the demo");

  const duplicateKey = await resolveReceptionistHttpRuntime({
    [PILOT_CONFIGURATION_ENV]: `{"environment":"pilot","environment":"pilot"}`,
  });
  assert(duplicateKey.status === "pilot-unavailable",
    "duplicate pilot configuration keys are rejected");

  const missingCredential = await resolveReceptionistHttpRuntime({
    [PILOT_CONFIGURATION_ENV]: JSON.stringify(pilotConfiguration()),
  });
  assert(missingCredential.status === "pilot-unavailable",
    "a missing database credential fails the pilot closed");

  const composed = await composePilotRuntime({
    configuration: pilotConfiguration(),
    businesses: [defaultBusiness(), secondBusiness()],
    environment: { [PILOT_DATABASE_REFERENCE]: "postgresql://example.invalid/pilot" },
    persistenceFactory: () => new InMemoryReceptionistPersistence(),
  });
  assert(composed.status === "created", "a complete environment composes the pilot runtime");

  const unknownBusiness = await composePilotRuntime({
    configuration: pilotConfiguration({
      businesses: [
        { businessId: BUSINESS_A, widgetId: WIDGET_A, allowedOrigins: [APP_ORIGIN] },
        { businessId: "unavailable-fictional-business", widgetId: WIDGET_B, allowedOrigins: [SECOND_ORIGIN] },
      ],
    }),
    businesses: [defaultBusiness(), secondBusiness()],
    environment: { [PILOT_DATABASE_REFERENCE]: "postgresql://example.invalid/pilot" },
    persistenceFactory: () => new InMemoryReceptionistPersistence(),
  });
  assert(unknownBusiness.status === "rejected",
    "a configured business with no supplied profile is rejected");

  const withCredential = await resolveReceptionistHttpRuntime({
    [PILOT_CONFIGURATION_ENV]: JSON.stringify(pilotConfiguration({
      businesses: [
        { businessId: BUSINESS_A, widgetId: WIDGET_A, allowedOrigins: [APP_ORIGIN] },
      ],
    })),
    [PILOT_DATABASE_REFERENCE]: "postgresql://example.invalid/pilot",
  }, { persistenceFactory: () => new InMemoryReceptionistPersistence() });
  assert(withCredential.status === "pilot",
    "an authorized environment with a current schema resolves the pilot runtime");
  resetPilotRuntimeCache();

  const staleSchema = await resolveReceptionistHttpRuntime({
    [PILOT_CONFIGURATION_ENV]: JSON.stringify(pilotConfiguration({
      businesses: [
        { businessId: BUSINESS_A, widgetId: WIDGET_A, allowedOrigins: [APP_ORIGIN] },
      ],
    })),
    [PILOT_DATABASE_REFERENCE]: "postgresql://example.invalid/pilot",
  }, {
    persistenceFactory: () => new Proxy(new InMemoryReceptionistPersistence(), {
      get(target, property) {
        if (property === "readSchemaVersion") return async () => 8;
        const value = Reflect.get(target, property) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    }),
  });
  assert(staleSchema.status === "pilot-unavailable",
    "an outdated pilot schema is refused instead of falling back to the demo");
  resetPilotRuntimeCache();
}

async function verifyAuthorizedIssuanceAndTurn(): Promise<void> {
  const runtime = buildRuntime();
  const issued = await issueViaHttp(runtime, { widgetId: WIDGET_A });

  assert(issued.response.status === 201, "authorized issuance succeeds");
  assert(issued.response.headers.get("cache-control") === "no-store",
    "issuance responses are not cacheable");
  assert(issued.body.ok === true, "issuance reports success");
  assert(issued.body.mode === "pilot", "issuance reports pilot mode");
  assert(issued.body.simulated === true, "issuance reports simulated responses");
  assert(issued.body.data?.provider === "simulated-offline-model-transport/v1",
    "issuance reports the truthful offline provider");
  assert(issued.body.data?.networkAccessed === false,
    "issuance never claims provider network access");
  assert(issued.body.data?.authority?.stateMutationAuthorized === false
    && issued.body.data?.authority?.customerReleaseAuthorized === false
    && issued.body.data?.authority?.externalActionAuthorized === false,
  "issuance grants no application authority");
  assert(typeof issued.body.data?.csrfToken === "string"
    && (issued.body.data?.csrfToken ?? "").length >= 32,
  "issuance returns a CSRF token for subsequent turns");

  const cookie = issued.setCookie;
  assert(cookie !== null, "issuance sets a session cookie");
  if (cookie === null) return;
  assert(cookie.includes("HttpOnly"), "the session cookie is HttpOnly");
  assert(cookie.includes("Secure"), "the session cookie is Secure");
  assert(cookie.includes("SameSite=Strict"), "the session cookie is SameSite=Strict");
  assert(cookie.includes("Path=/"), "the session cookie is path-scoped");
  assert(cookie.includes(`Max-Age=${Math.floor(SESSION_TTL_MS / 1_000)}`),
    "the session cookie lifetime matches the configured TTL");
  assert(!cookie.includes("Domain="), "the session cookie sets no Domain");

  const token = cookie.split(";")[0]?.split("=")[1] ?? "";
  assert(token.length >= 32, "the cookie carries an opaque session token");
  const serialized = JSON.stringify(issued.body);
  assert(!serialized.includes(token), "the session token never appears in the response body");
  assert(!serialized.includes("conversationHandle"), "no conversation handle is returned");

  const turn = await turnViaHttp(runtime, issued, "project help");
  assert(turn.response.status === 200, "a turn with the issued session succeeds");
  assert(turn.body.ok === true, "the turn reports success");
  assert(turn.body.mode === "pilot", "the turn reports pilot mode");
  assert(turn.body.simulated === true, "the turn reports a simulated response");
  assert(turn.body.data?.businessId === BUSINESS_A,
    "the turn is bound to the widget's configured business");
  assert(turn.body.data?.provider === "simulated-offline-model-transport/v1",
    "the turn reports the truthful offline provider");
  assert(turn.body.data?.networkAccessed === false,
    "the turn never claims provider network access");
  assert(!JSON.stringify(turn.body).includes(token),
    "the turn response never echoes the session token");
}

async function verifyInvalidWidgetIdentifiers(): Promise<void> {
  const runtime = buildRuntime();
  const before = await runtime.sessions.size();

  const unknown = await issueViaHttp(runtime, { widgetId: "widget-not-configured" });
  assert(unknown.response.status === 403, "an unknown widget is refused");
  assert(unknown.setCookie === null, "a refused widget sets no cookie");

  const malformed = await issueViaHttp(runtime, { widgetId: "short" });
  assert(malformed.response.status === 403, "a malformed widget identifier is refused");

  const businessSelection = await issueViaHttp(runtime, {
    widgetId: WIDGET_A,
    body: JSON.stringify({ widgetId: WIDGET_A, businessId: BUSINESS_B }),
  });
  assert(businessSelection.response.status === 400,
    "a client may not add a business selection to issuance");

  const numeric = await issueViaHttp(runtime, { widgetId: WIDGET_A, body: JSON.stringify({ widgetId: 7 }) });
  assert(numeric.response.status === 400, "a non-string widget identifier is refused");

  assert((await runtime.sessions.size()) === before,
    "refused issuances create no session");
}

async function verifyOriginRestrictions(): Promise<void> {
  const runtime = buildRuntime();

  const missing = await issueViaHttp(runtime, { widgetId: WIDGET_A, origin: null });
  assert(missing.response.status === 403, "a missing Origin is refused");

  const foreign = await issueViaHttp(runtime, { widgetId: WIDGET_A, origin: OTHER_ORIGIN });
  assert(foreign.response.status === 403, "a foreign Origin is refused");

  const crossSite = await issueViaHttp(runtime, {
    widgetId: WIDGET_A,
    fetchSite: "cross-site",
  });
  assert(crossSite.response.status === 403, "a cross-site fetch is refused");

  const wrongWidgetOrigin = await issueViaHttp(runtime, {
    widgetId: WIDGET_B,
    origin: APP_ORIGIN,
  });
  assert(wrongWidgetOrigin.response.status === 403,
    "a widget is refused when its origin allowlist does not admit the request");

  const rightWidget = await issueViaHttp(runtime, {
    widgetId: WIDGET_B,
    origin: SECOND_ORIGIN,
    url: `${SECOND_ORIGIN}/api/receptionist/session`,
  });
  assert(rightWidget.response.status === 201,
    "a widget bound to the request origin is admitted");
}

async function verifyCsrfProtection(): Promise<void> {
  const runtime = buildRuntime();
  const issued = await issueViaHttp(runtime, { widgetId: WIDGET_A });

  const missing = await turnViaHttp(runtime, issued, "project help", { csrf: null });
  assert(missing.response.status === 403, "a turn without a CSRF token is refused");

  const wrong = await turnViaHttp(runtime, issued, "project help", {
    csrf: "c".repeat(43),
  });
  assert(wrong.response.status === 403, "a turn with a wrong CSRF token is refused");

  const valid = await turnViaHttp(runtime, issued, "project help");
  assert(valid.response.status === 200, "a turn with the issued CSRF token succeeds");
}

async function verifyExpiredAndRevokedSessions(): Promise<void> {
  let clock = 10_000_000;
  const runtime = buildRuntime({ now: () => clock });
  const issued = await issueViaHttp(runtime, { widgetId: WIDGET_A });
  clock += SESSION_TTL_MS + 1;
  const expired = await turnViaHttp(runtime, issued, "project help");
  assert(expired.response.status === 401, "an expired session is refused");

  const revokedRuntime = buildRuntime();
  const session = await issueCustomerDirect(revokedRuntime, WIDGET_A);
  await revokedRuntime.sessions.revoke(session.token);
  const revoked = await handleReceptionistTurn(makeTurnRequest({
    cookie: cookieOf(session),
    csrf: session.csrfToken,
  }), revokedRuntime);
  assert(revoked.status === 401, "a revoked session is refused");
}

async function verifyCrossBusinessIsolation(): Promise<void> {
  const runtime = buildRuntime();
  const issuedA = await issueViaHttp(runtime, { widgetId: WIDGET_A });
  const sessionB = await issueCustomerDirect(runtime, WIDGET_B);

  const businessSelection = await turnViaHttp(runtime, issuedA, "project help", {
    body: JSON.stringify({
      message: "project help",
      turnId: nextTurnId(),
      businessId: BUSINESS_B,
    }),
  });
  assert(businessSelection.response.status === 403,
    "a session cannot select another business");

  const conversationSelection = await turnViaHttp(runtime, issuedA, "project help", {
    body: JSON.stringify({
      message: "project help",
      turnId: nextTurnId(),
      conversationId: sessionB.principal.conversationId,
    }),
  });
  assert(conversationSelection.response.status === 403,
    "a session cannot select another conversation");

  const own = await turnViaHttp(runtime, issuedA, "project help");
  assert(own.response.status === 200 && own.body.data?.businessId === BUSINESS_A,
    "the session continues only its own business conversation");
}

async function verifyDurableRecoveryAndRestart(): Promise<void> {
  const persistence = new InMemoryReceptionistPersistence();
  let clock = 20_000_000;
  const first = buildRuntime({ persistence, now: () => clock });
  const issued = await issueViaHttp(first, { widgetId: WIDGET_A });
  const firstTurn = await turnViaHttp(first, issued, "project help");
  assert(firstTurn.response.status === 200, "the first durable turn is served");
  const revision = firstTurn.body.data?.conversation.revision ?? -1;
  assert(revision > 0, "the durable conversation advances");

  clock += 5_000;
  const second = buildRuntime({ persistence, now: () => clock });
  const afterRestart = await turnViaHttp(second, issued, "what does it cost?");
  assert(afterRestart.response.status === 200,
    "a session issued before the restart still authenticates and is served");
  assert((afterRestart.body.data?.conversation.revision ?? -1) > revision,
    "the restarted runtime continues the durable conversation");

  const scope = {
    businessProfileId: BUSINESS_A,
    businessProfileVersion: fictionalBusinessProfile.version,
    conversationId: afterRestart.body.data?.conversationId ?? "",
  };
  const loaded = await persistence.loadConversation(scope);
  assert(loaded.status === "found", "the conversation remains durable");
  assert(loaded.status === "found" && loaded.conversation.messages.length >= 4,
    "committed messages survive the restart");
}

async function verifyConcurrentTurns(): Promise<void> {
  const runtime = buildRuntime();
  const issued = await issueViaHttp(runtime, { widgetId: WIDGET_A });

  const [left, right] = await Promise.all([
    turnViaHttp(runtime, issued, "project help"),
    turnViaHttp(runtime, issued, "what does it cost?"),
  ]);
  assert(left.response.status === 200 && right.response.status === 200,
    "concurrent turns on one session are serialized and served");
  const leftRevision = left.body.data?.conversation.revision ?? -1;
  const rightRevision = right.body.data?.conversation.revision ?? -1;
  assert(leftRevision !== rightRevision,
    "concurrent turns commit distinct revisions");

  assert(left.body.data?.conversationId === right.body.data?.conversationId,
    "the concurrent turns share one server-bound conversation");
  assert((left.body.data?.turn ?? 0) !== (right.body.data?.turn ?? 0),
    "the concurrent turns consume distinct turn numbers");
}

async function verifyPersistenceFailuresFailClosed(): Promise<void> {
  const failingSession = failingPersistence({ createSession: async () => "failure" });
  const runtime = buildRuntime({ persistence: failingSession });
  const issued = await issueViaHttp(runtime, { widgetId: WIDGET_A });
  assert(issued.response.status === 403, "a storage failure refuses issuance");
  const text = JSON.stringify(issued.body);
  assert(!text.toLowerCase().includes("persistence"),
    "a storage failure exposes no storage detail");

  const healthy = buildRuntime();
  const session = await issueViaHttp(healthy, { widgetId: WIDGET_A });
  const closed = buildRuntime({ persistence: failingPersistence({ findSession: async () => ({ status: "failure" }) }) });
  const turn = await turnViaHttp(closed, session, "project help");
  assert(turn.response.status === 401, "a session lookup failure fails authentication closed");
  assert(!JSON.stringify(turn.body).toLowerCase().includes("database"),
    "a storage failure exposes no database detail");
}

async function verifyIssuanceRateLimit(): Promise<void> {
  const runtime = buildRuntime();
  const limit: RateLimitPolicy = { limit: 2, windowMs: 60_000 };
  const statuses: number[] = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await issueViaHttp(runtime, {
      widgetId: WIDGET_A,
      ip: "203.0.113.99",
      issuanceRateLimit: limit,
    });
    statuses.push(result.response.status);
  }
  assert(statuses[0] === 201 && statuses[1] === 201,
    "issuance within the limit succeeds");
  assert(statuses[2] === 429, "issuance beyond the limit is rate limited");

  const limited = await issueViaHttp(runtime, {
    widgetId: WIDGET_A,
    ip: "203.0.113.99",
    issuanceRateLimit: limit,
  });
  assert(limited.response.headers.get("retry-after") !== null,
    "a limited issuance advertises a retry delay");
  assert(DEFAULT_ISSUANCE_RATE_LIMIT.limit > 0 && DEFAULT_ISSUANCE_RATE_LIMIT.windowMs > 0,
    "the default issuance policy is bounded");
}

async function verifyMalformedAndOversizedRequests(): Promise<void> {
  const runtime = buildRuntime();

  const duplicate = await issueViaHttp(runtime, {
    widgetId: WIDGET_A,
    body: `{"widgetId":"${WIDGET_A}","widgetId":"${WIDGET_B}"}`,
  });
  assert(duplicate.response.status === 400, "duplicate issuance keys are refused");

  const invalidJson = await issueViaHttp(runtime, { widgetId: WIDGET_A, body: "{" });
  assert(invalidJson.response.status === 400, "invalid issuance JSON is refused");

  const oversized = await issueViaHttp(runtime, {
    widgetId: WIDGET_A,
    contentLength: String(runtime.maximumRequestBytes + 1),
  });
  assert(oversized.response.status === 413, "an oversized declared body is refused");

  const media = await issueViaHttp(runtime, {
    widgetId: WIDGET_A,
    contentType: "text/plain",
  });
  assert(media.response.status === 415, "a non-JSON issuance is refused");

  const method = await issueViaHttp(runtime, { widgetId: WIDGET_A, method: "GET" });
  assert(method.response.status === 405, "a non-POST issuance is refused");
}

async function verifyModeReporting(): Promise<void> {
  const demo = createDemoRuntime();
  const demoSession = demo.issueSession(BUSINESS_A, "customer:demo");
  const demoTurn = await handleReceptionistTurn(makeTurnRequest({
    body: JSON.stringify({ message: "project help", turnId: nextTurnId() }),
    cookie: cookieOf(demoSession),
    csrf: demoSession.csrfToken,
  }), demo);
  const demoBody = await responseJson<TurnApiBody>(demoTurn);
  assert(demoTurn.status === 200, `the demonstration runtime still serves turns (status ${demoTurn.status})`);
  assert(demoBody.mode === "demo" && demoBody.simulated === true,
    "the demonstration is clearly labelled as simulated demo mode");

  const demoIssuance = await handleReceptionistSessionIssue(
    makeIssueRequest({ widgetId: WIDGET_A }),
    demo as unknown as PilotReceptionistRuntime,
  );
  assert(demoIssuance.status === 503, "session issuance is unavailable in demo mode");
  const demoIssuanceBody = await responseJson<SessionApiBody>(demoIssuance);
  assert(demoIssuanceBody.error?.code === "pilot_unavailable",
    "demo issuance reports pilot unavailability explicitly");

  const unavailable = pilotUnavailableResponse("pilot");
  const unavailableBody = await responseJson<SessionApiBody>(unavailable);
  assert(unavailable.status === 503 && unavailableBody.mode === "pilot"
    && unavailableBody.simulated === true,
  "an unavailable pilot is reported explicitly, never replaced by the demo");
}

async function verifyInsecureProductionTransport(): Promise<void> {
  const runtime = buildRuntime();
  const insecure = await handleReceptionistSessionIssue(
    makeIssueRequest({ widgetId: WIDGET_A, url: "http://pilot.example.invalid/api/receptionist/session", origin: "http://pilot.example.invalid" }),
    runtime,
    { requireSecureTransport: true },
  );
  assert(insecure.status === 403, "insecure production issuance is refused");

  const local = buildRuntime({
    configuration: pilotConfiguration({
      businesses: [
        { businessId: BUSINESS_A, widgetId: WIDGET_A, allowedOrigins: ["http://localhost:3000"] },
        { businessId: BUSINESS_B, widgetId: WIDGET_B, allowedOrigins: [SECOND_ORIGIN] },
      ],
    }),
  });
  const forwarded = await handleReceptionistSessionIssue(
    makeIssueRequest({
      widgetId: WIDGET_A,
      url: "http://localhost:3000/api/receptionist/session",
      origin: "http://localhost:3000",
      forwardedProto: "https",
    }),
    local,
    { requireSecureTransport: true },
  );
  assert(forwarded.status === 201, "a trusted HTTPS proxy header satisfies transport policy");
}

function verifyServerBoundaries(): void {
  const serverFiles = [
    "src/server/pilot/pilot-runtime-provider.ts",
    "src/server/http/receptionist-session-handler.ts",
    "src/server/http/pilot-unavailable-response.ts",
    "src/server/http/bounded-request-body.ts",
    "src/server/http/json-response.ts",
    "src/server/pilot/pilot-runtime.ts",
    "src/server/persistence/receptionist-persistence.ts",
  ];
  const root = process.cwd();
  for (const path of serverFiles) {
    const source = readFileSync(join(root, path), "utf8");
    assert(source.includes("server-only"), `${path} states its server-only boundary`);
    assert(!source.includes("console."), `${path} logs nothing`);
    assert(!source.includes("api.openai.com"), `${path} names no provider endpoint`);
    assert(!source.includes("Bearer "), `${path} sets no provider authorization`);
  }

  const routeFiles = [
    "app/api/receptionist/turn/route.ts",
    "app/api/receptionist/session/route.ts",
  ];
  for (const path of routeFiles) {
    const source = readFileSync(join(root, path), "utf8");
    assert(!source.includes("console."), `${path} logs nothing`);
    assert(!source.includes("\"use client\""), `${path} is a server route`);
  }

  const identifiers = [
    "pilot-runtime-provider",
    "receptionist-session-handler",
    "issueCustomerSession",
    "PILOT_CONFIGURATION_ENV",
    "PostgresqlReceptionistPersistence",
    "AI_RECEPTIONIST_PILOT_DATABASE_URL",
  ];
  const roots = ["app", "components", "hooks", "lib", "services", "types", "utils", "src"];
  for (const root of roots) {
    for (const file of sourceFiles(join(process.cwd(), root))) {
      const source = readFileSync(file, "utf8");
      const relativePath = relative(process.cwd(), file);
      const clientFile = source.includes("\"use client\"")
        || relativePath.startsWith(`components${sep}`)
        || relativePath.startsWith(`src${sep}prototype-ui`);
      if (!clientFile) continue;
      for (const identifier of identifiers) {
        assert(!source.includes(identifier),
          `${relativePath} does not reference ${identifier}`);
      }
    }
  }
}

function buildRuntime(options: {
  readonly persistence?: ReceptionistPersistence;
  readonly now?: () => number;
  readonly transport?: OfflineTransport;
  readonly configuration?: Record<string, unknown>;
} = {}): PilotReceptionistRuntime {
  const result = createPilotReceptionistRuntime({
    configuration: options.configuration ?? pilotConfiguration(),
    businesses: [defaultBusiness(), secondBusiness()],
    persistence: options.persistence ?? new InMemoryReceptionistPersistence(),
    databaseCredentialReference: PILOT_DATABASE_REFERENCE,
    transport: options.transport,
    now: options.now,
    ipRateLimit: { limit: 1_000, windowMs: 60_000 },
    sessionRateLimit: { limit: 1_000, windowMs: 60_000 },
    maximumRequestBytes: 8_192,
  });
  assert(result.status === "created", "the pilot runtime is created for the test");
  if (result.status !== "created") throw new Error("unreachable");
  return result.runtime;
}

function createDemoRuntime(): ReceptionistRuntime {
  return createReceptionistRuntime({
    businesses: [defaultBusiness()],
    ipRateLimit: { limit: 1_000, windowMs: 60_000 },
    sessionRateLimit: { limit: 1_000, windowMs: 60_000 },
  });
}

async function issueViaHttp(
  runtime: PilotReceptionistRuntime,
  overrides: RequestOverrides & { readonly widgetId: string; readonly issuanceRateLimit?: RateLimitPolicy },
): Promise<{
  readonly response: Response;
  readonly body: SessionApiBody;
  readonly setCookie: string | null;
}> {
  const response = await handleReceptionistSessionIssue(
    makeIssueRequest({
      widgetId: overrides.widgetId,
      body: overrides.body,
      url: overrides.url,
      origin: overrides.origin,
      fetchSite: overrides.fetchSite,
      contentType: overrides.contentType,
      ip: overrides.ip,
      method: overrides.method,
      contentLength: overrides.contentLength,
    }),
    runtime,
    { issuanceRateLimit: overrides.issuanceRateLimit, requireSecureTransport: false },
  );
  return {
    response,
    body: await responseJson<SessionApiBody>(response),
    setCookie: response.headers.get("set-cookie"),
  };
}

async function turnViaHttp(
  runtime: PilotReceptionistRuntime,
  issued: { readonly setCookie: string | null; readonly body: SessionApiBody },
  message: string,
  overrides: { readonly body?: string; readonly csrf?: string | null } = {},
): Promise<{ readonly response: Response; readonly body: TurnApiBody }> {
  const response = await handleReceptionistTurn(makeTurnRequest({
    body: overrides.body ?? JSON.stringify({ message, turnId: nextTurnId() }),
    cookie: issued.setCookie?.split(";")[0] ?? null,
    csrf: overrides.csrf === undefined ? issued.body.data?.csrfToken ?? null : overrides.csrf,
  }), runtime);
  return { response, body: await responseJson<TurnApiBody>(response) };
}

async function issueCustomerDirect(
  runtime: PilotReceptionistRuntime,
  widgetId: string,
): Promise<IssuedSession> {
  const origin = widgetId === WIDGET_A ? APP_ORIGIN : SECOND_ORIGIN;
  const issued = await runtime.issueCustomerSession({ widgetId, origin });
  assert(issued.status === "issued", "a direct customer session is issued for the test");
  if (issued.status !== "issued") throw new Error("unreachable");
  return issued.session;
}

function makeIssueRequest(overrides: RequestOverrides & { readonly widgetId: string }): Request {
  return makeRequest(overrides.url ?? SESSION_PATH, {
    ...overrides,
    body: overrides.body ?? JSON.stringify({ widgetId: overrides.widgetId }),
    origin: overrides.origin === undefined ? APP_ORIGIN : overrides.origin,
  });
}

function makeTurnRequest(overrides: RequestOverrides = {}): Request {
  return makeRequest(TURN_PATH, overrides);
}

function makeRequest(path: string, overrides: RequestOverrides = {}): Request {
  const headers = new Headers();
  headers.set("content-type", overrides.contentType ?? "application/json");
  if (overrides.cookie !== null && overrides.cookie !== undefined) {
    headers.set("cookie", overrides.cookie);
  }
  if (overrides.csrf !== null && overrides.csrf !== undefined) {
    headers.set("x-csrf-token", overrides.csrf);
  }
  if (overrides.origin !== null && overrides.origin !== undefined) {
    headers.set("origin", overrides.origin);
  }
  if (overrides.fetchSite !== null && overrides.fetchSite !== undefined) {
    headers.set("sec-fetch-site", overrides.fetchSite);
  }
  if (overrides.forwardedProto !== null && overrides.forwardedProto !== undefined) {
    headers.set("x-forwarded-proto", overrides.forwardedProto);
  }
  headers.set("x-forwarded-for", overrides.ip ?? DEFAULT_IP);
  if (overrides.contentLength !== null && overrides.contentLength !== undefined) {
    headers.set("content-length", overrides.contentLength);
  }
  const method = overrides.method ?? "POST";
  return new Request(path, {
    method,
    headers,
    body: method === "GET" ? undefined : overrides.body ?? "{}",
  });
}

async function responseJson<T>(response: Response): Promise<T> {
  return JSON.parse(await response.text()) as T;
}

function cookieOf(session: IssuedSession): string {
  return session.cookie.split(";")[0] ?? `${SESSION_COOKIE_NAME}=`;
}

function pilotConfiguration(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const configuration: Record<string, unknown> = {
    environment: "pilot",
    requireSecureTransport: true,
    providerNetworkExecution: "disabled",
    sessionTtlMs: SESSION_TTL_MS,
    operatorCredentialDigest: createHash("sha256")
      .update(OPERATOR_CREDENTIAL, "utf8")
      .digest("hex"),
    persistence: {
      mode: "durable",
      credentialReference: PILOT_DATABASE_REFERENCE,
    },
    businesses: [
      { businessId: BUSINESS_A, widgetId: WIDGET_A, allowedOrigins: [APP_ORIGIN] },
      { businessId: BUSINESS_B, widgetId: WIDGET_B, allowedOrigins: [SECOND_ORIGIN] },
    ],
  };
  for (const [key, value] of Object.entries(overrides)) {
    configuration[key] = value;
  }
  return configuration;
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

function failingPersistence(
  overrides: Partial<ReceptionistPersistence>,
): ReceptionistPersistence {
  const base = new InMemoryReceptionistPersistence();
  return Object.freeze({
    kind: base.kind,
    createConversation: (seed: ConversationSeed) => base.createConversation(seed),
    loadConversation: (scope: ConversationPersistenceScope) => base.loadConversation(scope),
    findScopeByHandleHash: (hash: string) => base.findScopeByHandleHash(hash),
    commitTurn: (input: CommitTurnInput) => base.commitTurn(input),
    loadTurnReceipt: (scope: ConversationPersistenceScope, turnId: string) => (
      base.loadTurnReceipt(scope, turnId)
    ),
    monthlyUsageMicros: (businessId: string, monthStartMs: number) => (
      base.monthlyUsageMicros(businessId, monthStartMs)
    ),
    readSchemaVersion: () => base.readSchemaVersion(),
    createSession: (record: PersistedSessionRecord) => base.createSession(record),
    findSession: (hash: string) => base.findSession(hash),
    revokeSession: (hash: string, at: number) => base.revokeSession(hash, at),
    countSessions: () => base.countSessions(),
    pruneSessions: (now: number) => base.pruneSessions(now),
    close: () => base.close(),
    ...overrides,
  }) as ReceptionistPersistence;
}

function sourceFiles(directory: string): string[] {
  let entries: Dirent[];
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(path);
  }
  return files;
}

function assert(condition: unknown, description: string): asserts condition {
  if (!condition) throw new Error(`Stage B2.3.2B verification failed: ${description}`);
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
