export const RUNTIME_CONFIGURATION_VERSION = "sprint-9.2-runtime-configuration-v1";

export const SUPPORTED_RUNTIME_ENVIRONMENTS = Object.freeze([
  "local-development",
  "automated-test",
  "controlled-evaluation",
  "production",
] as const);
export type RuntimeEnvironment = (typeof SUPPORTED_RUNTIME_ENVIRONMENTS)[number];

export const RUNTIME_CAPABILITIES = Object.freeze([
  "deterministic-fixture-prototype",
  "fictional-durable-activated-path",
  "bounded-operational-evidence",
  "controlled-evaluation-execution",
  "provider-network-model-execution",
  "customer-response-release",
  "external-action",
  "telephony",
  "sms",
  "email-sending",
  "crm-action",
  "scheduling",
  "payments-billing",
  "production-deployment",
  "production-database",
  "protected-data-processing",
  "administrative-functionality",
  "authentication-authorization",
] as const);
export type RuntimeCapability = (typeof RUNTIME_CAPABILITIES)[number];

export const RUNTIME_CREDENTIAL_PURPOSES = Object.freeze([
  "test-database",
  "production-database",
  "model-provider",
  "communication-channel",
  "identity-provider",
  "monitoring-service",
] as const);
export type RuntimeCredentialPurpose = (typeof RUNTIME_CREDENTIAL_PURPOSES)[number];
export type RuntimeCredentialState = "available" | "unavailable" | "revoked";

export const RUNTIME_ENVIRONMENT_KEYS = Object.freeze({
  environment: "AI_RECEPTIONIST_RUNTIME_ENVIRONMENT",
  configurationId: "AI_RECEPTIONIST_RUNTIME_CONFIGURATION_ID",
  capabilities: "AI_RECEPTIONIST_RUNTIME_CAPABILITIES",
  testDatabaseCredentialReference:
    "AI_RECEPTIONIST_TEST_DATABASE_CREDENTIAL_REFERENCE",
} as const);

export interface RuntimeConfigurationInput {
  /** Explicit snapshot supplied by the server composition root. */
  readonly environmentVariables: unknown;
  /** Availability receipts only. Secret material must never enter this contract. */
  readonly credentialAvailability: unknown;
}

export interface RuntimeCredentialAvailability {
  readonly purpose: RuntimeCredentialPurpose;
  readonly state: RuntimeCredentialState;
}

type AllowedRuntimeCapability =
  | "deterministic-fixture-prototype"
  | "fictional-durable-activated-path"
  | "bounded-operational-evidence";

export interface PublicRuntimeConfiguration {
  readonly version: typeof RUNTIME_CONFIGURATION_VERSION;
  readonly environment: "local-development" | "automated-test";
  readonly capabilities: readonly AllowedRuntimeCapability[];
  readonly customerResponseReleaseAuthorized: false;
  readonly externalActionAuthorized: false;
  readonly providerNetworkAuthorized: false;
}

export interface RuntimeConfigurationProvenance {
  readonly source: "explicit-process-environment-snapshot";
  readonly configurationId: string;
  readonly suppliedConfigurationKeys: readonly string[];
  readonly checkedCredentialPurposes: readonly RuntimeCredentialPurpose[];
  readonly secretValuesRetained: false;
}

export interface ValidatedRuntimeConfiguration {
  readonly version: typeof RUNTIME_CONFIGURATION_VERSION;
  readonly environment: "local-development" | "automated-test";
  readonly configurationId: string;
  readonly capabilities: readonly AllowedRuntimeCapability[];
  readonly credentialReferences: Readonly<{ readonly testDatabase: string | null }>;
  readonly publicConfiguration: PublicRuntimeConfiguration;
  readonly provenance: RuntimeConfigurationProvenance;
  readonly controlledEvaluationExecutionAuthorized: false;
  readonly productionRuntimeAuthorized: false;
  readonly productionDatabaseAuthorized: false;
  readonly protectedDataAuthorized: false;
  readonly customerResponseReleaseAuthorized: false;
  readonly externalActionAuthorized: false;
}

export type RuntimeConfigurationRejectionReason =
  | "InvalidInput"
  | "MissingConfiguration"
  | "UnknownEnvironment"
  | "EnvironmentUnauthorized"
  | "ProductionUnauthorized"
  | "UnknownCapability"
  | "ContradictoryCapability"
  | "InvalidCredentialReference"
  | "CredentialNotAllowed"
  | "CredentialUnavailable"
  | "CredentialRevoked"
  | "MissingCredential";

export type RuntimeConfigurationDecision =
  | Readonly<{ status: "ready"; configuration: ValidatedRuntimeConfiguration }>
  | Readonly<{
      status: "rejected";
      reason: RuntimeConfigurationRejectionReason;
      errors: readonly string[];
      environment: RuntimeEnvironment | null;
      startupAuthorized: false;
      controlledEvaluationExecutionAuthorized: false;
      productionRuntimeAuthorized: false;
      productionDatabaseAuthorized: false;
      protectedDataAuthorized: false;
      customerResponseReleaseAuthorized: false;
      externalActionAuthorized: false;
    }>;

export type RuntimeEnvironmentIdentityDecision =
  | Readonly<{ status: "recognized"; environment: RuntimeEnvironment }>
  | Readonly<{ status: "rejected"; environment: null }>;

const ALLOWED_CAPABILITIES = new Set<RuntimeCapability>([
  "deterministic-fixture-prototype",
  "fictional-durable-activated-path",
  "bounded-operational-evidence",
]);
const KNOWN_ENVIRONMENT_KEYS = new Set<string>(Object.values(RUNTIME_ENVIRONMENT_KEYS));

/** Recognition never implies startup or capability authority. */
export function classifyRuntimeEnvironmentIdentity(
  value: unknown,
): RuntimeEnvironmentIdentityDecision {
  if (
    typeof value === "string"
    && SUPPORTED_RUNTIME_ENVIRONMENTS.includes(value as RuntimeEnvironment)
  ) return Object.freeze({ status: "recognized", environment: value as RuntimeEnvironment });
  return Object.freeze({ status: "rejected", environment: null });
}

/** Parses an explicit server snapshot and never reads ambient process state. */
export function evaluateServerRuntimePreflight(input: unknown): RuntimeConfigurationDecision {
  try {
    return evaluatePreflight(input);
  } catch {
    return rejection("InvalidInput", null);
  }
}

function evaluatePreflight(input: unknown): RuntimeConfigurationDecision {
  if (!isPlainRecord(input) || !hasExactKeys(input, [
    "environmentVariables",
    "credentialAvailability",
  ])) return rejection("InvalidInput", null);

  if (!isPlainRecord(input.environmentVariables)) return rejection("InvalidInput", null);
  const environmentVariables = input.environmentVariables;
  if (hasUnknownNamespacedKey(environmentVariables)) return rejection("InvalidInput", null);

  const rawEnvironment = environmentVariables[RUNTIME_ENVIRONMENT_KEYS.environment];
  const identity = classifyRuntimeEnvironmentIdentity(rawEnvironment);
  if (identity.status === "rejected") {
    return rejection(
      rawEnvironment === undefined ? "MissingConfiguration" : "UnknownEnvironment",
      null,
    );
  }
  const environment = identity.environment;
  if (environment === "production") return rejection("ProductionUnauthorized", environment);
  if (environment === "controlled-evaluation") {
    return rejection("EnvironmentUnauthorized", environment);
  }

  const configurationId = environmentVariables[RUNTIME_ENVIRONMENT_KEYS.configurationId];
  const rawCapabilities = environmentVariables[RUNTIME_ENVIRONMENT_KEYS.capabilities];
  if (!isIdentifier(configurationId) || typeof rawCapabilities !== "string") {
    return rejection("MissingConfiguration", environment);
  }

  const capabilities = parseCapabilities(rawCapabilities);
  if (capabilities === null) return rejection("UnknownCapability", environment);
  if (capabilities.some((capability) => !ALLOWED_CAPABILITIES.has(capability))) {
    return rejection("ContradictoryCapability", environment);
  }

  const credentialAvailability = parseCredentialAvailability(input.credentialAvailability);
  if (credentialAvailability === null) return rejection("InvalidInput", environment);

  const testDatabaseReference = environmentVariables[
    RUNTIME_ENVIRONMENT_KEYS.testDatabaseCredentialReference
  ];
  if (
    testDatabaseReference !== undefined
    && !isCredentialReference(testDatabaseReference)
  ) return rejection("InvalidCredentialReference", environment);

  if (credentialAvailability.some((receipt) => receipt.purpose !== "test-database")) {
    return rejection("CredentialNotAllowed", environment);
  }

  const testDatabaseReceipt = credentialAvailability.find((receipt) =>
    receipt.purpose === "test-database");
  const durableCapabilityRequested = capabilities.includes(
    "fictional-durable-activated-path",
  );
  if (
    durableCapabilityRequested
    && (testDatabaseReference === undefined || testDatabaseReceipt === undefined)
  ) return rejection("MissingCredential", environment);
  if (durableCapabilityRequested && testDatabaseReceipt?.state === "unavailable") {
    return rejection("CredentialUnavailable", environment);
  }
  if (durableCapabilityRequested && testDatabaseReceipt?.state === "revoked") {
    return rejection("CredentialRevoked", environment);
  }

  const checkedCredentialPurposes = credentialAvailability
    .map((receipt) => receipt.purpose)
    .sort();
  const suppliedConfigurationKeys = Object.keys(environmentVariables)
    .filter((key) => KNOWN_ENVIRONMENT_KEYS.has(key))
    .sort();
  const publicConfiguration: PublicRuntimeConfiguration = deepFreeze({
    version: RUNTIME_CONFIGURATION_VERSION,
    environment,
    capabilities: [...capabilities],
    customerResponseReleaseAuthorized: false as const,
    externalActionAuthorized: false as const,
    providerNetworkAuthorized: false as const,
  });
  const provenance: RuntimeConfigurationProvenance = deepFreeze({
    source: "explicit-process-environment-snapshot" as const,
    configurationId,
    suppliedConfigurationKeys,
    checkedCredentialPurposes,
    secretValuesRetained: false as const,
  });
  const configuration: ValidatedRuntimeConfiguration = deepFreeze({
    version: RUNTIME_CONFIGURATION_VERSION,
    environment,
    configurationId,
    capabilities: [...capabilities],
    credentialReferences: {
      testDatabase: typeof testDatabaseReference === "string"
        ? testDatabaseReference
        : null,
    },
    publicConfiguration,
    provenance,
    controlledEvaluationExecutionAuthorized: false as const,
    productionRuntimeAuthorized: false as const,
    productionDatabaseAuthorized: false as const,
    protectedDataAuthorized: false as const,
    customerResponseReleaseAuthorized: false as const,
    externalActionAuthorized: false as const,
  });

  return deepFreeze({ status: "ready" as const, configuration });
}

function parseCapabilities(value: string): AllowedRuntimeCapability[] | null {
  if (value === "") return [];
  const values = value.split(",");
  if (
    values.some((capability) => capability !== capability.trim() || capability === "")
    || new Set(values).size !== values.length
    || values.some((capability) => !RUNTIME_CAPABILITIES.includes(
      capability as RuntimeCapability,
    ))
  ) return null;
  return values as AllowedRuntimeCapability[];
}

function parseCredentialAvailability(
  value: unknown,
): RuntimeCredentialAvailability[] | null {
  if (!Array.isArray(value)) return null;
  const results: RuntimeCredentialAvailability[] = [];
  for (const item of value) {
    if (!isPlainRecord(item) || !hasExactKeys(item, ["purpose", "state"])) return null;
    if (
      typeof item.purpose !== "string"
      || !RUNTIME_CREDENTIAL_PURPOSES.includes(item.purpose as RuntimeCredentialPurpose)
      || (item.state !== "available" && item.state !== "unavailable" && item.state !== "revoked")
      || results.some((receipt) => receipt.purpose === item.purpose)
    ) return null;
    results.push({
      purpose: item.purpose as RuntimeCredentialPurpose,
      state: item.state,
    });
  }
  return results;
}

function rejection(
  reason: RuntimeConfigurationRejectionReason,
  environment: RuntimeEnvironment | null,
): RuntimeConfigurationDecision {
  return deepFreeze({
    status: "rejected" as const,
    reason,
    errors: [safeError(reason)],
    environment,
    startupAuthorized: false as const,
    controlledEvaluationExecutionAuthorized: false as const,
    productionRuntimeAuthorized: false as const,
    productionDatabaseAuthorized: false as const,
    protectedDataAuthorized: false as const,
    customerResponseReleaseAuthorized: false as const,
    externalActionAuthorized: false as const,
  });
}

function safeError(reason: RuntimeConfigurationRejectionReason): string {
  const messages: Record<RuntimeConfigurationRejectionReason, string> = {
    InvalidInput: "Runtime configuration is invalid.",
    MissingConfiguration: "Required runtime configuration is unavailable.",
    UnknownEnvironment: "Runtime environment is unavailable.",
    EnvironmentUnauthorized: "This runtime environment is not authorized.",
    ProductionUnauthorized: "Production runtime is not authorized.",
    UnknownCapability: "Runtime capability configuration is invalid.",
    ContradictoryCapability: "Runtime capability configuration is not authorized.",
    InvalidCredentialReference: "Runtime credential reference is invalid.",
    CredentialNotAllowed: "Runtime credential is not allowed in this environment.",
    CredentialUnavailable: "Required runtime credential is unavailable.",
    CredentialRevoked: "Required runtime credential is revoked.",
    MissingCredential: "Required runtime credential is unavailable.",
  };
  return messages[reason];
}

function hasUnknownNamespacedKey(value: Readonly<Record<string, unknown>>): boolean {
  return Object.keys(value).some((key) =>
    key.startsWith("AI_RECEPTIONIST_") && !KNOWN_ENVIRONMENT_KEYS.has(key));
}

function isCredentialReference(value: unknown): value is string {
  return typeof value === "string"
    && value === value.trim()
    && value.length > 0
    && value.length <= 200
    && /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value);
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string"
    && value === value.trim()
    && value.length > 0
    && value.length <= 160
    && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function hasExactKeys(
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

function deepFreeze<Value>(value: Value): Value {
  if (value && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
