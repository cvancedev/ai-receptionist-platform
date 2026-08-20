import type { ConversationReadModelAction } from "../../conversation-read-model/contracts";
import type { BusinessProfile } from "../../domain/business-profile";
import type { ConversationState } from "../../domain/conversation-state";
import type { HandoffSummary } from "../../domain/handoff-summary";
import type { ConversationStage } from "../../shared/constants";

export const ACTIVATED_CONTEXT_POLICY_VERSION = "sprint-8.2-activated-context-v1";
export const GROUNDED_OUTPUT_POLICY_VERSION = "sprint-8.2-grounded-output-v1";

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
  readonly audience: "customer" | "both";
  readonly effectiveDate: string;
  readonly activationRevision: number;
  readonly contextPolicyVersion: typeof ACTIVATED_CONTEXT_POLICY_VERSION;
}

export interface EndToEndActivatedKnowledge extends EndToEndKnowledgeReference {
  readonly businessProfileId: string;
  readonly businessProfileVersion: number;
  readonly title: string;
  readonly category: string;
  readonly content: string;
  readonly lifecycleState: "active";
  readonly eligibility: Readonly<{
    readonly decision: "included";
    readonly effectiveAt: string;
    readonly policyVersion: typeof ACTIVATED_CONTEXT_POLICY_VERSION;
  }>;
}

/** Transient, application-owned context. It is neither durable message evidence nor provider input. */
export interface EndToEndActivatedContext {
  readonly identity: Readonly<{
    readonly businessProfileId: string;
    readonly businessProfileVersion: number;
    readonly conversationId: string;
    readonly stateRevision: number;
    readonly activationRevision: number;
  }>;
  readonly effectiveAt: string;
  readonly businessProfile: Readonly<BusinessProfile>;
  readonly conversationState: Readonly<ConversationState>;
  readonly currentCustomerInput: Readonly<EndToEndCustomerMessage> & Readonly<{
    readonly trust: "untrusted-customer-input";
  }>;
  readonly knowledge: readonly Readonly<EndToEndActivatedKnowledge>[];
  readonly provenance: Readonly<{
    readonly activationRequestId: string;
    readonly activatedAt: string;
    readonly contextPolicyVersion: typeof ACTIVATED_CONTEXT_POLICY_VERSION;
    readonly groundingPolicyVersion: typeof GROUNDED_OUTPUT_POLICY_VERSION;
  }>;
  readonly budget: Readonly<{
    readonly sizeLimit: number;
    readonly estimatedSize: number;
    readonly withinLimit: true;
  }>;
  readonly authority: Readonly<{
    readonly assembledBy: "application";
    readonly providerExecutionAuthorized: false;
    readonly stateMutationAuthorized: false;
    readonly customerReleaseAuthorized: false;
  }>;
}

export interface EndToEndGroundedCandidateInput {
  readonly candidateId: string;
  readonly content: string;
  readonly sourceReferences: readonly Readonly<EndToEndKnowledgeReference>[];
}

export type EndToEndGroundingValidationResult =
  | {
      readonly status: "success";
      readonly value: Readonly<EndToEndValidatedResponseCandidate>;
    }
  | {
      readonly status: "failure";
      readonly reason:
        | "InvalidCandidate"
        | "GroundingRequired"
        | "GroundingScopeMismatch";
      readonly errors: readonly string[];
    };

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
      readonly reason: "TurnProcessingNotAuthorizedBeforeMilestone8_3";
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
  readonly context: Readonly<EndToEndActivatedContext>;
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
  "ContextUnavailable",
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
