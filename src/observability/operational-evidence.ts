export const OPERATIONAL_EVIDENCE_VERSION = "sprint-9.5-operational-evidence-v1";
export const FICTIONAL_EVIDENCE_RETENTION_MS = 24 * 60 * 60 * 1000;
export const MAX_OPERATIONAL_EVIDENCE_ENTRIES = 100;

export const OPERATIONAL_EVENT_TYPES = Object.freeze([
  "operation-succeeded",
  "operation-failed",
  "request-rejected",
  "persistence-recovery-failed",
  "authorization-denied",
  "configuration-denied",
  "invariant-violation",
] as const);
export type OperationalEventType = (typeof OPERATIONAL_EVENT_TYPES)[number];

export const OPERATIONAL_SUBSYSTEMS = Object.freeze([
  "application",
  "authorization",
  "configuration",
  "persistence",
  "recovery",
  "migration",
] as const);
export type OperationalSubsystem = (typeof OPERATIONAL_SUBSYSTEMS)[number];

export const OPERATIONAL_REASON_CODES = Object.freeze([
  "completed",
  "safe-rejection",
  "dependency-unavailable",
  "invalid-input",
  "scope-mismatch",
  "integrity-failure",
  "policy-denial",
  "unknown-failure",
] as const);
export type OperationalReasonCode = (typeof OPERATIONAL_REASON_CODES)[number];

export const INCIDENT_CONDITIONS = Object.freeze([
  "secret-exposure",
  "protected-data-leakage",
  "cross-business-access",
  "authorization-bypass",
  "authoritative-state-corruption",
  "migration-integrity-failure",
  "recovery-proof-failure",
  "environment-configuration-failure",
  "high-critical-dependency-vulnerability",
  "unauthorized-release-external-action",
  "operational-evidence-sanitization-failure",
] as const);
export type IncidentCondition = (typeof INCIDENT_CONDITIONS)[number];

export interface OperationalEvidenceInput {
  readonly eventType: unknown;
  readonly subsystem: unknown;
  readonly outcome: unknown;
  readonly reasonCode: unknown;
  readonly correlationId: unknown;
  readonly environment: unknown;
  readonly occurredAt: unknown;
  readonly evidenceClass: unknown;
  readonly untrustedContext: unknown;
}

export interface OperationalEvidence {
  readonly version: typeof OPERATIONAL_EVIDENCE_VERSION;
  readonly sequence: number;
  readonly eventType: OperationalEventType;
  readonly subsystem: OperationalSubsystem;
  readonly outcome: "success" | "failure" | "denied";
  readonly reasonCode: OperationalReasonCode;
  readonly correlationId: string;
  readonly environment: "local-development" | "automated-test";
  readonly occurredAt: string;
  readonly evidenceClass: "fictional-operational";
  readonly redaction: Readonly<{
    readonly status: "discarded-untrusted-context";
    readonly inspectedNodeCount: number;
    readonly bounded: true;
  }>;
  readonly authoritativeState: false;
  readonly replayAuthorized: false;
  readonly authorizationAuthority: false;
  readonly configurationAuthority: false;
  readonly recoveryAuthority: false;
  readonly telemetryExportAuthorized: false;
  readonly customerResponseReleaseAuthorized: false;
  readonly externalActionAuthorized: false;
}

export type OperationalEvidenceResult =
  | Readonly<{ status: "recorded"; evidence: OperationalEvidence }>
  | Readonly<{
      status: "rejected";
      reason: "InvalidInput" | "UnknownEvent" | "ProhibitedEvidenceClass" | "SanitizationFailure";
      errors: readonly string[];
      retained: false;
      telemetryExportAuthorized: false;
    }>;

export interface IncidentDecision {
  readonly status: "block";
  readonly condition: IncidentCondition | null;
  readonly reason: "HighSeverityCondition" | "UnknownCondition" | "InvalidInput";
  readonly controlledEvaluationBlocked: true;
  readonly futureReleaseBlocked: true;
  readonly responseSequence: readonly [
    "detect", "contain", "preserve-bounded-evidence", "assess",
    "remediate", "verify", "document-decision",
  ];
  readonly automaticRemediationAuthorized: false;
  readonly externalActionAuthorized: false;
}

export class InMemoryOperationalEvidenceStore {
  private entries: OperationalEvidence[] = [];
  private nextSequence = 1;

  record(input: unknown): OperationalEvidenceResult {
    const parsed = parseInput(input, this.nextSequence);
    if (parsed.status === "rejected") return parsed;
    if (this.entries.length >= MAX_OPERATIONAL_EVIDENCE_ENTRIES) {
      return rejection("InvalidInput", "Operational evidence capacity is unavailable.");
    }
    this.entries.push(parsed.evidence);
    this.nextSequence += 1;
    return parsed;
  }

  snapshot(): readonly OperationalEvidence[] {
    return deepFreeze(this.entries.map((entry) => entry));
  }

  cleanup(cutoffExclusive: string): Readonly<{ removed: number; remaining: number }> {
    const cutoff = parseTimestamp(cutoffExclusive);
    if (cutoff === null) return deepFreeze({ removed: 0, remaining: this.entries.length });
    const previous = this.entries.length;
    this.entries = this.entries.filter((entry) => {
      const timestamp = parseTimestamp(entry.occurredAt);
      return timestamp !== null && timestamp >= cutoff;
    });
    return deepFreeze({ removed: previous - this.entries.length, remaining: this.entries.length });
  }

  cleanupExpired(now: string): Readonly<{ removed: number; remaining: number }> {
    const timestamp = parseTimestamp(now);
    if (timestamp === null) return deepFreeze({ removed: 0, remaining: this.entries.length });
    return this.cleanup(new Date(timestamp - FICTIONAL_EVIDENCE_RETENTION_MS).toISOString());
  }
}

export function evaluateIncidentCondition(input: unknown): IncidentDecision {
  try {
    if (!isPlainRecord(input) || !hasExactKeys(input, ["condition"])) {
      return incidentDecision(null, "InvalidInput");
    }
    if (typeof input.condition !== "string"
      || !INCIDENT_CONDITIONS.includes(input.condition as IncidentCondition)) {
      return incidentDecision(null, "UnknownCondition");
    }
    return incidentDecision(input.condition as IncidentCondition, "HighSeverityCondition");
  } catch {
    return incidentDecision(null, "InvalidInput");
  }
}

function parseInput(input: unknown, sequence: number): OperationalEvidenceResult {
  try {
    if (!isPlainRecord(input) || !hasExactKeys(input, [
      "eventType", "subsystem", "outcome", "reasonCode", "correlationId",
      "environment", "occurredAt", "evidenceClass", "untrustedContext",
    ])) return rejection("InvalidInput", "Operational evidence input is invalid.");
    if (typeof input.eventType !== "string"
      || !OPERATIONAL_EVENT_TYPES.includes(input.eventType as OperationalEventType)
      || typeof input.subsystem !== "string"
      || !OPERATIONAL_SUBSYSTEMS.includes(input.subsystem as OperationalSubsystem)
      || typeof input.reasonCode !== "string"
      || !OPERATIONAL_REASON_CODES.includes(input.reasonCode as OperationalReasonCode)) {
      return rejection("UnknownEvent", "Operational evidence classification is unavailable.");
    }
    if (input.evidenceClass !== "fictional-operational") {
      return rejection("ProhibitedEvidenceClass", "Operational evidence class is prohibited.");
    }
    if ((input.outcome !== "success" && input.outcome !== "failure" && input.outcome !== "denied")
      || (input.environment !== "local-development" && input.environment !== "automated-test")
      || !isIdentifier(input.correlationId)
      || typeof input.occurredAt !== "string"
      || parseTimestamp(input.occurredAt) === null) {
      return rejection("InvalidInput", "Operational evidence input is invalid.");
    }
    const inspectedNodeCount = inspectAndDiscard(input.untrustedContext);
    if (inspectedNodeCount === null) {
      return rejection("SanitizationFailure", "Operational evidence could not be sanitized.");
    }
    return deepFreeze({
      status: "recorded" as const,
      evidence: {
        version: OPERATIONAL_EVIDENCE_VERSION,
        sequence,
        eventType: input.eventType as OperationalEventType,
        subsystem: input.subsystem as OperationalSubsystem,
        outcome: input.outcome,
        reasonCode: input.reasonCode as OperationalReasonCode,
        correlationId: input.correlationId,
        environment: input.environment,
        occurredAt: input.occurredAt,
        evidenceClass: "fictional-operational" as const,
        redaction: {
          status: "discarded-untrusted-context" as const,
          inspectedNodeCount,
          bounded: true as const,
        },
        authoritativeState: false as const,
        replayAuthorized: false as const,
        authorizationAuthority: false as const,
        configurationAuthority: false as const,
        recoveryAuthority: false as const,
        telemetryExportAuthorized: false as const,
        customerResponseReleaseAuthorized: false as const,
        externalActionAuthorized: false as const,
      },
    });
  } catch {
    return rejection("SanitizationFailure", "Operational evidence could not be sanitized.");
  }
}

function inspectAndDiscard(value: unknown): number | null {
  const seen = new WeakSet<object>();
  let count = 0;
  const visit = (candidate: unknown, depth: number): boolean => {
    count += 1;
    if (count > 64 || depth > 6) return false;
    if (candidate === null || typeof candidate !== "object") return true;
    if (seen.has(candidate)) return true;
    seen.add(candidate);
    let values: unknown[];
    try { values = Object.values(candidate); } catch { return false; }
    return values.every((child) => visit(child, depth + 1));
  };
  return visit(value, 0) ? count : null;
}

function incidentDecision(
  condition: IncidentCondition | null,
  reason: IncidentDecision["reason"],
): IncidentDecision {
  return deepFreeze({
    status: "block" as const,
    condition,
    reason,
    controlledEvaluationBlocked: true as const,
    futureReleaseBlocked: true as const,
    responseSequence: [
      "detect", "contain", "preserve-bounded-evidence", "assess",
      "remediate", "verify", "document-decision",
    ] as const,
    automaticRemediationAuthorized: false as const,
    externalActionAuthorized: false as const,
  });
}

function rejection(reason: Extract<OperationalEvidenceResult, { status: "rejected" }>["reason"], error: string): OperationalEvidenceResult {
  return deepFreeze({
    status: "rejected" as const,
    reason,
    errors: [error],
    retained: false as const,
    telemetryExportAuthorized: false as const,
  });
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value !== "string" || value.length > 40) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 120
    && value === value.trim() && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function hasExactKeys(value: Readonly<Record<string, unknown>>, expected: readonly string[]): boolean {
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
