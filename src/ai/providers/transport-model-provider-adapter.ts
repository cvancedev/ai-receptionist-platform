import type {
  ModelGatewayRequest,
  ProviderAdapterResult,
  ProviderCompletionStatus,
  ProviderUsageMetadata,
} from "../contracts/results";
import type { ModelProviderAdapter } from "../gateway/model-gateway";
import {
  RENDERED_PROVIDER_PROMPT_BRAND,
  PROVIDER_INSTRUCTION_CHARACTER_LIMIT,
  type RenderedProviderPrompt,
} from "../prompts/provider-instruction-renderer";
import { deepFreeze } from "../shared/immutable";

/**
 * Transport-backed provider adapter for the Stage A seam.
 *
 * It performs no network work of its own: every request is handed to an
 * injected transport, which in local verification and rehearsal is an offline
 * stub. Timeout, cancellation, prompt shape, response shape, output size,
 * usage, and diagnostics are enforced here, outside provider output, so a
 * transport cannot widen them.
 */
export interface OfflineTransportRequest {
  readonly instructions: string;
  readonly input: string;
  readonly schema: string;
  readonly attemptId: string;
  readonly timeoutMs: number;
  readonly signal: AbortSignal | null;
}

export interface OfflineTransportResponse {
  readonly status: ProviderCompletionStatus;
  readonly rawOutput?: string | null;
  readonly usage?: { readonly inputUnits?: number; readonly outputUnits?: number };
  readonly finishReason?: string | null;
  readonly error?: { readonly category?: string; readonly message?: string } | null;
}

export type OfflineTransport = (
  request: OfflineTransportRequest,
) => Promise<OfflineTransportResponse>;

export interface TransportModelProviderAdapterOptions {
  /** Application ceiling. A larger per-request timeout is clamped down to this. */
  readonly timeoutMs?: number;
  readonly maxRawOutputCharacters?: number;
  readonly now?: () => number;
  readonly scheduleTimeout?: (callback: () => void, milliseconds: number) => () => void;
  /** Caller cancellation for an in-flight attempt. Aborting it yields `cancelled`. */
  readonly signal?: AbortSignal;
}

export const TRANSPORT_ADAPTER_ID = "transport-model-provider/v1" as const;
export const TRANSPORT_ADAPTER_DEFAULT_TIMEOUT_MS = 10_000;
export const TRANSPORT_ADAPTER_MAX_RAW_OUTPUT = 20_000;
const MAXIMUM_TIMEOUT_MS = 120_000;
const MAXIMUM_FINISH_REASON_LENGTH = 64;

const COMPLETION_STATUSES: readonly ProviderCompletionStatus[] = [
  "completed", "refused", "incomplete", "failed", "cancelled",
];

const SAFE_FINISH_REASONS = new Set([
  "stop", "length", "content-filter", "refusal", "cancelled",
  "cancelled-before-transport", "cancelled-mid-flight", "provider-reported",
]);

const SAFE_ERROR_CATEGORIES = new Set([
  "rate-limit", "unavailable", "upstream-unavailable", "authentication",
  "content-filter", "invalid-request", "provider-failure", "timeout",
]);

const SANITIZED_MESSAGES = {
  ProviderTimeout: "The provider attempt exceeded the application timeout.",
  TransportError: "The provider transport failed.",
  ProviderResponseInvalid: "The provider returned an unreadable response envelope.",
  ProviderOutputTooLarge: "The provider output exceeded the application limit.",
  ProviderOutputUnreadable: "The provider output was not a readable payload.",
  PromptIntegrityMismatch: "The rendered prompt did not match the request identity.",
} as const;

type AdapterFailureCategory = keyof typeof SANITIZED_MESSAGES;

type TransportOutcome =
  | { readonly kind: "response"; readonly response: unknown }
  | { readonly kind: "transport-error" }
  | { readonly kind: "timeout" }
  | { readonly kind: "aborted" };

export class TransportModelProviderAdapter implements ModelProviderAdapter {
  readonly adapterId = TRANSPORT_ADAPTER_ID;

  constructor(
    private readonly prompt: RenderedProviderPrompt,
    private readonly transport: OfflineTransport,
    private readonly options: TransportModelProviderAdapterOptions = {},
  ) {}

  async execute(request: ModelGatewayRequest): Promise<ProviderAdapterResult> {
    const startedAt = this.now();

    if (!isRenderedPrompt(this.prompt)
      || !matchesRequest(this.prompt, request)) {
      return this.failure(request, startedAt, "PromptIntegrityMismatch");
    }
    if (request.cancelled) {
      return this.cancelled(request, startedAt, "cancelled-before-transport");
    }
    const externalSignal = this.options.signal ?? null;
    if (externalSignal?.aborted) {
      return this.cancelled(request, startedAt, "cancelled-before-transport");
    }

    const timeoutMs = this.effectiveTimeout(request.timeoutMs);
    const controller = typeof AbortController === "undefined"
      ? null
      : new AbortController();
    let timedOut = false;
    let aborted = false;
    let cancelTimer: (() => void) | null = null;
    let removeAbortListener: (() => void) | null = null;

    const cleanup = () => {
      const clearTimer = cancelTimer as (() => void) | null;
      clearTimer?.();
      const removeListener = removeAbortListener as (() => void) | null;
      removeListener?.();
    };

    const timeoutOutcome = new Promise<"timeout">((resolve) => {
      cancelTimer = this.scheduleTimeout(() => {
        timedOut = true;
        controller?.abort();
        resolve("timeout");
      }, timeoutMs);
    });

    const abortOutcome: Promise<"aborted"> = externalSignal
      ? new Promise<"aborted">((resolve) => {
          const onAbort = () => {
            aborted = true;
            controller?.abort();
            resolve("aborted");
          };
          externalSignal.addEventListener("abort", onAbort, { once: true });
          removeAbortListener = () => externalSignal.removeEventListener("abort", onAbort);
        })
      : new Promise<"aborted">(() => {});

    // A deadline already behind us must not start provider work at all.
    if (timedOut) {
      cleanup();
      return this.failure(request, startedAt, "ProviderTimeout");
    }

    const transportOutcome: Promise<TransportOutcome> = Promise.resolve()
      .then(() => this.transport({
        instructions: this.prompt.instructions,
        input: this.prompt.input,
        schema: this.prompt.schema,
        attemptId: request.attempt.attemptId,
        timeoutMs,
        signal: controller?.signal ?? null,
      }))
      .then(
        (response) => ({ kind: "response" as const, response }),
        () => ({ kind: "transport-error" as const }),
      );

    const outcome = await Promise.race([
      transportOutcome,
      timeoutOutcome,
      abortOutcome,
    ]).then((result): TransportOutcome => {
      if (result === "timeout") return { kind: "timeout" };
      if (result === "aborted") return { kind: "aborted" };
      return result;
    });

    cleanup();

    if (outcome.kind === "timeout" || timedOut) {
      return this.failure(request, startedAt, "ProviderTimeout");
    }
    if (outcome.kind === "aborted" || aborted) {
      return this.cancelled(request, startedAt, "cancelled-mid-flight");
    }
    if (outcome.kind === "transport-error") {
      return this.failure(request, startedAt, "TransportError");
    }
    return this.fromResponse(request, startedAt, outcome.response);
  }

  private fromResponse(
    request: ModelGatewayRequest,
    startedAt: number,
    response: unknown,
  ): ProviderAdapterResult {
    if (!isResponseRecord(response) || !isCompletionStatus(response.status)) {
      return this.failure(request, startedAt, "ProviderResponseInvalid");
    }

    const usage = normalizeUsage(response.usage);

    if (response.status !== "completed") {
      return deepFreeze({
        ...this.identity(request),
        status: response.status,
        rawOutput: null,
        usage,
        finishReason: sanitizeFinishReason(response.finishReason),
        error: sanitizedError(response.error),
        durationMs: this.elapsed(startedAt),
      });
    }

    if (typeof response.rawOutput !== "string" || response.rawOutput.length === 0) {
      return this.failure(request, startedAt, "ProviderOutputUnreadable", usage);
    }
    if (response.rawOutput.length > this.maxRawOutputCharacters()) {
      return this.failure(request, startedAt, "ProviderOutputTooLarge", usage);
    }

    return deepFreeze({
      ...this.identity(request),
      status: "completed" as const,
      rawOutput: response.rawOutput,
      usage,
      finishReason: sanitizeFinishReason(response.finishReason),
      error: null,
      durationMs: this.elapsed(startedAt),
    });
  }

  private identity(request: ModelGatewayRequest) {
    return {
      requestId: request.identity.requestId,
      traceId: request.identity.traceId,
      adapterId: this.adapterId,
      attemptId: request.attempt.attemptId,
    };
  }

  private cancelled(
    request: ModelGatewayRequest,
    startedAt: number,
    finishReason: string,
  ): ProviderAdapterResult {
    return deepFreeze({
      ...this.identity(request),
      status: "cancelled" as const,
      rawOutput: null,
      usage: { inputUnits: 0, outputUnits: 0 },
      finishReason,
      error: null,
      durationMs: this.elapsed(startedAt),
    });
  }

  private failure(
    request: ModelGatewayRequest,
    startedAt: number,
    category: AdapterFailureCategory,
    usage: ProviderUsageMetadata = { inputUnits: 0, outputUnits: 0 },
  ): ProviderAdapterResult {
    return deepFreeze({
      ...this.identity(request),
      status: "failed" as const,
      rawOutput: null,
      usage,
      finishReason: null,
      error: {
        category,
        message: SANITIZED_MESSAGES[category],
      },
      durationMs: this.elapsed(startedAt),
    });
  }

  private effectiveTimeout(requestTimeoutMs: number): number {
    const requested = finitePositive(requestTimeoutMs);
    const configured = finitePositive(this.options.timeoutMs);
    const chosen = requested !== null && configured !== null
      ? Math.min(requested, configured)
      : requested ?? configured ?? TRANSPORT_ADAPTER_DEFAULT_TIMEOUT_MS;
    return Math.min(Math.max(Math.trunc(chosen), 1), MAXIMUM_TIMEOUT_MS);
  }

  private maxRawOutputCharacters(): number {
    const configured = finitePositive(this.options.maxRawOutputCharacters);
    if (configured === null) return TRANSPORT_ADAPTER_MAX_RAW_OUTPUT;
    return Math.min(Math.max(Math.trunc(configured), 1), TRANSPORT_ADAPTER_MAX_RAW_OUTPUT);
  }

  private now(): number {
    return this.options.now ? this.options.now() : Date.now();
  }

  private elapsed(startedAt: number): number {
    return Math.max(this.now() - startedAt, 0);
  }

  private scheduleTimeout(
    callback: () => void,
    milliseconds: number,
  ): () => void {
    if (this.options.scheduleTimeout) {
      return this.options.scheduleTimeout(callback, milliseconds);
    }
    const handle = setTimeout(callback, milliseconds);
    return () => clearTimeout(handle);
  }
}

function isRenderedPrompt(prompt: RenderedProviderPrompt): boolean {
  if (!prompt || typeof prompt !== "object") return false;
  if (prompt[RENDERED_PROVIDER_PROMPT_BRAND] !== true) return false;
  if (typeof prompt.instructions !== "string" || prompt.instructions.length === 0) return false;
  if (typeof prompt.input !== "string" || prompt.input.length === 0) return false;
  if (typeof prompt.schema !== "string" || prompt.schema.length === 0) return false;
  if (!prompt.requestId || !prompt.promptPackageId || !prompt.contextPackageId) return false;
  if (!Number.isFinite(prompt.taskVersion) || prompt.taskVersion < 1) return false;
  if (!Number.isFinite(prompt.outputContractVersion) || prompt.outputContractVersion < 1) return false;
  const expectedSize = prompt.instructions.length + prompt.input.length + prompt.schema.length;
  if (prompt.estimatedCharacters !== expectedSize) return false;
  return expectedSize <= PROVIDER_INSTRUCTION_CHARACTER_LIMIT;
}

function matchesRequest(
  prompt: RenderedProviderPrompt,
  request: ModelGatewayRequest,
): boolean {
  const identity = request.identity;
  return prompt.requestId === identity.requestId
    && prompt.traceId === identity.traceId
    && prompt.promptPackageId === request.promptPackage.promptPackageId
    && prompt.contextPackageId === request.promptPackage.contextPackageId
    && prompt.taskIdentifier === identity.taskIdentifier
    && prompt.taskVersion === identity.taskVersion
    && prompt.outputContractIdentifier === request.outputContractIdentifier
    && prompt.outputContractVersion === request.outputContractVersion;
}

function isResponseRecord(value: unknown): value is {
  status: unknown;
  rawOutput?: unknown;
  usage?: OfflineTransportResponse["usage"];
  finishReason?: unknown;
  error?: OfflineTransportResponse["error"];
} {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCompletionStatus(value: unknown): value is ProviderCompletionStatus {
  return typeof value === "string"
    && COMPLETION_STATUSES.includes(value as ProviderCompletionStatus);
}

function normalizeUsage(
  usage: OfflineTransportResponse["usage"] | undefined,
): ProviderUsageMetadata {
  return {
    inputUnits: nonNegative(usage?.inputUnits),
    outputUnits: nonNegative(usage?.outputUnits),
  };
}

function finitePositive(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function nonNegative(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.trunc(value)
    : 0;
}

function sanitizeFinishReason(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const candidate = value.slice(0, MAXIMUM_FINISH_REASON_LENGTH);
  return SAFE_FINISH_REASONS.has(candidate) ? candidate : "provider-reported";
}

function sanitizedError(
  error: OfflineTransportResponse["error"] | undefined | null,
): { category: string; message: string } | null {
  if (!error) return null;
  const candidate = typeof error.category === "string" && error.category.length > 0
    ? error.category.slice(0, 64)
    : "";
  return {
    category: SAFE_ERROR_CATEGORIES.has(candidate) ? candidate : "ProviderFailure",
    message: "The provider reported a failure without application authority.",
  };
}
