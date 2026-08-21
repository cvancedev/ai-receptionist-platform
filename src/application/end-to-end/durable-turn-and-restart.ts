import type { TransactionalExecutionPersistenceCoordinator, TransactionalExecutionPersistenceResult } from "../../ai/execution-persistence/contracts";
import { deepFreeze } from "../../ai/shared/immutable";
import type { StateExecutionResult } from "../../ai/execution/contracts";
import type { ConversationStore, ConversationStoreScope } from "../../conversation/conversation-store";
import type { BusinessProfile } from "../../domain/business-profile";
import type { HandoffSummary } from "../../domain/handoff-summary";
import { DeterministicHandoffBuilder } from "../../handoff/handoff-builder";
import { validateBusinessProfile } from "../../validation/business-profile-validation";
import type { EndToEndActivatedContext, EndToEndCustomerMessage } from "./contracts";
import {
  type DurableMessageEvidence,
  type DurableMessageEvidenceStore,
} from "./message-evidence";

export interface DurableTurnCommitInput {
  readonly turnId: string;
  readonly context: Readonly<EndToEndActivatedContext>;
  readonly message: Readonly<EndToEndCustomerMessage>;
  readonly execution: StateExecutionResult;
  readonly recordedAt: string;
}

export type DurableTurnCommitResult = TransactionalExecutionPersistenceResult;

/**
 * Application-owned Sprint 8.4 boundary. It accepts only an already-approved
 * execution and delegates one atomic state, execution-evidence, and message
 * commit. It cannot execute a transition, retry, release, or perform actions.
 */
export class DurableTurnCommitBoundary {
  constructor(
    private readonly persistence: TransactionalExecutionPersistenceCoordinator,
  ) {}

  async commit(input: Readonly<DurableTurnCommitInput>): Promise<DurableTurnCommitResult> {
    const evidence = prepareEvidence(input);
    if (!evidence) return deepFreeze({
      status: "failure" as const,
      reason: "MessageEvidenceRejected" as const,
    });
    return this.persistence.persist({
      scope: scopeFor(input.context),
      execution: input.execution,
      messageEvidence: evidence,
    });
  }
}

export type DurableRestartResult =
  | {
      readonly status: "success";
      readonly state: Readonly<NonNullable<StateExecutionResult["newState"]>>;
      readonly messages: readonly Readonly<DurableMessageEvidence>[];
      readonly handoff: Readonly<HandoffSummary> | null;
      readonly customerReleaseAuthorized: false;
    }
  | {
      readonly status: "failure";
      readonly reason: "InvalidScope" | "StateUnavailable" | "EvidenceUnavailable" | "ProvenanceMismatch" | "HandoffUnavailable";
      readonly customerReleaseAuthorized: false;
    };

/** Reads authoritative state and subordinate transcript evidence after restart. */
export class DurableConversationRestartBoundary {
  private readonly handoffBuilder = new DeterministicHandoffBuilder();

  constructor(
    private readonly conversations: ConversationStore<"asynchronous">,
    private readonly messages: DurableMessageEvidenceStore,
  ) {}

  async recover(
    scope: Readonly<ConversationStoreScope>,
    profile: Readonly<BusinessProfile>,
    activationRevision: number,
  ): Promise<DurableRestartResult> {
    const profileValidation = validateBusinessProfile(structuredClone(profile), {
      id: scope.businessProfileId,
      version: scope.businessProfileVersion,
    });
    if (!profileValidation.valid || !Number.isInteger(activationRevision) || activationRevision <= 0) {
      return restartFailure("InvalidScope");
    }
    const stateResult = await this.conversations.read(scope);
    if (stateResult.status === "failure") return restartFailure("StateUnavailable");
    const evidenceResult = await this.messages.snapshot(scope);
    if (evidenceResult.status === "failure") return restartFailure("EvidenceUnavailable");
    const entries = evidenceResult.snapshot.entries;
    if (!entries.every((entry, index) =>
      entry.sequence === index + 1
      && entry.activationRevision === activationRevision
      && entry.resultingStateRevision <= stateResult.state.revision)) {
      return restartFailure("ProvenanceMismatch");
    }
    const handoff = this.handoffBuilder.build(
      structuredClone(profile),
      structuredClone(stateResult.state),
    );
    const ready = stateResult.state.stage === "handoff"
      || stateResult.state.stage === "completed"
      || stateResult.state.completionState === "ready-for-handoff";
    if (ready && handoff.status === "failure") return restartFailure("HandoffUnavailable");
    return deepFreeze({
      status: "success" as const,
      state: structuredClone(stateResult.state),
      messages: entries.map((entry) => structuredClone(entry)),
      handoff: handoff.status === "success" ? handoff.summary : null,
      customerReleaseAuthorized: false as const,
    });
  }
}

function prepareEvidence(input: Readonly<DurableTurnCommitInput>): DurableMessageEvidence | null {
  const state = input.execution.newState;
  const identity = input.context.identity;
  if (!state
    || input.message.conversationId !== identity.conversationId
    || state.businessProfileId !== identity.businessProfileId
    || state.businessProfileVersion !== identity.businessProfileVersion
    || state.conversationId !== identity.conversationId) return null;
  return {
    messageId: input.message.messageId,
    turnId: input.turnId,
    businessProfileId: identity.businessProfileId,
    businessProfileVersion: identity.businessProfileVersion,
    conversationId: identity.conversationId,
    activationRevision: identity.activationRevision,
    sequence: input.message.sequence,
    source: "customer",
    content: input.message.content,
    resultingStateRevision: state.revision,
    recordedAt: input.recordedAt,
    evidenceSchemaVersion: 1,
  };
}

function scopeFor(context: Readonly<EndToEndActivatedContext>): ConversationStoreScope {
  return {
    businessProfileId: context.identity.businessProfileId,
    businessProfileVersion: context.identity.businessProfileVersion,
    conversationId: context.identity.conversationId,
  };
}

function restartFailure(reason: Extract<DurableRestartResult, { status: "failure" }>["reason"]): DurableRestartResult {
  return deepFreeze({ status: "failure" as const, reason, customerReleaseAuthorized: false as const });
}
