import { parseJsonWithoutDuplicateKeys } from "../../ai/providers/provider-output-schema";
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
  try {
    if (request.method !== "POST") {
      return errorResponse(405, "method_not_allowed", { allow: "POST" });
    }

    const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
    const mediaType = contentType.split(";")[0].trim();
    if (mediaType !== "application/json") {
      return errorResponse(415, "unsupported_media_type");
    }

    const declaredLength = request.headers.get("content-length");
    if (declaredLength !== null) {
      if (!/^\d+$/.test(declaredLength)) return errorResponse(400, "invalid_request");
      if (Number(declaredLength) > runtime.maximumRequestBytes) {
        return errorResponse(413, "request_too_large");
      }
    }

    const clientLimit = runtime.limiter.consume(
      `client:${clientRateLimitKey(request)}`,
      runtime.ipRateLimit,
    );
    if (!clientLimit.allowed) return rateLimitResponse(clientLimit);

    const authentication = runtime.sessions.authenticate(
      parseSessionCookie(request.headers.get("cookie")),
      request.headers.get("x-csrf-token"),
    );
    if (authentication.status === "missing" || authentication.status === "invalid") {
      return errorResponse(401, "unauthorized");
    }
    if (authentication.status === "csrf") {
      return errorResponse(403, "forbidden");
    }

    const originFailure = verifySameOrigin(request);
    if (originFailure) return errorResponse(403, "forbidden");

    const principal = authentication.principal;
    const sessionLimit = runtime.limiter.consume(
      `session:${principal.sessionKey}`,
      runtime.sessionRateLimit,
    );
    if (!sessionLimit.allowed) return rateLimitResponse(sessionLimit);

    const body = await readLimitedBody(request, runtime.maximumRequestBytes);
    if (body.status === "too-large") return errorResponse(413, "request_too_large");
    if (body.status !== "text") return errorResponse(400, "invalid_request");

    const strict = parseJsonWithoutDuplicateKeys(body.text);
    if (strict.status !== "parsed" || !isPlainRecord(strict.value)) {
      return errorResponse(400, "invalid_request");
    }

    const parsed = parseRequestBody(
      strict.value,
      principal,
      runtime.maximumMessageLength,
    );
    if (parsed.status === "forbidden") return errorResponse(403, "forbidden");
    if (parsed.status !== "ok") return errorResponse(400, "invalid_request");

    if (!runtime.hasBusiness(principal.businessId)) {
      return errorResponse(403, "forbidden");
    }
    // The conversation is selected only by the opaque handle the server bound
    // to this session. No client field can name a conversation or a business.
    if (principal.conversationHandle === null) {
      return errorResponse(403, "forbidden");
    }

    const outcome = await runtime.conversations.submit({
      handle: principal.conversationHandle,
      message: parsed.message,
    });
    return turnResponse(outcome, principal, runtime.provider);
  } catch {
    return errorResponse(500, "internal_error");
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
  provider: { readonly identifier: string; readonly networkAccessed: boolean },
): Response {
  if (outcome.status === "provider-failure") {
    return errorResponse(502, "provider_failure");
  }
  if (outcome.status === "internal-failure") {
    return errorResponse(500, "internal_error");
  }
  if (outcome.status === "conversation-unavailable") {
    return errorResponse(404, "conversation_unavailable");
  }
  if (outcome.status === "invalid-message") {
    return errorResponse(400, "invalid_request");
  }

  return jsonResponse(200, {
    ok: true,
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
      provider: provider.identifier,
      networkAccessed: provider.networkAccessed,
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

async function readLimitedBody(
  request: Request,
  maximumBytes: number,
): Promise<
  | { readonly status: "text"; readonly text: string }
  | { readonly status: "too-large" }
  | { readonly status: "empty" }
  | { readonly status: "invalid" }
> {
  if (!request.body) return { status: "empty" };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        return { status: "too-large" };
      }
      chunks.push(value);
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    return { status: "invalid" };
  }
  if (total === 0) return { status: "empty" };

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return {
      status: "text",
      text: new TextDecoder("utf-8", { fatal: true }).decode(merged),
    };
  } catch {
    return { status: "invalid" };
  }
}

function rateLimitResponse(decision: RateLimitDecision): Response {
  return errorResponse(429, "rate_limited", {
    "retry-after": String(decision.retryAfterSeconds),
  });
}

function errorResponse(
  status: number,
  code: ErrorCode,
  extraHeaders: Readonly<Record<string, string>> = {},
): Response {
  return jsonResponse(status, {
    ok: false,
    error: {
      code,
      message: ERROR_MESSAGES[code],
    },
  }, extraHeaders);
}

function jsonResponse(
  status: number,
  body: unknown,
  extraHeaders: Readonly<Record<string, string>> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      vary: "Cookie",
      ...extraHeaders,
    },
  });
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
