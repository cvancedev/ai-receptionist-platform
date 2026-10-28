import type { OfflineTransport } from "../../ai/providers/transport-model-provider-adapter";
import { digestConversationHandle, isConversationHandle } from "../auth/conversation-handle";
import {
  isConversationPersistenceScope,
  scopeKey,
  type ConversationPersistenceScope,
  type ReceptionistPersistence,
  type StoredMessage,
} from "../persistence/receptionist-persistence";
import {
  INITIAL_GREETING,
  MAXIMUM_MESSAGE_LENGTH,
  ReceptionistConversationService,
  createInitialConversationState,
  type ReceptionistBusiness,
  type ReceptionistTurnOutcome,
} from "./receptionist-conversation-service";

if (typeof window !== "undefined") {
  throw new Error("The durable receptionist conversation service is server-only.");
}

const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const MAXIMUM_RETURNED_HISTORY = 100;

export interface DurableReceptionistConversationServiceOptions {
  readonly persistence: ReceptionistPersistence;
  readonly transport?: OfflineTransport;
  readonly maximumConversations?: number;
}

type ResolvedSubmission =
  | {
      readonly message: string;
      readonly scope: ConversationPersistenceScope;
    }
  | { readonly failure: "unavailable" | "persistence" };

/**
 * Durable conversation service for the pilot.
 *
 * Each turn is executed by the same certified deterministic engine and simulated
 * language layer as the demo, against a snapshot loaded from storage. The final
 * state, conversation metadata, and new messages are committed in one storage
 * transaction compared against the revision the turn started from. If the commit
 * fails, the in-memory working copy is discarded so the next turn reloads
 * durable truth instead of continuing from uncommitted state.
 */
export class DurableReceptionistConversationService {
  private readonly service: ReceptionistConversationService;
  private readonly persistence: ReceptionistPersistence;
  private readonly businesses = new Map<string, ReceptionistBusiness>();
  private readonly queues = new Map<string, Promise<void>>();

  constructor(
    businesses: readonly ReceptionistBusiness[],
    options: DurableReceptionistConversationServiceOptions,
  ) {
    if (!options?.persistence) {
      throw new Error("Conversation persistence is required.");
    }
    this.persistence = options.persistence;
    this.service = new ReceptionistConversationService(businesses, {
      transport: options.transport,
      maximumConversations: options.maximumConversations,
    });
    for (const business of businesses) {
      this.businesses.set(business.profile.id, business);
    }
  }

  hasBusiness(businessId: unknown): boolean {
    return typeof businessId === "string" && this.businesses.has(businessId);
  }

  async begin(businessId: unknown, conversationId: unknown): Promise<string | null> {
    if (typeof businessId !== "string" || typeof conversationId !== "string") return null;
    const business = this.businesses.get(businessId);
    if (!business || business.profile.status !== "active") return null;
    if (conversationId.length < 1 || conversationId.length > 128) return null;
    if (this.service.handleForScope(businessId, conversationId) !== null) return null;

    const state = createInitialConversationState(business, conversationId);
    if (!state) return null;

    const handle = this.service.hydrate({
      businessId,
      conversationId,
      state,
      messages: [{
        messageId: 1,
        role: "assistant",
        content: INITIAL_GREETING,
      }],
      pendingFieldId: null,
      handoffAvailable: false,
      turn: 0,
      nextMessageId: 2,
    });
    if (!handle) return null;

    const created = await this.persistence.createConversation({
      scope: {
        businessProfileId: business.profile.id,
        businessProfileVersion: business.profile.version,
        conversationId,
      },
      handleHash: digestConversationHandle(handle),
      state,
      greeting: { messageId: 1, role: "assistant", content: INITIAL_GREETING },
    });
    if (created !== "created") {
      this.service.discard(handle);
      return null;
    }
    return handle;
  }

  async submit(input: unknown): Promise<ReceptionistTurnOutcome> {
    const submission = await this.resolveSubmission(input);
    if ("failure" in submission) {
      return Object.freeze({
        status: submission.failure === "persistence"
          ? "internal-failure" as const
          : "conversation-unavailable" as const,
      });
    }

    const key = scopeKey(submission.scope);
    const previous = this.queues.get(key) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.queues.set(key, current);
    await previous;
    try {
      return await this.process(submission.scope, submission.message);
    } finally {
      release();
      if (this.queues.get(key) === current) this.queues.delete(key);
    }
  }

  async revisionOfHandle(handle: unknown): Promise<number | null> {
    if (!isConversationHandle(handle)) return null;
    const snapshot = this.service.exportForPersistence(handle);
    if (snapshot) return snapshot.state.revision;
    const scope = await this.persistence.findScopeByHandleHash(
      digestConversationHandle(handle),
    );
    if (scope.status !== "found") return null;
    const loaded = await this.persistence.loadConversation(scope.scope);
    return loaded.status === "found" ? loaded.conversation.state.revision : null;
  }

  private async process(
    scope: ConversationPersistenceScope,
    message: string,
  ): Promise<ReceptionistTurnOutcome> {
    const loaded = await this.persistence.loadConversation(scope);
    if (loaded.status === "not-found") {
      return Object.freeze({ status: "conversation-unavailable" });
    }
    if (loaded.status === "failure") {
      return Object.freeze({ status: "internal-failure" });
    }
    const conversation = loaded.conversation;

    let handle = this.service.handleForScope(scope.businessProfileId, scope.conversationId);
    if (handle !== null) {
      const snapshot = this.service.exportForPersistence(handle);
      if (!snapshot || snapshot.state.revision !== conversation.state.revision) {
        // Another instance committed, or an earlier turn failed after mutating
        // the working copy. Durable state wins.
        this.service.discard(handle);
        handle = null;
      }
    }
    if (handle === null) {
      const history = conversation.messages.slice(-MAXIMUM_RETURNED_HISTORY);
      handle = this.service.hydrate({
        businessId: scope.businessProfileId,
        conversationId: scope.conversationId,
        state: conversation.state,
        messages: history.map((stored) => ({
          messageId: stored.messageId,
          role: stored.role,
          content: stored.content,
        })),
        pendingFieldId: conversation.pendingFieldId,
        handoffAvailable: conversation.handoffAvailable,
        turn: conversation.turnNumber,
        nextMessageId: conversation.nextMessageId,
      });
    }
    if (handle === null) return Object.freeze({ status: "internal-failure" });

    const outcome = await this.service.submit({ handle, message });
    if (outcome.status !== "ok") {
      this.service.discard(handle);
      return outcome;
    }

    const final = this.service.exportForPersistence(handle);
    if (!final) {
      this.service.discard(handle);
      return Object.freeze({ status: "internal-failure" });
    }

    const appended: StoredMessage[] = final.messages
      .filter((entry) => entry.messageId >= conversation.nextMessageId)
      .map((entry) => ({
        messageId: entry.messageId,
        role: entry.role,
        content: entry.content,
      }));

    const committed = await this.persistence.commitTurn({
      scope,
      expectedRevision: conversation.state.revision,
      expectedTurnNumber: conversation.turnNumber,
      state: final.state,
      pendingFieldId: final.pendingFieldId,
      handoffAvailable: final.handoffAvailable,
      turnNumber: final.turn,
      nextMessageId: final.nextMessageId,
      messages: appended,
    });
    if (committed !== "committed") {
      this.service.discard(handle);
      return Object.freeze({ status: "internal-failure" });
    }
    return outcome;
  }

  private async resolveSubmission(input: unknown): Promise<ResolvedSubmission> {
    if (!isPlainRecord(input)) return { failure: "unavailable" };
    const keys = Object.keys(input);
    if (typeof input.message !== "string") return { failure: "unavailable" };
    const message = input.message.trim();
    if (message.length === 0 || message.length > MAXIMUM_MESSAGE_LENGTH) {
      return { failure: "unavailable" };
    }
    if (CONTROL_CHARACTERS.test(message)) return { failure: "unavailable" };

    if (keys.length === 2 && keys.includes("handle") && keys.includes("message")) {
      if (!isConversationHandle(input.handle)) return { failure: "unavailable" };
      const snapshot = this.service.exportForPersistence(input.handle);
      if (snapshot) {
        return this.withBusinessScope({
          businessProfileId: snapshot.state.businessProfileId,
          businessProfileVersion: snapshot.state.businessProfileVersion,
          conversationId: snapshot.state.conversationId,
        }, message);
      }
      const scope = await this.persistence.findScopeByHandleHash(
        digestConversationHandle(input.handle),
      );
      if (scope.status === "not-found") return { failure: "unavailable" };
      if (scope.status === "failure") return { failure: "persistence" };
      return this.withBusinessScope(scope.scope, message);
    }

    if (keys.length === 4
      && keys.includes("businessId")
      && keys.includes("conversationId")
      && keys.includes("businessProfileVersion")
      && keys.includes("message")) {
      if (!isConversationPersistenceScope({
        businessProfileId: input.businessId,
        businessProfileVersion: input.businessProfileVersion,
        conversationId: input.conversationId,
      })) return { failure: "unavailable" };
      return this.withBusinessScope({
        businessProfileId: input.businessId as string,
        businessProfileVersion: input.businessProfileVersion as number,
        conversationId: input.conversationId as string,
      }, message);
    }

    return { failure: "unavailable" };
  }

  private withBusinessScope(
    scope: ConversationPersistenceScope,
    message: string,
  ): ResolvedSubmission {
    const business = this.businesses.get(scope.businessProfileId);
    if (!business || business.profile.status !== "active") {
      return { failure: "unavailable" };
    }
    if (business.profile.version !== scope.businessProfileVersion) {
      return { failure: "unavailable" };
    }
    return { message, scope };
  }
}


function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
