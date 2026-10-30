import type {
  OfflineTransport,
  OfflineTransportRequest,
  OfflineTransportResponse,
} from "./transport-model-provider-adapter";
import {
  parseJsonWithoutDuplicateKeys,
  validateProviderOutput,
} from "./provider-output-schema";

/**
 * Server-only HTTP transport for the existing provider adapter seam.
 *
 * The transport is dormant until an application composes it: nothing in the
 * running prototype imports this module, no endpoint or credential is read
 * from the environment, and no provider is contacted by the application or by
 * verification. Verification uses a loopback fake provider only.
 *
 * It enforces, outside provider output:
 * - one exact configured endpoint, re-checked against an explicit origin
 *   allowlist, with no credentials in the URL and no plaintext non-loopback
 *   endpoints;
 * - no redirect following;
 * - a bounded response body, read as a stream and cancelled as soon as the
 *   limit is crossed;
 * - an application timeout and caller cancellation, both of which abort the
 *   in-flight request and resolve to a safe application status;
 * - strict JSON parsing and strict validation of the provider's payload
 *   against the application-rendered schema before any output is returned;
 * - normalization of provider and transport failures into the approved error
 *   categories, with fixed messages that never echo provider text, prompts,
 *   responses, or credentials;
 * - usage units, which contain no conversation content.
 */

if (typeof window !== "undefined") {
  throw new Error("The HTTP model transport is server-only and cannot load in a browser.");
}

export const HTTP_MODEL_TRANSPORT_ID = "http-model-transport/v1" as const;
export const HTTP_MODEL_TRANSPORT_WIRE_VERSION = "provider-http-envelope/v1" as const;
export const HTTP_TRANSPORT_DEFAULT_MAX_RESPONSE_BYTES = 65_536;
export const HTTP_TRANSPORT_MAXIMUM_RESPONSE_BYTES = 262_144;
export const HTTP_TRANSPORT_DEFAULT_TIMEOUT_MS = 10_000;
export const HTTP_TRANSPORT_MAXIMUM_TIMEOUT_MS = 120_000;
export const HTTP_TRANSPORT_MAXIMUM_CREDENTIAL_LENGTH = 4_096;

export type HttpTransportConfigurationFailure =
  | "EndpointInvalid"
  | "EndpointInsecure"
  | "EndpointCredentials"
  | "EndpointNotAllowed"
  | "OriginNotAllowed"
  | "MaxResponseBytesInvalid"
  | "TimeoutInvalid";

export class HttpTransportConfigurationError extends Error {
  readonly code: HttpTransportConfigurationFailure;

  constructor(code: HttpTransportConfigurationFailure) {
    super(CONFIGURATION_MESSAGES[code]);
    this.name = "HttpTransportConfigurationError";
    this.code = code;
  }
}

export interface HttpModelTransportOptions {
  /** The single absolute endpoint this transport may call. */
  readonly endpoint: string;
  /**
   * Origins the endpoint must belong to. Defaults to the endpoint's own
   * origin; supplying a list can only restrict that origin further, never
   * widen it.
   */
  readonly allowedOrigins?: readonly string[];
  /**
   * Server-side credential reference. It is called per request and its return
   * value is sent only in the Authorization header. It is never stored,
   * logged, or placed in a result. No default credential exists.
   */
  readonly credentialReference?: () => string | null | undefined;
  /** Optional model identifier forwarded in the request envelope. */
  readonly model?: string;
  readonly maxResponseBytes?: number;
  /** Application ceiling for a request timeout. A larger request is clamped. */
  readonly timeoutMs?: number;
  /** Allows plaintext HTTP only for loopback verification endpoints. */
  readonly allowInsecureLoopback?: boolean;
}

const CONFIGURATION_MESSAGES: Record<HttpTransportConfigurationFailure, string> = {
  EndpointInvalid: "The provider endpoint is not an absolute HTTP URL.",
  EndpointInsecure: "The provider endpoint requires HTTPS except on an approved loopback.",
  EndpointCredentials: "The provider endpoint must not embed credentials.",
  EndpointNotAllowed: "The provider endpoint is not in the approved origin allowlist.",
  OriginNotAllowed: "An approved origin is not a valid HTTP origin.",
  MaxResponseBytesInvalid: "The response size limit is outside the application range.",
  TimeoutInvalid: "The timeout ceiling is outside the application range.",
};

const SAFE_ERROR_MESSAGES = {
  authentication: "The provider rejected the application credential.",
  "rate-limit": "The provider rate limit was reached.",
  unavailable: "The provider is temporarily unavailable.",
  "invalid-request": "The provider rejected the application request.",
  timeout: "The provider attempt exceeded the application timeout.",
  "provider-failure": "The provider returned a response the application could not accept.",
} as const;

export type SafeErrorCategory = keyof typeof SAFE_ERROR_MESSAGES;

const SAFE_FINISH_REASONS = new Set(["stop", "length", "content-filter", "refusal"]);
const MAXIMUM_USAGE_UNITS = 1_000_000_000;
const MAXIMUM_FINISH_REASON_LENGTH = 64;
const ZERO_USAGE = { inputUnits: 0, outputUnits: 0 } as const;

interface ResolvedOptions {
  readonly endpoint: string;
  readonly credentialReference: (() => string | null | undefined) | null;
  readonly model: string | null;
  readonly maxResponseBytes: number;
  readonly timeoutMs: number;
}

/** Outcome of reading a response body under a byte ceiling. */
export interface BoundedBody {
  readonly status: "text" | "too-large" | "empty" | "unreadable";
  readonly text?: string;
}

export function createHttpModelTransport(
  options: HttpModelTransportOptions,
): OfflineTransport {
  const resolved = resolveOptions(options);

  return async function httpModelTransport(
    request: OfflineTransportRequest,
  ): Promise<OfflineTransportResponse> {
    const endpoint = resolved.endpoint;
    const timeoutMs = clampTimeout(request.timeoutMs, resolved.timeoutMs);

    if (request.signal?.aborted) return cancelled();

    const controller = new AbortController();
    let timedOut = false;
    let cancelledByCaller = false;
    const onCallerAbort = () => {
      cancelledByCaller = true;
      controller.abort();
    };
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    request.signal?.addEventListener("abort", onCallerAbort, { once: true });
    // Close the race between the initial check and listener registration.
    if (request.signal?.aborted) {
      cancelledByCaller = true;
      controller.abort();
    }

    try {
      const credential = readCredential(resolved.credentialReference);
      if (credential.status === "invalid") return failure("authentication");

      const headers: Record<string, string> = {
        "content-type": "application/json",
        accept: "application/json",
        "cache-control": "no-store",
      };
      if (credential.token !== null) {
        headers.authorization = `Bearer ${credential.token}`;
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          wireVersion: HTTP_MODEL_TRANSPORT_WIRE_VERSION,
          model: resolved.model,
          instructions: request.instructions,
          input: request.input,
          schema: request.schema,
          attemptId: request.attemptId,
        }),
        redirect: "manual",
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });

      if (timedOut) return failure("timeout");
      if (cancelledByCaller) return cancelled();

      // `redirect: "manual"` never follows a redirect. Any 3xx, including an
      // opaque redirect in a browser-like runtime, is refused unread.
      if (response.type === "opaqueredirect" || response.redirected
        || (response.status >= 300 && response.status < 400)) {
        await discardBody(response);
        return failure("provider-failure");
      }
      if (!response.ok) {
        await discardBody(response);
        return failure(categoryForStatus(response.status));
      }

      const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
      if (contentType !== "" && !contentType.startsWith("application/json")) {
        await discardBody(response);
        return failure("provider-failure");
      }

      const declaredLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > resolved.maxResponseBytes) {
        await discardBody(response);
        return failure("provider-failure");
      }

      const body = await readBoundedBody(response, resolved.maxResponseBytes);
      if (body.status !== "text" || typeof body.text !== "string") {
        return failure("provider-failure");
      }

      // The envelope is provider output too: duplicate member names are
      // refused rather than silently collapsed by JSON.parse.
      const parsedEnvelope = parseJsonWithoutDuplicateKeys(body.text);
      if (parsedEnvelope.status !== "parsed" || !isPlainRecord(parsedEnvelope.value)) {
        return failure("provider-failure");
      }
      const envelope = parsedEnvelope.value;

      const rawOutput = envelope.output;
      if (typeof rawOutput !== "string" || rawOutput.length === 0) {
        return failure("provider-failure");
      }

      const validation = validateProviderOutput(rawOutput, request.schema);
      if (validation.status !== "valid") return failure("provider-failure");

      // A cancellation or deadline that landed while the body was being read
      // must never be reported as a completed provider result.
      if (timedOut) return failure("timeout");
      if (cancelledByCaller) return cancelled();

      return {
        status: "completed",
        rawOutput,
        usage: readUsage(envelope.usage),
        finishReason: readFinishReason(envelope.finish_reason ?? envelope.finishReason),
      };
    } catch {
      if (timedOut) return failure("timeout");
      if (cancelledByCaller) return cancelled();
      return failure("provider-failure");
    } finally {
      clearTimeout(timer);
      request.signal?.removeEventListener("abort", onCallerAbort);
    }
  };
}

function resolveOptions(options: HttpModelTransportOptions): ResolvedOptions {
  if (!options || typeof options.endpoint !== "string") {
    throw new HttpTransportConfigurationError("EndpointInvalid");
  }

  let endpoint: URL;
  try {
    endpoint = new URL(options.endpoint);
  } catch {
    throw new HttpTransportConfigurationError("EndpointInvalid");
  }
  if (endpoint.protocol !== "https:" && endpoint.protocol !== "http:") {
    throw new HttpTransportConfigurationError("EndpointInvalid");
  }
  if (endpoint.username !== "" || endpoint.password !== "") {
    throw new HttpTransportConfigurationError("EndpointCredentials");
  }
  if (endpoint.hash !== "") {
    throw new HttpTransportConfigurationError("EndpointInvalid");
  }

  const loopback = isLoopbackHost(endpoint.hostname);
  if (endpoint.protocol === "http:" && !(loopback && options.allowInsecureLoopback === true)) {
    throw new HttpTransportConfigurationError("EndpointInsecure");
  }

  // A supplied origin list replaces the default allowlist; it never widens it.
  const origins = new Set<string>();
  if (options.allowedOrigins === undefined) {
    origins.add(endpoint.origin);
  } else {
    if (!Array.isArray(options.allowedOrigins) || options.allowedOrigins.length === 0) {
      throw new HttpTransportConfigurationError("OriginNotAllowed");
    }
    for (const origin of options.allowedOrigins) {
      let parsed: URL;
      try {
        if (typeof origin !== "string" || origin.length === 0) {
          throw new Error("empty origin");
        }
        parsed = new URL(origin);
      } catch {
        throw new HttpTransportConfigurationError("OriginNotAllowed");
      }
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        throw new HttpTransportConfigurationError("OriginNotAllowed");
      }
      if (parsed.username !== "" || parsed.password !== ""
        || parsed.pathname !== "/" || parsed.search !== "" || parsed.hash !== "") {
        throw new HttpTransportConfigurationError("OriginNotAllowed");
      }
      if (parsed.protocol === "http:"
        && !(isLoopbackHost(parsed.hostname) && options.allowInsecureLoopback === true)) {
        throw new HttpTransportConfigurationError("EndpointInsecure");
      }
      origins.add(parsed.origin);
    }
  }
  if (!origins.has(endpoint.origin)) {
    throw new HttpTransportConfigurationError("EndpointNotAllowed");
  }

  const maxResponseBytes = options.maxResponseBytes === undefined
    ? HTTP_TRANSPORT_DEFAULT_MAX_RESPONSE_BYTES
    : boundedInteger(
        options.maxResponseBytes,
        1,
        HTTP_TRANSPORT_MAXIMUM_RESPONSE_BYTES,
      );
  if (maxResponseBytes === null) {
    throw new HttpTransportConfigurationError("MaxResponseBytesInvalid");
  }

  const timeoutMs = options.timeoutMs === undefined
    ? HTTP_TRANSPORT_DEFAULT_TIMEOUT_MS
    : boundedInteger(options.timeoutMs, 1, HTTP_TRANSPORT_MAXIMUM_TIMEOUT_MS);
  if (timeoutMs === null) {
    throw new HttpTransportConfigurationError("TimeoutInvalid");
  }

  if (options.credentialReference !== undefined
    && typeof options.credentialReference !== "function") {
    throw new HttpTransportConfigurationError("EndpointInvalid");
  }

  return {
    endpoint: endpoint.href,
    credentialReference: options.credentialReference ?? null,
    model: typeof options.model === "string" && options.model.length > 0
      ? options.model.slice(0, 128)
      : null,
    maxResponseBytes,
    timeoutMs,
  };
}

function readCredential(
  reference: (() => string | null | undefined) | null,
): { readonly status: "ok"; readonly token: string | null } | { readonly status: "invalid" } {
  if (!reference) return { status: "ok", token: null };
  let token: unknown;
  try {
    token = reference();
  } catch {
    return { status: "invalid" };
  }
  if (token === null || token === undefined) return { status: "ok", token: null };
  if (typeof token !== "string" || token.length === 0) return { status: "invalid" };
  if (token.length > HTTP_TRANSPORT_MAXIMUM_CREDENTIAL_LENGTH) return { status: "invalid" };
  if (/[\s\u0000-\u001f\u007f]/.test(token)) return { status: "invalid" };
  return { status: "ok", token };
}

/**
 * Reads a response body without ever buffering more than `maxBytes`, and
 * rejects a body that is not valid UTF-8. Exported so another provider
 * transport reuses this single bounded reader instead of growing a second
 * implementation that could drift.
 */
export async function readBoundedBody(
  response: Response,
  maxBytes: number,
): Promise<BoundedBody> {
  if (!response.body) return { status: "empty" };

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { status: "too-large" };
      }
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
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
    return { status: "unreadable" };
  }
}

/** Releases a response body that will not be read. */
export async function discardBody(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}

export function failure(category: SafeErrorCategory): OfflineTransportResponse {
  return {
    status: "failed",
    usage: ZERO_USAGE,
    finishReason: null,
    error: { category, message: SAFE_ERROR_MESSAGES[category] },
  };
}

export function cancelled(): OfflineTransportResponse {
  return {
    status: "cancelled",
    usage: ZERO_USAGE,
    finishReason: "cancelled",
    error: null,
  };
}

export function categoryForStatus(status: number): SafeErrorCategory {
  if (status === 401 || status === 403) return "authentication";
  if (status === 408) return "timeout";
  if (status === 429) return "rate-limit";
  if (status === 400 || status === 404 || status === 405 || status === 409
    || status === 413 || status === 415 || status === 422) {
    return "invalid-request";
  }
  if (status >= 500 && status <= 599) return "unavailable";
  return "provider-failure";
}

function readUsage(value: unknown): { readonly inputUnits: number; readonly outputUnits: number } {
  if (!isPlainRecord(value)) return ZERO_USAGE;
  return {
    inputUnits: usageNumber(value.input_tokens ?? value.inputUnits),
    outputUnits: usageNumber(value.output_tokens ?? value.outputUnits),
  };
}

function usageNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Math.trunc(value), MAXIMUM_USAGE_UNITS);
}

function readFinishReason(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const candidate = value.slice(0, MAXIMUM_FINISH_REASON_LENGTH);
  return SAFE_FINISH_REASONS.has(candidate) ? candidate : null;
}

function clampTimeout(requested: unknown, ceiling: number): number {
  const value = typeof requested === "number" && Number.isFinite(requested) && requested > 0
    ? Math.trunc(requested)
    : ceiling;
  return Math.min(Math.max(value, 1), ceiling);
}

function boundedInteger(value: unknown, minimum: number, maximum: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < minimum || value > maximum) return null;
  return value;
}

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "127.0.0.1" || host === "::1" || host === "[::1]" || host === "localhost";
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
