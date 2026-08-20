import { deepFreeze } from "../../ai/shared/immutable";
import type {
  ActivatedConfigurationPrototypeInitialization,
  ActivatedConfigurationPrototypeOperation,
  ActivatedConfigurationPrototypeResult,
} from "../../ai/prototype/activated-configuration-prototype-integration";
import type { ResolvedActivatedConfiguration } from "../../business-configuration/activated-configuration-resolver";
import type { ConversationStoreScope } from "../../conversation/conversation-store";
import type { ConversationState } from "../../domain/conversation-state";
import { DeterministicHandoffBuilder } from "../../handoff/handoff-builder";
import { COMPLETION_STATES, CONVERSATION_STAGES } from "../../shared/constants";
import type {
  EndToEndHandoffBoundary,
  EndToEndKnowledgeReference,
  EndToEndPreparationFailure,
  EndToEndTurnPreparationResult,
  EndToEndTurnRequest,
} from "./contracts";

const MAX_IDENTIFIER_LENGTH = 160;
const MAX_MESSAGE_LENGTH = 4_000;

export interface ActivatedConversationCompositionPort {
  initialize(input: Readonly<ActivatedConfigurationPrototypeInitialization>): Promise<ActivatedConfigurationPrototypeResult>;
  recover(input: Readonly<ActivatedConfigurationPrototypeOperation>): Promise<ActivatedConfigurationPrototypeResult>;
}

/**
 * Application-owned Milestone 8.1 preflight composition. It validates one
 * fictional inbound turn and composes already-certified configuration,
 * recovery, progress, and handoff boundaries without processing the message.
 */
export class EndToEndConversationCoordinator {
  private readonly handoffBuilder = new DeterministicHandoffBuilder();

  constructor(
    private readonly activatedConversation: ActivatedConversationCompositionPort,
  ) {}

  async prepareTurn(requestInput: unknown): Promise<EndToEndTurnPreparationResult> {
    if (!isTurnRequest(requestInput)) {
      return failure("InvalidInput", "End-to-end turn input is invalid.");
    }
    const request = requestInput as EndToEndTurnRequest;

    try {
      const resolved = request.mode === "start"
        ? await this.activatedConversation.initialize({
            businessProfileId: request.businessProfileId,
            conversationId: request.conversationId,
            effectiveAt: request.effectiveAt,
          })
        : await this.activatedConversation.recover({
            scope: request.scope,
            effectiveAt: request.effectiveAt,
          });
      if (resolved.status === "failure") return mapActivatedFailure(resolved.reason);

      const expectedScope = request.mode === "start"
        ? {
            businessProfileId: request.businessProfileId,
            businessProfileVersion: resolved.value.configuration.businessProfile.version,
            conversationId: request.conversationId,
          }
        : request.scope;
      if (!hasExactResolvedScope(resolved.value, expectedScope)) {
        return failure("ScopeMismatch", "End-to-end conversation scope is unavailable.");
      }

      const handoff = this.deriveHandoff(
        resolved.value.configuration,
        resolved.value.recovery.state,
      );
      if (handoff.status === "failure") return handoff;

      const state = resolved.value.recovery.state;
      const readModel = resolved.value.recovery.readModel;
      return deepFreeze({
        status: "success",
        value: {
          identity: {
            turnId: request.turnId,
            businessProfileId: state.businessProfileId,
            businessProfileVersion: state.businessProfileVersion,
            conversationId: state.conversationId,
            stateRevision: state.revision,
          },
          inboundMessage: {
            messageId: request.message.messageId,
            source: "customer",
            sequence: request.message.sequence,
            acceptedForProcessing: true,
            contentPersisted: false,
          },
          configuration: {
            activationRevision: resolved.value.configuration.activation.activationRevision,
            knowledge: knowledgeReferences(resolved.value.configuration),
          },
          conversation: {
            stage: readModel.stage,
            recommendedNextAction: readModel.recommendedNextAction,
          },
          applicationDecision: {
            decision: "ready-for-turn-processing",
            turnStateMutationAuthorized: false,
            transitionExecutionAuthorized: false,
            customerReleaseAuthorized: false,
            externalActionAuthorized: false,
          },
          response: {
            status: "not-produced",
            candidate: null,
            reason: "TurnProcessingNotAuthorizedInMilestone8_1",
            customerReleaseAuthorized: false,
          },
          handoff: handoff.value,
        },
      });
    } catch {
      return failure("CompositionUnavailable", "End-to-end conversation preparation is unavailable.");
    }
  }

  private deriveHandoff(
    configuration: Readonly<ResolvedActivatedConfiguration>,
    state: Readonly<ConversationState>,
  ):
    | { readonly status: "success"; readonly value: EndToEndHandoffBoundary }
    | Extract<EndToEndTurnPreparationResult, { readonly status: "failure" }> {
    const mayBeReady = state.stage === CONVERSATION_STAGES.HANDOFF
      || state.stage === CONVERSATION_STAGES.COMPLETED
      || state.completionState === COMPLETION_STATES.READY_FOR_HANDOFF;
    if (!mayBeReady) {
      return { status: "success", value: { status: "not-ready", summary: null } };
    }
    const handoff = this.handoffBuilder.build(
      structuredClone(configuration.businessProfile),
      structuredClone(state),
    );
    return handoff.status === "success"
      ? { status: "success", value: { status: "ready", summary: handoff.summary } }
      : failure("HandoffUnavailable", "Validated handoff is unavailable.");
  }
}

function mapActivatedFailure(
  reason: Extract<ActivatedConfigurationPrototypeResult, { readonly status: "failure" }>["reason"],
): EndToEndTurnPreparationResult {
  if (reason === "ConfigurationUnavailable") {
    return failure("ConfigurationUnavailable", "Activated configuration is unavailable for this conversation.");
  }
  if (reason === "ConversationUnavailable") {
    return failure("ConversationUnavailable", "The scoped fictional conversation is unavailable.");
  }
  return failure("CompositionUnavailable", "End-to-end conversation preparation is unavailable.");
}

function hasExactResolvedScope(
  snapshot: Extract<ActivatedConfigurationPrototypeResult, { readonly status: "success" }>["value"],
  expected: Readonly<ConversationStoreScope>,
): boolean {
  const { configuration, recovery } = snapshot;
  const identities = [
    {
      businessProfileId: configuration.businessProfile.id,
      businessProfileVersion: configuration.businessProfile.version,
      conversationId: recovery.state.conversationId,
    },
    recovery.readModel.identity,
    {
      businessProfileId: recovery.state.businessProfileId,
      businessProfileVersion: recovery.state.businessProfileVersion,
      conversationId: recovery.state.conversationId,
    },
  ];
  if (
    configuration.activation.businessProfileId !== expected.businessProfileId
    || configuration.activation.businessProfileVersion !== expected.businessProfileVersion
    || configuration.activation.knowledge.length !== configuration.knowledge.length
  ) return false;
  return identities.every((identity) =>
    identity.businessProfileId === expected.businessProfileId
    && identity.businessProfileVersion === expected.businessProfileVersion
    && identity.conversationId === expected.conversationId
  ) && configuration.activation.knowledge.every((scope) =>
    scope.businessProfileId === expected.businessProfileId
    && scope.businessProfileVersion === expected.businessProfileVersion
  ) && configuration.knowledge.every((record) =>
    record.businessProfileId === expected.businessProfileId
    && configuration.activation.knowledge.some((scope) =>
      scope.knowledgeRecordId === record.id
      && scope.knowledgeRecordVersion === record.version
    )
  ) && configuration.activation.knowledge.every((scope) =>
    configuration.knowledge.some((record) =>
      record.id === scope.knowledgeRecordId
      && record.version === scope.knowledgeRecordVersion
    )
  );
}

function knowledgeReferences(
  configuration: Readonly<ResolvedActivatedConfiguration>,
): readonly Readonly<EndToEndKnowledgeReference>[] {
  return configuration.knowledge.map((record) => ({
    knowledgeRecordId: record.id,
    knowledgeRecordVersion: record.version,
    source: record.source,
  }));
}

function isTurnRequest(value: unknown): value is EndToEndTurnRequest {
  if (!isPlainRecord(value)) return false;
  const common = ["mode", "turnId", "effectiveAt", "message"];
  if (!isBoundedIdentifier(value.turnId) || !isTimestamp(value.effectiveAt) || !isCustomerMessage(value.message)) return false;
  if (value.mode === "start") {
    return hasExactKeys(value, [...common, "businessProfileId", "conversationId"])
      && isBoundedIdentifier(value.businessProfileId)
      && isBoundedIdentifier(value.conversationId)
      && value.message.conversationId === value.conversationId;
  }
  if (value.mode === "resume") {
    return hasExactKeys(value, [...common, "scope"])
      && isConversationScope(value.scope)
      && value.message.conversationId === value.scope.conversationId;
  }
  return false;
}

function isCustomerMessage(value: unknown): value is EndToEndTurnRequest["message"] {
  return isPlainRecord(value)
    && hasExactKeys(value, ["messageId", "conversationId", "source", "sequence", "content"])
    && isBoundedIdentifier(value.messageId)
    && isBoundedIdentifier(value.conversationId)
    && value.source === "customer"
    && Number.isInteger(value.sequence)
    && Number(value.sequence) > 0
    && typeof value.content === "string"
    && value.content === value.content.trim()
    && value.content.length > 0
    && value.content.length <= MAX_MESSAGE_LENGTH;
}

function isConversationScope(value: unknown): value is ConversationStoreScope {
  return isPlainRecord(value)
    && hasExactKeys(value, ["businessProfileId", "businessProfileVersion", "conversationId"])
    && isBoundedIdentifier(value.businessProfileId)
    && Number.isInteger(value.businessProfileVersion)
    && Number(value.businessProfileVersion) > 0
    && isBoundedIdentifier(value.conversationId);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && value === value.trim() && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function isBoundedIdentifier(value: unknown): value is string {
  return typeof value === "string" && value === value.trim() && value.length > 0 && value.length <= MAX_IDENTIFIER_LENGTH;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function hasExactKeys(value: Readonly<Record<string, unknown>>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

function failure(
  reason: EndToEndPreparationFailure,
  error: string,
): Extract<EndToEndTurnPreparationResult, { readonly status: "failure" }> {
  return deepFreeze({ status: "failure", reason, errors: [error] });
}
