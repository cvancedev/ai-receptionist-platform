import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CONTROLLED_EVALUATION_ACTORS,
  CONTROLLED_EVALUATION_CAPABILITIES,
  CONTROLLED_EVALUATION_DATA_CLASSES,
  CONTROLLED_EVALUATION_DATA_DECISIONS,
  CONTROLLED_EVALUATION_ENVIRONMENTS,
  CONTROLLED_EVALUATION_POLICY_VERSION,
  evaluateControlledEvaluationRequest,
  type ControlledEvaluationRequest,
  type ControlledEvaluationRejectionReason,
} from "../security/controlled-evaluation-policy";

function run(): void {
  verifyAllowedFictionalBoundary();
  verifyDataClassificationBoundary();
  verifyCapabilityBoundary();
  verifyActorEnvironmentAndControlBoundary();
  verifyMalformedInputBoundary();
  verifyAuthorityAndCapabilitySurface();
  console.log("Sprint 9.1 controlled-evaluation policy verification passed.");
}

function verifyAllowedFictionalBoundary(): void {
  for (const actor of CONTROLLED_EVALUATION_ACTORS) {
    for (const environment of ["local", "test"] as const) {
      const request = allowedRequest({ actor, environment });
      const result = evaluateControlledEvaluationRequest(request);
      assert(
        result.status === "conforms"
          && result.decision === "within-planned-fictional-boundary"
          && result.actor === actor
          && result.environment === environment
          && result.dataClassifications.join(",")
            === "fictional-test-data,operational-audit-evidence"
          && result.capabilities.includes("deterministic-mock")
          && result.capabilities.includes("fictional-durable-activated-path")
          && !result.evaluationExecutionAuthorized
          && !result.productionLikeRuntimeAuthorized
          && !result.protectedDataAuthorized
          && !result.customerResponseReleaseAuthorized
          && !result.externalActionAuthorized,
        "moderated fictional local/test proposal conforms without gaining execution authority",
      );
      assertDeeplyFrozen(result, "conforming policy result");
    }
  }
}

function verifyDataClassificationBoundary(): void {
  assert(
    CONTROLLED_EVALUATION_DATA_DECISIONS.length === 7
      && CONTROLLED_EVALUATION_DATA_DECISIONS.map((decision) => decision.classification)
        .join(",") === CONTROLLED_EVALUATION_DATA_CLASSES.join(","),
    "all required data classifications have an explicit decision",
  );
  for (const decision of CONTROLLED_EVALUATION_DATA_DECISIONS) {
    const expected = decision.classification === "fictional-test-data"
      || decision.classification === "operational-audit-evidence";
    assert(
      decision.permittedInPlannedFictionalBoundary === expected
        && !decision.releaseAuthorized,
      `${decision.classification} has the expected no-release classification`,
    );
  }

  for (const classification of CONTROLLED_EVALUATION_DATA_CLASSES) {
    if (classification === "fictional-test-data"
      || classification === "operational-audit-evidence") continue;
    assertRejected(
      evaluateControlledEvaluationRequest(allowedRequest({
        dataClassifications: ["fictional-test-data", classification],
      })),
      "DataNotAllowed",
      `prohibited ${classification}`,
    );
  }
  assertRejected(
    evaluateControlledEvaluationRequest(allowedRequest({
      dataClassifications: ["operational-audit-evidence"],
    })),
    "DataNotAllowed",
    "evidence without fictional source data",
  );
}

function verifyCapabilityBoundary(): void {
  const allowed = new Set([
    "local-fictional-experience",
    "deterministic-mock",
    "fictional-durable-activated-path",
    "bounded-operational-evidence",
  ]);
  for (const capability of CONTROLLED_EVALUATION_CAPABILITIES) {
    if (allowed.has(capability)) continue;
    assertRejected(
      evaluateControlledEvaluationRequest(allowedRequest({
        capabilities: ["local-fictional-experience", capability],
      })),
      "CapabilityNotAllowed",
      `prohibited ${capability}`,
    );
  }
  assertRejected(
    evaluateControlledEvaluationRequest(allowedRequest({ capabilities: ["deterministic-mock"] })),
    "CapabilityNotAllowed",
    "missing bounded experience surface",
  );
}

function verifyActorEnvironmentAndControlBoundary(): void {
  for (const environment of CONTROLLED_EVALUATION_ENVIRONMENTS) {
    if (environment === "local" || environment === "test") continue;
    assertRejected(
      evaluateControlledEvaluationRequest(allowedRequest({ environment })),
      "EnvironmentNotAllowed",
      `${environment} environment`,
    );
  }
  assertRejected(
    evaluateControlledEvaluationRequest({ ...allowedRequest(), actor: "anonymous-public" }),
    "ActorNotAllowed",
    "unknown participant",
  );
  assertRejected(
    evaluateControlledEvaluationRequest(allowedRequest({ moderated: false })),
    "ModerationRequired",
    "unmoderated session",
  );
  assertRejected(
    evaluateControlledEvaluationRequest(allowedRequest({ fictionalDataOnly: false })),
    "FictionalDataRequired",
    "non-fictional data",
  );
  assertRejected(
    evaluateControlledEvaluationRequest(allowedRequest({
      customerResponseReleaseAuthorized: true,
    })),
    "CustomerResponseReleaseProhibited",
    "customer response release",
  );
  assertRejected(
    evaluateControlledEvaluationRequest(allowedRequest({ externalActionAuthorized: true })),
    "ExternalActionProhibited",
    "external action",
  );
}

function verifyMalformedInputBoundary(): void {
  const hostile = new Proxy({}, {
    getPrototypeOf() { throw new Error("hostile input"); },
  });
  for (const malformed of [
    null,
    {},
    hostile,
    { ...allowedRequest(), unexpected: true },
    { ...allowedRequest(), requestId: " padded " },
    { ...allowedRequest(), policyVersion: "unknown-policy" },
    { ...allowedRequest(), dataClassifications: [] },
    { ...allowedRequest(), capabilities: [] },
    { ...allowedRequest(), dataClassifications: ["fictional-test-data", "fictional-test-data"] },
    { ...allowedRequest(), capabilities: ["local-fictional-experience", "local-fictional-experience"] },
  ]) assertRejected(
    evaluateControlledEvaluationRequest(malformed),
    "InvalidRequest",
    "malformed request",
  );
}

function verifyAuthorityAndCapabilitySurface(): void {
  for (const policySurface of [
    CONTROLLED_EVALUATION_ACTORS,
    CONTROLLED_EVALUATION_ENVIRONMENTS,
    CONTROLLED_EVALUATION_DATA_CLASSES,
    CONTROLLED_EVALUATION_CAPABILITIES,
    CONTROLLED_EVALUATION_DATA_DECISIONS,
  ]) assert(Object.isFrozen(policySurface), "application-owned policy allowlist is immutable");
  const source = readFileSync(
    join(process.cwd(), "src/security/controlled-evaluation-policy.ts"),
    "utf8",
  );
  for (const prohibited of [
    'from "pg"',
    "postgresql",
    "fetch(",
    "process.env",
    "NextRequest",
    "NextResponse",
    "OpenAI",
    "ConversationStateManager",
    "ExecutionJournal",
    "MessageEvidence",
  ]) assert(!source.includes(prohibited), `policy contains no ${prohibited} capability`);
  assert(
    !source.includes("import ")
      && !source.includes("async ")
      && !source.includes("Promise<"),
    "policy is isolated, synchronous, technology-neutral, and has no runtime integration",
  );
}

function allowedRequest(
  overrides: Partial<ControlledEvaluationRequest> = {},
): ControlledEvaluationRequest {
  return {
    policyVersion: CONTROLLED_EVALUATION_POLICY_VERSION,
    requestId: "sprint-9-1-fictional-evaluation-proposal",
    actor: "internal-evaluator",
    environment: "local",
    dataClassifications: ["fictional-test-data", "operational-audit-evidence"],
    capabilities: [
      "local-fictional-experience",
      "deterministic-mock",
      "fictional-durable-activated-path",
      "bounded-operational-evidence",
    ],
    moderated: true,
    fictionalDataOnly: true,
    customerResponseReleaseAuthorized: false,
    externalActionAuthorized: false,
    ...overrides,
  };
}

function assertRejected(
  result: ReturnType<typeof evaluateControlledEvaluationRequest>,
  reason: ControlledEvaluationRejectionReason,
  label: string,
): void {
  assert(
    result.status === "rejected"
      && result.reason === reason
      && result.errors.length === 1
      && !result.evaluationExecutionAuthorized
      && !result.productionLikeRuntimeAuthorized
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
  if (!condition) throw new Error(`Sprint 9.1 verification failed: ${message}`);
}

run();
