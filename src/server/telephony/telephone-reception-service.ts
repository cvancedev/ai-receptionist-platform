import { createHash } from "node:crypto";
import type { ReceptionistBusiness } from "../conversation/receptionist-conversation-service";
import type { InboundVoiceRequest } from "../../telephony/twilio-voice";
import {
  createTelephoneCall,
  isTerminal,
  normalizeTelephoneNumber,
  withUtteranceDigest,
  type TelephoneCall,
} from "../../telephony/call-session";
import type { TelephoneReceptionFlow } from "../../telephony/call-flow";
import type { TelephoneCallStore } from "./call-store";

if (typeof window !== "undefined") {
  throw new Error("The telephone reception service is server-only.");
}

/**
 * One carrier webhook in, one spoken reply out.
 *
 * The service is the only place that decides whether a webhook opens a call,
 * advances it, or is simply a retry of a turn that already happened. It owns the
 * durability rules: a turn is saved against the turn count it started from, the
 * summary is written once, and the owner is notified once.
 */
export const TELEPHONE_RECEPTION_SERVICE_VERSION = "telephone-reception-service/v2" as const;

/**
 * Window in which an identical utterance to the same call is treated as a
 * carrier retry rather than something the caller said twice. Carriers retry a
 * webhook within seconds; a caller repeating themselves is re-prompted anyway,
 * so the shorter risk is taken deliberately.
 */
export const RETRY_DEDUPLICATION_WINDOW_MS = 15_000;

export interface TelephoneReceptionServiceOptions {
  readonly flow: TelephoneReceptionFlow;
  readonly store: TelephoneCallStore;
  readonly business: ReceptionistBusiness;
  readonly now?: () => number;
  /** Free-form hints the carrier's recognizer should favour. */
  readonly speechHints?: readonly string[];
}

export interface VoiceTurnReply {
  readonly speech: string;
  readonly endCall: boolean;
  readonly transferTo: string | null;
  readonly callId: string;
  /** True when the caller's last utterance could not be transcribed at all. */
  readonly heardNothing: boolean;
  /** The intake field the receptionist is waiting on, when it is waiting. */
  readonly pendingFieldId?: string | null;
}

export class TelephoneReceptionService {
  private readonly flow: TelephoneReceptionFlow;
  private readonly store: TelephoneCallStore;
  private readonly business: ReceptionistBusiness;
  private readonly now: () => number;
  private readonly speechHints: readonly string[];

  constructor(options: TelephoneReceptionServiceOptions) {
    if (!options?.flow || !options?.store || !options?.business) {
      throw new Error("The telephone reception service requires a flow, a store, and a business.");
    }
    this.flow = options.flow;
    this.store = options.store;
    this.business = options.business;
    this.now = typeof options.now === "function" ? options.now : Date.now;
    this.speechHints = Object.freeze([...(options.speechHints ?? [])]);
  }

  speechHintsForCarrier(): readonly string[] {
    return this.speechHints;
  }

  /**
   * Handle one inbound webhook.
   *
   * `opening` is true for the first request of a call, which carries no speech
   * because the carrier is waiting for the greeting before it listens.
   */
  async handleVoiceTurn(
    request: InboundVoiceRequest,
    opening: boolean,
  ): Promise<VoiceTurnReply> {
    const existing = await this.store.loadCall(request.callId);

    if (existing.status === "failure") {
      return Object.freeze({
        speech: "Sorry, I can't take details right now. Please try again shortly.",
        endCall: true,
        transferTo: null,
        callId: request.callId,
        heardNothing: true,
      });
    }

    if (existing.status === "not-found") {
      return this.openCall(request);
    }

    const call = existing.call;
    if (isTerminal(call)) {
      // A carrier retry after the call ended: say the closing line again and
      // hang up, without another dialogue turn or a second notification.
      return Object.freeze({
        speech: "Thank you. Goodbye.",
        endCall: true,
        transferTo: null,
        callId: call.callId,
        heardNothing: true,
      });
    }

    if (request.speech === null) {
      if (opening) return this.repeatGreeting(call);
      // The recognizer returned nothing: ask again rather than inventing words.
      return Object.freeze({
        speech: "Sorry, I didn't hear anything. Are you still there?",
        endCall: false,
        transferTo: null,
        callId: call.callId,
        heardNothing: true,
      });
    }

    const digest = utteranceDigest(request.speech);
    if (call.lastUtteranceDigest === digest
      && this.now() - call.lastActivityAt < RETRY_DEDUPLICATION_WINDOW_MS) {
      // The same webhook, delivered twice: repeat the reply without consuming a
      // turn, charging a provider, or asking the caller to repeat themselves.
      const lastAssistant = [...call.transcript].reverse()
        .find((entry) => entry.role === "assistant");
      return Object.freeze({
        speech: lastAssistant?.text ?? "Sorry, could you say that again?",
        endCall: false,
        transferTo: null,
        callId: call.callId,
        heardNothing: false,
      });
    }

    const result = await this.flow.handleCallerUtterance(call, request.speech);
    const recorded = withUtteranceDigest(result.call, digest);
    const saved = await this.store.saveCall(recorded, call.turnCount);
    if (saved === "conflict") {
      // Another webhook already advanced this call. Its reply is authoritative.
      const reloaded = await this.store.loadCall(call.callId);
      if (reloaded.status === "found" && isTerminal(reloaded.call)) {
        return Object.freeze({
          speech: "Thank you. Goodbye.",
          endCall: true,
          transferTo: null,
          callId: call.callId,
          heardNothing: false,
        });
      }
      return Object.freeze({
        speech: "Sorry, could you say that again?",
        endCall: false,
        transferTo: null,
        callId: call.callId,
        heardNothing: true,
      });
    }
    if (saved === "failure") {
      return Object.freeze({
        speech: "Sorry, I've lost track of this call. Please call back shortly.",
        endCall: true,
        transferTo: null,
        callId: call.callId,
        heardNothing: false,
      });
    }

    if (result.summary !== null) {
      await this.store.saveSummary(result.summary).catch(() => "failure" as const);
      await this.store.enqueueNotification(result.summary).catch(() => "failure" as const);
    }

    return Object.freeze({
      speech: result.speech,
      endCall: result.endCall,
      transferTo: result.transferTo,
      callId: result.call.callId,
      heardNothing: false,
      pendingFieldId: result.pendingFieldId ?? null,
    });
  }

  private async openCall(request: InboundVoiceRequest): Promise<VoiceTurnReply> {
    const now = this.now();
    const call = createTelephoneCall({
      callId: request.callId,
      businessProfileId: this.business.profile.id,
      businessProfileVersion: this.business.profile.version,
      conversationId: `call-${request.callId}`,
      fromNumber: normalizeTelephoneNumber(request.fromNumber) ?? request.fromNumber,
      toNumber: request.toNumber,
      now,
    });

    const started = await this.flow.start(call);
    const created = await this.store.createCall(started.call);
    if (created === "already-exists") {
      const reloaded = await this.store.loadCall(request.callId);
      if (reloaded.status === "found") return this.repeatGreeting(reloaded.call);
    }
    return Object.freeze({
      speech: started.speech,
      endCall: started.endCall,
      transferTo: started.transferTo,
      callId: started.call.callId,
      heardNothing: false,
    });
  }

  private repeatGreeting(call: TelephoneCall): VoiceTurnReply {
    const lastAssistant = [...call.transcript].reverse().find((entry) => entry.role === "assistant");
    return Object.freeze({
      speech: lastAssistant?.text ?? this.flow.greeting(),
      endCall: false,
      transferTo: null,
      callId: call.callId,
      heardNothing: false,
    });
  }
}

/**
 * Digest of one caller utterance.
 *
 * Normalizing first means the same webhook body produces the same digest even if
 * the carrier replays it with different whitespace. A digest is not reversible
 * and never leaves server memory or the call row.
 */
function utteranceDigest(speech: string): string {
  return createHash("sha256")
    .update(speech.normalize("NFKC").trim(), "utf8")
    .digest("hex")
    .slice(0, 32);
}
