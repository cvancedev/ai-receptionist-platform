import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AiFoundationPrototypeOrchestrator } from "../ai/prototype/ai-foundation-orchestrator";
import { decodeDurableMessageEvidence } from "../application/end-to-end/message-evidence";

const root = process.cwd();

async function run(): Promise<void> {
  verifyExecutableCoverage();
  await verifyUntrustedProviderBoundary();
  verifyMalformedEvidenceBoundary();
  verifyStaticSecurityBoundary();
  console.log("Sprint 8.7 end-to-end failure, security, and recovery verification passed.");
}

function verifyExecutableCoverage(): void {
  const coverage: readonly [string, readonly string[]][] = [
    ["src/verification/end-to-end-contracts.verify.ts", [
      "malformed or broad input fails closed",
      "invalid input never reaches activated configuration or persistence boundaries",
    ]],
    ["src/verification/activated-context-grounding.verify.ts", [
      "suspended knowledge", "wrong activation", "wrong-business profile fails closed",
      "wrong-conversation input fails closed", "missing grounding fails closed",
    ]],
    ["src/verification/deterministic-multi-turn-workflow.verify.ts", [
      "malformed input", "stale revision", "duplicate turn", "invalid completion transition",
      "wrong message conversation", "does not alter the certified model-controlled Transition Registry",
    ]],
    ["src/verification/durable-turn-restart.verify.ts", [
      "state, execution, and message commit together",
      "duplicate and stale failures consume no durable sequence",
      "message failure rolls back state",
      "message failure rolls back execution and message evidence",
      "restart decoder rejects corrupt evidence",
      "cross-business persistence fails closed",
    ]],
    ["src/verification/persistence-recovery.verify.ts", [
      "database-unavailable transactions return a technology-neutral failure",
      "restart after rollback sees only the prior committed state and no residue",
      "failed standalone append commits nothing",
      "transactional journal failure rolls back the state mutation and audit",
      "wrong-business reads disclose neither state nor journal existence",
      "request-time persistence does not create or repair schema objects",
      "recovery loads authoritative Conversation State before audit evidence",
    ]],
    ["src/verification/business-configuration-recovery.verify.ts", [
      "restart preserves last committed activation after failed commit",
      "failed commit leaves no activation or audit row",
      "failed recovery preserves exact pin and creates no fallback state",
      "durable activated path has no fixture fallback, retry, release, or dispatch",
    ]],
    ["src/verification/configuration-lifecycle-remediation.verify.ts", [
      "suspended", "stale", "wrong-business profile lifecycle transition fails safely",
    ]],
    ["src/verification/internal-fictional-mvp-experience.verify.ts", [
      "UI excludes", "bounded fixture read model grants no customer release",
    ]],
    ["src/verification/provider-evaluation.verify.ts", [
      "cannot mutate authoritative state", "cannot release customer output",
      "remains deterministic and local",
    ]],
  ];
  for (const [file, required] of coverage) {
    const source = read(file);
    for (const evidence of required) {
      assert(source.includes(evidence), `${file} retains evidence: ${evidence}`);
    }
  }
}

async function verifyUntrustedProviderBoundary(): Promise<void> {
  for (const scenario of [
    "malformed_output",
    "invalid_source_reference",
    "knowledge_grounding_failure",
    "state_mutation_authority_violation",
    "customer_release_authority_violation",
    "provider_failure",
  ] as const) {
    const result = await new AiFoundationPrototypeOrchestrator().run(scenario);
    assert(result.status === "success", `${scenario} returns a bounded result`);
    assert(result.value.validation.status !== "valid", `${scenario} remains untrusted`);
    assert(!result.value.stateMutationOccurred, `${scenario} applies no state mutation`);
    assert(!result.value.customerResponseReleased, `${scenario} grants no release`);
    assert(!result.value.networkAccessed, `${scenario} performs no network action`);
  }
}

function verifyMalformedEvidenceBoundary(): void {
  const scope = {
    businessProfileId: "fictional-business",
    businessProfileVersion: 1,
    conversationId: "fictional-conversation",
  };
  for (const malformed of [null, {}, { evidenceSchemaVersion: 1 }, {
    messageId: "message-1",
    turnId: "turn-1",
    businessProfileId: scope.businessProfileId,
    businessProfileVersion: scope.businessProfileVersion,
    conversationId: scope.conversationId,
    activationRevision: 1,
    sequence: 1,
    source: "customer",
    content: "x".repeat(4_001),
    resultingStateRevision: 1,
    recordedAt: "fictional",
    evidenceSchemaVersion: 1,
  }]) {
    assert(decodeDurableMessageEvidence(malformed, scope).status === "failure",
      "malformed or oversized message evidence fails closed");
  }
}

function verifyStaticSecurityBoundary(): void {
  const ui = read("components/prototype/PrototypeChat.tsx");
  assert(!/Postgresql|\bpg\b|TEST_DATABASE_URL|process\.env|rawOutput|providerPayload/.test(ui),
    "UI has no PostgreSQL, credential, or provider-payload access");
  const application = [
    read("src/application/end-to-end/contracts.ts"),
    read("src/application/end-to-end/durable-turn-and-restart.ts"),
    read("src/conversation/conversation-store.ts"),
  ].join("\n");
  assert(!/from ["']pg["']|PoolClient|Postgresql|\bSQL\b/.test(application),
    "application and domain contracts contain no PostgreSQL or driver types");
  assert(!/customerReleaseAuthorized:\s*true|externalActionAuthorized:\s*true/.test(application),
    "application boundary grants no release or external action");
  const persistenceRecovery = read("src/ai/prototype/persistence-backed-prototype-integration.ts");
  assert(!/journal.*replay|replay.*journal|fixture fallback|releaseCustomer|dispatch/i.test(persistenceRecovery),
    "recovery contains no replay, fixture fallback, release, or dispatch authority");
}

function read(file: string): string {
  return readFileSync(join(root, file), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Sprint 8.7 verification failed: ${message}.`);
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
