import type { ConversationReadModelAction } from "../../conversation-read-model/contracts";
import type { HandoffSummary } from "../../domain/handoff-summary";
import type { ConversationStage } from "../../shared/constants";

export interface EndToEndCustomerMessage {
  readonly messageId: string;
  readonly conversationId: string;
  readonly source: "customer";
  readonly sequence: number;
  readonly content: string;
}

export type EndToEndTurnRequest =
  | {
      readonly mode: "start";
      readonly turnId: string;
      readonly businessProfileId: string;
      readonly conversationId: string;
      readonly effectiveAt: string;
      readonly message: Readonly<EndToEndCustomerMessage>;
    }
  | {
      readonly mode: "resume";
      readonly turnId: string;
      readonly scope: Readonly<{
        readonly businessProfileId: string;
        readonly businessProfileVersion: number;
        readonly conversationId: string;
      }>;
      readonly effectiveAt: string;
      readonly message: Readonly<EndToEndCustomerMessage>;
    };

export interface EndToEndKnowledgeReference {
  readonly knowledgeRecordId: string;
  readonly knowledgeRecordVersion: number;
  readonly source: string;
}

/** Future response content may cross this boundary only after validation. */
export interface EndToEndValidatedResponseCandidate {
  readonly candidateId: string;
  readonly content: string;
  readonly sourceReferences: readonly Readonly<EndToEndKnowledgeReference>[];
  readonly validationStatus: "validated";
  readonly customerReleaseAuthorized: false;
}

export type EndToEndResponseBoundary =
  | {
      readonly status: "not-produced";
      readonly candidate: null;
      readonly reason: "TurnProcessingNotAuthorizedInMilestone8_1";
      readonly customerReleaseAuthorized: false;
    }
  | {
      readonly status: "validated";
      readonly candidate: Readonly<EndToEndValidatedResponseCandidate>;
      readonly reason: null;
      readonly customerReleaseAuthorized: false;
    };

export type EndToEndHandoffBoundary =
  | { readonly status: "not-ready"; readonly summary: null }
  | { readonly status: "ready"; readonly summary: Readonly<HandoffSummary> };

export interface EndToEndTurnPreparation {
  readonly identity: Readonly<{
    readonly turnId: string;
    readonly businessProfileId: string;
    readonly businessProfileVersion: number;
    readonly conversationId: string;
    readonly stateRevision: number;
  }>;
  readonly inboundMessage: Readonly<{
    readonly messageId: string;
    readonly source: "customer";
    readonly sequence: number;
    readonly acceptedForProcessing: true;
    readonly contentPersisted: false;
  }>;
  readonly configuration: Readonly<{
    readonly activationRevision: number;
    readonly knowledge: readonly Readonly<EndToEndKnowledgeReference>[];
  }>;
  readonly conversation: Readonly<{
    readonly stage: ConversationStage;
    readonly recommendedNextAction: ConversationReadModelAction;
  }>;
  readonly applicationDecision: Readonly<{
    readonly decision: "ready-for-turn-processing";
    readonly turnStateMutationAuthorized: false;
    readonly transitionExecutionAuthorized: false;
    readonly customerReleaseAuthorized: false;
    readonly externalActionAuthorized: false;
  }>;
  readonly response: EndToEndResponseBoundary;
  readonly handoff: EndToEndHandoffBoundary;
}

export const END_TO_END_PREPARATION_FAILURES = [
  "InvalidInput",
  "ConfigurationUnavailable",
  "ConversationUnavailable",
  "ScopeMismatch",
  "HandoffUnavailable",
  "CompositionUnavailable",
] as const;

export type EndToEndPreparationFailure =
  (typeof END_TO_END_PREPARATION_FAILURES)[number];

export type EndToEndTurnPreparationResult =
  | { readonly status: "success"; readonly value: Readonly<EndToEndTurnPreparation> }
  | {
      readonly status: "failure";
      readonly reason: EndToEndPreparationFailure;
      readonly errors: readonly string[];
    };
