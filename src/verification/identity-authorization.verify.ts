import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  ACTOR_TYPES,
  AUTHORIZATION_DATA_CLASSIFICATIONS,
  AUTHORIZATION_ENVIRONMENTS,
  AUTHORIZATION_OPERATIONS,
  evaluateProtectedDataAuthorization,
  type AuthorizationRejectionReason,
} from "../server/authorization/protected-data-authorization";

function run(): void {
  verifyActorsAndIdentity();
  verifyExactScope();
  verifyProtectedDataGate();
  verifyNonAuthorityInputs();
  verifyHostileInputAndSeparation();
  console.log("Sprint 9.3 identity and authorization gate verification passed.");
}

function verifyActorsAndIdentity(): void {
  for (const type of ACTOR_TYPES) {
    const result = evaluateProtectedDataAuthorization(validInput({ type }));
    assertDenied(
      result,
      type === "anonymous-untrusted" ? "ActorIneligible" : "EvaluationExecutionUnauthorized",
      `${type} identity grants no protected authority`,
    );
  }
  assertDenied(
    evaluateProtectedDataAuthorization(validInput({ type: "unknown-actor" })),
    "UnknownActorType",
    "unknown actor type",
  );
  assertDenied(
    evaluateProtectedDataAuthorization(validInput({ actorId: null })),
    "IdentityNotValidated",
    "a named actor still requires validated identity",
  );
}

function verifyExactScope(): void {
  assertDenied(
    evaluateProtectedDataAuthorization(validInput({ businessId: "other-business" })),
    "BusinessScopeMismatch",
    "business scope mismatch",
  );
  assertDenied(
    evaluateProtectedDataAuthorization(validInput({ conversationId: "other-conversation" })),
    "ConversationScopeMismatch",
    "conversation scope mismatch",
  );
  const exact = evaluateProtectedDataAuthorization(validInput());
  assertDenied(
    exact,
    "EvaluationExecutionUnauthorized",
    "exact scope does not itself grant authority",
  );
}

function verifyProtectedDataGate(): void {
  for (const classification of [
    "protected-sensitive-information",
    "credential-secret",
  ] as const) assertDenied(
    evaluateProtectedDataAuthorization(validInput({}, { dataClassification: classification })),
    "ProtectedDataProhibited",
    `${classification} remains prohibited`,
  );
  assertDenied(
    evaluateProtectedDataAuthorization(validInput({}, { dataClassification: "unknown-mixed" })),
    "UnknownDataClassification",
    "unknown or mixed classification",
  );
  assertDenied(
    evaluateProtectedDataAuthorization(validInput({}, { operation: "access-protected-data" })),
    "ProtectedDataProhibited",
    "protected-data operation",
  );
  assertDenied(
    evaluateProtectedDataAuthorization(validInput({}, { operation: "administer-business" })),
    "AdministrationProhibited",
    "administration",
  );
  assertDenied(
    evaluateProtectedDataAuthorization(validInput({}, {
      operation: "access-non-public-conversation",
    })),
    "NonPublicConversationProhibited",
    "non-public conversation access",
  );
}

function verifyNonAuthorityInputs(): void {
  const canary = "client-secret-authority-canary";
  const result = evaluateProtectedDataAuthorization(validInput({}, {
    clientClaims: {
      authenticated: true,
      role: "admin",
      protectedDataAuthorized: true,
      token: canary,
    },
    infrastructureSignals: {
      environmentAuthorized: true,
      credentialPresent: true,
      runtimeConfigurationOverride: "authorize-all",
      databaseRowExists: true,
    },
  }));
  assertDenied(result, "EvaluationExecutionUnauthorized", "claims and infrastructure signals");
  assert(!JSON.stringify(result).includes(canary), "untrusted claims do not leak into decisions");

  for (const environment of AUTHORIZATION_ENVIRONMENTS) {
    const decision = evaluateProtectedDataAuthorization(validInput({}, { environment }));
    assertDenied(
      decision,
      environment === "controlled-evaluation" || environment === "production"
        ? "EnvironmentUnauthorized"
        : "EvaluationExecutionUnauthorized",
      `${environment} identity grants no protected access`,
    );
  }
}

function verifyHostileInputAndSeparation(): void {
  const hostile = new Proxy({}, {
    getPrototypeOf() { throw new Error("hostile-secret-canary"); },
  });
  for (const input of [
    null,
    {},
    hostile,
    { ...validInput(), unexpected: true },
    validInput({}, { actor: hostile }),
    validInput({}, { requestedScope: hostile }),
  ]) {
    const result = evaluateProtectedDataAuthorization(input);
    assertDenied(result, "InvalidInput", "hostile or malformed input");
    assert(!JSON.stringify(result).includes("hostile-secret-canary"), "failure is sanitized");
  }

  for (const collection of [
    ACTOR_TYPES,
    AUTHORIZATION_OPERATIONS,
    AUTHORIZATION_ENVIRONMENTS,
    AUTHORIZATION_DATA_CLASSIFICATIONS,
  ]) assert(Object.isFrozen(collection), "policy allowlists are immutable");

  const source = readFileSync(join(
    process.cwd(),
    "src/server/authorization/protected-data-authorization.ts",
  ), "utf8");
  for (const prohibited of [
    "process.env",
    "fetch(",
    'from "pg"',
    "NextRequest",
    "NextResponse",
    "ConversationState",
    "RuntimeConfiguration",
    "credentialReferences",
  ]) assert(!source.includes(prohibited), `authorization boundary has no ${prohibited} authority`);

  for (const file of clientFacingFiles()) {
    const content = readFileSync(file, "utf8");
    assert(
      !content.includes("server/authorization")
        && !content.includes("evaluateProtectedDataAuthorization"),
      `${file} cannot import server authorization authority`,
    );
  }
}

function validInput(
  actorOverrides: Readonly<Record<string, unknown>> = {},
  inputOverrides: Readonly<Record<string, unknown>> = {},
): Readonly<Record<string, unknown>> {
  return {
    actor: {
      type: "controlled-evaluator",
      actorId: "fictional-evaluator",
      businessId: "fictional-business",
      conversationId: "fictional-conversation",
      validation: "unvalidated",
      ...actorOverrides,
    },
    requestedScope: {
      businessId: "fictional-business",
      conversationId: "fictional-conversation",
    },
    operation: "observe-fictional-evaluation",
    environment: "automated-test",
    dataClassification: "fictional-synthetic",
    clientClaims: {},
    infrastructureSignals: {},
    ...inputOverrides,
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

function assertDenied(
  result: ReturnType<typeof evaluateProtectedDataAuthorization>,
  reason: AuthorizationRejectionReason,
  label: string,
): void {
  assert(
    result.status === "denied"
      && result.reason === reason
      && result.errors.length === 1
      && !result.identityValidated
      && !result.authorizationGranted
      && !result.protectedDataAuthorized
      && !result.administrationAuthorized
      && !result.nonPublicConversationAuthorized
      && !result.controlledEvaluationExecutionAuthorized
      && !result.customerResponseReleaseAuthorized
      && !result.externalActionAuthorized,
    `${label} fails closed`,
  );
  assertDeeplyFrozen(result, label);
}

function assertDeeplyFrozen(value: unknown, label: string): void {
  assert(value !== null && typeof value === "object" && Object.isFrozen(value), `${label} frozen`);
  for (const child of Object.values(value as Record<string, unknown>)) {
    if (child && typeof child === "object") assertDeeplyFrozen(child, label);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Sprint 9.3 verification failed: ${message}`);
}

run();
