import type {
  ActiveConfigurationSnapshot,
  AtomicConfigurationActivationStore,
} from "./activation-contracts";
import type {
  BusinessProfileRevisionSnapshot,
  BusinessProfileVersionRepository,
  ConfigurationChangeContext,
  ConfigurationRepositoryFailureReason,
  ConfigurationRepositoryResult,
  KnowledgeRevisionSnapshot,
  KnowledgeVersionRepository,
  TransitionBusinessProfileLifecycleInput,
  TransitionKnowledgeLifecycleInput,
} from "./contracts";
import {
  validateBusinessProfileRevisionScope,
  validateKnowledgeRevisionScope,
} from "./contract-support";
import { validateBusinessProfileStructure } from "../validation/business-profile-validation";
import { validateKnowledge } from "../validation/knowledge-validation";

export type ConfigurationLifecycleFailureReason =
  | "InvalidInput"
  | "AuthorizationDenied"
  | "RevisionUnavailable"
  | "StaleRevision"
  | "InvalidConfiguration"
  | "IllegalTransition"
  | "ActivationUnavailable"
  | "DuplicateRequest"
  | "PersistenceFailure";

export type ConfigurationLifecycleResult<Snapshot> =
  | { readonly status: "success"; readonly value: Readonly<Snapshot> }
  | {
      readonly status: "failure";
      readonly reason: ConfigurationLifecycleFailureReason;
      readonly errors: readonly string[];
    };

export interface ConfigurationLifecycleCoordinatorDependencies {
  readonly businessProfiles: BusinessProfileVersionRepository<"asynchronous">;
  readonly knowledge: KnowledgeVersionRepository<"asynchronous">;
  readonly activations: AtomicConfigurationActivationStore;
}

/**
 * Application-owned lifecycle legality, validation, authorization, and
 * activation-prerequisite boundary. Repositories receive only accepted facts.
 */
export class ConfigurationLifecycleCoordinator {
  constructor(
    private readonly dependencies: Readonly<ConfigurationLifecycleCoordinatorDependencies>,
  ) {}

  async transitionBusinessProfile(
    input: Readonly<TransitionBusinessProfileLifecycleInput>,
  ): Promise<ConfigurationLifecycleResult<BusinessProfileRevisionSnapshot>> {
    const scope = validateBusinessProfileRevisionScope(input.scope);
    if (
      scope.status === "invalid"
      || !validContext(input.context)
      || input.context.audit.subject !== "business-profile"
    ) {
      return failure("InvalidInput", ["Business Profile lifecycle input is invalid."]);
    }
    if (input.context.authorization.decision !== "authorized") {
      return failure("AuthorizationDenied", ["Business Profile lifecycle transition is not authorized."]);
    }
    const current = await this.dependencies.businessProfiles.readRevision(scope.scope);
    if (current.status === "failure") return repositoryReadFailure(current.reason, "Business Profile");
    if (current.value.revision !== input.context.expectedRevision) {
      return failure("StaleRevision", ["Business Profile lifecycle revision is stale."]);
    }
    if (!isBusinessProfileTransition(current.value.lifecycleStatus, input.targetStatus)) {
      return failure("IllegalTransition", ["Business Profile lifecycle transition is not allowed."]);
    }
    if (!operationMatchesTarget(input.context, input.targetStatus)) {
      return failure("InvalidInput", ["Business Profile lifecycle operation does not match its target."]);
    }
    if (input.targetStatus === "ready-for-review") {
      const validation = validateBusinessProfileStructure(current.value.profile, {
        id: scope.scope.businessProfileId,
        version: scope.scope.businessProfileVersion,
      });
      if (!validation.valid) return failure("InvalidConfiguration", validation.errors);
    }
    if (input.targetStatus === "active") {
      const activation = await this.dependencies.activations.readActive(scope.scope.businessProfileId);
      if (!matchesProfileActivation(activation, scope.scope.businessProfileVersion)) {
        return failure("ActivationUnavailable", ["Exact activated Business Profile evidence is unavailable."]);
      }
    }
    return mapRepositoryResult(
      await this.dependencies.businessProfiles.recordLifecycleTransition(input),
    );
  }

  async transitionKnowledge(
    input: Readonly<TransitionKnowledgeLifecycleInput>,
  ): Promise<ConfigurationLifecycleResult<KnowledgeRevisionSnapshot>> {
    const scope = validateKnowledgeRevisionScope(input.scope);
    if (
      scope.status === "invalid"
      || !validContext(input.context)
      || input.context.audit.subject !== "knowledge-record"
    ) {
      return failure("InvalidInput", ["Knowledge lifecycle input is invalid."]);
    }
    if (input.context.authorization.decision !== "authorized") {
      return failure("AuthorizationDenied", ["Knowledge lifecycle transition is not authorized."]);
    }
    const current = await this.dependencies.knowledge.readRevision(scope.scope);
    if (current.status === "failure") return repositoryReadFailure(current.reason, "Knowledge");
    if (current.value.revision !== input.context.expectedRevision) {
      return failure("StaleRevision", ["Knowledge lifecycle revision is stale."]);
    }
    if (!isKnowledgeTransition(current.value.lifecycleStatus, input.targetStatus)) {
      return failure("IllegalTransition", ["Knowledge lifecycle transition is not allowed."]);
    }
    if (!operationMatchesTarget(input.context, input.targetStatus)) {
      return failure("InvalidInput", ["Knowledge lifecycle operation does not match its target."]);
    }
    if (input.targetStatus === "under-review" || input.targetStatus === "approved") {
      const validation = validateKnowledge(
        [current.value.record],
        scope.scope.businessProfileId,
      );
      if (!validation.valid) return failure("InvalidConfiguration", validation.errors);
    }
    if (input.targetStatus === "active") {
      const activation = await this.dependencies.activations.readActive(scope.scope.businessProfileId);
      if (!matchesKnowledgeActivation(activation, scope.scope)) {
        return failure("ActivationUnavailable", ["Exact activated Knowledge Record evidence is unavailable."]);
      }
    }
    return mapRepositoryResult(
      await this.dependencies.knowledge.recordLifecycleTransition(input),
    );
  }

  async inspectBusinessProfile(
    scope: Readonly<TransitionBusinessProfileLifecycleInput["scope"]>,
  ): Promise<ConfigurationLifecycleResult<BusinessProfileRevisionSnapshot>> {
    return mapRepositoryResult(
      await this.dependencies.businessProfiles.readRevision(scope),
    );
  }

  async inspectKnowledge(
    scope: Readonly<TransitionKnowledgeLifecycleInput["scope"]>,
  ): Promise<ConfigurationLifecycleResult<KnowledgeRevisionSnapshot>> {
    return mapRepositoryResult(
      await this.dependencies.knowledge.readRevision(scope),
    );
  }
}

function isBusinessProfileTransition(from: string, to: string): boolean {
  return (from === "draft" && to === "ready-for-review")
    || (from === "ready-for-review" && to === "active")
    || (from === "active" && to === "suspended");
}

function isKnowledgeTransition(from: string, to: string): boolean {
  return (from === "draft" && to === "under-review")
    || (from === "under-review" && to === "approved")
    || (from === "approved" && to === "active")
    || (from === "active" && to === "suspended");
}

function operationMatchesTarget(
  context: Readonly<ConfigurationChangeContext>,
  target: string,
): boolean {
  const expected = target === "ready-for-review" || target === "under-review"
    ? "submit-for-review"
    : target === "approved"
      ? "approve"
      : target === "active"
        ? "activate"
        : target === "suspended"
          ? "suspend"
          : null;
  return expected !== null && context.audit.operation === expected;
}

function validContext(context: Readonly<ConfigurationChangeContext>): boolean {
  return canonical(context.requestId)
    && Number.isInteger(context.expectedRevision)
    && context.expectedRevision >= 0
    && canonical(context.authorization.actorId)
    && canonical(context.authorization.decisionId)
    && canonical(context.audit.auditEventId)
    && context.audit.reason.trim().length > 0;
}

function matchesProfileActivation(
  result: Awaited<ReturnType<AtomicConfigurationActivationStore["readActive"]>>,
  version: number,
): result is { readonly status: "success"; readonly value: Readonly<ActiveConfigurationSnapshot> } {
  return result.status === "success" && result.value.businessProfileVersion === version;
}

function matchesKnowledgeActivation(
  result: Awaited<ReturnType<AtomicConfigurationActivationStore["readActive"]>>,
  scope: Readonly<TransitionKnowledgeLifecycleInput["scope"]>,
): boolean {
  return result.status === "success"
    && result.value.businessProfileVersion === scope.businessProfileVersion
    && result.value.knowledge.some((item) =>
      item.businessProfileId === scope.businessProfileId
      && item.businessProfileVersion === scope.businessProfileVersion
      && item.knowledgeRecordId === scope.knowledgeRecordId
      && item.knowledgeRecordVersion === scope.knowledgeRecordVersion
    );
}

function mapRepositoryResult<Snapshot>(
  result: ConfigurationRepositoryResult<Snapshot>,
): ConfigurationLifecycleResult<Snapshot> {
  if (result.status === "success") {
    return { status: "success", value: result.value };
  }
  const reason = result.reason === "RevisionAlreadyExists"
    ? "DuplicateRequest"
    : result.reason === "RevisionConflict"
      ? "StaleRevision"
      : result.reason === "PersistenceFailure"
        ? "PersistenceFailure"
        : result.reason === "RevisionNotFound"
          ? "RevisionUnavailable"
          : "InvalidInput";
  return failure(reason, result.errors);
}

function repositoryReadFailure(
  reason: ConfigurationRepositoryFailureReason,
  subject: string,
): ConfigurationLifecycleResult<never> {
  if (reason === "PersistenceFailure") {
    return failure("PersistenceFailure", [`${subject} lifecycle persistence is unavailable.`]);
  }
  return failure("RevisionUnavailable", [`${subject} revision is unavailable in the requested scope.`]);
}

function failure(
  reason: ConfigurationLifecycleFailureReason,
  errors: readonly string[],
): ConfigurationLifecycleResult<never> {
  return { status: "failure", reason, errors };
}

function canonical(value: string): boolean {
  return value.length > 0 && value === value.trim();
}
