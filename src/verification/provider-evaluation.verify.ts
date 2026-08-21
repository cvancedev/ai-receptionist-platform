import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AiFoundationPrototypeOrchestrator } from "../ai/prototype/ai-foundation-orchestrator";

async function run(): Promise<void> {
  const orchestrator = new AiFoundationPrototypeOrchestrator();
  const valid = await required(orchestrator, "valid_intent");
  assert(valid.decision.decision === "accepted", "deterministic mock baseline remains functional");

  for (const scenario of [
    "malformed_output",
    "invalid_source_reference",
    "knowledge_grounding_failure",
    "state_mutation_authority_violation",
    "customer_release_authority_violation",
    "refusal",
    "provider_failure",
    "cancellation",
  ] as const) {
    const result = await required(orchestrator, scenario);
    assert(!result.stateMutationOccurred, `${scenario} cannot mutate authoritative state`);
    assert(!result.customerResponseReleased, `${scenario} cannot release customer output`);
    assert(!result.networkAccessed, `${scenario} remains deterministic and local`);
    assert(result.validation.status !== "valid", `${scenario} fails before authoritative use`);
  }

  const evaluation = readFileSync(
    join(process.cwd(), "docs/SPRINT_8_PROVIDER_EVALUATION.md"),
    "utf8",
  ).replace(/\s+/g, " ");
  for (const requiredText of [
    "No provider or model is selected",
    "separate explicit authorization",
    "Missing, fabricated, unbound, stale, internal-only, or wrong-scope references",
    "Timeout and cancellation must be enforced",
    "cannot mutate state",
    "cannot retry itself",
    "No dependency is justified",
    "Milestone 8.7 capability",
  ]) assert(evaluation.includes(requiredText), `evaluation records: ${requiredText}`);

  const packageJson = readFileSync(join(process.cwd(), "package.json"), "utf8");
  for (const providerPackage of ["openai", "@anthropic-ai/sdk", "@google/generative-ai"]) {
    assert(!packageJson.includes(`\"${providerPackage}\"`), `no ${providerPackage} dependency is selected`);
  }
  console.log("Sprint 8.6 provider evaluation verification passed: provider deferred.");
}

async function required(
  orchestrator: AiFoundationPrototypeOrchestrator,
  scenario: Parameters<AiFoundationPrototypeOrchestrator["run"]>[0],
) {
  const result = await orchestrator.run(scenario);
  assert(result.status === "success", `${scenario} produces a bounded foundation result`);
  return result.value;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Sprint 8.6 verification failed: ${message}.`);
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
