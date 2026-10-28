import { parseJsonWithoutDuplicateKeys } from "../../ai/providers/provider-output-schema";
import { readBoundedBody } from "./bounded-request-body";
import { jsonResponse } from "./json-response";
import {
  parseSessionCookie,
  type SessionPrincipal,
} from "../auth/session-authority";
import type { ReceptionistTurnOutcome } from "../conversation/receptionist-conversation-service";
import {
  clientRateLimitKey,
  type RateLimitDecision,
} from "../security/request-rate-limiter";
import {
  getReceptionistRuntime,
  type ReceptionistTurnRuntime,
} from "../runtime/receptionist-runtime";

if (typeof window !== "undefined") {
  throw new Error("The receptionist turn handler is server-only.");
}

/**
 * One sanitized receptionist turn endpoint.
 *
 * Request order is deliberate:
 * 1. method, media type, and declared size (headers only);
 * 2. per-client rate limit;
 * 3. session authentication from the HttpOnly cookie;
 * 4. same-origin and CSRF validation;
 * 5. per-session rate limit;
 * 6. bounded body read and duplicate-free JSON parsing;
 * 7. business and conversation scope from the authenticated session only;
 * 8. server-side deterministic conversation work.
 *
 * Responses contain only application-authored messages, bounded state summary,
 * and explicit false authority. Provider details, prompts, proposal fields,
 * session tokens, CSRF tokens, and internal errors never leave the server.
 */
export const RECEPTIONIST_ENDPOINT_VERSION = "b2.2-receptionist-turn/v1" as const;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

type ErrorCode =
  | "method_not_allowed"
  | "unsupported_media_type"
  | "request_too_large"
  | "invalid_request"
  | "unauthorized"
  | "forbidden"
  | "rate_limited"
  | "conversation_unavailable"
  | "provider_failure"
  | "internal_error";

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  method_not_allowed: "This endpoint accepts POST only.",
  unsupported_media_type: "A JSON request body is required.",
  request_too_large: "The request body is too large.",
  invalid_request: "The request could not be accepted.",
  unauthorized: "Authentication is required.",
  forbidden: "The request is not authorized.",
  rate_limited: "Too many requests. Try again shortly.",
  conversation_unavailable: "The conversation is unavailable.",
  provider_failure: "The receptionist is temporarily unavailable.",
  internal_error: "The request could not be completed.",
};

export async function handleReceptionistTurn(
  request: Request,
  runtime: ReceptionistTurnRuntime = getReceptionistRuntime(),
): Promise<Response> {
  const mode = runtime.mode;
  try {
    if (request.method !== "POST") {
      return errorResponse(405, "method_not_allowed", mode, { allow: "POST" });
    }

    const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
    const mediaType = contentType.split(";")[0].trim();
    if (mediaType !== "application/json") {
      return errorResponse(415, "unsupported_media_type", mode);
    }

    const declaredLength = request.headers.get("content-length");
    if (declaredLength !== null) {
      if (!/^\d+$/.test(declaredLength)) return errorResponse(400, "invalid_request", mode);
      if (Number(declaredLength) > runtime.maximumRequestBytes) {
        return errorResponse(413, "request_too_large", mode);
      }
    }

    const clientLimit = runtime.limiter.consume(
      `client:${clientRateLimitKey(request)}`,
      runtime.ipRateLimit,
    );
    if (!clientLimit.allowed) return rateLimitResponse(clientLimit, mode);

    const authentication = await runtime.sessions.authenticate(
      parseSessionCookie(request.headers.get("cookie")),
      request.headers.get("x-csrf-token"),
    );
    if (authentication.status === "missing" || authentication.status === "invalid") {
      return errorResponse(401, "unauthorized", mode);
    }
    if (authentication.status === "csrf") {
      return errorResponse(403, "forbidden", mode);
    }

    const originFailure = verifySameOrigin(request);
    if (originFailure) return errorResponse(403, "forbidden", mode);

    const principal = authentication.principal;
    const sessionLimit = runtime.limiter.consume(
      `session:${principal.sessionKey}`,
      runtime.sessionRateLimit,
    );
    if (!sessionLimit.allowed) return rateLimitResponse(sessionLimit, mode);

    const body = await readBoundedBody(request, runtime.maximumRequestBytes);
    if (body.status === "too-large") return errorResponse(413, "request_too_large", mode);
    if (body.status !== "text") return errorResponse(400, "invalid_request", mode);

    const strict = parseJsonWithoutDuplicateKeys(body.text);
    if (strict.status !== "parsed" || !isPlainRecord(strict.value)) {
      return errorResponse(400, "invalid_request", mode);
    }

    const parsed = parseRequestBody(
      strict.value,
      principal,
      runtime.maximumMessageLength,
    );
    if (parsed.status === "forbidden") return errorResponse(403, "forbidden", mode);
    if (parsed.status !== "ok") return errorResponse(400, "invalid_request", mode);

    if (!runtime.hasBusiness(principal.businessId)) {
      return errorResponse(403, "forbidden", mode);
    }
    // The conversation is selected only by server-bound session state: the
    // opaque handle while it is resident, or the session's own durable scope
    // after a restart. No client field can name a conversation or a business.
    const submission = principal.conversationHandle !== null
      ? { handle: principal.conversationHandle, message: parsed.message }
      : principal.businessProfileVersion !== null
        ? {
          businessId: principal.businessId,
          conversationId: principal.conversationId,
          businessProfileVersion: principal.businessProfileVersion,
          message: parsed.message,
        }
        : null;
    if (submission === null) return errorResponse(403, "forbidden", mode);

    const outcome = await runtime.conversations.submit(submission);
    return turnResponse(outcome, principal, runtime);
  } catch {
    return errorResponse(500, "internal_error", mode);
  }
}

function parseRequestBody(
  body: Readonly<Record<string, unknown>>,
  principal: SessionPrincipal,
  maximumMessageLength: number,
):
  | { readonly status: "ok"; readonly message: string }
  | { readonly status: "forbidden" }
  | { readonly status: "invalid" } {
  const allowed = new Set(["message", "businessId", "conversationId"]);
  if (Object.keys(body).some((key) => !allowed.has(key))) {
    return { status: "invalid" };
  }
  if (typeof body.message !== "string") return { status: "invalid" };
  const message = body.message.trim();
  if (message.length === 0 || message.length > maximumMessageLength) {
    return { status: "invalid" };
  }
  if (CONTROL_CHARACTERS.test(message)) return { status: "invalid" };

  if (body.businessId !== undefined) {
    if (typeof body.businessId !== "string"
      || !IDENTIFIER_PATTERN.test(body.businessId)) return { status: "invalid" };
    if (body.businessId !== principal.businessId) return { status: "forbidden" };
  }
  if (body.conversationId !== undefined) {
    if (typeof body.conversationId !== "string"
      || !IDENTIFIER_PATTERN.test(body.conversationId)) return { status: "invalid" };
    if (body.conversationId !== principal.conversationId) return { status: "forbidden" };
  }

  return { status: "ok", message };
}

function turnResponse(
  outcome: ReceptionistTurnOutcome,
  principal: SessionPrincipal,
  runtime: ReceptionistTurnRuntime,
): Response {
  if (outcome.status === "provider-failure") {
    return errorResponse(502, "provider_failure", runtime.mode);
  }
  if (outcome.status === "internal-failure") {
    return errorResponse(500, "internal_error", runtime.mode);
  }
  if (outcome.status === "conversation-unavailable") {
    return errorResponse(404, "conversation_unavailable", runtime.mode);
  }
  if (outcome.status === "invalid-message") {
    return errorResponse(400, "invalid_request", runtime.mode);
  }

  return jsonResponse(200, {
    ok: true,
    mode: runtime.mode,
    simulated: runtime.simulated,
    data: {
      businessId: principal.businessId,
      conversationId: principal.conversationId,
      turn: outcome.turn,
      decision: outcome.decision,
      messages: outcome.messages.map((message) => ({
        role: message.role,
        text: message.text,
      })),
      conversation: {
        stage: outcome.conversation.stage,
        revision: outcome.conversation.revision,
        pendingFieldId: outcome.conversation.pendingFieldId,
        readiness: outcome.conversation.readiness,
        handoffAvailable: outcome.conversation.handoffAvailable,
      },
      authority: {
        stateMutationAuthorized: false,
        customerReleaseAuthorized: false,
        externalActionAuthorized: false,
      },
      provider: runtime.provider.identifier,
      networkAccessed: runtime.provider.networkAccessed,
    },
  });
}

function verifySameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin !== null) {
    let parsedOrigin: URL;
    let requestOrigin: URL;
    try {
      parsedOrigin = new URL(origin);
      requestOrigin = new URL(request.url);
    } catch {
      return true;
    }
    if (parsedOrigin.origin !== requestOrigin.origin) return true;
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite !== null && fetchSite !== "same-origin" && fetchSite !== "none") {
    return true;
  }
  return false;
}

function rateLimitResponse(
  decision: RateLimitDecision,
  mode: "demo" | "pilot",
): Response {
  return errorResponse(429, "rate_limited", mode, {
    "retry-after": String(decision.retryAfterSeconds),
  });
}

function errorResponse(
  status: number,
  code: ErrorCode,
  mode: "demo" | "pilot" = "demo",
  extraHeaders: Readonly<Record<string, string>> = {},
): Response {
  return jsonResponse(status, {
    ok: false,
    mode,
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
