import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  INCIDENT_CONDITIONS,
  InMemoryOperationalEvidenceStore,
  MAX_OPERATIONAL_EVIDENCE_ENTRIES,
  evaluateIncidentCondition,
} from "../observability/operational-evidence";

function run(): void {
  verifySanitizedImmutableEvidence();
  verifyHostileInput();
  verifyRetentionAndBounds();
  verifyIncidentBlocking();
  verifyAuthorityAndArchitecture();
  console.log("Sprint 9.5 operational evidence verification passed.");
}

function verifySanitizedImmutableEvidence(): void {
  const store = new InMemoryOperationalEvidenceStore();
  const canaries = [
    "customer-message-canary", "postgresql://user:password@localhost/db",
    "secret-token-canary", "private-key-canary", "provider-prompt-canary",
    "monitoring-credential-present-canary", "production-environment-canary",
  ];
  const result = store.record(validInput({
    message: canaries[0],
    nested: { connection: canaries[1], values: [canaries[2], { key: canaries[3] }] },
    prompt: canaries[4],
    credentialPresence: canaries[5],
    environmentOverride: canaries[6],
  }));
  assert(result.status === "recorded", "bounded fictional event records");
  assertDeeplyFrozen(result, "recorded result");
  const serialized = JSON.stringify(result);
  for (const canary of canaries) assert(!serialized.includes(canary), `${canary} is discarded`);
  if (result.status === "recorded") {
    assert(result.evidence.correlationId === "fictional-correlation", "correlation remains a bounded identifier");
    assert(
      !result.evidence.authoritativeState
        && !result.evidence.replayAuthorized
        && !result.evidence.authorizationAuthority
        && !result.evidence.configurationAuthority
        && !result.evidence.recoveryAuthority
        && !result.evidence.telemetryExportAuthorized
        && !result.evidence.customerResponseReleaseAuthorized
        && !result.evidence.externalActionAuthorized,
      "operational evidence has no authority",
    );
  }
}

function verifyHostileInput(): void {
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  const throwing = new Proxy({}, { ownKeys() { throw new Error("secret-getter-canary"); } });
  const tooDeep: Record<string, unknown> = {};
  let cursor = tooDeep;
  for (let index = 0; index < 8; index += 1) {
    const next: Record<string, unknown> = {};
    cursor.next = next;
    cursor = next;
  }
  const store = new InMemoryOperationalEvidenceStore();
  assert(store.record(validInput(circular)).status === "recorded", "circular input is contained");
  for (const hostile of [throwing, tooDeep]) {
    const result = store.record(validInput(hostile));
    assert(
      result.status === "rejected" && result.reason === "SanitizationFailure",
      "uninspectable hostile input fails closed",
    );
    assert(!JSON.stringify(result).includes("secret-getter-canary"), "hostile value is not echoed");
  }
  for (const invalid of [null, {}, { ...validInput({}), eventType: "unknown" }]) {
    assert(store.record(invalid).status === "rejected", "malformed or unknown event fails closed");
  }
  assert(
    store.record({ ...validInput({}), evidenceClass: "customer-content" }).status === "rejected",
    "prohibited customer-content evidence is never retained",
  );
}

function verifyRetentionAndBounds(): void {
  const store = new InMemoryOperationalEvidenceStore();
  store.record(validInput({}, { correlationId: "older", occurredAt: "2026-01-01T00:00:00.000Z" }));
  store.record(validInput({}, { correlationId: "newer", occurredAt: "2026-01-02T00:00:00.000Z" }));
  const cleaned = store.cleanupExpired("2026-01-03T00:00:00.000Z");
  assert(cleaned.removed === 1 && cleaned.remaining === 1, "eligible evidence is deleted");
  assert(store.snapshot()[0]?.correlationId === "newer", "retained evidence remains bounded");
  for (let index = 1; index < MAX_OPERATIONAL_EVIDENCE_ENTRIES; index += 1) {
    assert(store.record(validInput({}, { correlationId: `bounded-${index}` })).status === "recorded", "capacity accepts bounded evidence");
  }
  assert(store.record(validInput({}, { correlationId: "over-capacity" })).status === "rejected", "capacity fails closed");
}

function verifyIncidentBlocking(): void {
  for (const condition of INCIDENT_CONDITIONS) {
    const decision = evaluateIncidentCondition({ condition });
    assert(
      decision.status === "block"
        && decision.condition === condition
        && decision.controlledEvaluationBlocked
        && decision.futureReleaseBlocked
        && !decision.automaticRemediationAuthorized
        && !decision.externalActionAuthorized,
      `${condition} blocks evaluation and release`,
    );
    assertDeeplyFrozen(decision, condition);
  }
  for (const value of [null, {}, { condition: "unknown-incident" }]) {
    const decision = evaluateIncidentCondition(value);
    assert(decision.status === "block" && decision.condition === null, "unknown incident fails closed");
  }
}

function verifyAuthorityAndArchitecture(): void {
  const source = readFileSync(join(process.cwd(), "src/observability/operational-evidence.ts"), "utf8");
  for (const prohibited of [
    "fetch(", 'from "pg"', "process.env", "ConversationState", "ExecutionJournal",
    "MessageEvidence", "RuntimeConfiguration", "evaluateProtectedDataAuthorization",
  ]) assert(!source.includes(prohibited), `evidence boundary has no ${prohibited} authority`);
}

function validInput(
  untrustedContext: unknown,
  overrides: Readonly<Record<string, unknown>> = {},
): Readonly<Record<string, unknown>> {
  return {
    eventType: "operation-failed",
    subsystem: "persistence",
    outcome: "failure",
    reasonCode: "dependency-unavailable",
    correlationId: "fictional-correlation",
    environment: "automated-test",
    occurredAt: "2026-01-02T00:00:00.000Z",
    evidenceClass: "fictional-operational",
    untrustedContext,
    ...overrides,
  };
}

function assertDeeplyFrozen(value: unknown, label: string): void {
  assert(value !== null && typeof value === "object" && Object.isFrozen(value), `${label} frozen`);
  for (const child of Object.values(value as Record<string, unknown>)) {
    if (child && typeof child === "object") assertDeeplyFrozen(child, label);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Sprint 9.5 verification failed: ${message}.`);
}

run();
