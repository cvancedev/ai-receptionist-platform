import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { evaluateProtectedDataAuthorization } from "../server/authorization/protected-data-authorization";
import { evaluateServerRuntimePreflight } from "../server/runtime/runtime-configuration";
import { evaluateIncidentCondition, InMemoryOperationalEvidenceStore } from "../observability/operational-evidence";
import { verifyCertifiedPostgresqlMigrationSources } from "../persistence/postgresql/migration-runner";
import {
  evaluateReleaseReadiness, InMemoryValidationEvidenceStore, RELEASE_GATE_VERSION,
  VALIDATION_REQUIREMENTS, type ValidationRequirement,
} from "../validation-evidence/controlled-validation-gate";

const NOW = "2026-09-05T12:00:00.000Z";

async function run(): Promise<void> {
  verifyIntegratedSecurityBoundary();
  verifyFailureEvidenceCoverage();
  verifyOperationalAndReleaseBoundary();
  await verifyMigrationIntegrity();
  console.log("Sprint 9.8 integrated security, failure, and operational verification passed.");
}

function verifyIntegratedSecurityBoundary(): void {
  const authorization = evaluateProtectedDataAuthorization({
    actor: { type: "business-scoped-actor", actorId: "untrusted-actor", businessId: "business-a", conversationId: "conversation-a", validation: "unvalidated" },
    requestedScope: { businessId: "business-b", conversationId: "conversation-b" },
    operation: "access-protected-data", environment: "automated-test",
    dataClassification: "protected-sensitive-information",
    clientClaims: { authorized: true, secret: "credential-shaped-canary" },
    infrastructureSignals: { runtimeReady: true },
  });
  assert(authorization.status === "denied" && authorization.reason === "BusinessScopeMismatch"
    && !authorization.authorizationGranted && !authorization.protectedDataAuthorized,
  "cross-business/conversation protected access fails closed despite client/runtime claims");
  assert(!JSON.stringify(authorization).includes("credential-shaped-canary"), "authorization denial discards credential-shaped claims");

  const runtime = evaluateServerRuntimePreflight({ environmentVariables: {
    AI_RECEPTIONIST_RUNTIME_ENVIRONMENT: "production",
    AI_RECEPTIONIST_RUNTIME_CONFIGURATION_ID: "production-shaped",
    AI_RECEPTIONIST_RUNTIME_CAPABILITIES: "production-deployment,customer-response-release",
  }, credentialAvailability: [] });
  assert(runtime.status === "rejected" && !runtime.productionRuntimeAuthorized
    && !runtime.customerResponseReleaseAuthorized && !runtime.externalActionAuthorized,
  "runtime identity and requested capabilities grant no authority");

  const source = [read("src/validation-evidence/controlled-validation-gate.ts"), read("src/observability/operational-evidence.ts")].join("\n");
  for (const prohibited of ["ConversationStateManager", "StateExecutor", 'from "pg"', "fetch(", "process.env", "releaseCustomer", "dispatch("]) {
    assert(!source.includes(prohibited), `subordinate evidence cannot use ${prohibited}`);
  }
}

function verifyFailureEvidenceCoverage(): void {
  const required: readonly [string, readonly string[]][] = [
    ["src/verification/end-to-end-failure-security-recovery.verify.ts", ["wrong-business", "wrong-conversation", "stale revision", "duplicate turn", "message failure rolls back", "database-unavailable", "fixture fallback"]],
    ["src/verification/runtime-configuration.verify.ts", ["missing", "unavailable", "revoked", "production", "secret"]],
    ["src/verification/operational-postgresql-readiness.verify.ts", ["checksum mismatch", "unknown migration source"]],
    ["src/verification/sprint-9-6-hardening.verify.ts", ["oversized", "overlapping duplicate", "does not mutate authoritative"]],
    ["src/verification/controlled-validation-gate.verify.ts", ["malformed", "duplicate", "contradictory", "stale", "unknown classification", "mixed classification", "manual review"]],
  ];
  for (const [file, phrases] of required) {
    const source = read(file);
    for (const phrase of phrases) assert(source.includes(phrase), `${file} retains ${phrase} failure evidence`);
  }
  const prototype = read("components/prototype/PrototypeChat.tsx");
  assert(prototype.includes("fails closed instead of substituting fixture data"), "durable UI remains fail-closed without fixture fallback");
}

function verifyOperationalAndReleaseBoundary(): void {
  const operational = new InMemoryOperationalEvidenceStore();
  operational.record({ eventType: "operation-failed", subsystem: "persistence", outcome: "failure",
    reasonCode: "dependency-unavailable", correlationId: "integrated-fictional", environment: "automated-test",
    occurredAt: NOW, evidenceClass: "fictional-operational", untrustedContext: { secret: "secret-canary" } });
  const snapshot = operational.snapshot();
  assert(snapshot.length === 1 && !snapshot[0]!.replayAuthorized && !snapshot[0]!.authorizationAuthority,
    "operational evidence remains bounded and non-authoritative");
  assert(!JSON.stringify(snapshot).includes("secret-canary"), "operational evidence discards secret-shaped context");
  assert(evaluateIncidentCondition({ condition: "authorization-bypass" }).controlledEvaluationBlocked,
    "incident condition blocks controlled evaluation");

  const validation = new InMemoryValidationEvidenceStore();
  for (const requirement of VALIDATION_REQUIREMENTS) {
    const manual = requirement === "accessibility-review" || requirement === "usability-review";
    const result = validation.record(validationInput(requirement, manual));
    assert(result.status === "recorded", `${requirement} current evidence records`);
  }
  const before = JSON.stringify(validation.snapshot());
  const gate = evaluateReleaseReadiness({ gateVersion: RELEASE_GATE_VERSION, asOf: NOW, evidence: validation.snapshot() });
  assert(gate.status === "READY_FOR_CONTROLLED_EVALUATION" && gate.reasonCodes.includes("mandatory-fictional-evidence-passed")
    && gate.missingRequirements.length === 0,
  "current release gate recommends controlled evaluation after all mandatory evidence passed");
  assert(gate.recommendationOnly && !gate.evaluationExecutionAuthorized && !gate.productionAuthorized
    && !gate.customerResponseReleaseAuthorized && !gate.deploymentAuthorized && !gate.externalActionAuthorized,
  "release gate has no execution or side-effect authority");
  assert(JSON.stringify(validation.snapshot()) === before, "release evaluation performs no evidence mutation");
}

async function verifyMigrationIntegrity(): Promise<void> {
  const migrations = readdirSync(join(process.cwd(), "database/migrations")).sort();
  assert(migrations.length === 7 && migrations.every((file, index) => file.startsWith(String(index + 1).padStart(3, "0"))),
    "migration history remains exactly 001-007");
  await verifyCertifiedPostgresqlMigrationSources();
}

function validationInput(requirement: ValidationRequirement, manual: boolean) {
  const failClosed = /invalid|oversized|duplicate|overlapping|missing|rejected|failure|denial/.test(requirement);
  const expected = manual ? "manual-pass" : failClosed ? "fail-closed" : "safe-success";
  return { scenarioId: `integrated-${requirement}`, requirement, scenarioCategory: manual ? (requirement === "accessibility-review" ? "accessibility" : "usability") : "reliability",
    expectedOutcome: expected, observedOutcome: expected, result: "pass",
    reasonCode: "verified", evaluatorRole: manual ? "internal-manual-reviewer" : "automated-verifier",
    environment: "automated-test", dataClassification: "fictional-test-data", configurationReferences: ["sprint-9-integrated"],
    occurredAt: NOW, manualReviewRequired: manual, observationCategory: manual ? "human-comprehension" : "reliability",
    releaseGateRelevance: "mandatory", untrustedContent: {} };
}
function read(path: string): string { return readFileSync(join(process.cwd(), path), "utf8"); }
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(`Sprint 9.8 verification failed: ${message}.`); }
run().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
