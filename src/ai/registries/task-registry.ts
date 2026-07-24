import type { AiFailureCategory, ModelTaskDefinition } from "../contracts/catalog";
import type { ModelTaskIdentifier } from "../contracts/identities";
import type { OperationResult } from "../contracts/results";
import { deepFreeze } from "../shared/immutable";

const commonSections = ["identity", "business", "state", "current_customer_input"] as const;

const taskDefinitions: readonly ModelTaskDefinition[] = deepFreeze([
  task("language_interpretation", "intent_interpretation", [...commonSections, "facts", "history"],
    ["propose candidate intent, service, ambiguity, unsupported request, and objective"],
    ["resolve services, confirm facts, change state, activate escalation, decide readiness"], "standard"),
  task("candidate_fact_extraction", "candidate_fact", [...commonSections, "facts", "corrections"],
    ["propose a candidate field value with a current-message source"],
    ["confirm facts, apply corrections, overwrite state, decide readiness"], "low"),
  task("clarification_proposal", "clarification_text", [...commonSections, "history"],
    ["draft one approved clarification using approved options"],
    ["invent options, fields, policy, actions, or escalation"], "low"),
  task("response_drafting", "customer_response_draft", [...commonSections, "facts", "knowledge"],
    ["draft wording for one approved application action"],
    ["invent actions, services, policies, promises, mutations, or delivery"], "standard"),
  task("knowledge_grounded_answer", "knowledge_grounded_answer", [...commonSections, "facts", "knowledge"],
    ["draft an answer grounded only in included approved knowledge"],
    ["use external facts, model memory, or redefine profile rules"], "standard"),
  task("conversation_summary", "conversation_summary", [...commonSections, "facts", "claims", "corrections", "history"],
    ["summarize facts, claims, corrections, and pending issues separately"],
    ["replace state, confirm claims, remove contradictions, alter chronology"], "extended", "non_blocking"),
  task("escalation_recommendation", "escalation_recommendation", [...commonSections, "history"],
    ["recommend escalation under included policy and evidence"],
    ["activate, clear, assign, or create a handoff"], "standard"),
  task("unsupported_request_interpretation", "unsupported_request_interpretation", [...commonSections, "history"],
    ["propose an unsupported category, active candidate, or clarification"],
    ["create or activate services, resolve authoritatively, override policy"], "low"),
]);

const registry = new Map(taskDefinitions.map((definition) => [
  `${definition.identifier}@${definition.version}`,
  definition,
]));

export class TaskRegistry {
  resolve(identifier: ModelTaskIdentifier | string, version: number): OperationResult<ModelTaskDefinition> {
    const exact = registry.get(`${identifier}@${version}`);
    if (exact) return { status: "success", value: exact };
    const identifierExists = taskDefinitions.some((definition) => definition.identifier === identifier);
    const failure: AiFailureCategory = identifierExists ? "UnsupportedTaskVersion" : "UnknownTask";
    return { status: "failure", failures: [failure] };
  }

  list(): readonly ModelTaskDefinition[] {
    return taskDefinitions;
  }
}

function task(
  identifier: ModelTaskIdentifier,
  proposal: ModelTaskDefinition["compatibleProposalType"],
  requiredContextSections: ModelTaskDefinition["requiredContextSections"],
  allowedProposalBehavior: readonly string[],
  prohibitedBehavior: readonly string[],
  costClassification: ModelTaskDefinition["costClassification"],
  latencyClassification: ModelTaskDefinition["latencyClassification"] = "interactive",
): ModelTaskDefinition {
  return {
    identifier,
    version: 1,
    status: "approved",
    compatibleProposalType: proposal,
    compatibleOutputContract: `output_${proposal}`,
    requiredContextSections,
    allowedProposalBehavior,
    prohibitedBehavior,
    retryPolicyClassification: "bounded",
    costClassification,
    latencyClassification,
  };
}
