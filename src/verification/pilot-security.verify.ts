import { createHash } from "node:crypto";
import { readdirSync, readFileSync, type Dirent } from "node:fs";
import { join, relative, sep } from "node:path";
import type { BusinessProfile } from "../domain/business-profile";
import { fictionalBusinessProfile } from "../fixtures/business-profile";
import { createAiDemoChatSession } from "../prototype-ui/ai-demo-chat-session";
import {
  SESSION_COOKIE_NAME,
  type IssuedSession,
} from "../server/auth/session-authority";
import type { ReceptionistBusiness } from "../server/conversation/receptionist-conversation-service";
import { handleReceptionistTurn } from "../server/http/receptionist-turn-handler";
import {
  createPilotReceptionistRuntime,
  type PilotReceptionistRuntime,
} from "../server/pilot/pilot-runtime";
import {
  resolvePilotRuntimeConfiguration,
  type PilotRuntimeConfigurationRejection,
} from "../server/pilot/pilot-runtime-configuration";
import type { OfflineTransport } from "../ai/providers/transport-model-provider-adapter";
import type { RateLimitPolicy } from "../server/security/request-rate-limiter";

const BUSINESS_A = fictionalBusinessProfile.id;
const BUSINESS_B = "second-fictional-business";
const WIDGET_A = "widget-fictional-alpha";
const WIDGET_B = "widget-fictional-beta";
const APP_ORIGIN = "https://pilot.example.invalid";
const SECOND_ORIGIN = "https://second.example.invalid";
const OTHER_ORIGIN = "https://other.example.invalid";
const TURN_PATH = `${APP_ORIGIN}/api/receptionist/turn`;
const OPERATOR_CREDENTIAL = "fictional-pilot-operator-credential";
const OPERATOR_ID = "front-desk-operator";
const SESSION_TTL_MS = 15 * 60 * 1_000;
const DEFAULT_IP = "198.51.100.70";

interface ApiBody {
  readonly ok: boolean;
  readonly error?: { readonly code: string; readonly message: string };
  readonly data?: {
    readonly businessId: string;
    readonly conversationId: string;
    readonly turn: number;
    readonly decision: string;
    readonly messages: readonly { readonly role: string; readonly text: string }[];
    readonly conversation: {
      readonly stage: string;
      readonly revision: number;
      readonly pendingFieldId: string | null;
      readonly readiness: string;
      readonly handoffAvailable: boolean;
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

interface RequestOverrides {
  readonly body?: string;
  readonly cookie?: string | null;
  readonly csrf?: string | null;
  readonly origin?: string | null;
  readonly fetchSite?: string | null;
  readonly contentType?: string | null;
  readonly ip?: string;
  readonly method?: string;
  readonly contentLength?: string | null;
}

async function run(): Promise<void> {
  verifyConfigurationRejections();
  verifyCreationFailures();
  await verifyCustomerSessionIssuance();
  await verifyOperatorSessionIssuance();
  await verifyHandleIntegrityAndIsolation();
  await verifyTurnEndpointSecurity();
  await verifyProviderFailureStaysSanitized();
  verifyCookiePolicy();
  verifyClientBoundaries();
  await verifyDemoCompatibility();

  console.log(
    "Stage B2.3.1 pilot security verification passed: fail-closed configuration, "
    + "trusted customer and operator issuance, origin binding, secure cookies, "
    + "opaque conversation handles, cross-business refusal, and demo compatibility.",
  );
}

function verifyConfigurationRejections(): void {
  const valid = resolvePilotRuntimeConfiguration(pilotConfiguration());
  assert(valid.status === "valid",
    "an explicit, disabled-provider pilot configuration is accepted");
  assert(valid.value.secureCookiesRequired === true,
    "the accepted configuration requires secure cookies");
  assert(valid.value.providerNetworkAuthorized === false,
    "the accepted configuration authorizes no provider network");
  assert(Object.isFrozen(valid.value.businesses),
    "the accepted configuration is frozen");

  const rejections: readonly { readonly input: unknown; readonly reason: PilotRuntimeConfigurationRejection }[] = [
    { input: null, reason: "InvalidInput" },
    { input: {}, reason: "MissingConfiguration" },
    { input: pilotConfiguration({ environment: "production" }), reason: "UnknownEnvironment" },
    { input: pilotConfiguration({ environment: "local-development" }), reason: "UnknownEnvironment" },
    { input: pilotConfiguration({ requireSecureTransport: false }), reason: "InsecureTransport" },
    { input: pilotConfiguration({ requireSecureTransport: "true" }), reason: "InsecureTransport" },
    { input: pilotConfiguration({ providerNetworkExecution: "enabled" }), reason: "ProviderNetworkProhibited" },
    { input: pilotConfiguration({ providerNetworkExecution: true }), reason: "ProviderNetworkProhibited" },
    { input: pilotConfiguration({ businesses: [] }), reason: "NoBusinesses" },
    { input: pilotConfiguration({ sessionTtlMs: 0 }), reason: "InvalidSessionTtl" },
    { input: pilotConfiguration({ sessionTtlMs: 24 * 60 * 60 * 1_000 }), reason: "InvalidSessionTtl" },
    { input: pilotConfiguration({ operatorCredentialDigest: "not-a-digest" }), reason: "InvalidOperatorCredential" },
    { input: pilotConfiguration({ unexpected: true }), reason: "UnknownField" },
    {
      input: pilotConfiguration({
        businesses: [
          { businessId: BUSINESS_A, widgetId: WIDGET_A, allowedOrigins: [APP_ORIGIN] },
          { businessId: BUSINESS_A, widgetId: WIDGET_B, allowedOrigins: [APP_ORIGIN] },
        ],
      }),
      reason: "DuplicateBusiness",
    },
    {
      input: pilotConfiguration({
        businesses: [
          { businessId: BUSINESS_A, widgetId: WIDGET_A, allowedOrigins: [APP_ORIGIN] },
          { businessId: BUSINESS_B, widgetId: WIDGET_A, allowedOrigins: [APP_ORIGIN] },
        ],
      }),
      reason: "DuplicateWidget",
    },
    {
      input: pilotConfiguration({
        businesses: [{
          businessId: BUSINESS_A,
          widgetId: WIDGET_A,
          allowedOrigins: ["http://pilot.example.invalid"],
        }],
      }),
      reason: "InvalidOrigin",
    },
    {
      input: pilotConfiguration({
        businesses: [{
          businessId: BUSINESS_A,
          widgetId: WIDGET_A,
          allowedOrigins: [`${APP_ORIGIN}/embed`],
        }],
      }),
      reason: "InvalidOrigin",
    },
    {
      input: pilotConfiguration({
        businesses: [{
          businessId: BUSINESS_A,
          widgetId: WIDGET_A,
          allowedOrigins: ["https://user:secret@pilot.example.invalid"],
        }],
      }),
      reason: "InvalidOrigin",
    },
    {
      input: pilotConfiguration({
        businesses: [{
          businessId: BUSINESS_A,
          widgetId: WIDGET_A,
          allowedOrigins: ["https://*.example.invalid"],
        }],
      }),
      reason: "InvalidOrigin",
    },
    {
      input: pilotConfiguration({
        businesses: [{
          businessId: BUSINESS_A,
          widgetId: WIDGET_A,
          allowedOrigins: [APP_ORIGIN, `${APP_ORIGIN}/`],
        }],
      }),
      reason: "DuplicateOrigin",
    },
    {
      input: pilotConfiguration({
        businesses: [{
          businessId: BUSINESS_A,
          widgetId: WIDGET_A,
          allowedOrigins: [APP_ORIGIN],
          secret: "unexpected",
        }],
      }),
      reason: "UnknownField",
    },
  ];

  for (const entry of rejections) {
    const result = resolvePilotRuntimeConfiguration(entry.input);
    assert(result.status === "rejected" && result.reason === entry.reason,
      `an unsafe or incomplete configuration is rejected as ${entry.reason}`);
  }

  const loopback = resolvePilotRuntimeConfiguration(pilotConfiguration({
    businesses: [{
      businessId: BUSINESS_A,
      widgetId: WIDGET_A,
      allowedOrigins: ["http://127.0.0.1:3000"],
    }],
  }));
  assert(loopback.status === "valid",
    "an explicit loopback HTTP origin remains available for local development");
}

function verifyCreationFailures(): void {
  const missingBusinesses = createPilotReceptionistRuntime({
    configuration: pilotConfiguration(),
    businesses: [],
  });
  assert(missingBusinesses.status === "rejected"
    && missingBusinesses.reason === "InvalidBusinesses",
  "a pilot runtime requires explicit business registrations");

  const extraBusiness = createPilotReceptionistRuntime({
    configuration: pilotConfiguration(),
    businesses: [defaultBusiness(), secondBusiness(), thirdBusiness()],
  });
  assert(extraBusiness.status === "rejected"
    && extraBusiness.reason === "BusinessNotConfigured",
  "an unconfigured business cannot be composed into the pilot runtime");

  const missingConfigured = createPilotReceptionistRuntime({
    configuration: pilotConfiguration(),
    businesses: [defaultBusiness()],
  });
  assert(missingConfigured.status === "rejected"
    && missingConfigured.reason === "ConfiguredBusinessUnavailable",
  "a configured business that is absent fails closed");

  const duplicateBusiness = createPilotReceptionistRuntime({
    configuration: pilotConfiguration({
      businesses: [{
        businessId: BUSINESS_A,
        widgetId: WIDGET_A,
        allowedOrigins: [APP_ORIGIN],
      }],
    }),
    businesses: [defaultBusiness(), defaultBusiness()],
  });
  assert(duplicateBusiness.status === "rejected"
    && duplicateBusiness.reason === "InvalidBusinesses",
  "duplicate business compositions fail closed");

  const missingConfiguration = createPilotReceptionistRuntime({
    businesses: [defaultBusiness(), secondBusiness()],
  });
  assert(missingConfiguration.status === "rejected",
    "a runtime with no pilot configuration cannot be created");
}

async function verifyCustomerSessionIssuance(): Promise<void> {
  const runtime = buildRuntime();
  const before = runtime.sessions.size();

  const issued = runtime.issueCustomerSession({ widgetId: WIDGET_A, origin: APP_ORIGIN });
  assert(issued.status === "issued", "a configured widget and permitted origin issue a session");
  if (issued.status !== "issued") return;
  const session = issued.session;
  assert(session.principal.businessId === BUSINESS_A,
    "the issued session is bound to the widget's configured business");
  assert(session.principal.actorId === "customer:anonymous",
    "a customer session is anonymous and separate from operator identity");
  assert(session.principal.conversationHandle !== null,
    "the issued session carries a server-minted conversation handle");
  assert(runtime.sessions.size() === before + 1,
    "a successful issuance creates exactly one session");

  const denials: readonly { readonly input: unknown; readonly description: string }[] = [
    { input: { widgetId: "widget-unknown-000", origin: APP_ORIGIN }, description: "an unknown widget" },
    { input: { widgetId: WIDGET_A, origin: OTHER_ORIGIN }, description: "an unpermitted origin" },
    { input: { widgetId: WIDGET_A, origin: `${APP_ORIGIN}/embed` }, description: "an origin with a path" },
    { input: { widgetId: WIDGET_A, origin: "http://pilot.example.invalid" }, description: "a downgraded scheme" },
    { input: { widgetId: WIDGET_A, origin: "https://sub.pilot.example.invalid" }, description: "an unlisted subdomain" },
    { input: { widgetId: WIDGET_A, origin: `${APP_ORIGIN}:444` }, description: "an unlisted port" },
    { input: { widgetId: WIDGET_A }, description: "a missing origin" },
    { input: { origin: APP_ORIGIN }, description: "a missing widget" },
    { input: { widgetId: WIDGET_A, origin: APP_ORIGIN, businessId: BUSINESS_B }, description: "a client-selected business" },
    { input: { widgetId: WIDGET_B, origin: APP_ORIGIN }, description: "another business's widget at this origin" },
    { input: { widgetId: `${WIDGET_A} `, origin: APP_ORIGIN }, description: "a padded widget identifier" },
    { input: null, description: "a non-object request" },
  ];

  const afterValidIssuance = runtime.sessions.size();
  for (const entry of denials) {
    const result = runtime.issueCustomerSession(entry.input);
    assert(result.status === "denied", `${entry.description} is denied`);
  }
  assert(runtime.sessions.size() === afterValidIssuance,
    "denied issuance creates no session and no conversation access");

  const widgetOnly = runtime.issueCustomerSession({ widgetId: WIDGET_A });
  assert(widgetOnly.status === "denied",
    "a public widget identifier alone is not authentication");
}

async function verifyOperatorSessionIssuance(): Promise<void> {
  const runtime = buildRuntime();
  const issued = runtime.issueOperatorSession({
    credential: OPERATOR_CREDENTIAL,
    businessId: BUSINESS_A,
    operatorId: OPERATOR_ID,
  });
  assert(issued.status === "issued", "the server-held operator credential issues a session");
  if (issued.status !== "issued") return;
  assert(issued.session.principal.actorId === `operator:${OPERATOR_ID}`,
    "operator identity is distinct from every customer session");
  assert(issued.session.principal.businessId === BUSINESS_A,
    "the operator session is bound to the requested configured business");
  assert(issued.session.cookie.includes("Secure"),
    "an operator session uses a Secure cookie");

  const before = runtime.sessions.size();
  for (const entry of [
    { credential: `${OPERATOR_CREDENTIAL}x`, businessId: BUSINESS_A, operatorId: OPERATOR_ID },
    { credential: OPERATOR_CREDENTIAL, businessId: "unconfigured-fictional-business", operatorId: OPERATOR_ID },
    { credential: OPERATOR_CREDENTIAL, businessId: BUSINESS_A },
    { credential: OPERATOR_CREDENTIAL, businessId: BUSINESS_A, operatorId: OPERATOR_ID, actorId: "admin" },
    { credential: "", businessId: BUSINESS_A, operatorId: OPERATOR_ID },
    { credential: OPERATOR_CREDENTIAL, businessId: BUSINESS_A, operatorId: "bad operator!" },
  ]) {
    const result = runtime.issueOperatorSession(entry);
    assert(result.status === "denied", "an invalid operator issuance is denied");
  }
  assert(runtime.sessions.size() === before,
    "denied operator issuance creates no session");

  const noOperatorRuntime = buildRuntime({
    configuration: pilotConfiguration({ operatorCredentialDigest: undefined }),
  });
  const unavailable = noOperatorRuntime.issueOperatorSession({
    credential: OPERATOR_CREDENTIAL,
    businessId: BUSINESS_A,
    operatorId: OPERATOR_ID,
  });
  assert(unavailable.status === "denied",
    "operator issuance fails closed when no credential is configured");
}

async function verifyHandleIntegrityAndIsolation(): Promise<void> {
  const runtime = buildRuntime();
  const session = issueCustomer(runtime, WIDGET_A);
  const handle = session.principal.conversationHandle;
  assert(handle !== null, "the customer session carries a handle");
  if (handle === null) return;

  assert(!handle.includes(BUSINESS_A), "a handle reveals no business identifier");
  assert(!handle.includes(session.principal.conversationId),
    "a handle reveals no conversation identifier");
  assert(handle.length >= 43, "a handle has full entropy width");

  const forged = "A".repeat(43);
  assert(runtime.conversations.revisionOfHandle(forged) === null,
    "a forged handle resolves to no conversation");
  const forgedOutcome = await runtime.conversations.submit({
    handle: forged,
    message: "project help",
  });
  assert(forgedOutcome.status === "conversation-unavailable",
    "a forged handle cannot submit a turn");
  const truncated = handle.slice(0, 20);
  assert(runtime.conversations.revisionOfHandle(truncated) === null,
    "a truncated handle resolves to no conversation");

  const separateRuntime = buildRuntime();
  assert(separateRuntime.conversations.revisionOfHandle(handle) === null,
    "a handle is valid only in the runtime that minted it");

  const sessionB = issueCustomer(runtime, WIDGET_B);
  assert(sessionB.principal.businessId === BUSINESS_B,
    "the second widget binds to the second business");
  assert(sessionB.principal.conversationHandle !== handle,
    "two conversations never share a handle");

  const stolen = await handleReceptionistTurn(makeRequest({
    body: JSON.stringify({
      message: "project help",
      conversationId: sessionB.principal.conversationId,
    }),
    cookie: cookieOf(session),
    csrf: session.csrfToken,
  }), runtime);
  assert(stolen.status === 403,
    "a session cannot select another conversation by identifier");

  const stolenBusiness = await handleReceptionistTurn(makeRequest({
    body: JSON.stringify({ message: "project help", businessId: BUSINESS_B }),
    cookie: cookieOf(session),
    csrf: session.csrfToken,
  }), runtime);
  assert(stolenBusiness.status === 403,
    "a session cannot select another business by identifier");

  const clientHandle = await handleReceptionistTurn(makeRequest({
    body: JSON.stringify({ message: "project help", handle }),
    cookie: cookieOf(session),
    csrf: session.csrfToken,
  }), runtime);
  assert(clientHandle.status === 400,
    "a client may not supply a conversation handle at all");

  const ownTurn = await handleReceptionistTurn(makeRequest({
    body: JSON.stringify({ message: "project help" }),
    cookie: cookieOf(session),
    csrf: session.csrfToken,
  }), runtime);
  const ownBody = await responseJson(ownTurn);
  assert(ownTurn.status === 200 && ownBody.data?.businessId === BUSINESS_A,
    "the session's own handle serves its own business");
  assert(ownBody.data?.authority.stateMutationAuthorized === false
    && ownBody.data?.authority.customerReleaseAuthorized === false
    && ownBody.data?.authority.externalActionAuthorized === false,
  "pilot turns keep every authority flag false");
  const serialized = JSON.stringify(ownBody);
  assert(!serialized.includes(handle), "no response ever returns the conversation handle");
  assert(!serialized.includes(session.token), "no response returns the session token");
  assert(!serialized.includes(session.csrfToken), "no response returns the CSRF token");
  assert(!serialized.includes("candidateIntent"), "no response returns proposal fields");
}

async function verifyTurnEndpointSecurity(): Promise<void> {
  let clock = 5_000_000;
  const runtime = buildRuntime({ now: () => clock });
  const session = issueCustomer(runtime, WIDGET_A);
  const body = JSON.stringify({ message: "project help" });

  const missing = await handleReceptionistTurn(makeRequest({ body, cookie: null }), runtime);
  assert(missing.status === 401, "a missing session is unauthorized");

  const invalid = await handleReceptionistTurn(makeRequest({
    body,
    cookie: `${SESSION_COOKIE_NAME}=${"a".repeat(43)}`,
  }), runtime);
  assert(invalid.status === 401, "an unknown session token is unauthorized");

  const badCsrf = await handleReceptionistTurn(makeRequest({
    body,
    cookie: cookieOf(session),
    csrf: `${session.csrfToken}x`,
  }), runtime);
  assert(badCsrf.status === 403, "a wrong CSRF token is forbidden");

  const crossOrigin = await handleReceptionistTurn(makeRequest({
    body,
    cookie: cookieOf(session),
    csrf: session.csrfToken,
    origin: OTHER_ORIGIN,
  }), runtime);
  assert(crossOrigin.status === 403, "a foreign browser origin is forbidden");

  const crossSite = await handleReceptionistTurn(makeRequest({
    body,
    cookie: cookieOf(session),
    csrf: session.csrfToken,
    fetchSite: "cross-site",
  }), runtime);
  assert(crossSite.status === 403, "a cross-site fetch context is forbidden");

  const method = await handleReceptionistTurn(makeRequest({
    method: "GET",
    cookie: cookieOf(session),
    csrf: session.csrfToken,
  }), runtime);
  assert(method.status === 405, "a non-POST method is refused");

  const media = await handleReceptionistTurn(makeRequest({
    body: "message=project+help",
    contentType: "application/x-www-form-urlencoded",
    cookie: cookieOf(session),
    csrf: session.csrfToken,
  }), runtime);
  assert(media.status === 415, "a non-JSON media type is refused");

  const oversized = await handleReceptionistTurn(makeRequest({
    body,
    contentLength: "999999",
    cookie: cookieOf(session),
    csrf: session.csrfToken,
  }), runtime);
  assert(oversized.status === 413, "an oversized declared body is refused");

  const duplicateKeys = await handleReceptionistTurn(makeRequest({
    body: "{\"message\":\"project help\",\"message\":\"project help\"}",
    cookie: cookieOf(session),
    csrf: session.csrfToken,
  }), runtime);
  assert(duplicateKeys.status === 400, "duplicate request keys are refused");

  const expiredSession = runtime.issueCustomerSession({ widgetId: WIDGET_A, origin: APP_ORIGIN });
  assert(expiredSession.status === "issued", "a session is issued for the expiry test");
  if (expiredSession.status === "issued") {
    clock += SESSION_TTL_MS + 1_000;
    const expired = await handleReceptionistTurn(makeRequest({
      body,
      cookie: cookieOf(expiredSession.session),
      csrf: expiredSession.session.csrfToken,
    }), runtime);
    assert(expired.status === 401, "an expired session is unauthorized");
    clock -= SESSION_TTL_MS + 1_000;
  }

  const revoked = issueCustomer(runtime, WIDGET_A);
  runtime.sessions.revoke(revoked.token);
  const afterRevoke = await handleReceptionistTurn(makeRequest({
    body,
    cookie: cookieOf(revoked),
    csrf: revoked.csrfToken,
  }), runtime);
  assert(afterRevoke.status === 401, "a revoked session is unauthorized");

  const limitedClock = 10_000_000;
  const limited = buildRuntime({
    now: () => limitedClock,
    sessionRateLimit: { limit: 1, windowMs: 60_000 },
  });
  const limitedSession = issueCustomer(limited, WIDGET_A);
  const first = await handleReceptionistTurn(makeRequest({
    body,
    cookie: cookieOf(limitedSession),
    csrf: limitedSession.csrfToken,
    ip: "198.51.100.90",
  }), limited);
  assert(first.status === 200, "the first limited request is served");
  const second = await handleReceptionistTurn(makeRequest({
    body,
    cookie: cookieOf(limitedSession),
    csrf: limitedSession.csrfToken,
    ip: "198.51.100.90",
  }), limited);
  assert(second.status === 429, "the per-session limit is enforced");
  assert(second.headers.get("retry-after") !== null,
    "a limited response advertises a retry delay");
}

async function verifyProviderFailureStaysSanitized(): Promise<void> {
  const canary = "b231-canary-provider-detail";
  const transport: OfflineTransport = async () => ({
    status: "failed",
    error: { category: "provider-failure", message: canary },
  });
  const runtime = buildRuntime({ transport });
  const session = issueCustomer(runtime, WIDGET_A);
  const handle = session.principal.conversationHandle;
  assert(handle !== null, "the failure session carries a handle");

  const response = await handleReceptionistTurn(makeRequest({
    body: JSON.stringify({ message: "project help" }),
    cookie: cookieOf(session),
    csrf: session.csrfToken,
  }), runtime);
  assert(response.status === 502, "a provider failure is a sanitized bad gateway");
  const text = await response.text();
  assert(text.includes("\"provider_failure\""), "the failure has an explicit sanitized code");
  assert(!text.includes(canary), "provider diagnostics never reach the client");
  assert(!text.includes("provider-failure"), "internal failure categories never reach the client");
  assert(handle !== null && runtime.conversations.revisionOfHandle(handle) === 0,
    "a provider failure changes no pilot conversation state");

  const healthy = buildRuntime();
  const healthySession = issueCustomer(healthy, WIDGET_A);
  const healthyResponse = await handleReceptionistTurn(makeRequest({
    body: JSON.stringify({ message: "project help" }),
    cookie: cookieOf(healthySession),
    csrf: healthySession.csrfToken,
  }), healthy);
  const healthyBody = await responseJson(healthyResponse);
  assert(healthyBody.data?.provider === "simulated-offline-model-transport/v1",
    "the response reports the truthful offline provider identifier");
  assert(healthyBody.data?.networkAccessed === false,
    "the response never claims a network call in B2.3.1");
}

function verifyCookiePolicy(): void {
  const runtime = buildRuntime();
  const session = issueCustomer(runtime, WIDGET_A);
  const cookie = session.cookie;
  assert(cookie.includes("HttpOnly"), "the pilot cookie is HttpOnly");
  assert(cookie.includes("Secure"), "the pilot cookie is always Secure");
  assert(cookie.includes("SameSite=Strict"), "the pilot cookie is SameSite=Strict");
  assert(cookie.includes("Path=/"), "the pilot cookie is path-scoped");
  assert(cookie.includes(`Max-Age=${Math.floor(SESSION_TTL_MS / 1_000)}`),
    "the pilot cookie lifetime matches the configured TTL");
  assert(!cookie.includes("Domain="), "the pilot cookie sets no Domain");

  const operatorRuntime = buildRuntime();
  const operator = operatorRuntime.issueOperatorSession({
    credential: OPERATOR_CREDENTIAL,
    businessId: BUSINESS_A,
    operatorId: OPERATOR_ID,
  });
  assert(operator.status === "issued" && operator.session.cookie.includes("Secure"),
    "operator cookies are Secure as well");
}

function verifyClientBoundaries(): void {
  const serverFiles = [
    "src/server/pilot/pilot-runtime-configuration.ts",
    "src/server/pilot/pilot-runtime.ts",
    "src/server/auth/conversation-handle.ts",
  ];
  const packageRoot = process.cwd();
  for (const path of serverFiles) {
    const source = readFileSync(join(packageRoot, path), "utf8");
    assert(source.includes("server-only") || path.endsWith("conversation-handle.ts"),
      `${path} states its server-only boundary`);
    assert(!source.includes("api.openai.com"), `${path} names no real provider endpoint`);
    assert(!source.includes("http-model-transport"), `${path} enables no provider transport`);
    assert(!source.includes("Authorization"), `${path} sets no provider authorization`);
    assert(!source.includes("console."), `${path} logs nothing`);
  }

  const identifiers = [
    "pilot-runtime",
    "pilot-runtime-configuration",
    "conversation-handle",
    "operatorCredentialDigest",
    "issueCustomerSession",
    "issueOperatorSession",
  ];
  const roots = ["app", "components", "hooks", "lib", "services", "types", "utils", "src"];
  const files = roots.flatMap((root) => sourceFiles(join(packageRoot, root)));
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const relativePath = relative(packageRoot, file);
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

async function verifyDemoCompatibility(): Promise<void> {
  const demo = createAiDemoChatSession();
  const view = await demo.submit("project help");
  assert(view.messages.length > 1, "the existing simulated demo still serves a turn");
  assert(view.decision.stateMutationAuthorized === false
    && view.decision.customerReleaseAuthorized === false,
  "the existing demo still grants no release or mutation authority");
  assert(view.turns >= 1, "the existing demo still records its application audit");
}

function pilotConfiguration(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const configuration: Record<string, unknown> = {
    environment: "pilot",
    requireSecureTransport: true,
    providerNetworkExecution: "disabled",
    sessionTtlMs: SESSION_TTL_MS,
    operatorCredentialDigest: operatorDigest(),
    businesses: [
      { businessId: BUSINESS_A, widgetId: WIDGET_A, allowedOrigins: [APP_ORIGIN] },
      { businessId: BUSINESS_B, widgetId: WIDGET_B, allowedOrigins: [SECOND_ORIGIN] },
    ],
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete configuration[key];
    } else {
      configuration[key] = value;
    }
  }
  return configuration;
}

function buildRuntime(options: {
  readonly transport?: OfflineTransport;
  readonly now?: () => number;
  readonly configuration?: Record<string, unknown>;
  readonly sessionRateLimit?: RateLimitPolicy;
} = {}): PilotReceptionistRuntime {
  const result = createPilotReceptionistRuntime({
    configuration: options.configuration ?? pilotConfiguration(),
    businesses: [defaultBusiness(), secondBusiness()],
    transport: options.transport,
    now: options.now,
    ipRateLimit: { limit: 1_000, windowMs: 60_000 },
    sessionRateLimit: options.sessionRateLimit ?? { limit: 1_000, windowMs: 60_000 },
  });
  assert(result.status === "created", "the pilot runtime is created from valid configuration");
  if (result.status !== "created") throw new Error("unreachable");
  return result.runtime;
}

function issueCustomer(runtime: PilotReceptionistRuntime, widgetId: string): IssuedSession {
  const origin = widgetId === WIDGET_A ? APP_ORIGIN : SECOND_ORIGIN;
  const issued = runtime.issueCustomerSession({ widgetId, origin });
  assert(issued.status === "issued", "a customer session is issued for the test");
  if (issued.status !== "issued") throw new Error("unreachable");
  return issued.session;
}

function operatorDigest(): string {
  return createHash("sha256").update(OPERATOR_CREDENTIAL, "utf8").digest("hex");
}

function cookieOf(session: IssuedSession): string {
  return session.cookie.split(";")[0] ?? `${SESSION_COOKIE_NAME}=`;
}

function makeRequest(overrides: RequestOverrides = {}): Request {
  const headers = new Headers();
  headers.set("content-type", overrides.contentType ?? "application/json");
  if (overrides.cookie !== null) {
    headers.set("cookie", overrides.cookie ?? `${SESSION_COOKIE_NAME}=${"b".repeat(43)}`);
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
  headers.set("x-forwarded-for", overrides.ip ?? DEFAULT_IP);
  if (overrides.contentLength !== null && overrides.contentLength !== undefined) {
    headers.set("content-length", overrides.contentLength);
  }
  const method = overrides.method ?? "POST";
  const body = method === "GET" ? undefined : (overrides.body ?? "{}");
  return new Request(TURN_PATH, { method, headers, body });
}

async function responseJson(response: Response): Promise<ApiBody> {
  return JSON.parse(await response.text()) as ApiBody;
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

function thirdBusiness(): ReceptionistBusiness {
  const profile: BusinessProfile = {
    ...secondBusiness().profile,
    id: "third-fictional-business",
    businessName: "Third Fictional Services",
  };
  return { profile, knowledge: [] };
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
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...sourceFiles(path));
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
      files.push(path);
    }
  }
  return files;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Stage B2.3.1 pilot verification failed: ${message}.`);
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
