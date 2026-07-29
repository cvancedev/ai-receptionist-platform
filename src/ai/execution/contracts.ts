import type { ConversationState } from "../../domain/conversation-state";
import type { ConversationStage } from "../../shared/constants";
import type {
  AiPackageIdentity,
  ModelProposalIdentifier,
  ModelTaskIdentifier,
} from "../contracts/identities";
import type { ApplicationDecision, AiValidationResult } from "../contracts/results";
import type { ExecutionJournalAppendResult } from "../execution-journal/contracts";

export const STATE_TRANSITION_IDENTIFIERS = [
  "begin_intake_after_language_interpretation",
] as const;

export type StateTransitionIdentifier =
  (typeof STATE_TRANSITION_IDENTIFIERS)[number];

export type TransitionCondition =
  | "approved-application-decision"
  | "validated-proposal"
  | "matching-business-conversation-profile-and-revision"
  | "matching-task-and-proposal-policy"
  | "unique-execution";

export interface StateTransitionDefinition {
  identifier: StateTransitionIdentifier;
  version: number;
  currentStage: ConversationStage;
  nextStage: ConversationStage;
  requiredTaskIdentifier: ModelTaskIdentifier;
  requiredProposalType: ModelProposalIdentifier;
  requiredDecision: "accepted";
  requiredConditions: readonly TransitionCondition[];
}

export interface StateExecutionRequest {
  executionId: string;
  transitionIdentifier: StateTransitionIdentifier;
  transitionVersion: number;
  expectedCurrentStage: ConversationStage;
  expectedStateRevision: number;
  identity: AiPackageIdentity;
  applicationDecision: ApplicationDecision;
  validation: AiValidationResult;
}

export const STATE_EXECUTION_REASONS = [
  "TransitionApplied",
  "MalformedExecutionRequest",
  "DecisionNotApproved",
  "ProposalNotValidated",
  "UnknownTask",
  "UnknownProposalType",
  "UnknownTransition",
  "ScopeMismatch",
  "CurrentStateMismatch",
  "PolicyViolation",
  "DuplicateExecution",
  "StateApplicationFailed",
] as const;

export type StateExecutionReason =
  (typeof STATE_EXECUTION_REASONS)[number];

export interface StateExecutionMetadata {
  executionId: string | null;
  requestId: string | null;
  traceId: string | null;
  taskIdentifier: string | null;
  proposalId: string | null;
  conversationId: string | null;
  businessProfileId: string | null;
  businessProfileVersion: number | null;
  expectedStateRevision: number | null;
  appliedStateRevision: number | null;
  failures: readonly StateExecutionReason[];
  details: readonly string[];
}

export interface StateExecutionResult {
  success: boolean;
  reason: StateExecutionReason;
  previousState: Readonly<ConversationState> | null;
  newState: Readonly<ConversationState> | null;
  transitionId: string | null;
  executionTimestamp: string;
  executionMetadata: Readonly<StateExecutionMetadata>;
}

export interface AiControlledExecutionSnapshot {
  foundationDecision: ApplicationDecision;
  execution: StateExecutionResult;
  journalAppend: ExecutionJournalAppendResult;
  conversationState: Readonly<ConversationState>;
}

export type AiControlledExecutionResult =
  | { status: "success"; value: AiControlledExecutionSnapshot }
  | { status: "failure"; reason: "ExecutionStateUnavailable" };
