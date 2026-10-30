/**
 * Approved provider configuration for Stage B2.4B.2B (readiness only).
 *
 * This module describes the only OpenAI endpoint and models the application has
 * verified and priced. It authorizes nothing: `mode` must be the literal
 * `"disabled"`, so no configuration can turn on network execution by flipping a
 * boolean or filling in a variable. Enabling a real provider remains a separate,
 * explicitly authorized change.
 *
 * The credential is named, never held. A configuration supplies the *name* of a
 * server-side variable, and a value that looks like a key is rejected rather
 * than stored, so a pasted secret cannot reach source control or a log through
 * this path.
 */
import {
  resolveProviderPricing,
  type ProviderModelPricing,
} from "../billing/provider-pricing";

if (typeof window !== "undefined") {
  throw new Error("Pilot provider configuration is server-only.");
}

export const PILOT_PROVIDER_CONFIGURATION_VERSION =
  "b2.4b2b-provider-configuration/v1" as const;

/** The only origin a pilot provider request may reach. */
export const PILOT_PROVIDER_ORIGIN = "https://api.openai.com" as const;
export const PILOT_APPROVED_PROVIDER_ORIGINS: readonly string[] = Object.freeze([
  PILOT_PROVIDER_ORIGIN,
]);

/**
 * Recommended pilot model. It answers short, grounded customer questions with a
 * strict JSON schema at $0.10 / $0.50 per million input / output tokens, which
 * is the cost-sensitive tier of the current generation. `gpt-5.6-luna` is the
 * verified same-generation alternative at $0.20 / $1.20; the GPT-5.6 flagship is
 * deliberately absent because it costs roughly forty times as much per turn and
 * nothing in this workload needs it.
 */
export const PILOT_RECOMMENDED_MODEL = "gpt-6-luna" as const;
export const PILOT_APPROVED_PROVIDER_MODELS: readonly string[] = Object.freeze([
  "gpt-6-luna",
  "gpt-5.6-luna",
]);

/** Name of the server-side variable that would hold the key. Not the key. */
export const PILOT_PROVIDER_CREDENTIAL_REFERENCE = "OPENAI_API_KEY" as const;

/** The only accepted execution mode until a real provider is authorized. */
export const PILOT_PROVIDER_MODE = "disabled" as const;

export const PILOT_PROVIDER_DEFAULT_MAX_OUTPUT_TOKENS = 512;
export const PILOT_PROVIDER_MAXIMUM_OUTPUT_TOKENS = 4_096;
export const PILOT_PROVIDER_DEFAULT_TIMEOUT_MS = 15_000;
export const PILOT_PROVIDER_MINIMUM_TIMEOUT_MS = 1_000;
export const PILOT_PROVIDER_MAXIMUM_TIMEOUT_MS = 60_000;

const CREDENTIAL_REFERENCE_PATTERN = /^[A-Z][A-Z0-9_]{2,64}$/;
const MODEL_PATTERN = /^[A-Za-z0-9._:-]{1,100}$/;
const MAXIMUM_ORIGIN_LENGTH = 512;

/** Shapes that mean a value was supplied where a variable name belongs. */
const CREDENTIAL_VALUE_MARKERS = ["sk-", "sk_", "bearer ", "eyj"] as const;

const TOP_LEVEL_KEYS = new Set([
  "mode",
  "origin",
  "model",
  "credentialReference",
  "maxOutputTokens",
  "timeoutMs",
]);

export type PilotProviderConfigurationRejection =
  | "InvalidInput"
  | "UnknownField"
  | "ProviderNetworkProhibited"
  | "OriginNotApproved"
  | "ModelNotApproved"
  | "ModelNotPriced"
  | "InvalidCredentialReference"
  | "InvalidOutputBudget"
  | "InvalidTimeout";

export interface ValidatedPilotProviderConfiguration {
  readonly version: typeof PILOT_PROVIDER_CONFIGURATION_VERSION;
  readonly mode: typeof PILOT_PROVIDER_MODE;
  readonly providerNetworkAuthorized: false;
  readonly origin: string;
  readonly model: string;
  /** Name of a server-side variable. Never a credential value. */
  readonly credentialReference: string;
  readonly maxOutputTokens: number;
  readonly timeoutMs: number;
  /** Pricing that the spending guard would use for this model. */
  readonly pricing: ProviderModelPricing;
  readonly provenance: {
    readonly suppliedKeys: readonly string[];
    readonly credentialValueRetained: false;
  };
}

export type PilotProviderConfigurationResult =
  | { readonly status: "valid"; readonly value: ValidatedPilotProviderConfiguration }
  | {
      readonly status: "rejected";
      readonly reason: PilotProviderConfigurationRejection;
    };

/**
 * Validates an approved provider configuration, or rejects it.
 *
 * Every rejection is a fail-closed outcome: no partially valid configuration is
 * returned, and a model without an allowlisted price is refused here so it can
 * never reach the reservation-free provider path.
 */
export function validatePilotProviderConfiguration(
  input: unknown,
): PilotProviderConfigurationResult {
  if (!isRecord(input)) return reject("InvalidInput");

  const keys = Object.keys(input);
  for (const key of keys) {
    if (!TOP_LEVEL_KEYS.has(key)) return reject("UnknownField");
  }

  // Network execution is not authorized by any value in this stage.
  if (input.mode !== PILOT_PROVIDER_MODE) return reject("ProviderNetworkProhibited");

  const origin = input.origin ?? PILOT_PROVIDER_ORIGIN;
  if (typeof origin !== "string" || origin.length > MAXIMUM_ORIGIN_LENGTH) {
    return reject("InvalidInput");
  }
  if (!PILOT_APPROVED_PROVIDER_ORIGINS.includes(origin)) {
    return reject("OriginNotApproved");
  }

  const model = input.model ?? PILOT_RECOMMENDED_MODEL;
  if (typeof model !== "string" || !MODEL_PATTERN.test(model)) {
    return reject("InvalidInput");
  }
  if (!PILOT_APPROVED_PROVIDER_MODELS.includes(model)) {
    return reject("ModelNotApproved");
  }
  const pricing = resolveProviderPricing("openai", model);
  if (!pricing) return reject("ModelNotPriced");

  const credentialReference =
    input.credentialReference ?? PILOT_PROVIDER_CREDENTIAL_REFERENCE;
  if (!isCredentialReference(credentialReference)) {
    return reject("InvalidCredentialReference");
  }

  const maxOutputTokens =
    input.maxOutputTokens ?? PILOT_PROVIDER_DEFAULT_MAX_OUTPUT_TOKENS;
  if (!isBoundedInteger(maxOutputTokens, 1, PILOT_PROVIDER_MAXIMUM_OUTPUT_TOKENS)) {
    return reject("InvalidOutputBudget");
  }

  const timeoutMs = input.timeoutMs ?? PILOT_PROVIDER_DEFAULT_TIMEOUT_MS;
  if (
    !isBoundedInteger(
      timeoutMs,
      PILOT_PROVIDER_MINIMUM_TIMEOUT_MS,
      PILOT_PROVIDER_MAXIMUM_TIMEOUT_MS,
    )
  ) {
    return reject("InvalidTimeout");
  }

  return {
    status: "valid",
    value: Object.freeze({
      version: PILOT_PROVIDER_CONFIGURATION_VERSION,
      mode: PILOT_PROVIDER_MODE,
      providerNetworkAuthorized: false,
      origin,
      model,
      credentialReference,
      maxOutputTokens,
      timeoutMs,
      pricing,
      provenance: Object.freeze({
        suppliedKeys: Object.freeze(keys.slice().sort()),
        credentialValueRetained: false,
      }),
    }),
  };
}

/**
 * True when the value could be a server-side variable name. A key-shaped value
 * is rejected so a secret supplied by mistake is neither stored nor echoed.
 */
function isCredentialReference(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!CREDENTIAL_REFERENCE_PATTERN.test(value)) return false;
  const lowered = value.toLowerCase();
  return !CREDENTIAL_VALUE_MARKERS.some((marker) => lowered.includes(marker));
}

function isBoundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= minimum
    && value <= maximum;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function reject(reason: PilotProviderConfigurationRejection): PilotProviderConfigurationResult {
  return Object.freeze({ status: "rejected", reason });
}
