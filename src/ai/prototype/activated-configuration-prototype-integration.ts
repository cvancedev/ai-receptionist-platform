import type {
  ActivatedConfigurationResolutionFailureReason,
  ResolvedActivatedConfiguration,
} from "../../business-configuration/activated-configuration-resolver";
import { ActivatedConfigurationResolver } from "../../business-configuration/activated-configuration-resolver";
import type { ConversationStateAccessResult } from "../../conversation/conversation-state-manager";
import type {
  ConversationStore,
  ConversationStoreFailureReason,
  ConversationStoreScope,
} from "../../conversation/conversation-store";
import type { ExecutionJournalStore } from "../execution-journal/contracts";
import type {
  TransactionalExecutionPersistenceCoordinator,
  TransactionalExecutionPersistenceFailureReason,
} from "../execution-persistence/contracts";
import { deepFreeze } from "../shared/immutable";
import {
  PersistenceBackedPrototypeIntegration,
  type PersistenceBackedPrototypeAdvanceResult,
  type PersistenceBackedPrototypeRecoveryResult,
} from "./persistence-backed-prototype-integration";

export interface ActivatedConfigurationPrototypeDependencies {
  readonly configurationResolver: ActivatedConfigurationResolver;
  readonly conversationStore: ConversationStore<"asynchronous">;
  readonly executionJournal: ExecutionJournalStore<"asynchronous">;
  readonly transactionCoordinator: TransactionalExecutionPersistenceCoordinator;
}

export interface ActivatedConfigurationPrototypeInitialization {
  readonly businessProfileId: string;
  readonly conversationId: string;
  readonly effectiveAt: string;
}

export interface ActivatedConfigurationPrototypeOperation {
  readonly scope: Readonly<ConversationStoreScope>;
  readonly effectiveAt: string;
}

export interface ActivatedConfigurationPrototypeSnapshot {
  readonly configuration: Readonly<ResolvedActivatedConfiguration>;
  readonly recovery: Extract<
    PersistenceBackedPrototypeRecoveryResult,
    { readonly status: "success" }
  >;
}

export type ActivatedConfigurationPrototypeFailureReason =
  | "ConfigurationUnavailable"
  | "ConversationUnavailable"
  | "PrototypeUnavailable";

export type ActivatedConfigurationPrototypeResult =
  | {
      readonly status: "success";
      readonly value: Readonly<ActivatedConfigurationPrototypeSnapshot>;
    }
  | {
      readonly status: "failure";
      readonly reason: ActivatedConfigurationPrototypeFailureReason;
      readonly configurationFailure?: ActivatedConfigurationResolutionFailureReason;
      readonly persistenceFailure?:
        | ConversationStoreFailureReason
        | TransactionalExecutionPersistenceFailureReason;
      readonly errors: readonly string[];
    };

export type ActivatedConfigurationPrototypeAdvanceResult =
  | {
      readonly status: "committed" | "progress-only";
      readonly configuration: Readonly<ResolvedActivatedConfiguration>;
      readonly prototype: Extract<
        PersistenceBackedPrototypeAdvanceResult,
        { readonly status: "committed" | "progress-only" }
      >;
    }
  | Extract<ActivatedConfigurationPrototypeResult, { readonly status: "failure" }>;

/**
 * Opt-in fictional workflow from an exact activated configuration to the
 * certified persistence-backed deterministic/mock prototype. It has no
 * configuration mutation, activation, authentication, release, or UI access.
 */
export class ActivatedConfigurationPrototypeIntegration {
  constructor(
    private readonly dependencies: Readonly<ActivatedConfigurationPrototypeDependencies>,
  ) {}

  async initialize(
    input: Readonly<ActivatedConfigurationPrototypeInitialization>,
  ): Promise<ActivatedConfigurationPrototypeResult> {
    const configuration = await this.dependencies.configurationResolver.resolve({
      businessProfileId: input.businessProfileId,
      effectiveAt: input.effectiveAt,
      audience: "customer",
      selection: { mode: "current" },
    });
    if (configuration.status === "failure") {
      return configurationFailure(configuration.reason);
    }
    const profile = configuration.value.businessProfile;
    const scope = {
      businessProfileId: profile.id,
      businessProfileVersion: profile.version,
      conversationId: input.conversationId,
    };
    const integration = this.integration(scope, configuration.value);
    const initialized = await integration.initialize({
      ...scope,
      requiredFields: requiredInitializationFields(profile),
      authorizedEscalationDestination: profile.escalation.destination,
    });
    if (initialized.status === "failure") {
      return conversationFailure(initialized);
    }
    return this.recover({ scope, effectiveAt: input.effectiveAt });
  }

  async recover(
    input: Readonly<ActivatedConfigurationPrototypeOperation>,
  ): Promise<ActivatedConfigurationPrototypeResult> {
    const configuration = await this.resolvePinned(input);
    if (configuration.status === "failure") return configuration;
    const recovered = await this.integration(
      input.scope,
      configuration.value,
    ).recover(input.scope);
    if (recovered.status === "failure") {
      return prototypeFailure(recovered.persistenceFailure);
    }
    return {
      status: "success",
      value: deepFreeze({
        configuration: configuration.value,
        recovery: recovered,
      }),
    };
  }

  async advance(
    input: Readonly<ActivatedConfigurationPrototypeOperation>,
  ): Promise<ActivatedConfigurationPrototypeAdvanceResult> {
    const configuration = await this.resolvePinned(input);
    if (configuration.status === "failure") return configuration;
    const advanced = await this.integration(
      input.scope,
      configuration.value,
    ).advance(input.scope);
    if (advanced.status === "failure") {
      return prototypeFailure(advanced.persistenceFailure);
    }
    return deepFreeze({
      status: advanced.status,
      configuration: configuration.value,
      prototype: advanced,
    });
  }

  private async resolvePinned(
    input: Readonly<ActivatedConfigurationPrototypeOperation>,
  ): Promise<
    | { readonly status: "success"; readonly value: Readonly<ResolvedActivatedConfiguration> }
    | Extract<ActivatedConfigurationPrototypeResult, { readonly status: "failure" }>
  > {
    const configuration = await this.dependencies.configurationResolver.resolve({
      businessProfileId: input.scope.businessProfileId,
      effectiveAt: input.effectiveAt,
      audience: "customer",
      selection: {
        mode: "pinned",
        businessProfileVersion: input.scope.businessProfileVersion,
      },
    });
    if (configuration.status === "failure") {
      return configurationFailure(configuration.reason);
    }
    const pinnedConversation = await this.dependencies.conversationStore.read(
      input.scope,
    );
    if (pinnedConversation.status === "failure") {
      return conversationStoreFailure(pinnedConversation.reason);
    }
    return configuration;
  }

  private integration(
    scope: Readonly<ConversationStoreScope>,
    configuration: Readonly<ResolvedActivatedConfiguration>,
  ): PersistenceBackedPrototypeIntegration {
    return new PersistenceBackedPrototypeIntegration(
      {
        scope,
        businessProfile: configuration.businessProfile,
        knowledge: configuration.knowledge,
      },
      {
        conversationStore: this.dependencies.conversationStore,
        executionJournal: this.dependencies.executionJournal,
        transactionCoordinator: this.dependencies.transactionCoordinator,
      },
    );
  }
}

function requiredInitializationFields(
  profile: Readonly<ResolvedActivatedConfiguration["businessProfile"]>,
): readonly string[] {
  return [
    "requested-service",
    ...profile.intakeRequirements
      .filter((field) => field.required && field.serviceIds.length === 0)
      .map((field) => field.id),
  ].filter((field, index, fields) => fields.indexOf(field) === index);
}

function configurationFailure(
  configurationFailure: ActivatedConfigurationResolutionFailureReason,
): Extract<ActivatedConfigurationPrototypeResult, { readonly status: "failure" }> {
  return deepFreeze({
    status: "failure",
    reason: "ConfigurationUnavailable",
    configurationFailure,
    errors: ["Activated configuration is unavailable for this conversation."],
  });
}

function conversationFailure(
  result: Extract<ConversationStateAccessResult, { readonly status: "failure" }>,
): Extract<ActivatedConfigurationPrototypeResult, { readonly status: "failure" }> {
  return deepFreeze({
    status: "failure",
    reason: "ConversationUnavailable",
    ...(result.persistenceFailure
      ? { persistenceFailure: result.persistenceFailure }
      : {}),
    errors: ["The scoped fictional conversation is unavailable."],
  });
}

function conversationStoreFailure(
  persistenceFailure: ConversationStoreFailureReason,
): Extract<ActivatedConfigurationPrototypeResult, { readonly status: "failure" }> {
  return deepFreeze({
    status: "failure",
    reason: "ConversationUnavailable",
    persistenceFailure,
    errors: ["The scoped fictional conversation is unavailable."],
  });
}

function prototypeFailure(
  persistenceFailure?:
    | ConversationStoreFailureReason
    | TransactionalExecutionPersistenceFailureReason,
): Extract<ActivatedConfigurationPrototypeResult, { readonly status: "failure" }> {
  return deepFreeze({
    status: "failure",
    reason: "PrototypeUnavailable",
    ...(persistenceFailure ? { persistenceFailure } : {}),
    errors: ["The activated fictional prototype path is unavailable."],
  });
}
