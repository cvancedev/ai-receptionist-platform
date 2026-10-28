import { parseJsonWithoutDuplicateKeys } from "../../ai/providers/provider-output-schema";
import type { PilotReceptionistRuntime } from "../pilot/pilot-runtime";
import {
  clientRateLimitKey,
  type RateLimitDecision,
  type RateLimitPolicy,
} from "../security/request-rate-limiter";
import { readBoundedBody } from "./bounded-request-body";
import { jsonResponse } from "./json-response";

if (typeof window !== "undefined") {
  throw new Error("The receptionist session handler is server-only.");
}

/**
 * Controlled pilot session issuance.
 *
 * A widget identifier selects a configured business; it is never treated as an
 * authentication secret. Issuance succeeds only when:
 * 1. the request is a same-origin, JSON POST over HTTPS in production;
 * 2. the client stays within the issuance rate limit;
 * 3. the widget exists and the configured origin allowlist admits the request;
 * 4. the durable store creates the conversation and session.
 *
 * The session token leaves the server only in the HttpOnly, Secure,
 * SameSite=Strict cookie. The response carries the CSRF token the browser must
 * echo on turn requests, plus explicit mode, simulation, and authority flags.
 */
export const RECEPTIONIST_SESSION_ENDPOINT_VERSION =
  "b2.3.2b-receptionist-session/v1" as const;

export const DEFAULT_ISSUANCE_RATE_LIMIT: RateLimitPolicy = Object.freeze({
  limit: 10,
  windowMs: 60_000,
});

type SessionErrorCode =
  | "method_not_allowed"
  | "unsupported_media_type"
  | "request_too_large"
  | "invalid_request"
  | "forbidden"
  | "rate_limited"
  | "internal_error"
  | "pilot_unavailable";

const ERROR_MESSAGES: Record<SessionErrorCode, string> = {
  method_not_allowed: "This endpoint accepts POST only.",
  unsupported_media_type: "A JSON request body is required.",
  request_too_large: "The request body is too large.",
  invalid_request: "The request could not be accepted.",
  forbidden: "The request is not authorized.",
  rate_limited: "Too many requests. Try again shortly.",
  internal_error: "The request could not be completed.",
  pilot_unavailable: "The receptionist pilot is unavailable.",
};

export interface SessionIssueHandlerOptions {
  readonly issuanceRateLimit?: RateLimitPolicy;
  readonly requireSecureTransport?: boolean;
  readonly nodeEnvironment?: string;
}

export async function handleReceptionistSessionIssue(
  request: Request,
  runtime: PilotReceptionistRuntime,
  options: Readonly<SessionIssueHandlerOptions> = {},
): Promise<Response> {
  if (runtime.mode !== "pilot") {
    return errorResponse(503, "pilot_unavailable");
  }
  try {
    if (request.method !== "POST") {
      return errorResponse(405, "method_not_allowed", { allow: "POST" });
    }

    const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
    if (contentType.split(";")[0].trim() !== "application/json") {
      return errorResponse(415, "unsupported_media_type");
    }

    const declaredLength = request.headers.get("content-length");
    if (declaredLength !== null) {
      if (!/^\d+$/.test(declaredLength)) return errorResponse(400, "invalid_request");
      if (Number(declaredLength) > runtime.maximumRequestBytes) {
        return errorResponse(413, "request_too_large");
      }
    }

    const nodeEnvironment = options.nodeEnvironment ?? process.env.NODE_ENV;
    const requireSecureTransport = options.requireSecureTransport
      ?? nodeEnvironment === "production";
    if (requireSecureTransport && !isSecureTransport(request)) {
      return errorResponse(403, "forbidden");
    }

    // Issuance is same-origin only. Cross-site embedding would need a separate,
    // explicitly reviewed cookie and CORS policy; it is not enabled here.
    if (!isSameOriginRequest(request)) {
      return errorResponse(403, "forbidden");
    }

    const rateLimit = options.issuanceRateLimit ?? DEFAULT_ISSUANCE_RATE_LIMIT;
    const decision = runtime.limiter.consume(
      `issuance:${clientRateLimitKey(request)}`,
      rateLimit,
    );
    if (!decision.allowed) return rateLimitResponse(decision);

    const body = await readBoundedBody(request, runtime.maximumRequestBytes);
    if (body.status === "too-large") return errorResponse(413, "request_too_large");
    if (body.status !== "text") return errorResponse(400, "invalid_request");

    const strict = parseJsonWithoutDuplicateKeys(body.text);
    if (strict.status !== "parsed" || !isPlainRecord(strict.value)) {
      return errorResponse(400, "invalid_request");
    }
    const keys = Object.keys(strict.value);
    if (keys.length !== 1 || keys[0] !== "widgetId") {
      return errorResponse(400, "invalid_request");
    }
    if (typeof strict.value.widgetId !== "string") {
      return errorResponse(400, "invalid_request");
    }

    const origin = request.headers.get("origin");
    if (origin === null) return errorResponse(403, "forbidden");

    // A public widget identifier plus a permitted origin selects a configured
    // business. It grants no operator identity and no cross-business access.
    const issued = await runtime.issueCustomerSession({
      widgetId: strict.value.widgetId,
      origin,
    });
    if (issued.status !== "issued") return errorResponse(403, "forbidden");

    const session = issued.session;
    return jsonResponse(201, {
      ok: true,
      mode: runtime.mode,
      simulated: runtime.simulated,
      data: {
        csrfToken: session.csrfToken,
        expiresAt: session.principal.expiresAt,
        provider: runtime.provider.identifier,
        networkAccessed: runtime.provider.networkAccessed,
        authority: {
          stateMutationAuthorized: false,
          customerReleaseAuthorized: false,
          externalActionAuthorized: false,
        },
      },
    }, { "set-cookie": session.cookie });
  } catch {
    return errorResponse(500, "internal_error");
  }
}

function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin === null) return false;
  let parsedOrigin: URL;
  let requestOrigin: URL;
  try {
    parsedOrigin = new URL(origin);
    requestOrigin = new URL(request.url);
  } catch {
    return false;
  }
  if (parsedOrigin.origin !== requestOrigin.origin) return false;

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite !== null && fetchSite !== "same-origin" && fetchSite !== "none") {
    return false;
  }
  return true;
}

function isSecureTransport(request: Request): boolean {
  try {
    if (new URL(request.url).protocol === "https:") return true;
  } catch {
    return false;
  }
  const forwarded = (request.headers.get("x-forwarded-proto") ?? "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  return forwarded === "https";
}

function rateLimitResponse(decision: RateLimitDecision): Response {
  return errorResponse(429, "rate_limited", {
    "retry-after": String(decision.retryAfterSeconds),
  });
}

function errorResponse(
  status: number,
  code: SessionErrorCode,
  extraHeaders: Readonly<Record<string, string>> = {},
): Response {
  return jsonResponse(status, {
    ok: false,
    mode: "pilot",
    simulated: true,
    error: {
      code,
      message: ERROR_MESSAGES[code],
    },
  }, extraHeaders);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
