/**
 * Fail-closed pilot runtime configuration for Stage B2.3.1.
 *
 * This is deliberately separate from the Sprint 9.2 runtime-configuration module
 * so the certified local/automated-test gate is not weakened. A pilot
 * composition must present this explicit, fully specified configuration before a
 * runtime exists at all. Missing, contradictory, or unsafe values produce a
 * rejection and no runtime; there is no default business, widget, origin, TTL,
 * or operator credential.
 *
 * B2.3.1 still prohibits real provider execution. `providerNetworkExecution`
 * must be the literal `"disabled"`, so a configuration can never authorize a
 * network model call by accident or by flipping a boolean.
 */
if (typeof window !== "undefined") {
  throw new Error("Pilot runtime configuration is server-only.");
}

export const PILOT_RUNTIME_CONFIGURATION_VERSION =
  "b2.3.1-pilot-runtime-configuration/v1" as const;
export const PILOT_ENVIRONMENT = "pilot" as const;
export const PILOT_PROVIDER_NETWORK_MODE = "disabled" as const;

export const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1_000;
export const MINIMUM_SESSION_TTL_MS = 60 * 1_000;
export const MAXIMUM_SESSION_TTL_MS = 60 * 60 * 1_000;

export const MAXIMUM_PILOT_BUSINESSES = 50;
export const MAXIMUM_ALLOWED_ORIGINS = 20;
const MAXIMUM_ORIGIN_LENGTH = 512;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const WIDGET_PATTERN = /^[A-Za-z0-9._-]{8,64}$/;
const DIGEST_PATTERN = /^[0-9a-fA-F]{64}$/;

const TOP_LEVEL_KEYS = new Set([
  "environment",
  "requireSecureTransport",
  "providerNetworkExecution",
  "sessionTtlMs",
  "operatorCredentialDigest",
  "businesses",
  "persistence",
]);

const BUSINESS_KEYS = new Set(["businessId", "widgetId", "allowedOrigins"]);
const PERSISTENCE_KEYS = new Set(["mode", "credentialReference"]);
const CREDENTIAL_REFERENCE_PATTERN = /^[A-Z][A-Z0-9_]{2,64}$/;

export type PilotRuntimeConfigurationRejection =
  | "InvalidInput"
  | "MissingConfiguration"
  | "UnknownEnvironment"
  | "InsecureTransport"
  | "ProviderNetworkProhibited"
  | "UnknownField"
  | "NoBusinesses"
  | "TooManyBusinesses"
  | "DuplicateBusiness"
  | "DuplicateWidget"
  | "InvalidBusinessId"
  | "InvalidWidgetId"
  | "InvalidOrigin"
  | "DuplicateOrigin"
  | "InvalidSessionTtl"
  | "InvalidOperatorCredential"
  | "InvalidPersistence";

export interface PilotBusinessRegistration {
  readonly businessId: string;
  readonly widgetId: string;
  /**
   * Exact origins permitted to request a customer session for this widget.
   * A public widget identifier is an identifier, not a secret, so the origin
   * allowlist is anti-abuse and brand protection, not authentication.
   */
  readonly allowedOrigins: readonly string[];
}

export interface PilotPersistenceAuthorization {
  readonly mode: "durable";
  /** Name of a server-side credential reference; never a credential value. */
  readonly credentialReference: string;
}

export interface ValidatedPilotRuntimeConfiguration {
  readonly version: typeof PILOT_RUNTIME_CONFIGURATION_VERSION;
  readonly environment: typeof PILOT_ENVIRONMENT;
  readonly requireSecureTransport: true;
  readonly providerNetworkMode: typeof PILOT_PROVIDER_NETWORK_MODE;
  readonly providerNetworkAuthorized: false;
  readonly secureCookiesRequired: true;
  readonly sessionTtlMs: number;
  readonly operatorCredentialDigest: string | null;
  readonly persistence: PilotPersistenceAuthorization;
  readonly businesses: readonly PilotBusinessRegistration[];
  readonly provenance: {
    readonly suppliedKeys: readonly string[];
    readonly secretMaterialRetained: false;
  };
}

export type PilotRuntimeConfigurationResult =
  | { readonly status: "valid"; readonly value: ValidatedPilotRuntimeConfiguration }
  | { readonly status: "rejected"; readonly reason: PilotRuntimeConfigurationRejection };

export function resolvePilotRuntimeConfiguration(
  input: unknown,
): PilotRuntimeConfigurationResult {
  if (!isPlainRecord(input)) return rejected("InvalidInput");

  const keys = Object.keys(input);
  if (keys.some((key) => !TOP_LEVEL_KEYS.has(key))) return rejected("UnknownField");

  for (const required of [
    "environment",
    "requireSecureTransport",
    "providerNetworkExecution",
    "sessionTtlMs",
    "businesses",
    "persistence",
  ]) {
    if (!(required in input)) return rejected("MissingConfiguration");
  }

  if (input.environment !== PILOT_ENVIRONMENT) return rejected("UnknownEnvironment");
  if (input.requireSecureTransport !== true) return rejected("InsecureTransport");
  if (input.providerNetworkExecution !== PILOT_PROVIDER_NETWORK_MODE) {
    return rejected("ProviderNetworkProhibited");
  }

  const sessionTtlMs = boundedInteger(
    input.sessionTtlMs,
    MINIMUM_SESSION_TTL_MS,
    MAXIMUM_SESSION_TTL_MS,
  );
  if (sessionTtlMs === null) return rejected("InvalidSessionTtl");

  const rawPersistence = input.persistence;
  if (!isPlainRecord(rawPersistence)) return rejected("InvalidPersistence");
  if (Object.keys(rawPersistence).some((key) => !PERSISTENCE_KEYS.has(key))) {
    return rejected("InvalidPersistence");
  }
  if (rawPersistence.mode !== "durable") return rejected("InvalidPersistence");
  if (typeof rawPersistence.credentialReference !== "string"
    || !CREDENTIAL_REFERENCE_PATTERN.test(rawPersistence.credentialReference)) {
    return rejected("InvalidPersistence");
  }
  const persistence: PilotPersistenceAuthorization = Object.freeze({
    mode: "durable" as const,
    credentialReference: rawPersistence.credentialReference,
  });

  let operatorCredentialDigest: string | null = null;
  if (input.operatorCredentialDigest !== undefined
    && input.operatorCredentialDigest !== null) {
    if (typeof input.operatorCredentialDigest !== "string"
      || !DIGEST_PATTERN.test(input.operatorCredentialDigest)) {
      return rejected("InvalidOperatorCredential");
    }
    operatorCredentialDigest = input.operatorCredentialDigest.toLowerCase();
  }

  const rawBusinesses = input.businesses;
  if (!Array.isArray(rawBusinesses)) return rejected("InvalidInput");
  if (rawBusinesses.length === 0) return rejected("NoBusinesses");
  if (rawBusinesses.length > MAXIMUM_PILOT_BUSINESSES) return rejected("TooManyBusinesses");

  const businesses: PilotBusinessRegistration[] = [];
  const businessIds = new Set<string>();
  const widgetIds = new Set<string>();

  for (const raw of rawBusinesses) {
    if (!isPlainRecord(raw)) return rejected("InvalidInput");
    if (Object.keys(raw).some((key) => !BUSINESS_KEYS.has(key))) {
      return rejected("UnknownField");
    }
    if (!("businessId" in raw) || !("widgetId" in raw) || !("allowedOrigins" in raw)) {
      return rejected("MissingConfiguration");
    }
    if (typeof raw.businessId !== "string" || !IDENTIFIER_PATTERN.test(raw.businessId)) {
      return rejected("InvalidBusinessId");
    }
    if (typeof raw.widgetId !== "string" || !WIDGET_PATTERN.test(raw.widgetId)) {
      return rejected("InvalidWidgetId");
    }
    if (businessIds.has(raw.businessId)) return rejected("DuplicateBusiness");
    if (widgetIds.has(raw.widgetId)) return rejected("DuplicateWidget");
    if (!Array.isArray(raw.allowedOrigins)
      || raw.allowedOrigins.length === 0
      || raw.allowedOrigins.length > MAXIMUM_ALLOWED_ORIGINS) {
      return rejected("InvalidOrigin");
    }

    const origins: string[] = [];
    for (const origin of raw.allowedOrigins) {
      const normalized = normalizePilotOrigin(origin);
      if (normalized === null) return rejected("InvalidOrigin");
      if (origins.includes(normalized)) return rejected("DuplicateOrigin");
      origins.push(normalized);
    }

    businessIds.add(raw.businessId);
    widgetIds.add(raw.widgetId);
    businesses.push(Object.freeze({
      businessId: raw.businessId,
      widgetId: raw.widgetId,
      allowedOrigins: Object.freeze(origins),
    }));
  }

  return Object.freeze({
    status: "valid" as const,
    value: Object.freeze({
      version: PILOT_RUNTIME_CONFIGURATION_VERSION,
      environment: PILOT_ENVIRONMENT,
      requireSecureTransport: true as const,
      providerNetworkMode: PILOT_PROVIDER_NETWORK_MODE,
      providerNetworkAuthorized: false as const,
      secureCookiesRequired: true as const,
      sessionTtlMs,
      operatorCredentialDigest,
      persistence,
      businesses: Object.freeze(businesses),
      provenance: Object.freeze({
        suppliedKeys: Object.freeze([...keys].sort()),
        secretMaterialRetained: false as const,
      }),
    }),
  });
}

/**
 * Normalize one allowed origin. Only an exact HTTPS origin (or an explicit
 * loopback HTTP origin for development) is accepted. Credentials, paths,
 * queries, fragments, wildcards, and malformed values are refused.
 */
export function normalizePilotOrigin(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.length === 0 || value.length > MAXIMUM_ORIGIN_LENGTH) return null;
  if (value !== value.trim()) return null;
  if (value.includes("*")) return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.username !== "" || url.password !== "") return null;
  if (url.pathname !== "/" || url.search !== "" || url.hash !== "") return null;
  if (url.origin === "null") return null;

  const loopback = isLoopbackHostname(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) return null;
  return url.origin;
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "[::1]"
    || hostname === "::1";
}

function rejected(
  reason: PilotRuntimeConfigurationRejection,
): PilotRuntimeConfigurationResult {
  return Object.freeze({ status: "rejected" as const, reason });
}

function boundedInteger(value: unknown, minimum: number, maximum: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < minimum || value > maximum) return null;
  return value;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
