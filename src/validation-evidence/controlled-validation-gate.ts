export const VALIDATION_EVIDENCE_VERSION = "sprint-9.7-validation-evidence-v1";
export const RELEASE_GATE_VERSION = "sprint-9.7-release-gate-v1";
export const MAX_VALIDATION_EVIDENCE_ENTRIES = 100;
export const MAX_VALIDATION_EVIDENCE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const VALIDATION_REQUIREMENTS = Object.freeze([
  "normal-multi-turn", "correction-flow", "handoff-escalation", "invalid-input",
  "oversized-input", "duplicate-submission", "overlapping-submission",
  "missing-configuration", "rejected-operation", "projection-internal-failure",
  "restart-recovery", "configuration-pinning", "scope-isolation",
  "error-sanitization", "protected-data-denial", "external-action-denial",
  "accessibility-review", "usability-review", "runtime-configuration",
  "dependency-security", "incident-readiness",
] as const);
export type ValidationRequirement = (typeof VALIDATION_REQUIREMENTS)[number];

export const BLOCKING_REQUIREMENTS = Object.freeze([
  "scope-isolation", "protected-data-denial", "error-sanitization",
  "restart-recovery", "configuration-pinning", "external-action-denial",
  "accessibility-review", "usability-review", "runtime-configuration",
  "dependency-security", "incident-readiness", "projection-internal-failure",
] as const satisfies readonly ValidationRequirement[]);

export const VALIDATION_REASON_CODES = Object.freeze([
  "verified", "manual-review-pending", "requirement-failed", "security-finding",
  "isolation-failure", "authorization-bypass", "protected-data-failure",
  "secret-exposure", "state-corruption", "pin-corruption", "recovery-failure",
  "unsafe-fixture-fallback", "internal-data-leakage", "accessibility-failure",
  "reliability-failure", "usability-blocker", "runtime-configuration-failure",
  "dependency-vulnerability", "unauthorized-network-provider",
  "incident-unresolved", "unknown-classification",
] as const);
export type ValidationReasonCode = (typeof VALIDATION_REASON_CODES)[number];

export interface ValidationEvidence {
  readonly version: typeof VALIDATION_EVIDENCE_VERSION;
  readonly sequence: number;
  readonly scenarioId: string;
  readonly requirement: ValidationRequirement;
  readonly scenarioCategory: "reliability" | "security-privacy" | "accessibility" | "usability" | "operations";
  readonly expectedOutcome: "safe-success" | "safe-rejection" | "fail-closed" | "manual-pass";
  readonly observedOutcome: "safe-success" | "safe-rejection" | "fail-closed" | "manual-pass" | "not-observed";
  readonly result: "pass" | "fail" | "blocked" | "pending";
  readonly reasonCode: ValidationReasonCode;
  readonly evaluatorRole: "automated-verifier" | "internal-manual-reviewer";
  readonly environment: "local" | "automated-test";
  readonly dataClassification: "fictional-test-data" | "unknown" | "mixed";
  readonly configurationReferences: readonly string[];
  readonly occurredAt: string;
  readonly manualReviewRequired: boolean;
  readonly observationCategory: "none" | "keyboard" | "screen-reader" | "contrast-reflow" | "human-comprehension" | "reliability";
  readonly releaseGateRelevance: "mandatory" | "blocking";
  readonly sanitization: Readonly<{ status: "discarded-untrusted-content"; inspectedNodeCount: number; bounded: true }>;
  readonly authoritativeState: false;
  readonly replayAuthorized: false;
  readonly authorizationAuthority: false;
  readonly configurationAuthority: false;
  readonly releaseAuthorized: false;
  readonly deploymentAuthorized: false;
  readonly protectedDataAuthorized: false;
  readonly customerResponseReleaseAuthorized: false;
  readonly externalActionAuthorized: false;
}

export type EvidenceRecordResult =
  | Readonly<{ status: "recorded"; evidence: ValidationEvidence }>
  | Readonly<{ status: "rejected"; reason: "InvalidInput" | "UnknownClassification" | "ProhibitedContentClass" | "SanitizationFailure" | "DuplicateEvidence" | "CapacityUnavailable"; retained: false; errors: readonly string[] }>;

export interface ReleaseGateDecision {
  readonly version: typeof RELEASE_GATE_VERSION;
  readonly status: "BLOCKED" | "NOT_READY" | "READY_FOR_CONTROLLED_EVALUATION";
  readonly reasonCodes: readonly string[];
  readonly missingRequirements: readonly ValidationRequirement[];
  readonly evaluatedEvidenceCount: number;
  readonly recommendationOnly: true;
  readonly evaluationExecutionAuthorized: false;
  readonly productionAuthorized: false;
  readonly protectedDataAuthorized: false;
  readonly customerResponseReleaseAuthorized: false;
  readonly deploymentAuthorized: false;
  readonly externalActionAuthorized: false;
}

export class InMemoryValidationEvidenceStore {
  private entries: ValidationEvidence[] = [];
  private nextSequence = 1;

  record(input: unknown): EvidenceRecordResult {
    const parsed = parseEvidence(input, this.nextSequence);
    if (parsed.status === "rejected") return parsed;
    if (this.entries.some((entry) => entry.scenarioId === parsed.evidence.scenarioId
      || entry.requirement === parsed.evidence.requirement)) {
      return rejection("DuplicateEvidence", "Validation evidence is duplicated.");
    }
    if (this.entries.length >= MAX_VALIDATION_EVIDENCE_ENTRIES) {
      return rejection("CapacityUnavailable", "Validation evidence capacity is unavailable.");
    }
    this.entries.push(parsed.evidence);
    this.nextSequence += 1;
    return parsed;
  }

  snapshot(): readonly ValidationEvidence[] {
    return deepFreeze(this.entries.map((entry) => entry));
  }
}

export function evaluateReleaseReadiness(input: unknown): ReleaseGateDecision {
  try {
    if (!isPlainRecord(input) || !hasExactKeys(input, ["gateVersion", "asOf", "evidence"])
      || input.gateVersion !== RELEASE_GATE_VERSION || parseTimestamp(input.asOf) === null
      || !Array.isArray(input.evidence)) return decision("BLOCKED", ["invalid-gate-input"], [], 0);
    const evidence = input.evidence as unknown[];
    if (evidence.length > MAX_VALIDATION_EVIDENCE_ENTRIES
      || evidence.some((entry) => !isStoredEvidence(entry))) {
      return decision("BLOCKED", ["malformed-evidence"], [], 0);
    }
    const typed = evidence as ValidationEvidence[];
    const keys = new Set<string>();
    const scenarios = new Set<string>();
    if (typed.some((entry) => {
      const key = `${entry.scenarioId}:${entry.requirement}`;
      if (keys.has(key) || scenarios.has(entry.scenarioId)) return true;
      keys.add(key);
      scenarios.add(entry.scenarioId);
      return false;
    })) return decision("BLOCKED", ["duplicate-evidence"], [], typed.length);
    const byRequirement = new Map<ValidationRequirement, ValidationEvidence[]>();
    for (const entry of typed) {
      const values = byRequirement.get(entry.requirement) ?? [];
      values.push(entry);
      byRequirement.set(entry.requirement, values);
    }
    if ([...byRequirement.values()].some((values) => values.length !== 1)) {
      return decision("BLOCKED", ["contradictory-evidence"], [], typed.length);
    }
    const missing = VALIDATION_REQUIREMENTS.filter((requirement) => !byRequirement.has(requirement));
    if (missing.length) return decision("NOT_READY", ["mandatory-evidence-incomplete"], missing, typed.length);
    const asOf = parseTimestamp(input.asOf)!;
    if (typed.some((entry) => {
      const occurredAt = parseTimestamp(entry.occurredAt)!;
      return occurredAt > asOf || asOf - occurredAt > MAX_VALIDATION_EVIDENCE_AGE_MS;
    })) return decision("BLOCKED", ["stale-or-future-evidence"], [], typed.length);
    if (typed.some((entry) => entry.dataClassification !== "fictional-test-data")) {
      return decision("BLOCKED", ["unknown-or-mixed-classification"], [], typed.length);
    }
    const failed = typed.filter((entry) => entry.result === "fail" || entry.result === "blocked");
    if (failed.length) return decision("BLOCKED", unique(failed.map((entry) => entry.reasonCode)), [], typed.length);
    if (typed.some((entry) => entry.result === "pending" || (entry.manualReviewRequired
      && (entry.evaluatorRole !== "internal-manual-reviewer" || entry.observedOutcome !== "manual-pass")))) {
      return decision("NOT_READY", ["required-manual-review-pending"], [], typed.length);
    }
    if (typed.some((entry) => entry.result !== "pass" || entry.reasonCode !== "verified"
      || entry.expectedOutcome !== entry.observedOutcome)) {
      return decision("BLOCKED", ["contradictory-evidence"], [], typed.length);
    }
    return decision("READY_FOR_CONTROLLED_EVALUATION", ["mandatory-fictional-evidence-passed"], [], typed.length);
  } catch {
    return decision("BLOCKED", ["invalid-gate-input"], [], 0);
  }
}

function parseEvidence(input: unknown, sequence: number): EvidenceRecordResult {
  try {
    const keys = ["scenarioId", "requirement", "scenarioCategory", "expectedOutcome", "observedOutcome", "result", "reasonCode", "evaluatorRole", "environment", "dataClassification", "configurationReferences", "occurredAt", "manualReviewRequired", "observationCategory", "releaseGateRelevance", "untrustedContent"];
    if (!isPlainRecord(input) || !hasExactKeys(input, keys)) return rejection("InvalidInput", "Validation evidence input is invalid.");
    if (input.dataClassification === "customer-provided-information" || input.dataClassification === "protected-sensitive-information" || input.dataClassification === "provider-content") {
      return rejection("ProhibitedContentClass", "Validation evidence content class is prohibited.");
    }
    if (input.dataClassification !== "fictional-test-data" && input.dataClassification !== "unknown" && input.dataClassification !== "mixed") {
      return rejection("UnknownClassification", "Validation evidence classification is unavailable.");
    }
    if (!isIdentifier(input.scenarioId) || !VALIDATION_REQUIREMENTS.includes(input.requirement as ValidationRequirement)
      || !includes(["reliability", "security-privacy", "accessibility", "usability", "operations"], input.scenarioCategory)
      || !includes(["safe-success", "safe-rejection", "fail-closed", "manual-pass"], input.expectedOutcome)
      || !includes(["safe-success", "safe-rejection", "fail-closed", "manual-pass", "not-observed"], input.observedOutcome)
      || !includes(["pass", "fail", "blocked", "pending"], input.result)
      || !VALIDATION_REASON_CODES.includes(input.reasonCode as ValidationReasonCode)
      || !includes(["automated-verifier", "internal-manual-reviewer"], input.evaluatorRole)
      || !includes(["local", "automated-test"], input.environment)
      || !isReferences(input.configurationReferences) || parseTimestamp(input.occurredAt) === null
      || typeof input.manualReviewRequired !== "boolean"
      || !includes(["none", "keyboard", "screen-reader", "contrast-reflow", "human-comprehension", "reliability"], input.observationCategory)
      || !includes(["mandatory", "blocking"], input.releaseGateRelevance)) return rejection("InvalidInput", "Validation evidence input is invalid.");
    const inspectedNodeCount = inspectAndDiscard(input.untrustedContent);
    if (inspectedNodeCount === null) return rejection("SanitizationFailure", "Validation evidence could not be sanitized.");
    return deepFreeze({ status: "recorded" as const, evidence: {
      version: VALIDATION_EVIDENCE_VERSION, sequence, scenarioId: input.scenarioId,
      requirement: input.requirement as ValidationRequirement,
      scenarioCategory: input.scenarioCategory as ValidationEvidence["scenarioCategory"],
      expectedOutcome: input.expectedOutcome as ValidationEvidence["expectedOutcome"],
      observedOutcome: input.observedOutcome as ValidationEvidence["observedOutcome"],
      result: input.result as ValidationEvidence["result"],
      reasonCode: input.reasonCode as ValidationReasonCode,
      evaluatorRole: input.evaluatorRole as ValidationEvidence["evaluatorRole"],
      environment: input.environment as ValidationEvidence["environment"],
      dataClassification: input.dataClassification as ValidationEvidence["dataClassification"],
      configurationReferences: [...input.configurationReferences], occurredAt: input.occurredAt as string,
      manualReviewRequired: input.manualReviewRequired,
      observationCategory: input.observationCategory as ValidationEvidence["observationCategory"],
      releaseGateRelevance: input.releaseGateRelevance as ValidationEvidence["releaseGateRelevance"],
      sanitization: { status: "discarded-untrusted-content" as const, inspectedNodeCount, bounded: true as const },
      authoritativeState: false as const, replayAuthorized: false as const, authorizationAuthority: false as const,
      configurationAuthority: false as const, releaseAuthorized: false as const, deploymentAuthorized: false as const,
      protectedDataAuthorized: false as const, customerResponseReleaseAuthorized: false as const,
      externalActionAuthorized: false as const,
    }});
  } catch { return rejection("SanitizationFailure", "Validation evidence could not be sanitized."); }
}

function isStoredEvidence(value: unknown): value is ValidationEvidence {
  if (!isPlainRecord(value) || !hasExactKeys(value, [
    "version", "sequence", "scenarioId", "requirement", "scenarioCategory",
    "expectedOutcome", "observedOutcome", "result", "reasonCode", "evaluatorRole",
    "environment", "dataClassification", "configurationReferences", "occurredAt",
    "manualReviewRequired", "observationCategory", "releaseGateRelevance",
    "sanitization", "authoritativeState", "replayAuthorized", "authorizationAuthority",
    "configurationAuthority", "releaseAuthorized", "deploymentAuthorized",
    "protectedDataAuthorized", "customerResponseReleaseAuthorized", "externalActionAuthorized",
  ])) return false;
  return value.version === VALIDATION_EVIDENCE_VERSION && typeof value.sequence === "number"
    && Number.isSafeInteger(value.sequence) && value.sequence > 0 && isIdentifier(value.scenarioId)
    && VALIDATION_REQUIREMENTS.includes(value.requirement as ValidationRequirement)
    && includes(["reliability", "security-privacy", "accessibility", "usability", "operations"], value.scenarioCategory)
    && includes(["safe-success", "safe-rejection", "fail-closed", "manual-pass"], value.expectedOutcome)
    && includes(["safe-success", "safe-rejection", "fail-closed", "manual-pass", "not-observed"], value.observedOutcome)
    && includes(["pass", "fail", "blocked", "pending"], value.result)
    && VALIDATION_REASON_CODES.includes(value.reasonCode as ValidationReasonCode)
    && includes(["automated-verifier", "internal-manual-reviewer"], value.evaluatorRole)
    && includes(["local", "automated-test"], value.environment)
    && includes(["fictional-test-data", "unknown", "mixed"], value.dataClassification)
    && isReferences(value.configurationReferences) && parseTimestamp(value.occurredAt) !== null
    && typeof value.manualReviewRequired === "boolean"
    && includes(["none", "keyboard", "screen-reader", "contrast-reflow", "human-comprehension", "reliability"], value.observationCategory)
    && includes(["mandatory", "blocking"], value.releaseGateRelevance)
    && isPlainRecord(value.sanitization)
    && hasExactKeys(value.sanitization, ["status", "inspectedNodeCount", "bounded"])
    && value.sanitization.status === "discarded-untrusted-content"
    && Number.isSafeInteger(value.sanitization.inspectedNodeCount)
    && (value.sanitization.inspectedNodeCount as number) > 0
    && (value.sanitization.inspectedNodeCount as number) <= 64
    && value.sanitization.bounded === true && Object.isFrozen(value.sanitization)
    && Object.isFrozen(value.configurationReferences) && Object.isFrozen(value)
    && value.authoritativeState === false && value.replayAuthorized === false
    && value.authorizationAuthority === false && value.configurationAuthority === false
    && value.releaseAuthorized === false && value.deploymentAuthorized === false
    && value.protectedDataAuthorized === false && value.customerResponseReleaseAuthorized === false
    && value.externalActionAuthorized === false;
}

function decision(status: ReleaseGateDecision["status"], reasonCodes: readonly string[], missingRequirements: readonly ValidationRequirement[], count: number): ReleaseGateDecision {
  return deepFreeze({ version: RELEASE_GATE_VERSION, status, reasonCodes: [...reasonCodes], missingRequirements: [...missingRequirements], evaluatedEvidenceCount: count,
    recommendationOnly: true as const, evaluationExecutionAuthorized: false as const, productionAuthorized: false as const,
    protectedDataAuthorized: false as const, customerResponseReleaseAuthorized: false as const,
    deploymentAuthorized: false as const, externalActionAuthorized: false as const });
}

function rejection(reason: Extract<EvidenceRecordResult, { status: "rejected" }>["reason"], error: string): EvidenceRecordResult {
  return deepFreeze({ status: "rejected" as const, reason, retained: false as const, errors: [error] });
}
function inspectAndDiscard(value: unknown): number | null { const seen = new WeakSet<object>(); let count = 0; const visit = (item: unknown, depth: number): boolean => { count += 1; if (count > 64 || depth > 6) return false; if (!item || typeof item !== "object") return true; if (seen.has(item)) return true; seen.add(item); let values: unknown[]; try { values = Object.values(item); } catch { return false; } return values.every((child) => visit(child, depth + 1)); }; return visit(value, 0) ? count : null; }
function isReferences(value: unknown): value is readonly string[] { return Array.isArray(value) && value.length <= 4 && new Set(value).size === value.length && value.every(isIdentifier); }
function isIdentifier(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 120 && value === value.trim() && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value); }
function parseTimestamp(value: unknown): number | null { if (typeof value !== "string" || value.length > 40) return null; const parsed = Date.parse(value); return Number.isFinite(parsed) ? parsed : null; }
function includes(values: readonly string[], value: unknown): value is string { return typeof value === "string" && values.includes(value); }
function isPlainRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function hasExactKeys(value: Readonly<Record<string, unknown>>, expected: readonly string[]): boolean { const keys = Object.keys(value); return keys.length === expected.length && keys.every((key) => expected.includes(key)); }
function unique(values: readonly string[]): readonly string[] { return [...new Set(values)].sort(); }
function deepFreeze<Value>(value: Value): Value { if (value && typeof value === "object") { for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child); Object.freeze(value); } return value; }
