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
import { evaluateIntakeReadiness } from "../conversation/intake-readiness";
import {
  CONVERSATION_PROGRESS_SERVICE_STATUSES,
  DEFAULT_CONVERSATION_PROGRESS_POLICY,
} from "../conversation-progress/contracts";
import { CONVERSATION_STAGES } from "../shared/constants";

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
        serviceResolutionStatus: requestedServiceId
          ? CONVERSATION_PROGRESS_SERVICE_STATUSES.UNSUPPORTED
          : stateInput.stage === CONVERSATION_STAGES.CLARIFICATION
            ? CONVERSATION_PROGRESS_SERVICE_STATUSES.AMBIGUOUS
            : CONVERSATION_PROGRESS_SERVICE_STATUSES.UNRESOLVED,
        reopenedRequiredFieldIds: [],
        completionEligible: false,
        progressPolicy: DEFAULT_CONVERSATION_PROGRESS_POLICY,
      };
    }
    const fields = resolveIntakeFields(this.profile, service, stateInput);
    if (!fields) return null;
    const requiredFieldIds = unique([
      "requested-service",
      ...fields.required.map((field) => field.id),
    ]);
    const readiness = evaluateIntakeReadiness(
      this.profile,
      stateInput,
      service,
    );
    return {
      requiredFieldIds,
      resolvedServiceId: service.id,
      serviceResolutionStatus:
        CONVERSATION_PROGRESS_SERVICE_STATUSES.RESOLVED,
      reopenedRequiredFieldIds: unique(
        stateInput.corrections
          .map((correction) => correction.field)
          .filter(
            (field) =>
              requiredFieldIds.includes(field)
              && stateInput.missingFields.includes(field),
          ),
      ),
      completionEligible:
        readiness.status === "ready-for-confirmation"
        || readiness.status === "ready-for-handoff",
      progressPolicy: DEFAULT_CONVERSATION_PROGRESS_POLICY,
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
