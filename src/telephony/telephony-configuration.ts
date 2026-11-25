/**
 * Fail-closed telephony configuration.
 *
 * A telephone runtime exists only when an explicit configuration names the
 * dialed number for each business and a server-held carrier credential resolves.
 * There is no default business, no default number, and no fallback: an absent or
 * invalid configuration means the voice endpoint politely refuses the call.
 *
 * Live carrier traffic is gated by a literal constant, exactly as the model
 * provider path is. In this stage `LIVE_TELEPHONY_AUTHORIZED` is `false`, so a
 * configuration cannot route a real call by flipping a value; enabling the pilot
 * requires a reviewed code change once the owner has approved the purchase.
 */
export const TELEPHONY_CONFIGURATION_VERSION = "telephony-configuration/v1" as const;

/** Environment variable holding the complete telephony configuration document. */
export const TELEPHONY_CONFIGURATION_ENV = "AI_RECEPTIONIST_TELEPHONY_CONFIGURATION" as const;

/** Server-only variable holding the carrier auth token used for signatures. */
export const TELEPHONY_AUTH_TOKEN_VARIABLE = "AI_RECEPTIONIST_TWILIO_AUTH_TOKEN" as const;

/** Public origin the carrier posts to. Signatures are computed over this URL. */
export const TELEPHONY_PUBLIC_ORIGIN_VARIABLE = "AI_RECEPTIONIST_TELEPHONY_PUBLIC_ORIGIN" as const;

/**
 * Live calls are not authorized. This is the only switch that can change that,
 * and changing it is a reviewed code change, not a deployment setting.
 */
export const LIVE_TELEPHONY_AUTHORIZED = false as const;

export const TELEPHONY_MODES = ["disabled", "sandbox", "live"] as const;
export type TelephonyMode = (typeof TELEPHONY_MODES)[number];

const BUSINESS_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const MAXIMUM_BUSINESSES = 10;
const MINIMUM_AUTH_TOKEN_LENGTH = 16;
const MAXIMUM_AUTH_TOKEN_LENGTH = 4_096;

const TOP_LEVEL_KEYS = new Set(["mode", "publicOrigin", "businesses", "voice"]);
const BUSINESS_KEYS = new Set(["businessId", "phoneNumber"]);

export type TelephonyConfigurationRejection =
  | "InvalidInput"
  | "UnknownField"
  | "MissingConfiguration"
  | "UnknownMode"
  | "LiveNotAuthorized"
  | "MissingAuthToken"
  | "InvalidAuthToken"
  | "InvalidPublicOrigin"
  | "NoBusinesses"
  | "TooManyBusinesses"
  | "InvalidBusinessId"
  | "InvalidPhoneNumber"
  | "DuplicateBusiness"
  | "DuplicatePhoneNumber";

export interface TelephonyBusinessRoute {
  readonly businessId: string;
  /** E.164 number the carrier dialed for this business. */
  readonly phoneNumber: string;
}

export interface ValidatedTelephonyConfiguration {
  readonly version: typeof TELEPHONY_CONFIGURATION_VERSION;
  readonly mode: "sandbox";
  readonly liveAuthorized: false;
  readonly publicOrigin: string;
  readonly businesses: readonly TelephonyBusinessRoute[];
  readonly voice: string;
  /** Resolved server-side credential, used only for signature verification. */
  readonly authToken: string;
  readonly provenance: {
    readonly authTokenRetained: true;
    readonly authTokenLogged: false;
  };
}

export type TelephonyConfigurationResult =
  | { readonly status: "valid"; readonly value: ValidatedTelephonyConfiguration }
  | { readonly status: "rejected"; readonly reason: TelephonyConfigurationRejection };

/**
 * Validate a raw configuration document plus the server environment.
 *
 * `mode` may be omitted, which means `disabled`: the voice route then refuses
 * every call instead of serving an unconfigured dialogue.
 */
export function resolveTelephonyConfiguration(
  input: unknown,
  environment: Readonly<Record<string, string | undefined>>,
): TelephonyConfigurationResult {
  if (input === undefined || input === null) return rejected("MissingConfiguration");
  if (!isRecord(input)) return rejected("InvalidInput");
  for (const key of Object.keys(input)) {
    if (!TOP_LEVEL_KEYS.has(key)) return rejected("UnknownField");
  }

  const mode = input.mode ?? "disabled";
  if (typeof mode !== "string" || !TELEPHONY_MODES.includes(mode as TelephonyMode)) {
    return rejected("UnknownMode");
  }
  if (mode === "disabled") return rejected("MissingConfiguration");
  if (mode === "live") {
    // Unreachable by configuration while the constant is false.
    if (!LIVE_TELEPHONY_AUTHORIZED) return rejected("LiveNotAuthorized");
    return rejected("LiveNotAuthorized");
  }

  const authToken = environment[TELEPHONY_AUTH_TOKEN_VARIABLE];
  if (typeof authToken !== "string" || authToken.trim().length === 0) {
    return rejected("MissingAuthToken");
  }
  if (authToken.length < MINIMUM_AUTH_TOKEN_LENGTH || authToken.length > MAXIMUM_AUTH_TOKEN_LENGTH) {
    return rejected("InvalidAuthToken");
  }

  const publicOrigin = input.publicOrigin ?? environment[TELEPHONY_PUBLIC_ORIGIN_VARIABLE];
  const origin = normalizeOrigin(publicOrigin);
  if (origin === null) return rejected("InvalidPublicOrigin");

  const rawBusinesses = input.businesses;
  if (!Array.isArray(rawBusinesses) || rawBusinesses.length === 0) {
    return rejected("NoBusinesses");
  }
  if (rawBusinesses.length > MAXIMUM_BUSINESSES) return rejected("TooManyBusinesses");

  const businesses: TelephonyBusinessRoute[] = [];
  const ids = new Set<string>();
  const numbers = new Set<string>();
  for (const raw of rawBusinesses) {
    if (!isRecord(raw)) return rejected("InvalidInput");
    if (Object.keys(raw).some((key) => !BUSINESS_KEYS.has(key))) return rejected("UnknownField");
    if (typeof raw.businessId !== "string" || !BUSINESS_ID_PATTERN.test(raw.businessId)) {
      return rejected("InvalidBusinessId");
    }
    const phoneNumber = normalizeE164(raw.phoneNumber);
    if (phoneNumber === null) return rejected("InvalidPhoneNumber");
    if (ids.has(raw.businessId)) return rejected("DuplicateBusiness");
    if (numbers.has(phoneNumber)) return rejected("DuplicatePhoneNumber");
    ids.add(raw.businessId);
    numbers.add(phoneNumber);
    businesses.push(Object.freeze({ businessId: raw.businessId, phoneNumber }));
  }

  const voice = typeof input.voice === "string" && input.voice.length <= 64
    ? input.voice
    : "Polly.Joanna";

  return Object.freeze({
    status: "valid" as const,
    value: Object.freeze({
      version: TELEPHONY_CONFIGURATION_VERSION,
      mode: "sandbox" as const,
      liveAuthorized: false as const,
      publicOrigin: origin,
      businesses: Object.freeze(businesses),
      voice,
      authToken,
      provenance: Object.freeze({
        authTokenRetained: true as const,
        authTokenLogged: false as const,
      }),
    }),
  });
}

/** Resolve the business a dialed number belongs to. */
export function businessForDialedNumber(
  configuration: ValidatedTelephonyConfiguration,
  dialedNumber: string,
): string | null {
  const normalized = normalizeE164(dialedNumber);
  if (normalized === null) return null;
  const route = configuration.businesses.find((entry) => entry.phoneNumber === normalized);
  return route ? route.businessId : null;
}

function normalizeOrigin(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return null;
  if (value !== value.trim() || value.includes("*")) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback(url.hostname))) {
    return null;
  }
  if (url.username !== "" || url.password !== "") return null;
  if (url.pathname !== "/" || url.search !== "" || url.hash !== "") return null;
  return url.origin;
}

function normalizeE164(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\+[1-9][0-9]{7,14}$/.test(trimmed)) return null;
  return trimmed;
}

function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function rejected(reason: TelephonyConfigurationRejection): TelephonyConfigurationResult {
  return Object.freeze({ status: "rejected" as const, reason });
}
