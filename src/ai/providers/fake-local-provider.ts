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
  | "cancelled";

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
  const simulated = createSimulatedModelTransport();

  const transport: OfflineTransport = async (
    request: OfflineTransportRequest,
  ): Promise<OfflineTransportResponse> => {
    invocations += 1;
    if (observer) await observer(request);

    switch (mode) {
      case "success":
        return simulated(request);
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

  return Object.freeze({
    providerIdentifier: FAKE_PROVIDER_ID,
    transport,
    invocationCount: () => invocations,
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
