import { createSimulatedModelTransport } from "../demo/simulated-model-transport";
import type {
  OfflineTransport,
  OfflineTransportRequest,
  OfflineTransportResponse,
} from "./transport-model-provider-adapter";

/**
 * Deterministic local fake provider for Stage B2.4A verification.
 *
 * It is an in-process transport: it opens no socket, reads no environment
 * variable, holds no credential, and contacts no external service. Its purpose
 * is to prove the budget and failure paths of the durable turn pipeline without
 * a real model call.
 *
 * `success` delegates to the certified offline simulated transport, so the
 * response is a valid contract-shaped proposal for the rendered prompt. The
 * failure modes produce the provider envelopes the adapter and validator must
 * reject.
 */
export const FAKE_PROVIDER_ID = "fake-local-provider/v1" as const;

export type FakeProviderMode =
  | "success"
  | "reject"
  | "unavailable"
  | "invalid-output"
  | "transport-error"
  | "timeout"
  | "cancelled"
  /** A contract-shaped hours answer that states times the business never approved. */
  | "grounding-unsupported-time"
  /** A contract-shaped hours answer that cites another business's knowledge. */
  | "grounding-foreign-source";

export interface FakeProviderOptions {
  readonly mode?: FakeProviderMode;
  /** Observer invoked once per attempt, before the response is produced. */
  readonly onInvoke?: (request: OfflineTransportRequest) => void | Promise<void>;
}

export interface FakeProviderController {
  readonly providerIdentifier: string;
  readonly transport: OfflineTransport;
  /** Number of attempts the application made against this fake. */
  invocationCount(): number;
  /**
   * Token units the fake reported on its most recent response, or null when it
   * reported none. It lets a verification suite price exactly what the
   * application settled rather than assuming a fixed count.
   */
  reportedUsage(): { readonly inputUnits: number; readonly outputUnits: number } | null;
  setMode(mode: FakeProviderMode): void;
  /** Replace the per-attempt observer, or clear it with null. */
  setOnInvoke(
    observer: ((request: OfflineTransportRequest) => void | Promise<void>) | null,
  ): void;
}

const DOMAIN_VALIDATION_MESSAGES = Object.freeze({
  offline: "A deterministic fake provider stands in for the model.",
});

export function createFakeProvider(
  options: FakeProviderOptions = {},
): FakeProviderController {
  let mode: FakeProviderMode = options.mode ?? "success";
  let invocations = 0;
  let observer: ((request: OfflineTransportRequest) => void | Promise<void>) | null =
    options.onInvoke ?? null;
  let lastUsage: { readonly inputUnits: number; readonly outputUnits: number } | null = null;
  const simulated = createSimulatedModelTransport();

  const respond: OfflineTransport = async (
    request: OfflineTransportRequest,
  ): Promise<OfflineTransportResponse> => {
    invocations += 1;
    if (observer) await observer(request);

    switch (mode) {
      case "success":
        return simulated(request);
      case "grounding-unsupported-time":
        return groundedOverride(request, {
          customerFacingText: "The business is open today from 7:00 AM to 11:00 PM.",
          insufficientKnowledge: false,
        });
      case "grounding-foreign-source":
        return groundedOverride(request, {
          customerFacingText:
            "I cannot confirm the hours from the approved information available to me, so a person should review this.",
          insufficientKnowledge: true,
          knowledgeSourceReferences: ["other-business-regular-hours"],
        });
      case "reject":
        return {
          status: "refused",
          rawOutput: null,
          finishReason: "refusal",
          error: { category: "invalid-request", message: DOMAIN_VALIDATION_MESSAGES.offline },
          usage: { inputUnits: 0, outputUnits: 0 },
        };
      case "unavailable":
        return {
          status: "failed",
          rawOutput: null,
          finishReason: "provider-reported",
          error: { category: "unavailable" },
          usage: { inputUnits: 0, outputUnits: 0 },
        };
      case "invalid-output":
        return {
          status: "completed",
          rawOutput: JSON.stringify({ proposalType: "intent_interpretation", unexpectedField: true }),
          finishReason: "stop",
          usage: { inputUnits: 1, outputUnits: 1 },
        };
      case "transport-error":
        throw new Error("fake local transport failure");
      case "timeout":
        // Never resolves: the adapter's own deadline must terminate the attempt.
        return new Promise<OfflineTransportResponse>(() => undefined);
      case "cancelled":
        return new Promise<OfflineTransportResponse>((_resolve, reject) => {
          if (request.signal?.aborted) {
            reject(new Error("aborted"));
            return;
          }
          request.signal?.addEventListener(
            "abort",
            () => reject(new Error("aborted")),
            { once: true },
          );
        });
    }
  };

  /**
   * Return a plausible-looking proposal that the application must refuse. The
   * proposal copies this request's scope identity and cites whatever knowledge
   * the prompt actually contained, so only the claim checks can catch it.
   */
  function groundedOverride(
    request: OfflineTransportRequest,
    payload: Readonly<Record<string, unknown>>,
  ): OfflineTransportResponse {
    let identity: Record<string, unknown> = {};
    let sourceIds: string[] = [];
    try {
      const parsed: unknown = JSON.parse(request.input);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        const record = parsed as Record<string, unknown>;
        if (record.identity !== null && typeof record.identity === "object") {
          identity = record.identity as Record<string, unknown>;
        }
        if (Array.isArray(record.approvedKnowledge)) {
          sourceIds = record.approvedKnowledge
            .map((entry) => (entry !== null && typeof entry === "object"
              ? (entry as Record<string, unknown>).id
              : null))
            .filter((id): id is string => typeof id === "string");
        }
      }
    } catch {
      return {
        status: "failed",
        rawOutput: null,
        usage: { inputUnits: 0, outputUnits: 0 },
        finishReason: null,
        error: {
          category: "invalid-request",
          message: "The fake provider could not read the request.",
        },
      };
    }
    const rawOutput = JSON.stringify({
      ...identity,
      knowledgeSourceReferences: payload.knowledgeSourceReferences ?? sourceIds.slice(0, 1),
      ...payload,
    });
    return {
      status: "completed",
      rawOutput,
      usage: { inputUnits: 1, outputUnits: 1 },
      finishReason: "stop",
      error: null,
    };
  }

  const transport: OfflineTransport = async (
    request: OfflineTransportRequest,
  ): Promise<OfflineTransportResponse> => {
    const response = await respond(request);
    lastUsage = response.usage === undefined || response.usage === null
      ? null
      : {
          inputUnits: response.usage.inputUnits ?? 0,
          outputUnits: response.usage.outputUnits ?? 0,
        };
    return response;
  };

  return Object.freeze({
    providerIdentifier: FAKE_PROVIDER_ID,
    transport,
    invocationCount: () => invocations,
    reportedUsage: () => lastUsage,
    setMode: (next: FakeProviderMode) => {
      mode = next;
    },
    setOnInvoke: (
      next: ((request: OfflineTransportRequest) => void | Promise<void>) | null,
    ) => {
      observer = next;
    },
  });
}
