import type { OperationResult } from "../contracts/results";

export class DuplicateProcessingGuard {
  private readonly proposals = new Set<string>();
  private readonly stateOperations = new Set<string>();
  private readonly responseReleases = new Set<string>();

  registerProposal(proposalId: string): OperationResult<string> {
    return this.register(this.proposals, proposalId, "DuplicateProposalProcessing");
  }

  registerStateOperation(operationId: string): OperationResult<string> {
    return this.register(this.stateOperations, operationId, "DuplicateStateMutation");
  }

  hasStateOperation(operationId: string): boolean {
    return this.stateOperations.has(operationId);
  }

  registerResponseRelease(releaseId: string): OperationResult<string> {
    return this.register(this.responseReleases, releaseId, "DuplicateResponseRelease");
  }

  snapshot(): Readonly<{
    proposalCount: number;
    stateOperationAttemptCount: number;
    responseReleaseAttemptCount: number;
  }> {
    return Object.freeze({
      proposalCount: this.proposals.size,
      stateOperationAttemptCount: this.stateOperations.size,
      responseReleaseAttemptCount: this.responseReleases.size,
    });
  }

  private register(
    set: Set<string>,
    identity: string,
    duplicateFailure: "DuplicateProposalProcessing" | "DuplicateStateMutation" | "DuplicateResponseRelease",
  ): OperationResult<string> {
    if (!identity || set.has(identity)) return { status: "failure", failures: [duplicateFailure] };
    set.add(identity);
    return { status: "success", value: identity };
  }
}
