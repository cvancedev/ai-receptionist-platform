import {
  parseJsonWithoutDuplicateKeys,
  parseProviderOutputSchema,
  validateProviderOutput,
  type ProviderOutputSchema,
} from "./provider-output-schema";
import {
  HttpTransportConfigurationError,
  categoryForStatus,
  cancelled,
  discardBody,
  failure,
  readBoundedBody,
} from "./http-model-transport";
import type {
  OfflineTransport,
  OfflineTransportRequest,
  OfflineTransportResponse,
} from "./transport-model-provider-adapter";

if (typeof window !== "undefined") {
  throw new Error("The OpenAI Responses adapter is server-only.");
}

/**
 * OpenAI Responses adapter for the provider-neutral model transport.
 *
 * It translates one application-approved request into OpenAI's Responses API
 * wire format and translates the response back into the provider envelope the
 * certified pipeline already understands. The application still owns the
 * instructions, the input, the output schema, and every decision: the request
 * carries no tools, no model-selected retrieval, and no business action, and the
 * adapter refuses any response that looks like an attempt to act.
 *
 * Nothing here is reachable from production composition. The pilot runtime keeps
 * provider network execution disabled, and this transport is only constructed by
 * verification against a loopback fake.
 */
export const OPENAI_RESPONSES_ADAPTER_ID = "openai-responses-adapter/v1" as const;
export const OPENAI_RESPONSES_DEFAULT_BASE_URL = "https://api.openai.com" as const;
export const OPENAI_RESPONSES_PATH = "/v1/responses" as const;
export const OPENAI_RESPONSES_DEFAULT_MODEL = "gpt-5.6" as const;
export const OPENAI_RESPONSES_SCHEMA_NAME = "receptionist_proposal" as const;
export const OPENAI_RESPONSES_DEFAULT_MAX_OUTPUT_TOKENS = 512;
export const OPENAI_RESPONSES_MAXIMUM_OUTPUT_TOKENS = 4_096;
export const OPENAI_RESPONSES_DEFAULT_MAX_RESPONSE_BYTES = 131_072;
export const OPENAI_RESPONSES_MAXIMUM_RESPONSE_BYTES = 262_144;
export const OPENAI_RESPONSES_DEFAULT_TIMEOUT_MS = 15_000;
export const OPENAI_RESPONSES_MAXIMUM_TIMEOUT_MS = 60_000;
export const OPENAI_RESPONSES_MAXIMUM_INSTRUCTIONS_CHARACTERS = 32_000;
export const OPENAI_RESPONSES_MAXIMUM_INPUT_CHARACTERS = 64_000;
export const OPENAI_RESPONSES_MAXIMUM_BODY_BYTES = 128_000;
export const OPENAI_RESPONSES_MAXIMUM_CREDENTIAL_LENGTH = 4_096;

export type OpenAiRequestBuildFailure =
  | "SchemaUnreadable"
  | "SchemaFieldTypeUnsupported"
  | "ModelInvalid"
  | "OutputBudgetInvalid"
  | "InstructionsInvalid"
  | "InputInvalid"
  | "RequestBodyTooLarge";

export type OpenAiRequestBuild =
  | {
      readonly status: "built";
      readonly model: string;
      readonly maxOutputTokens: number;
      readonly body: string;
    }
  | { readonly status: "rejected"; readonly failure: OpenAiRequestBuildFailure };

export type OpenAiResponseFailure =
  | "EnvelopeDuplicateField"
  | "EnvelopeUnreadable"
  | "EnvelopeUnexpectedShape"
  | "NonTerminalStatus"
  | "UnexpectedToolOutput"
  | "UnexpectedOutputItem"
  | "MissingOutputText"
  | "OutputTextAmbiguous"
  | "ProviderReportedFailure";

export type OpenAiResponseParse =
  | {
      readonly status: "completed";
      readonly rawOutput: string;
      readonly usage: OpenAiUsage | null;
      readonly finishReason: "stop";
    }
  | {
      readonly status: "refused";
      readonly usage: OpenAiUsage | null;
      readonly finishReason: "refusal";
    }
  | {
      readonly status: "incomplete";
      readonly usage: OpenAiUsage | null;
      readonly finishReason: "length" | null;
    }
  | { readonly status: "cancelled"; readonly usage: OpenAiUsage | null }
  | {
      readonly status: "failed";
      readonly usage: OpenAiUsage | null;
      readonly failure: OpenAiResponseFailure;
    };

export interface OpenAiUsage {
  readonly inputUnits: number;
  readonly outputUnits: number;
}

export interface OpenAiResponsesTransportOptions {
  /** Origin the request may reach. Defaults to the public API origin. */
  readonly baseUrl?: string;
  /** Origins the endpoint must belong to; it can only narrow `baseUrl`. */
  readonly allowedOrigins?: readonly string[];
  /** Server-side credential reference, called once per attempt. */
  readonly credentialReference?: () => string | null | undefined;
  /** Allowlisted model identifier sent as `model`. */
  readonly model?: string;
  /** Application ceiling on generated tokens. */
  readonly maxOutputTokens?: number;
  readonly maxResponseBytes?: number;
  /** Application ceiling for a request timeout. A larger request is clamped. */
  readonly timeoutMs?: number;
  /** Allows plaintext HTTP only for a loopback verification endpoint. */
  readonly allowInsecureLoopback?: boolean;
}

export class OpenAiResponsesConfigurationError extends Error {
  readonly code: "ModelInvalid" | "OutputBudgetInvalid" | "CredentialReferenceInvalid";

  constructor(code: OpenAiResponsesConfigurationError["code"]) {
    super(code);
    this.name = "OpenAiResponsesConfigurationError";
    this.code = code;
  }
}

const MAXIMUM_MODEL_LENGTH = 100;
const MODEL_PATTERN = /^[A-Za-z0-9._:-]+$/;
const MAXIMUM_USAGE_UNITS = 1_000_000_000;
const RESPONSE_STATUSES = new Set([
  "completed", "incomplete", "failed", "cancelled", "in_progress", "queued",
]);
/** Output items that would mean the provider tried to act rather than answer. */
const ACTION_ITEM_TYPES = new Set([
  "function_call", "function_call_output", "custom_tool_call", "custom_tool_call_output",
  "computer_call", "computer_call_output", "web_search_call", "file_search_call",
  "code_interpreter_call", "image_generation_call", "mcp_call", "mcp_list_tools",
  "mcp_approval_request", "local_shell_call",
]);
const IGNORED_ITEM_TYPES = new Set(["reasoning"]);

const LOCAL_FAILURE_MESSAGE =
  "The application could not form an acceptable provider request.";
/** The enumerated build failure is application-authored, so it is safe to name. */
function localFailureMessage(failure: OpenAiRequestBuildFailure): string {
  return `${LOCAL_FAILURE_MESSAGE} (${failure})`;
}

/**
 * Builds the exact JSON body sent to `POST /v1/responses` from one approved
 * application request. Pure and deterministic: no clock, no environment, no
 * network, so verification can assert the wire format directly.
 */
export function buildOpenAiResponsesRequest(
  request: OfflineTransportRequest,
  options: { readonly model?: string; readonly maxOutputTokens?: number } = {},
): OpenAiRequestBuild {
  const model = options.model ?? OPENAI_RESPONSES_DEFAULT_MODEL;
  if (typeof model !== "string" || model.length === 0
    || model.length > MAXIMUM_MODEL_LENGTH || !MODEL_PATTERN.test(model)) {
    return { status: "rejected", failure: "ModelInvalid" };
  }
  const maxOutputTokens = options.maxOutputTokens ?? OPENAI_RESPONSES_DEFAULT_MAX_OUTPUT_TOKENS;
  if (!Number.isInteger(maxOutputTokens)
    || maxOutputTokens < 1
    || maxOutputTokens > OPENAI_RESPONSES_MAXIMUM_OUTPUT_TOKENS) {
    return { status: "rejected", failure: "OutputBudgetInvalid" };
  }
  if (typeof request?.instructions !== "string"
    || request.instructions.length === 0
    || request.instructions.length > OPENAI_RESPONSES_MAXIMUM_INSTRUCTIONS_CHARACTERS) {
    return { status: "rejected", failure: "InstructionsInvalid" };
  }
  if (typeof request.input !== "string"
    || request.input.length === 0
    || request.input.length > OPENAI_RESPONSES_MAXIMUM_INPUT_CHARACTERS) {
    return { status: "rejected", failure: "InputInvalid" };
  }

  const parsedSchema = parseProviderOutputSchema(request.schema);
  if (!parsedSchema) return { status: "rejected", failure: "SchemaUnreadable" };
  const jsonSchema = toStrictJsonSchema(parsedSchema);
  if (jsonSchema === null) return { status: "rejected", failure: "SchemaFieldTypeUnsupported" };

  // Strict structured output: every advertised property is required, nothing
  // else is allowed, and optional contract fields are simply not advertised so
  // the model cannot fabricate them.
  const body = JSON.stringify({
    model,
    instructions: request.instructions,
    input: request.input,
    max_output_tokens: maxOutputTokens,
    store: false,
    text: {
      format: {
        type: "json_schema",
        name: OPENAI_RESPONSES_SCHEMA_NAME,
        strict: true,
        schema: jsonSchema,
      },
    },
  });
  if (body.length > OPENAI_RESPONSES_MAXIMUM_BODY_BYTES) {
    return { status: "rejected", failure: "RequestBodyTooLarge" };
  }
  return { status: "built", model, maxOutputTokens, body };
}

/**
 * Translates one provider response body into the application envelope.
 *
 * Every branch fails closed: a duplicate member name, an unknown status, an
 * action-bearing output item, ambiguous text, or a provider-reported failure is
 * refused instead of being interpreted. Missing usage is reported as `null` so
 * the settlement later records the conservative estimate rather than a guessed
 * zero.
 */
export function parseOpenAiResponsesResponse(
  bodyText: string,
): OpenAiResponseParse | { readonly status: "unreadable"; readonly failure: OpenAiResponseFailure } {
  return parseBody(bodyText) ?? { status: "unreadable", failure: "EnvelopeUnreadable" };
}

function parseBody(bodyText: string): OpenAiResponseParse | null {
  if (typeof bodyText !== "string" || bodyText.length === 0) return null;
  const parsed = parseStrictJson(bodyText);
  if (parsed.status === "duplicate") {
    return { status: "failed", usage: null, failure: "EnvelopeDuplicateField" };
  }
  if (parsed.status !== "parsed" || !isPlainRecord(parsed.value)) return null;

  const envelope = parsed.value;
  const status = envelope.status;
  if (typeof status !== "string" || !RESPONSE_STATUSES.has(status)) {
    return { status: "failed", usage: null, failure: "EnvelopeUnexpectedShape" };
  }
  const usage = readUsage(envelope.usage);

  if (status === "failed") {
    return { status: "failed", usage, failure: "ProviderReportedFailure" };
  }
  if (status === "cancelled") return { status: "cancelled", usage };
  if (status === "in_progress" || status === "queued") {
    return { status: "failed", usage, failure: "NonTerminalStatus" };
  }

  const output = envelope.output;
  if (!Array.isArray(output)) {
    return { status: "failed", usage, failure: "EnvelopeUnexpectedShape" };
  }

  const texts: string[] = [];
  let refusal = false;
  for (const item of output) {
    if (!isPlainRecord(item) || typeof item.type !== "string") {
      return { status: "failed", usage, failure: "EnvelopeUnexpectedShape" };
    }
    if (ACTION_ITEM_TYPES.has(item.type)) {
      // The application never offers tools, so any tool output means the
      // provider is acting outside the approved contract.
      return { status: "failed", usage, failure: "UnexpectedToolOutput" };
    }
    if (IGNORED_ITEM_TYPES.has(item.type)) continue;
    if (item.type !== "message") {
      return { status: "failed", usage, failure: "UnexpectedOutputItem" };
    }
    const content = item.content;
    if (!Array.isArray(content)) {
      return { status: "failed", usage, failure: "EnvelopeUnexpectedShape" };
    }
    for (const part of content) {
      if (!isPlainRecord(part) || typeof part.type !== "string") {
        return { status: "failed", usage, failure: "EnvelopeUnexpectedShape" };
      }
      if (part.type === "refusal") {
        if (typeof part.refusal !== "string" || part.refusal.length === 0) {
          return { status: "failed", usage, failure: "EnvelopeUnexpectedShape" };
        }
        refusal = true;
        continue;
      }
      if (part.type !== "output_text") {
        // Images, audio, and tool citations are outside this contract.
        return { status: "failed", usage, failure: "UnexpectedOutputItem" };
      }
      if (typeof part.text !== "string" || part.text.length === 0) {
        return { status: "failed", usage, failure: "EnvelopeUnexpectedShape" };
      }
      texts.push(part.text);
    }
  }

  if (status === "incomplete") {
    const reason = isPlainRecord(envelope.incomplete_details)
      && typeof envelope.incomplete_details.reason === "string"
      ? envelope.incomplete_details.reason
      : null;
    return {
      status: "incomplete",
      usage,
      finishReason: reason === "max_output_tokens" ? "length" : null,
    };
  }

  if (refusal || texts.length === 0) {
    if (refusal) return { status: "refused", usage, finishReason: "refusal" };
    return { status: "failed", usage, failure: "MissingOutputText" };
  }
  if (texts.length > 1) {
    // Two text parts could each claim to be the answer; refuse to choose.
    return { status: "failed", usage, failure: "OutputTextAmbiguous" };
  }
  return { status: "completed", rawOutput: texts[0], usage, finishReason: "stop" };
}

function toStrictJsonSchema(schema: ProviderOutputSchema): Record<string, unknown> | null {
  const properties: Record<string, Record<string, unknown>> = {};
  for (const field of schema.required) {
    const type = schema.fieldTypes[field];
    const property = jsonSchemaForField(type, schema);
    if (!property) return null;
    properties[field] = property;
  }
  return {
    type: "object",
    additionalProperties: false,
    required: [...schema.required],
    properties,
  };
}

function jsonSchemaForField(
  type: string | undefined,
  schema: ProviderOutputSchema,
): Record<string, unknown> | null {
  switch (type) {
    case "string":
      return { type: "string", maxLength: schema.maxStringLength };
    case "number":
      return { type: "number" };
    case "boolean":
      return { type: "boolean" };
    case "string_array":
      return {
        type: "array",
        items: { type: "string", maxLength: schema.maxStringLength },
        maxItems: schema.maxArrayLength,
      };
    default:
      // `record` / `record_array` cannot be expressed with strict additional
      // properties, so a contract using them is refused rather than loosened.
      return null;
  }
}

function readUsage(value: unknown): OpenAiUsage | null {
  if (!isPlainRecord(value)) return null;
  const input = value.input_tokens;
  const output = value.output_tokens;
  if (!isUsageCount(input) || !isUsageCount(output)) return null;
  return { inputUnits: input, outputUnits: output };
}

function isUsageCount(value: unknown): value is number {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= 0
    && value <= MAXIMUM_USAGE_UNITS;
}

/**
 * Creates the hardened OpenAI Responses transport.
 *
 * It carries the same network discipline as the certified provider transport:
 * one allowlisted HTTPS origin, no redirects, no credentials in the URL, a
 * bounded response body, a bounded timeout, caller cancellation, and sanitized
 * errors that never contain provider text or the credential.
 */
export function createOpenAiResponsesTransport(
  options: OpenAiResponsesTransportOptions,
): OfflineTransport {
  const resolved = resolveOptions(options);
  const model = options.model ?? OPENAI_RESPONSES_DEFAULT_MODEL;
  const maxOutputTokens = options.maxOutputTokens ?? OPENAI_RESPONSES_DEFAULT_MAX_OUTPUT_TOKENS;
  if (!MODEL_PATTERN.test(model) || model.length > MAXIMUM_MODEL_LENGTH) {
    throw new OpenAiResponsesConfigurationError("ModelInvalid");
  }
  if (!Number.isInteger(maxOutputTokens)
    || maxOutputTokens < 1
    || maxOutputTokens > OPENAI_RESPONSES_MAXIMUM_OUTPUT_TOKENS) {
    throw new OpenAiResponsesConfigurationError("OutputBudgetInvalid");
  }

  return async function openAiResponsesTransport(
    request: OfflineTransportRequest,
  ): Promise<OfflineTransportResponse> {
    const timeoutMs = clampTimeout(request.timeoutMs, resolved.timeoutMs);
    if (request.signal?.aborted) return cancelled();

    const build = buildOpenAiResponsesRequest(request, { model, maxOutputTokens });
    if (build.status !== "built") return localFailure(build.failure);

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

      const response = await fetch(resolved.endpoint, {
        method: "POST",
        headers,
        body: build.body,
        redirect: "manual",
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });

      if (timedOut) return failure("timeout");
      if (cancelledByCaller) return cancelled();

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

      if (timedOut) return failure("timeout");
      if (cancelledByCaller) return cancelled();

      return translateResponse(body.text, request);
    } catch {
      if (timedOut) return failure("timeout");
      if (cancelledByCaller) return cancelled();
      return failure("provider-failure");
    } finally {
      clearTimeout(timer);
      request.signal?.removeEventListener("abort", onCallerAbort);
    }
  };

  function translateResponse(
    bodyText: string,
    request: OfflineTransportRequest,
  ): OfflineTransportResponse {
    const parsed = parseOpenAiResponsesResponse(bodyText);
    if (parsed.status === "unreadable" || parsed.status === "failed") {
      return failure("provider-failure");
    }
    if (parsed.status === "refused") {
      return {
        status: "refused",
        rawOutput: null,
        usage: toEnvelopeUsage(parsed.usage),
        finishReason: "refusal",
        error: null,
      };
    }
    if (parsed.status === "incomplete") {
      return {
        status: "incomplete",
        rawOutput: null,
        usage: toEnvelopeUsage(parsed.usage),
        finishReason: parsed.finishReason,
        error: null,
      };
    }
    if (parsed.status === "cancelled") {
      return {
        status: "cancelled",
        rawOutput: null,
        usage: toEnvelopeUsage(parsed.usage),
        finishReason: "cancelled",
        error: null,
      };
    }

    // The output is provider text. It must satisfy the application schema
    // before it is treated as a proposal; malformed JSON, duplicate member
    // names, missing fields, and unexpected fields are refused here.
    const validation = validateProviderOutput(parsed.rawOutput, request.schema);
    if (validation.status !== "valid") return failure("provider-failure");

    return {
      status: "completed",
      rawOutput: parsed.rawOutput,
      usage: toEnvelopeUsage(parsed.usage),
      finishReason: "stop",
    };
  }
}

function toEnvelopeUsage(
  usage: OpenAiUsage | null,
): { readonly inputUnits?: number; readonly outputUnits?: number } | undefined {
  // `undefined` tells the durable turn to settle the conservative estimate
  // instead of recording a guessed zero when the provider omitted usage.
  return usage === null
    ? undefined
    : { inputUnits: usage.inputUnits, outputUnits: usage.outputUnits };
}

function localFailure(failure: OpenAiRequestBuildFailure): OfflineTransportResponse {
  return {
    status: "failed",
    rawOutput: null,
    usage: { inputUnits: 0, outputUnits: 0 },
    finishReason: null,
    error: { category: "invalid-request", message: localFailureMessage(failure) },
  };
}

interface ResolvedOpenAiOptions {
  readonly endpoint: string;
  readonly credentialReference: (() => string | null | undefined) | null;
  readonly maxResponseBytes: number;
  readonly timeoutMs: number;
}

function resolveOptions(options: OpenAiResponsesTransportOptions): ResolvedOpenAiOptions {
  if (!options || typeof options !== "object") {
    throw new HttpTransportConfigurationError("EndpointInvalid");
  }
  // `baseUrl` is an origin, not a path. A path, query, or fragment is a
  // configuration mistake, so it is refused instead of being silently dropped.
  let base: URL;
  try {
    base = new URL(options.baseUrl ?? OPENAI_RESPONSES_DEFAULT_BASE_URL);
  } catch {
    throw new HttpTransportConfigurationError("EndpointInvalid");
  }
  if ((base.protocol !== "https:" && base.protocol !== "http:")
    || base.username !== "" || base.password !== ""
    || (base.pathname !== "" && base.pathname !== "/")
    || base.search !== "" || base.hash !== "") {
    throw new HttpTransportConfigurationError("EndpointInvalid");
  }
  const endpoint = new URL(OPENAI_RESPONSES_PATH, base.origin);
  if (endpoint.pathname !== OPENAI_RESPONSES_PATH || endpoint.origin !== base.origin) {
    throw new HttpTransportConfigurationError("EndpointInvalid");
  }

  const loopback = isLoopbackHost(endpoint.hostname);
  if (endpoint.protocol === "http:" && !(loopback && options.allowInsecureLoopback === true)) {
    throw new HttpTransportConfigurationError("EndpointInsecure");
  }

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
        if (typeof origin !== "string" || origin.length === 0) throw new Error("empty");
        parsed = new URL(origin);
      } catch {
        throw new HttpTransportConfigurationError("OriginNotAllowed");
      }
      if ((parsed.protocol !== "https:" && parsed.protocol !== "http:")
        || parsed.username !== "" || parsed.password !== ""
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
    ? OPENAI_RESPONSES_DEFAULT_MAX_RESPONSE_BYTES
    : boundedInteger(options.maxResponseBytes, 1, OPENAI_RESPONSES_MAXIMUM_RESPONSE_BYTES);
  if (maxResponseBytes === null) {
    throw new HttpTransportConfigurationError("MaxResponseBytesInvalid");
  }
  const timeoutMs = options.timeoutMs === undefined
    ? OPENAI_RESPONSES_DEFAULT_TIMEOUT_MS
    : boundedInteger(options.timeoutMs, 1, OPENAI_RESPONSES_MAXIMUM_TIMEOUT_MS);
  if (timeoutMs === null) {
    throw new HttpTransportConfigurationError("TimeoutInvalid");
  }
  if (options.credentialReference !== undefined
    && typeof options.credentialReference !== "function") {
    throw new OpenAiResponsesConfigurationError("CredentialReferenceInvalid");
  }

  return {
    endpoint: endpoint.toString(),
    credentialReference: options.credentialReference ?? null,
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
  if (token.length > OPENAI_RESPONSES_MAXIMUM_CREDENTIAL_LENGTH) return { status: "invalid" };
  if (/[\s\u0000-\u001f\u007f]/.test(token)) return { status: "invalid" };
  return { status: "ok", token };
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

/**
 * Strict parse of the provider envelope itself.
 *
 * Duplicate-member detection is delegated to the certified structural scanner
 * in `provider-output-schema`, so a repeated member name is refused rather than
 * silently collapsed by `JSON.parse`.
 */
function parseStrictJson(
  text: string,
): { readonly status: "parsed"; readonly value: unknown }
  | { readonly status: "duplicate" }
  | { readonly status: "invalid" } {
  const result = parseJsonWithoutDuplicateKeys(text);
  if (result.status === "duplicate-key") return { status: "duplicate" };
  if (result.status !== "parsed") return { status: "invalid" };
  return { status: "parsed", value: result.value };
}
