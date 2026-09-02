import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  RUNTIME_CAPABILITIES,
  RUNTIME_CONFIGURATION_VERSION,
  RUNTIME_CREDENTIAL_PURPOSES,
  RUNTIME_ENVIRONMENT_KEYS,
  SUPPORTED_RUNTIME_ENVIRONMENTS,
  classifyRuntimeEnvironmentIdentity,
  evaluateServerRuntimePreflight,
  type RuntimeConfigurationInput,
  type RuntimeConfigurationRejectionReason,
  type RuntimeEnvironment,
} from "../server/runtime/runtime-configuration";

function run(): void {
  verifyEnvironmentIdentityAndStartupBoundary();
  verifyCapabilityBoundary();
  verifyCredentialBoundary();
  verifyMalformedAndHostileInput();
  verifyPublicAndAuthorityBoundaries();
  console.log("Sprint 9.2 runtime configuration verification passed.");
}

function verifyEnvironmentIdentityAndStartupBoundary(): void {
  for (const environment of SUPPORTED_RUNTIME_ENVIRONMENTS) {
    const identity = classifyRuntimeEnvironmentIdentity(environment);
    assert(
      identity.status === "recognized"
        && identity.environment === environment
        && Object.isFrozen(identity),
      `${environment} identity is explicitly recognized without implying authority`,
    );
  }
  for (const unknown of [undefined, null, "", "development", "staging", "PRODUCTION"]) {
    const identity = classifyRuntimeEnvironmentIdentity(unknown);
    assert(
      identity.status === "rejected" && identity.environment === null,
      "unknown environment identity fails closed",
    );
  }

  for (const environment of ["local-development", "automated-test"] as const) {
    const result = evaluateServerRuntimePreflight(validInput(environment));
    assert(
      result.status === "ready"
        && result.configuration.environment === environment
        && result.configuration.version === RUNTIME_CONFIGURATION_VERSION
        && result.configuration.capabilities.join(",") === "deterministic-fixture-prototype"
        && !result.configuration.controlledEvaluationExecutionAuthorized
        && !result.configuration.productionRuntimeAuthorized
        && !result.configuration.productionDatabaseAuthorized
        && !result.configuration.protectedDataAuthorized
        && !result.configuration.customerResponseReleaseAuthorized
        && !result.configuration.externalActionAuthorized,
      `${environment} accepts only its explicit bounded capability`,
    );
    assertDeeplyFrozen(result, `${environment} configuration`);
  }

  assertRejected(
    evaluateServerRuntimePreflight(validInput("controlled-evaluation")),
    "EnvironmentUnauthorized",
    "controlled evaluation remains unauthorized pending later gates",
  );
  assertRejected(
    evaluateServerRuntimePreflight(validInput("production")),
    "ProductionUnauthorized",
    "production remains unauthorized",
  );

  const misleadingInfrastructure = validInput("local-development", {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://not-authority.invalid/example",
    VERCEL_ENV: "production",
    HOSTNAME: "production-host",
  });
  const result = evaluateServerRuntimePreflight(misleadingInfrastructure);
  assert(
    result.status === "ready" && result.configuration.environment === "local-development",
    "infrastructure signals cannot override explicit application environment identity",
  );
}

function verifyCapabilityBoundary(): void {
  const allowed = new Set([
    "deterministic-fixture-prototype",
    "fictional-durable-activated-path",
    "bounded-operational-evidence",
  ]);
  for (const capability of RUNTIME_CAPABILITIES) {
    if (allowed.has(capability)) continue;
    assertRejected(
      evaluateServerRuntimePreflight(validInput("local-development", {
        [RUNTIME_ENVIRONMENT_KEYS.capabilities]:
          `deterministic-fixture-prototype,${capability}`,
      })),
      "ContradictoryCapability",
      `${capability} is denied by default`,
    );
  }
  for (const malformed of [
    "unknown-capability",
    "deterministic-fixture-prototype,deterministic-fixture-prototype",
    "deterministic-fixture-prototype, bounded-operational-evidence",
  ]) assertRejected(
    evaluateServerRuntimePreflight(validInput("automated-test", {
      [RUNTIME_ENVIRONMENT_KEYS.capabilities]: malformed,
    })),
    "UnknownCapability",
    "unknown or malformed capability configuration",
  );
}

function verifyCredentialBoundary(): void {
  const referenceCanary = "verification-only/test-database-reference";
  const durable = validInput("automated-test", {
    [RUNTIME_ENVIRONMENT_KEYS.capabilities]: "fictional-durable-activated-path",
    [RUNTIME_ENVIRONMENT_KEYS.testDatabaseCredentialReference]: referenceCanary,
  }, [{ purpose: "test-database", state: "available" }]);
  const ready = evaluateServerRuntimePreflight(durable);
  assert(
    ready.status === "ready"
      && ready.configuration.capabilities.join(",") === "fictional-durable-activated-path"
      && ready.configuration.credentialReferences.testDatabase === referenceCanary
      && !JSON.stringify(ready.configuration.publicConfiguration).includes(referenceCanary)
      && !JSON.stringify(ready.configuration.provenance).includes(referenceCanary),
    "available test credential satisfies only the requested durable capability and stays server-only",
  );

  const presentWithoutCapability = evaluateServerRuntimePreflight(validInput(
    "automated-test",
    { [RUNTIME_ENVIRONMENT_KEYS.testDatabaseCredentialReference]: referenceCanary },
    [{ purpose: "test-database", state: "available" }],
  ));
  assert(
    presentWithoutCapability.status === "ready"
      && !presentWithoutCapability.configuration.capabilities.includes(
        "fictional-durable-activated-path",
      ),
    "credential presence cannot grant capability authority",
  );

  assertRejected(
    evaluateServerRuntimePreflight(validInput("automated-test", {
      [RUNTIME_ENVIRONMENT_KEYS.capabilities]: "fictional-durable-activated-path",
    })),
    "MissingCredential",
    "missing credential reference",
  );
  for (const state of ["unavailable", "revoked"] as const) {
    assertRejected(
      evaluateServerRuntimePreflight(validInput("automated-test", {
        [RUNTIME_ENVIRONMENT_KEYS.capabilities]: "fictional-durable-activated-path",
        [RUNTIME_ENVIRONMENT_KEYS.testDatabaseCredentialReference]: referenceCanary,
      }, [{ purpose: "test-database", state }])),
      state === "revoked" ? "CredentialRevoked" : "CredentialUnavailable",
      `${state} credential`,
    );
  }
  for (const purpose of RUNTIME_CREDENTIAL_PURPOSES) {
    if (purpose === "test-database") continue;
    assertRejected(
      evaluateServerRuntimePreflight(validInput(
        "local-development",
        {},
        [{ purpose, state: "available" }],
      )),
      "CredentialNotAllowed",
      `${purpose} credential is outside Sprint 9.2`,
    );
  }
}

function verifyMalformedAndHostileInput(): void {
  const hostile = new Proxy({}, {
    getPrototypeOf() { throw new Error("secret-value-canary"); },
  });
  const malformed: readonly Readonly<{
    value: unknown;
    reason: RuntimeConfigurationRejectionReason;
  }>[] = [
    { value: null, reason: "InvalidInput" },
    { value: {}, reason: "InvalidInput" },
    { value: hostile, reason: "InvalidInput" },
    { value: { ...validInput("local-development"), unexpected: true }, reason: "InvalidInput" },
    {
      value: validInput("local-development", {
        AI_RECEPTIONIST_UNKNOWN_SECRET: "secret-value-canary",
      }),
      reason: "InvalidInput",
    },
    {
      value: validInput("local-development", {
        [RUNTIME_ENVIRONMENT_KEYS.configurationId]: " padded ",
      }),
      reason: "MissingConfiguration",
    },
    {
      value: validInput("local-development", {
        [RUNTIME_ENVIRONMENT_KEYS.testDatabaseCredentialReference]:
          "secret value with spaces",
      }),
      reason: "InvalidCredentialReference",
    },
    { value: { environmentVariables: hostile, credentialAvailability: [] }, reason: "InvalidInput" },
    { value: { environmentVariables: {}, credentialAvailability: hostile }, reason: "MissingConfiguration" },
    {
      value: validInput("local-development", {}, [
        { purpose: "test-database", state: "available" },
        { purpose: "test-database", state: "available" },
      ]),
      reason: "InvalidInput",
    },
  ];
  for (const testCase of malformed) {
    const result = evaluateServerRuntimePreflight(testCase.value);
    assertRejected(result, testCase.reason, "malformed or hostile configuration");
    assert(
      !JSON.stringify(result).includes("secret-value-canary"),
      "safe failure never echoes rejected secret-shaped input",
    );
  }
}

function verifyPublicAndAuthorityBoundaries(): void {
  for (const surface of [
    SUPPORTED_RUNTIME_ENVIRONMENTS,
    RUNTIME_CAPABILITIES,
    RUNTIME_CREDENTIAL_PURPOSES,
    RUNTIME_ENVIRONMENT_KEYS,
  ]) assert(Object.isFrozen(surface), "runtime allowlists and keys are immutable");

  const sourcePath = join(
    process.cwd(),
    "src/server/runtime/runtime-configuration.ts",
  );
  const source = readFileSync(sourcePath, "utf8");
  for (const prohibited of [
    "process.env",
    'from "pg"',
    "fetch(",
    "NextRequest",
    "NextResponse",
    "ConversationState",
    "BusinessProfile",
    "KnowledgeRecord",
    "ExecutionJournal",
    "StateExecutor",
  ]) assert(!source.includes(prohibited), `runtime boundary has no ${prohibited} authority`);

  for (const file of clientFacingFiles()) {
    const content = readFileSync(file, "utf8");
    assert(
      !content.includes("server/runtime/runtime-configuration")
        && !content.includes("AI_RECEPTIONIST_")
        && !content.includes("TEST_DATABASE_URL"),
      `${file} cannot import or expose server runtime configuration`,
    );
  }
}

function validInput(
  environment: RuntimeEnvironment,
  overrides: Readonly<Record<string, unknown>> = {},
  credentialAvailability: readonly unknown[] = [],
): RuntimeConfigurationInput {
  return {
    environmentVariables: {
      [RUNTIME_ENVIRONMENT_KEYS.environment]: environment,
      [RUNTIME_ENVIRONMENT_KEYS.configurationId]: `sprint-9-2-${environment}`,
      [RUNTIME_ENVIRONMENT_KEYS.capabilities]: "deterministic-fixture-prototype",
      ...overrides,
    },
    credentialAvailability,
  };
}

function clientFacingFiles(): string[] {
  return [
    ...collectFiles(join(process.cwd(), "app")),
    ...collectFiles(join(process.cwd(), "components")),
    ...collectFiles(join(process.cwd(), "src/prototype-ui")),
  ];
}

function collectFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(path));
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(path);
  }
  return files;
}

function assertRejected(
  result: ReturnType<typeof evaluateServerRuntimePreflight>,
  reason: RuntimeConfigurationRejectionReason,
  label: string,
): void {
  assert(
    result.status === "rejected"
      && result.reason === reason
      && result.errors.length === 1
      && !result.startupAuthorized
      && !result.controlledEvaluationExecutionAuthorized
      && !result.productionRuntimeAuthorized
      && !result.productionDatabaseAuthorized
      && !result.protectedDataAuthorized
      && !result.customerResponseReleaseAuthorized
      && !result.externalActionAuthorized,
    `${label} fails closed`,
  );
  assertDeeplyFrozen(result, `${label} rejection`);
}

function assertDeeplyFrozen(value: unknown, label: string): void {
  assert(value !== null && typeof value === "object" && Object.isFrozen(value), `${label} frozen`);
  for (const child of Object.values(value as Record<string, unknown>)) {
    if (child && typeof child === "object") assertDeeplyFrozen(child, label);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Sprint 9.2 verification failed: ${message}`);
}

run();
