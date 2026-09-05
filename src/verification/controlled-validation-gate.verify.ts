import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  evaluateReleaseReadiness,
  InMemoryValidationEvidenceStore,
  MAX_VALIDATION_EVIDENCE_ENTRIES,
  RELEASE_GATE_VERSION,
  VALIDATION_REQUIREMENTS,
  type ValidationEvidence,
  type ValidationRequirement,
} from "../validation-evidence/controlled-validation-gate";

const NOW = "2026-09-05T12:00:00.000Z";

function run(): void {
  verifyEvidenceSanitizationAndBounds();
  verifyCompletenessContradictionAndFreshness();
  verifyBlockingAndManualReview();
  verifyBoundedRecommendationOnly();
  verifyArchitecture();
  console.log("Sprint 9.7 controlled validation evidence and release gate verification passed.");
}

function verifyEvidenceSanitizationAndBounds(): void {
  const canaries = ["customer-content-canary", "postgresql://user:password@host/db", "provider-output-canary", "secret-canary"];
  const store = new InMemoryValidationEvidenceStore();
  const recorded = store.record(input("normal-multi-turn", { untrustedContent: { canaries } }));
  assert(recorded.status === "recorded", "fictional bounded evidence records");
  assertDeeplyFrozen(recorded, "recorded evidence");
  for (const canary of canaries) assert(!JSON.stringify(recorded).includes(canary), `${canary} is discarded`);
  if (recorded.status === "recorded") assertNoAuthority(recorded.evidence);
  assert(store.record(input("normal-multi-turn", { scenarioId: "duplicate-scenario" })).status === "rejected",
    "duplicate requirement cannot inflate readiness");
  for (const dataClassification of ["customer-provided-information", "protected-sensitive-information", "provider-content"]) {
    const result = new InMemoryValidationEvidenceStore().record(input("protected-data-denial", { dataClassification, untrustedContent: canaries }));
    assert(result.status === "rejected" && !JSON.stringify(result).includes(canaries[0]), `${dataClassification} cannot enter evidence`);
  }
  const hostile = new Proxy({}, { ownKeys() { throw new Error("stack-secret-canary"); } });
  const hostileResult = new InMemoryValidationEvidenceStore().record(input("invalid-input", { untrustedContent: hostile }));
  assert(hostileResult.status === "rejected" && !JSON.stringify(hostileResult).includes("stack-secret-canary"),
    "uninspectable content fails closed without exception disclosure");
  for (const malformed of [null, {}, { ...input("invalid-input"), unexpected: true }]) {
    assert(new InMemoryValidationEvidenceStore().record(malformed).status === "rejected", "malformed evidence fails closed");
  }
  assert(MAX_VALIDATION_EVIDENCE_ENTRIES >= VALIDATION_REQUIREMENTS.length, "bounded capacity covers mandatory evidence once");
}

function verifyCompletenessContradictionAndFreshness(): void {
  const incomplete = passingEvidence().slice(0, -1);
  assert(gate(incomplete).status === "NOT_READY", "missing mandatory evidence fails closed as not ready");
  const complete = passingEvidence();
  assert(gate([...complete, complete[0]!]).status === "BLOCKED", "duplicate evidence blocks readiness");
  const reusedScenario = record("correction-flow", { scenarioId: complete[0]!.scenarioId });
  assert(gate([complete[0]!, reusedScenario, ...complete.slice(2)]).status === "BLOCKED",
    "duplicate scenario identity across requirements blocks readiness");
  const alternate = record("normal-multi-turn", { scenarioId: "alternate-normal" });
  assert(gate([alternate, ...complete.slice(1)]).status === "READY_FOR_CONTROLLED_EVALUATION",
    "a single alternate scenario remains coherent");
  assert(gate([complete[0]!, alternate, ...complete.slice(1)]).status === "BLOCKED",
    "contradictory requirement evidence blocks readiness");
  const stale = passingEvidence("2026-08-01T12:00:00.000Z");
  assert(gate(stale).status === "BLOCKED", "stale evidence cannot satisfy current requirements");
  const unknown = replace(complete, "normal-multi-turn", { dataClassification: "unknown" });
  assert(gate(unknown).status === "BLOCKED", "unknown classification blocks readiness");
  const mixed = replace(complete, "normal-multi-turn", { dataClassification: "mixed" });
  assert(gate(mixed).status === "BLOCKED", "mixed classification blocks readiness");
  const malformed = Object.freeze({ ...complete[0], scenarioCategory: "invented-category" });
  assert(gate([malformed as unknown as ValidationEvidence, ...complete.slice(1)]).status === "BLOCKED",
    "malformed frozen evidence cannot produce readiness");
}

function verifyBlockingAndManualReview(): void {
  const blocking: readonly [ValidationRequirement, string][] = [
    ["scope-isolation", "isolation-failure"], ["protected-data-denial", "protected-data-failure"],
    ["error-sanitization", "internal-data-leakage"], ["restart-recovery", "recovery-failure"],
    ["configuration-pinning", "pin-corruption"], ["external-action-denial", "unauthorized-network-provider"],
    ["accessibility-review", "accessibility-failure"], ["usability-review", "usability-blocker"],
    ["runtime-configuration", "runtime-configuration-failure"], ["dependency-security", "dependency-vulnerability"],
    ["incident-readiness", "incident-unresolved"], ["projection-internal-failure", "state-corruption"],
  ];
  for (const [requirement, reasonCode] of blocking) {
    const failed = replace(passingEvidence(), requirement, { result: "fail", reasonCode, observedOutcome: "not-observed" });
    assert(gate(failed).status === "BLOCKED", `${reasonCode} blocks readiness`);
  }
  for (const requirement of ["accessibility-review", "usability-review"] as const) {
    const pending = replace(passingEvidence(), requirement, {
      result: "pending", reasonCode: "manual-review-pending", observedOutcome: "not-observed",
      evaluatorRole: "automated-verifier",
    });
    assert(gate(pending).status === "NOT_READY", `${requirement} pending manual review prevents readiness`);
  }
}

function verifyBoundedRecommendationOnly(): void {
  const evidence = passingEvidence();
  const before = JSON.stringify(evidence);
  const result = gate(evidence);
  assert(result.status === "READY_FOR_CONTROLLED_EVALUATION", "complete synthetic evidence yields bounded recommendation");
  assert(result.recommendationOnly && !result.evaluationExecutionAuthorized && !result.productionAuthorized
    && !result.protectedDataAuthorized && !result.customerResponseReleaseAuthorized
    && !result.deploymentAuthorized && !result.externalActionAuthorized,
  "passing recommendation grants no execution, production, data, release, deployment, or action authority");
  assertDeeplyFrozen(result, "release gate decision");
  assert(JSON.stringify(evidence) === before, "release gate evaluation has no evidence side effect");
}

function verifyArchitecture(): void {
  const source = readFileSync(join(process.cwd(), "src/validation-evidence/controlled-validation-gate.ts"), "utf8");
  for (const prohibited of ["fetch(", 'from "pg"', "process.env", "ConversationState", "ExecutionJournal", "MessageEvidence", "setTimeout(", "setInterval(", "console."]) {
    assert(!source.includes(prohibited), `gate excludes ${prohibited}`);
  }
  const migrations = readdirSync(join(process.cwd(), "database/migrations")).sort();
  assert(migrations.length === 7 && migrations[0]?.startsWith("001_") && migrations[6]?.startsWith("007_"),
    "migration history remains exactly 001-007");
}

function passingEvidence(occurredAt = NOW): readonly ValidationEvidence[] {
  return VALIDATION_REQUIREMENTS.map((requirement) => record(requirement, { occurredAt }));
}
function record(requirement: ValidationRequirement, overrides: Readonly<Record<string, unknown>> = {}): ValidationEvidence {
  const result = new InMemoryValidationEvidenceStore().record(input(requirement, overrides));
  assert(result.status === "recorded", `${requirement} evidence records`);
  return result.evidence;
}
function replace(entries: readonly ValidationEvidence[], requirement: ValidationRequirement, overrides: Readonly<Record<string, unknown>>): readonly ValidationEvidence[] {
  return entries.map((entry) => entry.requirement === requirement ? record(requirement, overrides) : entry);
}
function input(requirement: ValidationRequirement, overrides: Readonly<Record<string, unknown>> = {}): Readonly<Record<string, unknown>> {
  const manual = requirement === "accessibility-review" || requirement === "usability-review";
  const failClosed = ["invalid-input", "oversized-input", "duplicate-submission", "overlapping-submission", "missing-configuration", "rejected-operation", "projection-internal-failure", "protected-data-denial", "external-action-denial"].includes(requirement);
  const expectedOutcome = manual ? "manual-pass" : failClosed ? "fail-closed" : "safe-success";
  return { scenarioId: `scenario-${requirement}`, requirement,
    scenarioCategory: requirement === "accessibility-review" ? "accessibility" : requirement === "usability-review" ? "usability" : requirement.includes("denial") || requirement === "scope-isolation" || requirement === "error-sanitization" ? "security-privacy" : requirement === "runtime-configuration" || requirement === "dependency-security" || requirement === "incident-readiness" ? "operations" : "reliability",
    expectedOutcome, observedOutcome: expectedOutcome, result: "pass", reasonCode: "verified",
    evaluatorRole: manual ? "internal-manual-reviewer" : "automated-verifier", environment: "automated-test",
    dataClassification: "fictional-test-data", configurationReferences: ["profile-fixture-v1"], occurredAt: NOW,
    manualReviewRequired: manual, observationCategory: manual ? "human-comprehension" : "reliability",
    releaseGateRelevance: "mandatory", untrustedContent: {}, ...overrides };
}
function gate(evidence: readonly ValidationEvidence[]) { return evaluateReleaseReadiness({ gateVersion: RELEASE_GATE_VERSION, asOf: NOW, evidence }); }
function assertNoAuthority(evidence: ValidationEvidence): void { assert(!evidence.authoritativeState && !evidence.replayAuthorized && !evidence.authorizationAuthority && !evidence.configurationAuthority && !evidence.releaseAuthorized && !evidence.deploymentAuthorized && !evidence.protectedDataAuthorized && !evidence.customerResponseReleaseAuthorized && !evidence.externalActionAuthorized, "validation evidence has no authority"); }
function assertDeeplyFrozen(value: unknown, label: string): void { assert(value !== null && typeof value === "object" && Object.isFrozen(value), `${label} frozen`); for (const child of Object.values(value as Record<string, unknown>)) if (child && typeof child === "object") assertDeeplyFrozen(child, label); }
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(`Sprint 9.7 verification failed: ${message}.`); }
run();
