import type { ApplicationDecision } from "../ai/contracts/results";
import type {
  AiControlledExecutionSnapshot,
  StateExecutionResult,
} from "../ai/execution/contracts";
import { deepFreeze } from "../ai/shared/immutable";
import type { BusinessProfile } from "../domain/business-profile";
import type { ConversationState } from "../domain/conversation-state";
import {
  ConversationReadModelProjector,
} from "../conversation-read-model/conversation-read-model-projector";
import type {
  ConversationReadModel,
  ConversationReadModelProjectionContext,
} from "../conversation-read-model/contracts";
import { resolveIntakeFields } from "../conversation/intake-field-resolution";

export interface PrototypeDecisionSummary {
  readonly decision: ApplicationDecision["decision"];
  readonly reasons: readonly string[];
  readonly acceptedFields: readonly string[];
  readonly rejectedFields: readonly string[];
  readonly stateMutationAuthorized: false;
  readonly customerReleaseAuthorized: false;
}

export interface PrototypeExecutionSummary {
  readonly success: boolean;
  readonly reason: StateExecutionResult["reason"];
  readonly transitionId: string | null;
  readonly executionTimestamp: string;
  readonly expectedStateRevision: number | null;
  readonly appliedStateRevision: number | null;
}

export type PrototypeReadModelIntegrationResult =
  | {
      readonly status: "success";
      readonly mode: "read-only" | "controlled-execution";
      readonly decision: PrototypeDecisionSummary | null;
      readonly execution: PrototypeExecutionSummary | null;
      readonly readModel: ConversationReadModel;
      readonly errors: readonly string[];
    }
  | {
      readonly status: "projection-failure";
      readonly mode: "read-only" | "controlled-execution";
      readonly decision: PrototypeDecisionSummary | null;
      readonly execution: PrototypeExecutionSummary | null;
      readonly readModel: null;
      readonly errors: readonly string[];
    };

export class PrototypeReadModelIntegration {
  private readonly projector = new ConversationReadModelProjector();

  constructor(private readonly profile: BusinessProfile) {}

  project(
    stateInput: unknown,
    controlled: AiControlledExecutionSnapshot | null = null,
  ): PrototypeReadModelIntegrationResult {
    const mode = controlled ? "controlled-execution" : "read-only";
    const decision = controlled
      ? summarizeDecision(controlled.foundationDecision)
      : null;
    const execution = controlled
      ? summarizeExecution(controlled.execution)
      : null;
    const context = this.buildContext(stateInput);
    const projection = this.projector.project(stateInput, context);
    if (projection.status === "failure") {
      return deepFreeze({
        status: "projection-failure",
        mode,
        decision,
        execution,
        readModel: null,
        errors: [...projection.errors],
      });
    }
    return deepFreeze({
      status: "success",
      mode,
      decision,
      execution,
      readModel: projection.readModel,
      errors: [],
    });
  }

  private buildContext(
    stateInput: unknown,
  ): ConversationReadModelProjectionContext | null {
    if (!isProjectionState(stateInput)) return null;
    const requestedServiceId =
      stateInput.confirmedFacts["requested-service"]?.value;
    const service = this.profile.services.find(
      (candidate) =>
        candidate.id === requestedServiceId
        && candidate.status === "active",
    );
    if (!service) {
      return {
        requiredFieldIds: ["requested-service"],
        resolvedServiceId: null,
      };
    }
    const fields = resolveIntakeFields(this.profile, service, stateInput);
    if (!fields) return null;
    return {
      requiredFieldIds: unique([
        "requested-service",
        ...fields.required.map((field) => field.id),
      ]),
      resolvedServiceId: service.id,
    };
  }
}

function summarizeDecision(
  decision: ApplicationDecision,
): PrototypeDecisionSummary {
  return {
    decision: decision.decision,
    reasons: [...decision.reasons],
    acceptedFields: [...decision.acceptedFields],
    rejectedFields: [...decision.rejectedFields],
    stateMutationAuthorized: false,
    customerReleaseAuthorized: false,
  };
}

function summarizeExecution(
  execution: StateExecutionResult,
): PrototypeExecutionSummary {
  return {
    success: execution.success,
    reason: execution.reason,
    transitionId: execution.transitionId,
    executionTimestamp: execution.executionTimestamp,
    expectedStateRevision:
      execution.executionMetadata.expectedStateRevision,
    appliedStateRevision:
      execution.executionMetadata.appliedStateRevision,
  };
}

function isProjectionState(value: unknown): value is ConversationState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<ConversationState>;
  return (
    candidate.confirmedFacts !== null
    && typeof candidate.confirmedFacts === "object"
    && !Array.isArray(candidate.confirmedFacts)
  );
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}
