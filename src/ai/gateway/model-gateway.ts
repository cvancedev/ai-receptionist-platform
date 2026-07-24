import type { ProviderAdapterResult, ModelGatewayRequest, OperationResult } from "../contracts/results";
import { OutputContractRegistry } from "../registries/output-contract-registry";
import { TaskRegistry } from "../registries/task-registry";

export interface ModelProviderAdapter {
  readonly adapterId: string;
  execute(request: ModelGatewayRequest): Promise<ProviderAdapterResult>;
}

export interface ProviderNeutralModelGateway {
  request(request: ModelGatewayRequest): Promise<OperationResult<ProviderAdapterResult>>;
}

export class PrototypeModelGateway implements ProviderNeutralModelGateway {
  constructor(
    private readonly adapter: ModelProviderAdapter,
    private readonly tasks = new TaskRegistry(),
    private readonly contracts = new OutputContractRegistry(),
  ) {}

  async request(request: ModelGatewayRequest): Promise<OperationResult<ProviderAdapterResult>> {
    if (!request.promptPackage.validation.valid) {
      return { status: "failure", failures: ["InvalidPromptPackage"] };
    }
    const identity = request.identity;
    const prompt = request.promptPackage;
    if (prompt.requestId !== identity.requestId || prompt.traceId !== identity.traceId
      || prompt.businessId !== identity.businessId || prompt.conversationId !== identity.conversationId
      || prompt.profileVersion !== identity.profileVersion || prompt.stateRevision !== identity.stateRevision) {
      return { status: "failure", failures: ["PromptPackageMismatch"] };
    }
    const taskResult = this.tasks.resolve(identity.taskIdentifier, identity.taskVersion);
    if (taskResult.status === "failure") return taskResult;
    const contractResult = this.contracts.resolve(
      request.outputContractIdentifier,
      request.outputContractVersion,
    );
    if (contractResult.status === "failure") return contractResult;
    const compatibility = this.contracts.validateCompatibility(
      contractResult.value,
      taskResult.value.identifier,
      taskResult.value.compatibleProposalType,
    );
    if (compatibility.status === "failure") return compatibility;
    if (prompt.outputContractReference.identifier !== contractResult.value.identifier
      || prompt.outputContractReference.version !== contractResult.value.version) {
      return { status: "failure", failures: ["OutputContractMismatch"] };
    }
    if (request.cancelled) {
      return {
        status: "success",
        value: {
          requestId: identity.requestId,
          traceId: identity.traceId,
          adapterId: this.adapter.adapterId,
          attemptId: request.attempt.attemptId,
          status: "cancelled",
          rawOutput: null,
          usage: { inputUnits: 0, outputUnits: 0 },
          finishReason: "cancelled-before-adapter",
          error: null,
          durationMs: 0,
        },
      };
    }
    return { status: "success", value: await this.adapter.execute(request) };
  }
}
