import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { BoundedRawOutputParser } from "../ai/output/raw-output-parser";
import type { OfflineTransport } from "../ai/providers/transport-model-provider-adapter";
import { fictionalBusinessProfile } from "../fixtures/business-profile";
import type { BusinessProfile } from "../domain/business-profile";
import {
  SESSION_COOKIE_NAME,
  SessionAuthority,
  parseSessionCookie,
  serializeSessionCookie,
} from "../server/auth/session-authority";
import {
  MAXIMUM_MESSAGE_LENGTH,
  ReceptionistConversationService,
  type ReceptionistBusiness,
} from "../server/conversation/receptionist-conversation-service";
import {
  handleReceptionistTurn,
} from "../server/http/receptionist-turn-handler";
import { createReceptionistRuntime } from "../server/runtime/receptionist-runtime";

const CANARY = "b22-canary-provider-detail-must-not-escape";
const ORIGIN = "http://localhost";
const TURN_PATH = `${ORIGIN}/api/receptionist/turn`;
const BUSINESS_A = fictionalBusinessProfile.id;
const BUSINESS_B = "second-fictional-business";
const DEFAULT_IP = "198.51.100.10";

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

async function run(): Promise<void> {
  verifyCookieAndParserFoundation();
  await verifySessionAuthentication();
  await verifyConversationTurnFlow();
  await verifyCsrfAndRateLimits();
  await verifyMalformedRequests();
  await verifyBusinessAndConversationIsolation();
  await verifyProviderFailuresAndAuthority();
  verifyClientBoundaries();
  await verifyConcurrentTurnSerialization();

  console.log(
    "Stage B2.2 receptionist endpoint verification passed: session authentication, CSRF, "
    + "business/conversation isolation, rate limits, bounded malformed input, sanitized "
    + "provider failures, duplicate-key refusal, no tool or release authority, and no "
    + "client-side server imports.",
  );
}

function verifyCookieAndParserFoundation(): void {
  const authority = new SessionAuthority({
    generateBytes: () => Buffer.alloc(32, 7),
  });
  const issued = authority.issue({
    businessId: BUSINESS_A,
    conversationId: "conversation-cookie-001",
    actorId: "fictional-actor-001",
  }, true);
  assert(issued.cookie.includes(`${SESSION_COOKIE_NAME}=${issued.token}`),
    "the session cookie carries the opaque token");
  assert(issued.cookie.includes("HttpOnly"), "the session cookie is HttpOnly");
  assert(issued.cookie.includes("SameSite=Strict"), "the session cookie is SameSite=Strict");
  assert(issued.cookie.includes("Path=/"), "the session cookie is path-scoped");
  assert(issued.cookie.includes("Secure"), "a secure session cookie requests Secure");
  assert(issued.cookie.includes("Max-Age="), "the session cookie has a bounded lifetime");
  assert(!issued.cookie.includes("Domain="), "the session cookie sets no Domain");
  assert(serializeSessionCookie(issued.token, { secure: false, maxAgeSeconds: 60 })
    .includes("Max-Age=60"), "cookie serialization is deterministic");
  assert(parseSessionCookie(`other=1; ${SESSION_COOKIE_NAME}=${issued.token}; last=2`)
    === issued.token, "cookie parsing reads only the named session cookie");
  assert(parseSessionCookie(null) === null, "a missing cookie header yields no session");
  assert(authority.authenticate(issued.token, issued.csrfToken).status === "authenticated",
    "the issued token and CSRF pair authenticates");
  assert(authority.authenticate(issued.token, `${issued.csrfToken}x`).status === "csrf",
    "a wrong CSRF token is rejected");
  assert(authority.authenticate(`${issued.token}x`, issued.csrfToken).status === "invalid",
    "a tampered session token is rejected");

  const parser = new BoundedRawOutputParser();
  for (const raw of [
    "{\"a\":1,\"a\":2}",
    "{\"a\":1,\"\\u0061\":2}",
    "{\"a\":{\"b\":1,\"b\":2}}",
    "{\"a\":[{\"b\":1,\"b\":2}]}",
  ]) {
    const result = parser.parse(raw);
    assert(result.status === "failure" && result.failures.includes("RawOutputMalformed"),
      `the downstream parser refuses duplicate keys in ${raw}`);
  }
  const valid = parser.parse("{\"a\":1,\"b\":2}");
  assert(valid.status === "success", "the downstream parser still accepts duplicate-free JSON");
  assert(parser.parse("{\"__proto__\":1}").status === "failure",
    "the downstream parser refuses dangerous keys");
  assert(parser.parse("{\"a\":1} trailing").status === "failure",
    "the downstream parser refuses trailing content");
}

async function verifySessionAuthentication(): Promise<void> {
  let clock = 1_000_000;
  const runtime = createReceptionistRuntime({ now: () => clock });
  const session = runtime.issueSession(BUSINESS_A, "fictional-actor-auth");
  const body = JSON.stringify({ message: "project help" });

  let unknownBusinessRejected = false;
  try {
    runtime.issueSession("unknown-fictional-business", "fictional-actor-auth");
  } catch {
    unknownBusinessRejected = true;
  }
  assert(unknownBusinessRejected,
    "trusted composition cannot issue a session for an unknown business");

  const missing = await handleReceptionistTurn(
    makeRequest({ body, cookie: null }),
    runtime,
  );
  assert(missing.status === 401, "a missing session is unauthorized");
  const missingBody = await responseJson(missing);
  assert(missingBody.error?.code === "unauthorized", "the missing-session code is sanitized");
  assert(!missing.headers.has("set-cookie"), "an unauthorized response sets no cookie");

  const invalid = await handleReceptionistTurn(
    makeRequest({ body, cookie: `${SESSION_COOKIE_NAME}=${"a".repeat(43)}` }),
    runtime,
  );
  assert(invalid.status === 401, "an unknown session token is unauthorized");

  const validCookie = await handleReceptionistTurn(makeRequest({
    body,
    cookie: `other=1; ${session.cookie.split(";")[0]}`,
    csrf: session.csrfToken,
  }), runtime);
  assert(validCookie.status === 200, "a valid cookie authenticates through the full flow");

  clock += 31 * 60 * 1_000;
  const afterExpiry = await handleReceptionistTurn(makeRequest({
    body,
    cookie: `other=1; ${session.cookie.split(";")[0]}`,
    csrf: session.csrfToken,
  }), runtime);
  assert(afterExpiry.status === 401, "an expired session is unauthorized");

  const revokedRuntime = createReceptionistRuntime();
  const revoked = revokedRuntime.issueSession(BUSINESS_A, "fictional-actor-revoked");
  revokedRuntime.sessions.revoke(revoked.token);
  const afterRevoke = await handleReceptionistTurn(makeRequest({
    body,
    cookie: `${SESSION_COOKIE_NAME}=${revoked.token}`,
  }), revokedRuntime);
  assert(afterRevoke.status === 401, "a revoked session is unauthorized");

  const method = await handleReceptionistTurn(makeRequest({
    method: "GET",
    cookie: `${SESSION_COOKIE_NAME}=${session.token}`,
    csrf: session.csrfToken,
  }), runtime);
  assert(method.status === 405, "a non-POST request is refused");
  assert(method.headers.get("allow") === "POST", "the method refusal advertises POST only");

  const media = await handleReceptionistTurn(makeRequest({
    body: "message=project+help",
    contentType: "application/x-www-form-urlencoded",
    cookie: `${SESSION_COOKIE_NAME}=${session.token}`,
    csrf: session.csrfToken,
  }), runtime);
  assert(media.status === 415, "a non-JSON media type is refused");
}

async function verifyConversationTurnFlow(): Promise<void> {
  const runtime = createReceptionistRuntime();
  const session = runtime.issueSession(BUSINESS_A, "fictional-actor-flow");
  const cookie = `${SESSION_COOKIE_NAME}=${session.token}`;

  const first = await handleReceptionistTurn(makeRequest({
    body: JSON.stringify({ message: "project help" }),
    cookie,
    csrf: session.csrfToken,
    ip: "198.51.100.15",
  }), runtime);
  const firstData = await responseJson(first);
  assert(first.status === 200 && firstData.data?.decision === "accepted",
    "a configured service request is accepted through the endpoint");
  assert(typeof firstData.data?.conversation.pendingFieldId === "string",
    "the first turn exposes the next application-selected field");
  assert((firstData.data?.conversation.revision ?? 0) >= 1,
    "the first accepted turn advances deterministic state");
  assert(!JSON.stringify(firstData).includes(session.token),
    "the response never returns the session token");
  assert(!JSON.stringify(firstData).includes(session.csrfToken),
    "the response never returns the CSRF token");

  const second = await handleReceptionistTurn(makeRequest({
    body: JSON.stringify({ message: "Jordan Example" }),
    cookie,
    csrf: session.csrfToken,
    ip: "198.51.100.16",
  }), runtime);
  const secondData = await responseJson(second);
  assert(second.status === 200 && secondData.data?.decision === "accepted",
    "a candidate fact answer is accepted through the endpoint");
  assert((secondData.data?.conversation.revision ?? 0)
    > (firstData.data?.conversation.revision ?? 0),
  "the second accepted turn advances state again");
  assert(secondData.data?.messages.some((message) => message.role === "assistant"),
    "the endpoint returns application-authored assistant messages");
  assert(!JSON.stringify(secondData).includes("candidateValue"),
    "the endpoint never returns raw proposal fields");
}

async function verifyCsrfAndRateLimits(): Promise<void> {
  const runtime = createReceptionistRuntime();
  const session = runtime.issueSession(BUSINESS_A, "fictional-actor-csrf");
  const cookie = `${SESSION_COOKIE_NAME}=${session.token}`;
  const body = JSON.stringify({ message: "project help" });

  const missingCsrf = await handleReceptionistTurn(makeRequest({
    body,
    cookie,
    csrf: null,
  }), runtime);
  assert(missingCsrf.status === 403, "a missing CSRF token is forbidden");

  const wrongCsrf = await handleReceptionistTurn(makeRequest({
    body,
    cookie,
    csrf: `${session.csrfToken}x`,
  }), runtime);
  assert(wrongCsrf.status === 403, "a wrong CSRF token is forbidden");

  const crossOrigin = await handleReceptionistTurn(makeRequest({
    body,
    cookie,
    csrf: session.csrfToken,
    origin: "https://evil.example",
  }), runtime);
  assert(crossOrigin.status === 403, "a foreign Origin is forbidden");

  const crossSite = await handleReceptionistTurn(makeRequest({
    body,
    cookie,
    csrf: session.csrfToken,
    fetchSite: "cross-site",
  }), runtime);
  assert(crossSite.status === 403, "a cross-site fetch is forbidden");

  const invalidOrigin = await handleReceptionistTurn(makeRequest({
    body,
    cookie,
    csrf: session.csrfToken,
    origin: "null",
  }), runtime);
  assert(invalidOrigin.status === 403, "an unparseable Origin is forbidden");

  const sessionLimited = createReceptionistRuntime({
    sessionRateLimit: { limit: 2, windowMs: 60_000 },
    ipRateLimit: { limit: 100, windowMs: 60_000 },
  });
  const limited = sessionLimited.issueSession(BUSINESS_A, "fictional-actor-limit");
  const limitedCookie = `${SESSION_COOKIE_NAME}=${limited.token}`;
  const first = await handleReceptionistTurn(makeRequest({
    body, cookie: limitedCookie, csrf: limited.csrfToken,
  }), sessionLimited);
  const second = await handleReceptionistTurn(makeRequest({
    body, cookie: limitedCookie, csrf: limited.csrfToken,
  }), sessionLimited);
  const third = await handleReceptionistTurn(makeRequest({
    body, cookie: limitedCookie, csrf: limited.csrfToken,
  }), sessionLimited);
  assert(first.status === 200 && second.status === 200,
    "requests within the session limit are allowed");
  assert(third.status === 429, "the session rate limit refuses the next request");
  assert(Number(third.headers.get("retry-after")) >= 1,
    "the rate-limit response provides a retry delay");
  const limitedBody = await responseJson(third);
  assert(limitedBody.error?.code === "rate_limited", "the rate-limit code is sanitized");

  const ipLimited = createReceptionistRuntime({
    sessionRateLimit: { limit: 100, windowMs: 60_000 },
    ipRateLimit: { limit: 2, windowMs: 60_000 },
  });
  const one = ipLimited.issueSession(BUSINESS_A, "fictional-actor-ip-1");
  const two = ipLimited.issueSession(BUSINESS_A, "fictional-actor-ip-2");
  const three = ipLimited.issueSession(BUSINESS_A, "fictional-actor-ip-3");
  const ipKey = "203.0.113.99";
  const ipFirst = await handleReceptionistTurn(makeRequest({
    body, cookie: `${SESSION_COOKIE_NAME}=${one.token}`, csrf: one.csrfToken, ip: ipKey,
  }), ipLimited);
  const ipSecond = await handleReceptionistTurn(makeRequest({
    body, cookie: `${SESSION_COOKIE_NAME}=${two.token}`, csrf: two.csrfToken, ip: ipKey,
  }), ipLimited);
  const ipThird = await handleReceptionistTurn(makeRequest({
    body, cookie: `${SESSION_COOKIE_NAME}=${three.token}`, csrf: three.csrfToken, ip: ipKey,
  }), ipLimited);
  assert(ipFirst.status === 200 && ipSecond.status === 200,
    "requests within the client limit are allowed");
  assert(ipThird.status === 429, "the client rate limit refuses the next request");
}

async function verifyMalformedRequests(): Promise<void> {
  const runtime = createReceptionistRuntime();
  const session = runtime.issueSession(BUSINESS_A, "fictional-actor-malformed");
  const cookie = `${SESSION_COOKIE_NAME}=${session.token}`;
  const csrf = session.csrfToken;

  const cases: readonly { readonly body: string; readonly description: string }[] = [
    { body: "", description: "an empty body" },
    { body: "{}", description: "a body without a message" },
    { body: JSON.stringify({ message: "" }), description: "an empty message" },
    { body: JSON.stringify({ message: "   " }), description: "a whitespace-only message" },
    { body: JSON.stringify({ message: "a".repeat(MAXIMUM_MESSAGE_LENGTH + 1) }),
      description: "an over-length message" },
    { body: JSON.stringify({ message: "hello\u0000world" }),
      description: "a control character in the message" },
    { body: JSON.stringify({ message: "hello", extra: true }),
      description: "an unexpected field" },
    { body: "{\"message\":\"one\",\"message\":\"two\"}",
      description: "duplicate request keys" },
    { body: "{", description: "invalid JSON" },
    { body: "[]", description: "a non-object JSON body" },
  ];
  for (const item of cases) {
    const response = await handleReceptionistTurn(makeRequest({
      body: item.body, cookie, csrf, ip: "198.51.100.20",
    }), runtime);
    assert(response.status === 400, `${item.description} is a bad request`);
    const parsed = await responseJson(response);
    assert(parsed.error?.code === "invalid_request",
      `${item.description} returns a sanitized invalid_request code`);
  }

  const oversized = await handleReceptionistTurn(makeRequest({
    body: JSON.stringify({ message: "x".repeat(9_000) }),
    cookie,
    csrf,
    ip: "198.51.100.21",
  }), runtime);
  assert(oversized.status === 413, "an oversized streamed request is refused");

  const declared = await handleReceptionistTurn(makeRequest({
    body: JSON.stringify({ message: "small" }),
    cookie,
    csrf,
    ip: "198.51.100.22",
    contentLength: "99999",
  }), runtime);
  assert(declared.status === 413, "an oversized declared request is refused before reading");

  const invalidUtf8 = new Uint8Array([0x7b, 0x22, 0x6d, 0x22, 0x3a, 0xff, 0x7d]);
  const invalidEncodingRequest = new Request(TURN_PATH, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie,
      "x-csrf-token": csrf,
      "x-forwarded-for": "198.51.100.23",
    },
    body: invalidUtf8,
  });
  const invalidEncoding = await handleReceptionistTurn(invalidEncodingRequest, runtime);
  assert(invalidEncoding.status === 400, "invalid UTF-8 is refused");
}

async function verifyBusinessAndConversationIsolation(): Promise<void> {
  const businessB = secondBusiness();
  const runtime = createReceptionistRuntime({ businesses: [defaultBusiness(), businessB] });
  const sessionA = runtime.issueSession(BUSINESS_A, "fictional-actor-a");
  const sessionB = runtime.issueSession(BUSINESS_B, "fictional-actor-b");
  const cookieA = `${SESSION_COOKIE_NAME}=${sessionA.token}`;
  const cookieB = `${SESSION_COOKIE_NAME}=${sessionB.token}`;

  const aFirst = await handleReceptionistTurn(makeRequest({
    body: JSON.stringify({ message: "project help" }),
    cookie: cookieA,
    csrf: sessionA.csrfToken,
    ip: "198.51.100.30",
  }), runtime);
  const aData = await responseJson(aFirst);
  assert(aFirst.status === 200 && aData.data?.businessId === BUSINESS_A,
    "business A receives its own scoped response");
  assert(aData.data?.conversationId === sessionA.principal.conversationId,
    "the conversation comes from the session, not the client");
  assert(!JSON.stringify(aData).includes(sessionA.token),
    "a scoped response never returns the session token");
  assert(!JSON.stringify(aData).includes(sessionA.csrfToken),
    "a scoped response never returns the CSRF token");
  assert(aData.data?.authority.stateMutationAuthorized === false,
    "the response grants no state authority");
  assert(aData.data?.authority.customerReleaseAuthorized === false,
    "the response grants no customer-release authority");

  const beforeA = runtime.conversations.revisionOf(
    BUSINESS_A,
    sessionA.principal.conversationId,
  );
  const bFirst = await handleReceptionistTurn(makeRequest({
    body: JSON.stringify({ message: "project help" }),
    cookie: cookieB,
    csrf: sessionB.csrfToken,
    ip: "198.51.100.31",
  }), runtime);
  const bData = await responseJson(bFirst);
  assert(bFirst.status === 200 && bData.data?.businessId === BUSINESS_B,
    "business B receives its own scoped response");
  assert(bData.data?.conversationId === sessionB.principal.conversationId,
    "business B is bound to its own conversation");
  assert(runtime.conversations.revisionOf(
    BUSINESS_A,
    sessionA.principal.conversationId,
  ) === beforeA, "business B work leaves business A state unchanged");

  const crossBusiness = await handleReceptionistTurn(makeRequest({
    body: JSON.stringify({ message: "project help", businessId: BUSINESS_B }),
    cookie: cookieA,
    csrf: sessionA.csrfToken,
    ip: "198.51.100.32",
  }), runtime);
  assert(crossBusiness.status === 403, "a session cannot select another business");

  const crossConversation = await handleReceptionistTurn(makeRequest({
    body: JSON.stringify({
      message: "project help",
      conversationId: sessionB.principal.conversationId,
    }),
    cookie: cookieA,
    csrf: sessionA.csrfToken,
    ip: "198.51.100.33",
  }), runtime);
  assert(crossConversation.status === 403, "a session cannot select another conversation");

  const reverseConversation = await handleReceptionistTurn(makeRequest({
    body: JSON.stringify({
      message: "project help",
      conversationId: sessionA.principal.conversationId,
    }),
    cookie: cookieB,
    csrf: sessionB.csrfToken,
    ip: "198.51.100.34",
  }), runtime);
  assert(reverseConversation.status === 403,
    "business B cannot select business A's conversation");

  const sameBusiness = await handleReceptionistTurn(makeRequest({
    body: JSON.stringify({
      message: "project help",
      businessId: BUSINESS_A,
      conversationId: sessionA.principal.conversationId,
    }),
    cookie: cookieA,
    csrf: sessionA.csrfToken,
    ip: "198.51.100.35",
  }), runtime);
  assert(sameBusiness.status === 200,
    "an echoed matching scope does not change the authenticated scope");
}

async function verifyProviderFailuresAndAuthority(): Promise<void> {
  const failingTransport: OfflineTransport = async () => ({
    status: "failed",
    error: { category: "provider-failure", message: CANARY },
  });
  const failureRuntime = createReceptionistRuntime({ transport: failingTransport });
  const failureSession = failureRuntime.issueSession(BUSINESS_A, "fictional-actor-failure");
  const failureResponse = await handleReceptionistTurn(makeRequest({
    body: JSON.stringify({ message: "project help" }),
    cookie: `${SESSION_COOKIE_NAME}=${failureSession.token}`,
    csrf: failureSession.csrfToken,
    ip: "198.51.100.40",
  }), failureRuntime);
  assert(failureResponse.status === 502, "a provider failure is a sanitized bad gateway");
  const failureBody = await responseText(failureResponse);
  assert(failureBody.includes("\"provider_failure\""), "a provider failure has an explicit code");
  assert(!failureBody.includes(CANARY), "a provider failure does not echo provider text");
  assert(!failureBody.includes("provider-failure"), "a provider failure does not echo internal categories");
  assert(failureRuntime.conversations.revisionOf(
    BUSINESS_A,
    failureSession.principal.conversationId,
  ) === 0, "a provider failure changes no conversation state");

  const maliciousTransport = maliciousProposalTransport();
  const maliciousRuntime = createReceptionistRuntime({ transport: maliciousTransport });
  const maliciousSession = maliciousRuntime.issueSession(BUSINESS_A, "fictional-actor-authority");
  const maliciousResponse = await handleReceptionistTurn(makeRequest({
    body: JSON.stringify({ message: "project help" }),
    cookie: `${SESSION_COOKIE_NAME}=${maliciousSession.token}`,
    csrf: maliciousSession.csrfToken,
    ip: "198.51.100.41",
  }), maliciousRuntime);
  const maliciousBody = await responseText(maliciousResponse);
  assert(maliciousResponse.status === 200, "a rejected proposal returns a bounded application outcome");
  assert(maliciousBody.includes("\"decision\":\"rejected\""),
    "the malicious proposal is rejected by the application");
  assert(!maliciousBody.includes(CANARY), "AI proposal text is never returned");
  assert(!maliciousBody.includes("\"toolCall\"") && !maliciousBody.includes("\"stateMutation\""),
    "tool and state fields are never returned");
  assert(!maliciousBody.includes("candidateIntent"), "raw proposal fields are never returned");
  assert(maliciousRuntime.conversations.revisionOf(
    BUSINESS_A,
    maliciousSession.principal.conversationId,
  ) === 0, "authority-bearing output changes no conversation state");

  const providerService = new ReceptionistConversationService([defaultBusiness()], {
    transport: async () => ({ status: "failed", error: { category: "provider-failure" } }),
  });
  assert(providerService.begin(BUSINESS_A, "conversation-provider-failure"),
    "a service conversation can begin for a failure test");
  const providerOutcome = await providerService.submit({
    businessId: BUSINESS_A,
    conversationId: "conversation-provider-failure",
    message: "project help",
  });
  assert(providerOutcome.status === "provider-failure",
    "the service reports a provider failure without applying state");
  assert(providerService.revisionOf(BUSINESS_A, "conversation-provider-failure") === 0,
    "the service leaves the revision unchanged after provider failure");
}

async function verifyConcurrentTurnSerialization(): Promise<void> {
  let active = 0;
  let maximumActive = 0;
  const transport: OfflineTransport = async (request) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, 15));
    active -= 1;
    const input = JSON.parse(request.input) as {
      identity: Record<string, unknown>;
      currentCustomerInput: { messageId: string };
    };
    return {
      status: "completed",
      rawOutput: JSON.stringify({
        ...input.identity,
        candidateIntent: "service-inquiry",
        candidateServiceReference: "home-project-consultation",
        ambiguity: false,
        unsupportedRequest: false,
        sourceMessageReference: input.currentCustomerInput.messageId,
        customerObjective: "A fictional project consultation.",
      }),
      usage: { inputUnits: 10, outputUnits: 5 },
      finishReason: "stop",
    };
  };
  const service = new ReceptionistConversationService([defaultBusiness()], { transport });
  assert(service.begin(BUSINESS_A, "conversation-concurrent-001"),
    "a concurrent-test conversation can begin");
  const [first, second] = await Promise.all([
    service.submit({
      businessId: BUSINESS_A,
      conversationId: "conversation-concurrent-001",
      message: "project help",
    }),
    service.submit({
      businessId: BUSINESS_A,
      conversationId: "conversation-concurrent-001",
      message: "project help",
    }),
  ]);
  assert(first.status === "ok" && second.status === "ok",
    "both serialized turns settle safely");
  assert(maximumActive === 1, "concurrent requests cannot overlap provider work");
}

function verifyClientBoundaries(): void {
  const identifiers = [
    "session-authority",
    "receptionist-conversation-service",
    "receptionist-turn-handler",
    "receptionist-runtime",
    "SESSION_COOKIE_NAME",
    "parseSessionCookie",
    "x-csrf-token",
  ];
  const packageRoot = process.cwd();
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
        `${relative(packageRoot, file)} does not reference ${identifier}`);
    }
  }

  for (const path of [
    "src/server/auth/session-authority.ts",
    "src/server/conversation/receptionist-conversation-service.ts",
    "src/server/http/receptionist-turn-handler.ts",
    "src/server/runtime/receptionist-runtime.ts",
    "src/server/security/request-rate-limiter.ts",
    "app/api/receptionist/turn/route.ts",
  ]) {
    const source = readFileSync(join(packageRoot, path), "utf8");
    assert(!source.includes("api.openai.com"), `${path} names no real provider endpoint`);
    assert(!source.includes("http-model-transport"),
      `${path} does not enable the real provider HTTP transport`);
    assert(!source.includes("Authorization"), `${path} sets no provider authorization`);
    assert(!source.includes("console."), `${path} logs nothing`);
  }

  const handler = readFileSync(
    join(packageRoot, "src/server/http/receptionist-turn-handler.ts"),
    "utf8",
  );
  assert(!handler.includes("rawOutput"), "the endpoint never returns raw provider output");
  assert(!handler.includes("proposal:"), "the endpoint never returns a proposal field");
}

function makeRequest(overrides: RequestOverrides = {}): Request {
  const headers = new Headers();
  headers.set("content-type", overrides.contentType ?? "application/json");
  const cookie = overrides.cookie === undefined
    ? `${SESSION_COOKIE_NAME}=${"b".repeat(43)}`
    : overrides.cookie;
  if (cookie !== null) headers.set("cookie", cookie);
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

function maliciousProposalTransport(): OfflineTransport {
  return async (request) => {
    const input = JSON.parse(request.input) as {
      identity: Record<string, unknown>;
      currentCustomerInput: { messageId: string };
    };
    return {
      status: "completed",
      rawOutput: JSON.stringify({
        ...input.identity,
        candidateIntent: "service-inquiry",
        candidateServiceReference: "home-project-consultation",
        ambiguity: false,
        unsupportedRequest: false,
        sourceMessageReference: input.currentCustomerInput.messageId,
        customerObjective: CANARY,
        customerFacingText: CANARY,
        toolCall: { name: "execute-external-action" },
        stateMutation: { stage: "completed" },
      }),
      usage: { inputUnits: 1, outputUnits: 1 },
      finishReason: "stop",
    };
  };
}

function defaultBusiness(): ReceptionistBusiness {
  return {
    profile: fictionalBusinessProfile,
    knowledge: [],
  };
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

async function responseJson(response: Response): Promise<ApiBody> {
  return JSON.parse(await response.text()) as ApiBody;
}

async function responseText(response: Response): Promise<string> {
  return response.text();
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Stage B2.2 receptionist verification failed: ${message}.`);
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
