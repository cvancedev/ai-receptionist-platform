export interface AiOperationIdentity {
  requestId: string;
  traceId: string;
  businessId: string;
  conversationId: string;
  profileVersion: number;
  stateRevision: number;
  taskIdentifier: ModelTaskIdentifier;
  taskVersion: number;
}

export interface AiPackageIdentity extends AiOperationIdentity {
  contextPackageId: string;
  promptPackageId: string;
  outputContractIdentifier: OutputContractIdentifier;
  outputContractVersion: number;
}

export const MODEL_TASK_IDENTIFIERS = [
  "language_interpretation",
  "candidate_fact_extraction",
  "clarification_proposal",
  "response_drafting",
  "knowledge_grounded_answer",
  "conversation_summary",
  "escalation_recommendation",
  "unsupported_request_interpretation",
] as const;

export type ModelTaskIdentifier = (typeof MODEL_TASK_IDENTIFIERS)[number];

export const MODEL_PROPOSAL_IDENTIFIERS = [
  "intent_interpretation",
  "candidate_fact",
  "clarification_text",
  "customer_response_draft",
  "knowledge_grounded_answer",
  "conversation_summary",
  "escalation_recommendation",
  "unsupported_request_interpretation",
] as const;

export type ModelProposalIdentifier = (typeof MODEL_PROPOSAL_IDENTIFIERS)[number];
export type OutputContractIdentifier = `output_${ModelProposalIdentifier}`;

export function isModelTaskIdentifier(value: unknown): value is ModelTaskIdentifier {
  return typeof value === "string" && MODEL_TASK_IDENTIFIERS.includes(value as ModelTaskIdentifier);
}

export function isModelProposalIdentifier(value: unknown): value is ModelProposalIdentifier {
  return typeof value === "string" && MODEL_PROPOSAL_IDENTIFIERS.includes(value as ModelProposalIdentifier);
}
