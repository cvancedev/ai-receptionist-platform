import type { ConversationState } from "../domain/conversation-state";

export interface ConversationStoreScope {
  readonly conversationId: string;
  readonly businessProfileId: string;
  readonly businessProfileVersion: number;
}

export interface ConversationStoreReplaceInput {
  readonly scope: Readonly<ConversationStoreScope>;
  readonly expectedRevision: number;
  readonly state: Readonly<ConversationState>;
}

export type ConversationStoreFailureReason =
  | "ConversationAlreadyExists"
  | "ConversationNotFound"
  | "ScopeMismatch"
  | "RevisionConflict"
  | "InvalidRevisionIncrement"
  | "InvalidStoredState"
  | "IncompatibleStoredState"
  | "PersistenceFailure";

export type ConversationStoreResult =
  | { readonly status: "success"; readonly state: ConversationState }
  | {
      readonly status: "failure";
      readonly reason: ConversationStoreFailureReason;
      readonly errors: readonly string[];
    };

/**
 * Application-owned persistence boundary for complete Conversation State
 * snapshots. Implementations provide storage mechanics only; they do not decide
 * transition legality or construct state updates.
 */
export interface ConversationStore {
  create(state: Readonly<ConversationState>): ConversationStoreResult;
  read(
    scope: Readonly<ConversationStoreScope>,
  ): ConversationStoreResult;
  replace(
    input: Readonly<ConversationStoreReplaceInput>,
  ): ConversationStoreResult;
}
