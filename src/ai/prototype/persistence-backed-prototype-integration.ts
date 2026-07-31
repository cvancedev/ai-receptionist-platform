import type {
  ExecutionJournalSnapshot,
  ExecutionJournalStore,
} from "../execution-journal/contracts";
import type {
  TransactionalExecutionPersistenceCoordinator,
  TransactionalExecutionPersistenceFailureReason,
} from "../execution-persistence/contracts";
import type { StateExecutionResult } from "../execution/contracts";
import { deepFreeze } from "../shared/immutable";
import type {
  ConversationStateAccessResult,
  InitializeConversationInput,
} from "../../conversation/conversation-state-manager";
import { ConversationStateManager } from "../../conversation/conversation-state-manager";
import type {
  ConversationStore,
  ConversationStoreFailureReason,
  ConversationStoreScope,
} from "../../conversation/conversation-store";
import { InMemoryConversationStore } from "../../conversation/in-memory-conversation-store";
import { ConversationReadModelProjector } from "../../conversation-read-model/conversation-read-model-projector";
import type { ConversationReadModel } from "../../conversation-read-model/contracts";
import { CONVERSATION_READ_MODEL_ACTIONS } from "../../conversation-read-model/contracts";
import { buildPrototypeProjectionContext } from "../../conversation-read-model/prototype-projection-context";
import type { BusinessProfile } from "../../domain/business-profile";
import type { ConversationState } from "../../domain/conversation-state";
import { validateBusinessProfile } from "../../validation/business-profile-validation";
import { AiFoundationPrototypeOrchestrator } from "./ai-foundation-orchestrator";

export interface PersistenceBackedPrototypeConfiguration {
  readonly scope: Readonly<ConversationStoreScope>;
  readonly businessProfile: Readonly<BusinessProfile>;
}

export interface PersistenceBackedPrototypeDependencies {
  readonly conversationStore: ConversationStore<"asynchronous">;
  readonly executionJournal: ExecutionJournalStore<"asynchronous">;
  readonly transactionCoordinator: TransactionalExecutionPersistenceCoordinator;
}

export type PersistenceBackedPrototypeRecoveryFailureReason =
  | "ScopeMismatch"
  | "StateUnavailable"
  | "JournalUnavailable"
  | "ProjectionFailed";

export type PersistenceBackedPrototypeRecoveryResult =
  | {
      readonly status: "success";
      readonly state: Readonly<ConversationState>;
      readonly journal: ExecutionJournalSnapshot;
      readonly readModel: ConversationReadModel;
    }
  | {
      readonly status: "failure";
      readonly reason: PersistenceBackedPrototypeRecoveryFailureReason;
      readonly persistenceFailure?: ConversationStoreFailureReason;
    };

export type PersistenceBackedPrototypeAdvanceResult =
  | {
      readonly status: "committed";
      readonly execution: StateExecutionResult;
      readonly recovery: Extract<
        PersistenceBackedPrototypeRecoveryResult,
        { readonly status: "success" }
      >;
    }
  | {
      readonly status: "progress-only";
      readonly reason: "NoAuthorizedStateTransition";
      readonly recovery: Extract<
        PersistenceBackedPrototypeRecoveryResult,
        { readonly status: "success" }
      >;
    }
  | {
      readonly status: "failure";
      readonly reason:
        | PersistenceBackedPrototypeRecoveryFailureReason
        | "ExecutionUnavailable"
        | "ExecutionRejected"
        | "PersistenceFailed";
      readonly persistenceFailure?:
        | ConversationStoreFailureReason
        | TransactionalExecutionPersistenceFailureReason;
    };

/**
 * Explicitly opt-in fictional prototype integration for durable initialization,
 * controlled execution, recovery, and deterministic post-restart progression.
 * It owns orchestration only and grants no persistence adapter workflow authority.
 */
export class PersistenceBackedPrototypeIntegration {
  private readonly stateManager: ConversationStateManager<"asynchronous">;
  private readonly readModelProjector = new ConversationReadModelProjector();
  private readonly configuredScope: Readonly<ConversationStoreScope>;
  private readonly profile: Readonly<BusinessProfile>;

  constructor(
    configuration: Readonly<PersistenceBackedPrototypeConfiguration>,
    private readonly dependencies: Readonly<PersistenceBackedPrototypeDependencies>,
  ) {
    this.configuredScope = Object.freeze({ ...configuration.scope });
    this.profile = structuredClone(configuration.businessProfile);
    this.stateManager = ConversationStateManager.usingStore(
      dependencies.conversationStore,
    );
  }

  initialize(
    input: Readonly<InitializeConversationInput>,
  ): Promise<ConversationStateAccessResult> {
    if (!this.isConfiguredProfileScope(input)) {
      return Promise.resolve({
        status: "failure",
        errors: ["Initialization scope does not match the configured prototype."],
        persistenceFailure: "ScopeMismatch",
      });
    }
    return this.stateManager.initialize(input);
  }

  async recover(
    scope: Readonly<ConversationStoreScope>,
  ): Promise<PersistenceBackedPrototypeRecoveryResult> {
    if (!this.isConfiguredProfileScope(scope)) {
      return recoveryFailure("ScopeMismatch");
    }

    const stateResult = await this.stateManager.snapshot(scope);
    if (stateResult.status === "failure") {
      return recoveryFailure(
        "StateUnavailable",
        stateResult.persistenceFailure,
      );
    }
    const journal = await this.dependencies.executionJournal.snapshot(scope);
    if (journal.failure) return recoveryFailure("JournalUnavailable");

    const context = buildPrototypeProjectionContext(
      this.profile,
      stateResult.state,
    );
    const projection = this.readModelProjector.project(
      stateResult.state,
      context,
    );
    if (projection.status === "failure") {
      return recoveryFailure("ProjectionFailed");
    }
    return deepFreeze({
      status: "success",
      state: stateResult.state,
      journal,
      readModel: projection.readModel,
    });
  }

  async advance(
    scope: Readonly<ConversationStoreScope>,
  ): Promise<PersistenceBackedPrototypeAdvanceResult> {
    const recovery = await this.recover(scope);
    if (recovery.status === "failure") return recovery;

    if (
      recovery.readModel.recommendedNextAction
        !== CONVERSATION_READ_MODEL_ACTIONS.BEGIN_INTAKE
    ) {
      return deepFreeze({
        status: "progress-only",
        reason: "NoAuthorizedStateTransition",
        recovery,
      } satisfies PersistenceBackedPrototypeAdvanceResult);
    }

    const executionManager = managerFromRecoveredState(recovery.state);
    if (!executionManager) {
      return advanceFailure("ExecutionUnavailable");
    }
    const controlled = await new AiFoundationPrototypeOrchestrator({
      executionManager,
    }).runWithExecution("valid_intent");
    if (controlled.status === "failure") {
      return advanceFailure("ExecutionUnavailable");
    }
    if (!controlled.value.execution.success) {
      return advanceFailure("ExecutionRejected");
    }

    const persistence = await this.dependencies.transactionCoordinator.persist({
      scope,
      execution: controlled.value.execution,
    });
    if (persistence.status === "failure") {
      return advanceFailure("PersistenceFailed", persistence.reason);
    }

    const committedRecovery = await this.recover(scope);
    if (committedRecovery.status === "failure") return committedRecovery;
    return deepFreeze({
      status: "committed",
      execution: controlled.value.execution,
      recovery: committedRecovery,
    });
  }

  private isConfiguredProfileScope(
    scope: Readonly<ConversationStoreScope>,
  ): boolean {
    const profileValidation = validateBusinessProfile(this.profile, {
      id: scope.businessProfileId,
      version: scope.businessProfileVersion,
    });
    return profileValidation.valid
      && scope.conversationId === this.configuredScope.conversationId
      && scope.businessProfileId === this.configuredScope.businessProfileId
      && scope.businessProfileVersion
        === this.configuredScope.businessProfileVersion;
  }
}

function managerFromRecoveredState(
  state: Readonly<ConversationState>,
): ConversationStateManager | null {
  const store = new InMemoryConversationStore();
  const seeded = store.create(state);
  return seeded.status === "success"
    ? ConversationStateManager.usingStore(store)
    : null;
}

function recoveryFailure(
  reason: PersistenceBackedPrototypeRecoveryFailureReason,
  persistenceFailure?: ConversationStoreFailureReason,
): Extract<PersistenceBackedPrototypeRecoveryResult, { status: "failure" }> {
  return deepFreeze({
    status: "failure",
    reason,
    ...(persistenceFailure ? { persistenceFailure } : {}),
  });
}

function advanceFailure(
  reason: Extract<
    PersistenceBackedPrototypeAdvanceResult,
    { readonly status: "failure" }
  >["reason"],
  persistenceFailure?:
    | ConversationStoreFailureReason
    | TransactionalExecutionPersistenceFailureReason,
): Extract<PersistenceBackedPrototypeAdvanceResult, { status: "failure" }> {
  return deepFreeze({
    status: "failure",
    reason,
    ...(persistenceFailure ? { persistenceFailure } : {}),
  });
}
