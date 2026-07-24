import type { ModelGatewayRequest, ProviderAdapterResult } from "../contracts/results";
import type { ModelProviderAdapter } from "../gateway/model-gateway";

export const MOCK_PROVIDER_SCENARIOS = [
  "valid_intent", "valid_candidate_fact", "valid_escalation", "malformed_output", "unknown_proposal_type",
  "unexpected_action_field", "business_scope_mismatch", "conversation_scope_mismatch",
  "profile_version_mismatch", "state_revision_mismatch", "unknown_field", "inactive_service",
  "invalid_source_reference", "knowledge_grounding_failure", "escalation_authority_violation",
  "completion_authority_violation", "state_mutation_authority_violation",
  "customer_release_authority_violation", "refusal", "incomplete", "provider_failure", "cancellation",
] as const;

export type MockProviderScenario = (typeof MOCK_PROVIDER_SCENARIOS)[number];

export class MockModelProviderAdapter implements ModelProviderAdapter {
  readonly adapterId = "mock-model-provider/v1";

  constructor(private readonly scenario: MockProviderScenario) {}

  execute(request: ModelGatewayRequest): Promise<ProviderAdapterResult> {
    const terminal = terminalResult(this.scenario, request, this.adapterId);
    if (terminal) return Promise.resolve(terminal);
    const proposal = proposalFixture(this.scenario, request);
    return Promise.resolve({
      requestId: request.identity.requestId,
      traceId: request.identity.traceId,
      adapterId: this.adapterId,
      attemptId: request.attempt.attemptId,
      status: "completed",
      rawOutput: this.scenario === "malformed_output"
        ? '{"proposalType":"intent_interpretation"'
        : JSON.stringify(proposal),
      usage: { inputUnits: 100, outputUnits: 40 },
      finishReason: "fixture-complete",
      error: null,
      durationMs: 5,
    });
  }
}

function proposalFixture(
  scenario: MockProviderScenario,
  request: ModelGatewayRequest,
): Record<string, unknown> {
  const prompt = request.promptPackage;
  const common: Record<string, unknown> = {
    proposalId: `proposal-${scenario}`,
    proposalType: proposalTypeForTask(request.identity.taskIdentifier),
    requestId: request.identity.requestId,
    traceId: request.identity.traceId,
    businessId: request.identity.businessId,
    conversationId: request.identity.conversationId,
    profileVersion: request.identity.profileVersion,
    stateRevision: request.identity.stateRevision,
    taskIdentifier: request.identity.taskIdentifier,
    taskVersion: request.identity.taskVersion,
    contextPackageId: prompt.contextPackageId,
    promptPackageId: prompt.promptPackageId,
    outputContractIdentifier: request.outputContractIdentifier,
    outputContractVersion: request.outputContractVersion,
  };
  const taskPayload = payloadForTask(request.identity.taskIdentifier);
  const proposal = { ...common, ...taskPayload };

  switch (scenario) {
    case "unknown_proposal_type": proposal.proposalType = "invented_operation"; break;
    case "unexpected_action_field": proposal.toolCall = "send-message"; break;
    case "business_scope_mismatch": proposal.businessId = "other-business"; break;
    case "conversation_scope_mismatch": proposal.conversationId = "other-conversation"; break;
    case "profile_version_mismatch": proposal.profileVersion = request.identity.profileVersion + 1; break;
    case "state_revision_mismatch": proposal.stateRevision = request.identity.stateRevision + 1; break;
    case "unknown_field": proposal.fieldIdentifier = "unknown-field"; break;
    case "inactive_service": proposal.candidateServiceReference = "inactive-fixture-service"; break;
    case "invalid_source_reference": proposal.sourceMessageReference = "message-from-another-conversation"; break;
    case "knowledge_grounding_failure": proposal.knowledgeSourceReferences = ["invented-knowledge"]; break;
    case "escalation_authority_violation": proposal.escalationActivated = true; break;
    case "completion_authority_violation": proposal.completionMarked = true; break;
    case "state_mutation_authority_violation": proposal.stateMutation = { field: "customer-name", value: "Changed" }; break;
    case "customer_release_authority_violation": proposal.customerReleased = true; break;
    default: break;
  }
  return proposal;
}

function payloadForTask(task: ModelGatewayRequest["identity"]["taskIdentifier"]): Record<string, unknown> {
  switch (task) {
    case "candidate_fact_extraction":
      return { fieldIdentifier: "customer-name", candidateValue: "Riley Example", sourceMessageReference: "message-current-001" };
    case "clarification_proposal":
      return { customerFacingText: "Did you mean Home Project Consultation?", reasonCategory: "service-ambiguity", approvedOptionReferences: ["home-project-consultation"] };
    case "response_drafting":
      return { customerFacingText: "What name should the fictional team use?", approvedActionReference: "ask-customer-name", groundingReferences: [] };
    case "knowledge_grounded_answer":
      return { customerFacingText: "The fictional team is available on weekdays.", knowledgeSourceReferences: ["regular-hours"], insufficientKnowledge: false };
    case "conversation_summary":
      return { confirmedFactSummary: [], claimSummary: ["Customer asked for project help."], correctionSummary: [], pendingIssueSummary: ["Customer name is missing."], sourceRangeReferences: ["message-current-001"] };
    case "escalation_recommendation":
      return { recommended: true, reasonCategory: "customer-request", supportingSourceReferences: ["message-current-001"], customerAcknowledgmentDraft: "A person can review this request." };
    case "unsupported_request_interpretation":
      return { unsupportedCategory: "unconfigured-service", sourceMessageReference: "message-current-001", candidateNearestActiveService: "home-project-consultation", clarificationRecommended: true };
    case "language_interpretation":
      return { candidateIntent: "service-inquiry", candidateServiceReference: "home-project-consultation", ambiguity: false, unsupportedRequest: false, sourceMessageReference: "message-current-001", customerObjective: "Request project help" };
  }
}

function proposalTypeForTask(task: ModelGatewayRequest["identity"]["taskIdentifier"]): string {
  const mapping: Record<ModelGatewayRequest["identity"]["taskIdentifier"], string> = {
    language_interpretation: "intent_interpretation",
    candidate_fact_extraction: "candidate_fact",
    clarification_proposal: "clarification_text",
    response_drafting: "customer_response_draft",
    knowledge_grounded_answer: "knowledge_grounded_answer",
    conversation_summary: "conversation_summary",
    escalation_recommendation: "escalation_recommendation",
    unsupported_request_interpretation: "unsupported_request_interpretation",
  };
  return mapping[task];
}

function terminalResult(
  scenario: MockProviderScenario,
  request: ModelGatewayRequest,
  adapterId: string,
): ProviderAdapterResult | null {
  const status = scenario === "refusal" ? "refused"
    : scenario === "incomplete" ? "incomplete"
    : scenario === "provider_failure" ? "failed"
    : scenario === "cancellation" ? "cancelled"
    : null;
  if (!status) return null;
  return {
    requestId: request.identity.requestId,
    traceId: request.identity.traceId,
    adapterId,
    attemptId: request.attempt.attemptId,
    status,
    rawOutput: null,
    usage: { inputUnits: status === "cancelled" ? 0 : 50, outputUnits: 0 },
    finishReason: `fixture-${status}`,
    error: status === "failed" ? { category: "mock-provider-failure", message: "Deterministic fixture failure." } : null,
    durationMs: 3,
  };
}
