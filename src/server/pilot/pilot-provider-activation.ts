/**
 * Controlled provider activation for Stage B2.4B.2C.
 *
 * This is the single server-only path that can put the OpenAI Responses adapter
 * behind the pilot conversation runtime. It is deliberately not a second
 * execution pathway: whatever it returns is an `OfflineTransport`, which the
 * existing durable service already wraps with budget reservation, settlement,
 * turn receipts and tenant isolation.
 *
 * Three states exist, and only two are reachable:
 *
 * - `disabled` (default) — the offline simulator serves every turn.
 * - `offline-verification` — the real adapter is exercised, but only against a
 *   loopback endpoint, so no request can leave the machine. It is how the
 *   adapter is proven end to end without a key or a bill.
 * - `live` — refuses unconditionally. `LIVE_PROVIDER_AUTHORIZED` is the literal
 *   `false`, so live activation requires a reviewed code change to that
 *   constant in a future stage; nothing an operator sets can reach it.
 *
 * No client request may select a mode. Nothing here reads a request body, and
 * the only credential ever touched is supplied by server composition.
 */
import {
  createOpenAiResponsesTransport,
  OPENAI_RESPONSES_ADAPTER_ID,
  type OpenAiResponsesTransportOptions,
} from "../../ai/providers/openai-responses-adapter";
import type { OfflineTransport } from "../../ai/providers/transport-model-provider-adapter";
import {
  resolveProviderPricing,
  type ProviderModelPricing,
} from "../billing/provider-pricing";
import { OFFLINE_PROVIDER_DESCRIPTOR } from "../runtime/receptionist-runtime";
import {
  PILOT_APPROVED_PROVIDER_MODELS,
  PILOT_PROVIDER_CREDENTIAL_REFERENCE,
  PILOT_PROVIDER_DEFAULT_MAX_OUTPUT_TOKENS,
  PILOT_PROVIDER_DEFAULT_TIMEOUT_MS,
  PILOT_PROVIDER_MAXIMUM_OUTPUT_TOKENS,
  PILOT_PROVIDER_MAXIMUM_TIMEOUT_MS,
  PILOT_PROVIDER_MINIMUM_TIMEOUT_MS,
  PILOT_RECOMMENDED_MODEL,
} from "./pilot-provider-configuration";

if (typeof window !== "undefined") {
  throw new Error("Pilot provider activation is server-only.");
}

export const PILOT_PROVIDER_ACTIVATION_VERSION =
  "b2.4b2c-provider-activation/v1" as const;

export const PROVIDER_ACTIVATION_MODES = Object.freeze([
  "disabled",
  "offline-verification",
  "live",
] as const);

export type ProviderActivationMode = (typeof PROVIDER_ACTIVATION_MODES)[number];

/**
 * Live activation is not authorized. Flipping this in a future, separately
 * reviewed stage is the only way `live` can be reached, because the value is a
 * literal type and every configuration path is checked against it.
 */
export const LIVE_PROVIDER_AUTHORIZED = false as const;

/**
 * The dedicated server-side variable that would hold the key. The name is
 * exported so composition can reference it; the value is never read here except
 * by {@link serverCredentialFromEnvironment}, which never logs or returns it to
 * a caller other than the adapter.
 */
export const PILOT_PROVIDER_CREDENTIAL_VARIABLE =
  "AI_RECEPTIONIST_OPENAI_API_KEY" as const;

export const MAXIMUM_CREDENTIAL_LENGTH = 4_096;

/** Provider descriptor reported while only the offline simulator runs. */
export const DISABLED_PROVIDER_DESCRIPTOR = OFFLINE_PROVIDER_DESCRIPTOR;

/**
 * Descriptor for an adapter exercised against loopback. It names the real
 * adapter truthfully while still stating that no network was accessed, because
 * a loopback request never leaves the machine.
 */
export const LOOPBACK_VERIFICATION_PROVIDER_DESCRIPTOR = Object.freeze({
  identifier: OPENAI_RESPONSES_ADAPTER_ID,
  networkAccessed: false,
});

const TOP_LEVEL_KEYS = new Set([
  "mode",
  "baseUrl",
  "model",
  "credential",
  "maxOutputTokens",
  "timeoutMs",
]);

export type ProviderActivationRejection =
  | "InvalidInput"
  | "UnknownField"
  | "UnknownMode"
  | "LiveNotAuthorized"
  | "LoopbackRequired"
  | "ModelNotApproved"
  | "ModelNotPriced"
  | "CredentialUnavailable"
  | "CredentialInvalid"
  | "ConfigurationRejected";

export interface ActivatedPilotProvider {
  readonly version: typeof PILOT_PROVIDER_ACTIVATION_VERSION;
  readonly mode: "disabled" | "offline-verification";
  /** Undefined when disabled: the durable service falls back to the simulator. */
  readonly transport: OfflineTransport | undefined;
  readonly provider: { readonly identifier: string; readonly networkAccessed: boolean };
  readonly usageProviderIdentifier: string;
  readonly pricing: ProviderModelPricing | null;
  readonly credentialVariable: string;
  readonly provenance: {
    readonly credentialValueRetained: false;
    readonly liveAuthorized: false;
    readonly loopbackOnly: boolean;
  };
}

export type ProviderActivationResult =
  | { readonly status: "activated"; readonly value: ActivatedPilotProvider }
  | { readonly status: "rejected"; readonly reason: ProviderActivationRejection };

/**
 * Resolves the provider activation for a composed runtime, or rejects it.
 *
 * A rejection is a fail-closed outcome: the caller must not build a runtime, so
 * a misconfigured deployment serves nothing rather than serving unguarded.
 */
export function createPilotProviderActivation(
  input: unknown,
): ProviderActivationResult {
  // Omitted means disabled. This is the only value that is inferred, because it
  // is the state in which no provider can be reached at all; every other mode
  // must be stated explicitly by server composition.
  if (input === undefined || input === null) return disabled();
  if (!isRecord(input)) return reject("InvalidInput");
  for (const key of Object.keys(input)) {
    if (!TOP_LEVEL_KEYS.has(key)) return reject("UnknownField");
  }

  const mode = input.mode;
  if (mode === undefined) return disabled();
  if (typeof mode !== "string"
    || !PROVIDER_ACTIVATION_MODES.includes(mode as ProviderActivationMode)) {
    return reject("UnknownMode");
  }

  if (mode === "disabled") return disabled();
  if (mode === "live") {
    // Unreachable by configuration: live needs a code change to the constant.
    return reject("LiveNotAuthorized");
  }
  return offlineVerification(input);
}

function disabled(): ProviderActivationResult {
  return {
    status: "activated",
    value: Object.freeze({
      version: PILOT_PROVIDER_ACTIVATION_VERSION,
      mode: "disabled" as const,
      transport: undefined,
      provider: DISABLED_PROVIDER_DESCRIPTOR,
      usageProviderIdentifier: OFFLINE_PROVIDER_DESCRIPTOR.identifier,
      pricing: null,
      credentialVariable: PILOT_PROVIDER_CREDENTIAL_VARIABLE,
      provenance: Object.freeze({
        credentialValueRetained: false as const,
        liveAuthorized: false as const,
        loopbackOnly: false,
      }),
    }),
  };
}

function offlineVerification(
  input: Record<string, unknown>,
): ProviderActivationResult {
  // A loopback endpoint is the whole point of this mode, so anything routable is
  // refused rather than silently accepted as "almost loopback".
  const baseUrl = input.baseUrl;
  if (typeof baseUrl !== "string" || baseUrl.length === 0) {
    return reject("LoopbackRequired");
  }
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return reject("LoopbackRequired");
  }
  if (!isLoopbackOrigin(parsed)) return reject("LoopbackRequired");

  const model = input.model ?? PILOT_RECOMMENDED_MODEL;
  if (typeof model !== "string" || !PILOT_APPROVED_PROVIDER_MODELS.includes(model)) {
    return reject("ModelNotApproved");
  }
  const pricing = resolveProviderPricing("openai", model);
  if (!pricing) return reject("ModelNotPriced");

  const maxOutputTokens =
    input.maxOutputTokens ?? PILOT_PROVIDER_DEFAULT_MAX_OUTPUT_TOKENS;
  if (!isBoundedInteger(maxOutputTokens, 1, PILOT_PROVIDER_MAXIMUM_OUTPUT_TOKENS)) {
    return reject("ConfigurationRejected");
  }

  const timeoutMs = input.timeoutMs ?? PILOT_PROVIDER_DEFAULT_TIMEOUT_MS;
  if (!isBoundedInteger(timeoutMs, PILOT_PROVIDER_MINIMUM_TIMEOUT_MS, PILOT_PROVIDER_MAXIMUM_TIMEOUT_MS)) {
    return reject("ConfigurationRejected");
  }

  // The credential must be supplied by server composition. A missing one fails
  // closed here rather than at call time, so no turn can begin unbilled.
  const credential = typeof input.credential === "function"
    ? (input.credential as () => string | null | undefined)
    : null;
  if (!credential) return reject("CredentialUnavailable");

  let transport: OfflineTransport;
  try {
    const options: OpenAiResponsesTransportOptions = {
      baseUrl: parsed.origin,
      allowedOrigins: [parsed.origin],
      model,
      maxOutputTokens,
      timeoutMs,
      // Required for a plaintext loopback verification endpoint; the adapter
      // still refuses plaintext for any non-loopback host.
      allowInsecureLoopback: true,
      credentialReference: () => {
        const value = credential();
        return typeof value === "string" && value.length > 0 ? value : null;
      },
    };
    transport = createOpenAiResponsesTransport(options);
  } catch {
    // The adapter's own configuration errors are sanitized: they never carry a
    // base URL, a credential, or a model value back to the caller.
    return reject("ConfigurationRejected");
  }

  // Probe the credential once, before any turn, so a missing value is a startup
  // rejection instead of a per-turn failure. The value itself is not retained.
  const probe = typeof input.credential === "function"
    ? (input.credential as () => string | null | undefined)()
    : null;
  if (!isUsableCredential(probe)) return reject("CredentialInvalid");

  return {
    status: "activated",
    value: Object.freeze({
      version: PILOT_PROVIDER_ACTIVATION_VERSION,
      mode: "offline-verification" as const,
      transport,
      provider: LOOPBACK_VERIFICATION_PROVIDER_DESCRIPTOR,
      usageProviderIdentifier: "openai",
      pricing,
      credentialVariable: PILOT_PROVIDER_CREDENTIAL_VARIABLE,
      provenance: Object.freeze({
        credentialValueRetained: false as const,
        liveAuthorized: false as const,
        loopbackOnly: true,
      }),
    }),
  };
}

/**
 * Reads the dedicated credential from the server environment.
 *
 * Server-only, call-once-per-attempt, and it never logs. It exists so a future
 * authorized stage can compose it without inventing a second credential path;
 * no runtime calls it today.
 */
export function serverCredentialFromEnvironment(): string | null {
  const environment = typeof process === "undefined" ? undefined : process.env;
  if (!environment) return null;
  const value = environment[PILOT_PROVIDER_CREDENTIAL_VARIABLE];
  return isUsableCredential(value) ? value : null;
}

function isUsableCredential(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length === 0 || value.length > MAXIMUM_CREDENTIAL_LENGTH) return false;
  // A pasted line break or surrounding prose means the value is not a key.
  return value === value.trim() && !/\s/.test(value);
}

function isLoopbackOrigin(url: URL): boolean {
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.username !== "" || url.password !== "") return false;
  if (url.pathname !== "/" && url.pathname !== "") return false;
  if (url.search !== "" || url.hash !== "") return false;
  const host = url.hostname.toLowerCase();
  return host === "127.0.0.1" || host === "::1" || host === "[::1]" || host === "localhost";
}

function isBoundedInteger(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isInteger(value)
    && value >= minimum && value <= maximum;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function reject(reason: ProviderActivationRejection): ProviderActivationResult {
  return Object.freeze({ status: "rejected", reason });
}

/** Reported to an operator without revealing whether a key is present. */
export function describeProviderActivation(result: ProviderActivationResult): {
  readonly mode: string;
  readonly networkAccessed: boolean;
  readonly credentialConfigured: boolean;
} {
  if (result.status === "rejected") {
    return Object.freeze({
      mode: "rejected",
      networkAccessed: false,
      credentialConfigured: false,
    });
  }
  return Object.freeze({
    mode: result.value.mode,
    networkAccessed: result.value.provider.networkAccessed,
    credentialConfigured: result.value.mode === "offline-verification",
  });
}

/** Re-exported so composition names the credential once, from one constant. */
export { PILOT_PROVIDER_CREDENTIAL_REFERENCE };
