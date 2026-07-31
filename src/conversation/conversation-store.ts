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
  | "InvalidConversationState"
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

export type ConversationStoreOperationMode = "synchronous" | "asynchronous";

export type ConversationStoreOperation<
  Mode extends ConversationStoreOperationMode,
> = Mode extends "asynchronous"
  ? Promise<ConversationStoreResult>
  : ConversationStoreResult;

/**
 * Application-owned persistence boundary for complete Conversation State
 * snapshots. Implementations provide storage mechanics only; they do not decide
 * transition legality or construct state updates.
 */
export interface ConversationStore<
  Mode extends ConversationStoreOperationMode = "synchronous",
> {
  readonly operationMode: Mode;
  create(
    state: Readonly<ConversationState>,
  ): ConversationStoreOperation<Mode>;
  read(
    scope: Readonly<ConversationStoreScope>,
  ): ConversationStoreOperation<Mode>;
  replace(
    input: Readonly<ConversationStoreReplaceInput>,
  ): ConversationStoreOperation<Mode>;
}
