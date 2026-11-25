import type { ReceptionistBusiness } from "../server/conversation/receptionist-conversation-service";
import type {
  DurableReceptionistConversationService,
} from "../server/conversation/durable-receptionist-conversation-service";
import type { ReceptionistTurnOutcome } from "../server/conversation/receptionist-conversation-service";
import { answerFromApprovedKnowledge, looksLikeQuestion } from "./approved-answers";
import {
  MAXIMUM_CALL_DURATION_MS,
  MAXIMUM_CALL_TURNS,
  appendTranscript,
  callLimitReached,
  isSpokenText,
  isTerminal,
  normalizeTelephoneNumber,
  recordApprovedAnswer,
  recordUnanswered,
  withContact,
  withEscalation,
  withState,
  type CallLimits,
  type CallState,
  type HandoffSummary,
  type TelephoneCall,
  type UnansweredReason,
} from "./call-session";

if (typeof window !== "undefined") {
  throw new Error("The telephone call flow is server-only.");
}

/**
 * The telephone conversation, expressed on top of the certified engine.
 *
 * This module owns the *telephone* concerns only: what is spoken, when a caller
 * has confirmed their details, when a call must end, and what the owner is told.
 * Every interpretation, grounded answer, intake field and escalation decision is
 * still made by the existing deterministic engine and its validators; this flow
 * never invents an answer, and it refuses to speak engine text that was written
 * for a screen.
 */
export const TELEPHONE_CALL_FLOW_VERSION = "telephone-call-flow/v1" as const;

export interface TelephoneReceptionFlowOptions {
  readonly conversations: DurableReceptionistConversationService;
  readonly business: ReceptionistBusiness;
  readonly now?: () => number;
  readonly limits?: Partial<CallLimits>;
  readonly conversationIdFactory?: (callId: string) => string;
}

export interface CallTurnResult {
  readonly call: TelephoneCall;
  /** Exactly what the receptionist should say next. Never empty. */
  readonly speech: string;
  readonly endCall: boolean;
  /** Set when the carrier should transfer the caller to a human. */
  readonly transferTo: string | null;
  readonly summary: HandoffSummary | null;
  /** The intake field the engine is waiting on, when it is waiting on one. */
  readonly pendingFieldId?: string | null;
}

/** Wording from the screen-oriented demo that must never reach a caller. */
const SCREEN_ONLY_TEXT = /(?:fictional|type\s+[“"']?confirm|simulated ai)/i;

const AFFIRMATIVE = /^(?:yes|yeah|yep|yup|correct|that'?s right|that is right|sure|exactly|okay|ok|confirm|confirmed)\b/i;
const NEGATIVE = /^(?:no|nope|not right|incorrect|wrong|that'?s not right)\b/i;
const HUMAN_REQUEST =
  /\b(?:speak|talk|transfer|connect)\b[^.?!]{0,24}\b(?:person|human|someone|manager|representative|agent|real\s+person)\b/i;

const FALLBACK_APOLOGY =
  "I'm sorry, I'm having trouble with that. I've recorded your details so the team can call you back.";

export class TelephoneReceptionFlow {
  private readonly conversations: DurableReceptionistConversationService;
  private readonly business: ReceptionistBusiness;
  private readonly now: () => number;
  private readonly limits: CallLimits;
  private readonly conversationIdFactory: (callId: string) => string;

  constructor(options: TelephoneReceptionFlowOptions) {
    if (!options?.conversations || !options?.business) {
      throw new Error("The telephone call flow requires a conversation service and a business.");
    }
    this.conversations = options.conversations;
    this.business = options.business;
    this.now = typeof options.now === "function" ? options.now : Date.now;
    this.limits = Object.freeze({
      maximumTurns: bounded(options.limits?.maximumTurns, 1, MAXIMUM_CALL_TURNS) ?? 12,
      maximumDurationMs:
        bounded(options.limits?.maximumDurationMs, 10_000, MAXIMUM_CALL_DURATION_MS) ?? 8 * 60 * 1_000,
    });
    this.conversationIdFactory = typeof options.conversationIdFactory === "function"
      ? options.conversationIdFactory
      : (callId: string) => `call-${callId}`;
  }

  /** The greeting a caller hears as soon as the call connects. */
  greeting(): string {
    return `Thanks for calling ${this.business.profile.businessName}. This is the assistant. How can I help you today?`;
  }

  /** True when the business wants the recording notice spoken before any capture. */
  requiresRecordingNotice(): boolean {
    return RECORDING_NOTICE_BUSINESSES.has(this.business.profile.id);
  }

  /**
   * Open the call: create the scoped conversation and speak the greeting.
   * A conversation that cannot be created ends the call rather than running
   * an untracked dialogue.
   */
  async start(call: TelephoneCall): Promise<CallTurnResult> {
    const conversationId = call.conversationId.length > 0
      ? call.conversationId
      : this.conversationIdFactory(call.callId);
    const greeting = this.greeting();

    const handle = await this.conversations.begin(
      this.business.profile.id,
      conversationId,
      greeting,
    );
    if (handle === null) {
      const failed = withState(call, "failed", this.now());
      return Object.freeze({
        call: failed,
        speech: "I'm sorry, the assistant isn't available right now. Please call back shortly.",
        endCall: true,
        transferTo: null,
        summary: null,
      });
    }

    const at = this.now();
    const started = appendTranscript(
      withState(call, "in-dialogue", at),
      "assistant",
      greeting,
      at,
    );
    return Object.freeze({
      call: started,
      speech: greeting,
      endCall: false,
      transferTo: null,
      summary: null,
    });
  }

  /**
   * Handle one caller utterance and return what to say next.
   *
   * The caller's words are untrusted input. They reach the engine, never a
   * business fact; anything the receptionist states comes back from the engine's
   * grounded answer or from an approved knowledge record.
   */
  async handleCallerUtterance(
    call: TelephoneCall,
    utterance: string,
  ): Promise<CallTurnResult> {
    const at = this.now();

    if (isTerminal(call)) {
      return this.end(call, at, this.goodbye());
    }

    const limit = callLimitReached(call, this.limits, at);
    if (limit !== null) {
      return this.escalate(
        call,
        `call-${limit}`,
        "This call has reached its limit. I'll have the team call you back.",
        at,
      );
    }

    if (!isSpokenText(utterance)) {
      const unusable = recordUnanswered(call, "(unusable audio)", "transcription-unusable", at);
      return Object.freeze({
        call: unusable,
        speech: "I'm sorry, I didn't catch that. Could you say that again?",
        endCall: false,
        transferTo: null,
        summary: null,
      });
    }

    const text = utterance.trim();
    const heard = appendTranscript(
      Object.freeze({ ...call, turnCount: call.turnCount + 1 }),
      "caller",
      text,
      at,
    );

    // A request for a person always wins, before any other interpretation.
    if (HUMAN_REQUEST.test(text)) {
      return this.escalate(
        heard,
        "caller-requested-human",
        "Of course. I'll pass this to the team now so someone can call you back.",
        at,
      );
    }

    // Mid-confirmation the assistant drives the dialogue itself: the engine's
    // confirmation copy is written for a keyboard, and a caller must be able to
    // answer with a plain yes or no.
    if (call.state === "awaiting-confirmation") {
      return this.confirmOrReprompt(heard, text, at);
    }

    // A callback number the receptionist cannot dial must be corrected here,
    // before the engine records it as a confirmed fact.
    if (this.pendingFieldOf(heard) === "callback-number") {
      const normalized = normalizeTelephoneNumber(extractSpokenNumber(text));
      if (normalized === null) {
        return Object.freeze({
          call: heard,
          speech: "I'm sorry, I didn't get a complete phone number. Could you say it again, including the area code?",
          endCall: false,
          transferTo: null,
          summary: null,
          pendingFieldId: "callback-number",
        });
      }
      const stored = withContact(heard, { callbackNumber: normalized });
      return this.runEngine(stored, text, at);
    }

    if (this.pendingFieldOf(heard) === "caller-name") {
      const name = plausibleName(text);
      if (name === null) {
        return Object.freeze({
          call: heard,
          speech: "Sorry, I didn't catch your name. Could you say it again?",
          endCall: false,
          transferTo: null,
          summary: null,
          pendingFieldId: "caller-name",
        });
      }
      return this.runEngine(withContact(heard, { name }), text, at);
    }

    // A factual question is answered from approved records, and only then does
    // the dialogue continue. Hours stay with the engine's certified grounding.
    if (looksLikeQuestion(text) && !asksAboutHours(text)) {
      const answer = answerFromApprovedKnowledge({
        question: text,
        knowledge: this.business.knowledge,
        businessProfileId: this.business.profile.id,
      });
      if (answer) {
        const spoken = appendTranscript(
          recordApprovedAnswer(heard, { text: answer.text, sources: answer.sources }),
          "assistant",
          answer.text,
          at,
        );
        return Object.freeze({
          call: spoken,
          speech: answer.text,
          endCall: false,
          transferTo: null,
          summary: null,
        });
      }
      // Deliberately not answered here: the engine still gets the turn, because
      // it may recognise a service request rather than an unanswerable question.
    }

    const issue = heard.contact.issueSummary
      ?? (looksLikeQuestion(text) ? null : summarizeIssue(text));
    return this.runEngine(issue ? withContact(heard, { issueSummary: issue }) : heard, text, at);
  }

  /** Close the call on the caller's request with no summary needed. */
  async hangUp(call: TelephoneCall): Promise<CallTurnResult> {
    return this.end(call, this.now(), this.goodbye());
  }

  private async runEngine(
    call: TelephoneCall,
    text: string,
    at: number,
  ): Promise<CallTurnResult> {
    const outcome = await this.conversations.submit({
      businessId: this.business.profile.id,
      businessProfileVersion: this.business.profile.version,
      conversationId: call.conversationId,
      message: text,
      turnId: turnIdentifier(call),
    });

    if (outcome.status !== "ok") {
      const reason = failureReason(outcome);
      const failedCall = recordUnanswered(call, text, reason, at);
      return this.escalate(failedCall, `engine-${outcome.status}`, FALLBACK_APOLOGY, at);
    }

    const conversation = outcome.conversation;
    const stage = conversation.stage;
    const decision = outcome.decision;
    // What the engine is waiting for next decides which caller utterance must be
    // validated here (a dialable number, a plausible name) before it is stored.
    this.rememberPendingField(call.callId, conversation.pendingFieldId);

    // The call is over only when the engine says the handoff is built.
    if (conversation.handoffAvailable || stage === "handoff" || stage === "completed") {
      const closing = "Thank you. I've passed your details to the team and someone will call you back.";
      const withClosing = appendTranscript(call, "assistant", closing, at);
      return this.end(withClosing, at, closing, "completed");
    }

    if (stage === "confirmation") {
      const awaiting = withState(call, "awaiting-confirmation", at);
      const readback = this.readback(awaiting);
      const spoken = appendTranscript(awaiting, "assistant", readback, at);
      return Object.freeze({
        call: spoken,
        speech: readback,
        endCall: false,
        transferTo: null,
        summary: null,
        pendingFieldId: null,
      });
    }

    if (decision === "escalation" || stage === "escalation") {
      return this.escalate(
        call,
        "engine-escalation",
        "I'm sorry, that needs someone on the team. I'll have them call you back.",
        at,
        looksLikeQuestion(text) ? "outside-configured-services" : undefined,
      );
    }

    if (decision === "answered") {
      const answerText = usableAssistantText(outcome);
      if (answerText !== null) {
        const spoken = appendTranscript(
          recordApprovedAnswer(call, { text: answerText, sources: [] }),
          "assistant",
          answerText,
          at,
        );
        return Object.freeze({
          call: spoken,
          speech: answerText,
          endCall: false,
          transferTo: null,
          summary: null,
          pendingFieldId: conversation.pendingFieldId,
        });
      }
    }

    if (decision === "rejected" || decision === "not-performed") {
      const speech = "I'm not able to help with that one, but I can take your details so the team can call you back.";
      return this.escalate(
        call,
        "outside-configured-services",
        speech,
        at,
        "outside-configured-services",
      );
    }

    // accepted / clarification / confirmation: speak the engine's own question,
    // when it is a question a caller can actually answer.
    const question = usableAssistantText(outcome);
    if (question !== null) {
      const spoken = appendTranscript(call, "assistant", question, at);
      return Object.freeze({
        call: spoken,
        speech: question,
        endCall: false,
        transferTo: null,
        summary: null,
        pendingFieldId: conversation.pendingFieldId,
      });
    }

    // Nothing the engine produced can be spoken to a caller, so the utterance
    // itself is what a person must answer.
    return this.escalate(
      call,
      "no-usable-response",
      FALLBACK_APOLOGY,
      at,
      looksLikeQuestion(text) ? "outside-configured-services" : undefined,
    );
  }

  private confirmOrReprompt(
    call: TelephoneCall,
    text: string,
    at: number,
  ): Promise<CallTurnResult> | CallTurnResult {
    if (AFFIRMATIVE.test(text)) {
      return this.runEngine(call, "confirm", at);
    }
    if (NEGATIVE.test(text)) {
      // The receptionist must not silently overwrite confirmed details, so a
      // correction goes to a person rather than being guessed at.
      return this.escalate(
        call,
        "caller-corrected-details",
        "Thanks for telling me. I'll have someone from the team confirm the details with you.",
        at,
      );
    }
    const readback = this.readback(call);
    const spoken = appendTranscript(call, "assistant", readback, at);
    return Object.freeze({ call: spoken, speech: readback, endCall: false, transferTo: null, summary: null });
  }

  private readback(call: TelephoneCall): string {
    const name = call.contact.name ?? "you";
    const number = call.contact.callbackNumber ?? "the number you called from";
    const issue = call.contact.issueSummary ?? "the problem you described";
    return `Just to confirm: your name is ${name}, your callback number is ${speakNumber(number)}, and the issue is ${issue}. Is that all correct?`;
  }

  private escalate(
    call: TelephoneCall,
    reason: string,
    speech: string,
    at: number,
    unansweredReason?: UnansweredReason,
  ): CallTurnResult {
    const questioned = unansweredReason === undefined
      ? call
      : recordUnanswered(call, lastCallerLine(call) ?? speech, unansweredReason, at);
    const escalated = withEscalation(
      questioned,
      reason,
      this.business.profile.escalation.destination,
      at,
    );
    const spoken = appendTranscript(escalated, "assistant", speech, at);
    const summary = this.buildSummary(spoken);
    return Object.freeze({
      call: spoken,
      speech,
      endCall: true,
      transferTo: null,
      summary,
    });
  }

  private end(
    call: TelephoneCall,
    at: number,
    speech: string,
    state: CallState = "completed",
  ): CallTurnResult {
    const ended = withState(call, state, at);
    const summary = this.buildSummary(ended);
    return Object.freeze({
      call: ended,
      speech,
      endCall: true,
      transferTo: null,
      summary,
    });
  }

  private goodbye(): string {
    return `Thanks for calling ${this.business.profile.businessName}. Goodbye.`;
  }

  private pendingFieldOf(call: TelephoneCall): string | null {
    return this.pendingByCall.get(call.callId) ?? null;
  }

  /** Remembered per call so the flow can validate a field before the engine sees it. */
  private readonly pendingByCall = new Map<string, string | null>();

  /** Record the field the engine is waiting on. Called after every engine turn. */
  private rememberPendingField(callId: string, pendingFieldId: string | null): void {
    if (pendingFieldId === null) this.pendingByCall.delete(callId);
    else this.pendingByCall.set(callId, pendingFieldId);
  }

  buildSummary(call: TelephoneCall): HandoffSummary {
    const businessName = this.business.profile.businessName;
    const endedAt = call.lastActivityAt;
    const outcome: CallState = call.escalation.escalated ? "escalated" : call.state;
    const unresolved = call.unanswered.map((entry) => Object.freeze({
      question: entry.question,
      reason: entry.reason,
    }));
    const confirmedByCaller = call.contact.name !== null
      && call.contact.callbackNumber !== null
      && call.contact.issueSummary !== null;

    return Object.freeze({
      callId: call.callId,
      businessProfileId: call.businessProfileId,
      businessName,
      receivedAt: call.startedAt,
      endedAt,
      durationMs: Math.max(0, endedAt - call.startedAt),
      outcome,
      caller: Object.freeze({
        name: call.contact.name,
        callbackNumber: call.contact.callbackNumber,
        issueSummary: call.contact.issueSummary,
      }),
      answered: Object.freeze(call.answered.map((entry) => Object.freeze({
        text: entry.text,
        sources: entry.sources,
      }))),
      unresolved: Object.freeze(unresolved),
      escalated: call.escalation,
      confirmedByCaller,
      ownerBrief: ownerBrief({
        businessName,
        call,
        outcome,
        confirmedByCaller,
      }),
    });
  }
}

/** Businesses that require an explicit recording notice before capture. */
const RECORDING_NOTICE_BUSINESSES: ReadonlySet<string> = new Set();

function ownerBrief(input: {
  readonly businessName: string;
  readonly call: TelephoneCall;
  readonly outcome: CallState;
  readonly confirmedByCaller: boolean;
}): string {
  const { call } = input;
  const who = call.contact.name ?? "An unidentified caller";
  const number = call.contact.callbackNumber ?? `the calling number ${call.fromNumber}`;
  const issue = (call.contact.issueSummary ?? "no issue described").replace(/[.!?]+\s*$/, "");
  const duration = Math.max(1, Math.round((call.lastActivityAt - call.startedAt) / 1000));
  const parts = [
    `New call for ${input.businessName}.`,
    `${who} called from ${number} about: ${issue}.`,
    `Call lasted ${duration} seconds and ended as ${input.outcome}.`,
  ];
  if (call.answered.length > 0) {
    parts.push(`Answered ${call.answered.length} question(s) from approved information.`);
  }
  if (call.unanswered.length > 0) {
    parts.push(`${call.unanswered.length} question(s) need a person.`);
  }
  if (call.escalation.escalated) {
    parts.push(`Escalated: ${call.escalation.reason}. Destination: ${call.escalation.destination ?? "unassigned"}.`);
  }
  return parts.join(" ");
}

function turnIdentifier(call: TelephoneCall): string {
  const suffix = `-t${call.turnCount}-${call.lastActivityAt.toString(36)}`;
  const base = call.callId.slice(0, Math.max(8, 64 - suffix.length));
  return `${base}${suffix}`.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 64);
}

function failureReason(outcome: Exclude<ReceptionistTurnOutcome, { status: "ok" }>): "budget-exhausted" | "provider-unavailable" {
  return outcome.status === "budget-exhausted" ? "budget-exhausted" : "provider-unavailable";
}

/** The caller's most recent utterance, used as the question a person must answer. */
function lastCallerLine(call: TelephoneCall): string | null {
  for (let index = call.transcript.length - 1; index >= 0; index -= 1) {
    const entry = call.transcript[index];
    if (entry?.role === "caller") return entry.text;
  }
  return null;
}

/** The last assistant line, when it is something a caller should hear. */
function usableAssistantText(outcome: Extract<ReceptionistTurnOutcome, { status: "ok" }>): string | null {
  const assistant = outcome.messages.filter((message) => message.role === "assistant");
  for (let index = assistant.length - 1; index >= 0; index -= 1) {
    const text = assistant[index]?.text?.trim() ?? "";
    if (text.length === 0) continue;
    if (SCREEN_ONLY_TEXT.test(text)) continue;
    return text;
  }
  return null;
}

function summarizeIssue(text: string): string | null {
  const normalized = text.replace(/\s+/g, " ").trim().replace(/[.!?,;:]+\s*$/, "");
  if (normalized.length < 8) return null;
  return normalized.length > 160 ? `${normalized.slice(0, 157)}...` : normalized;
}

/**
 * Pull a dialable number out of a spoken sentence.
 *
 * Callers say numbers in every format the recognizer can produce: digit by
 * digit, with words, grouped with commas or dashes, or with filler such as "my
 * number is". Words are converted first, then every non-digit is dropped, so
 * grouping punctuation can never truncate the number.
 */
function extractSpokenNumber(text: string): string {
  const spokenDigits = text
    .toLowerCase()
    .replace(/\boh\b/g, "0")
    .replace(/\bzero\b/g, "0")
    .replace(/\bone\b/g, "1")
    .replace(/\btwo\b/g, "2")
    .replace(/\bthree\b/g, "3")
    .replace(/\bfour\b/g, "4")
    .replace(/\bfive\b/g, "5")
    .replace(/\bsix\b/g, "6")
    .replace(/\bseven\b/g, "7")
    .replace(/\beight\b/g, "8")
    .replace(/\bnine\b/g, "9");
  return spokenDigits.replace(/\D/g, "");
}

function plausibleName(text: string): string | null {
  const normalized = text.replace(/^(?:it'?s|this is|my name is|i'?m)\s+/i, "").trim();
  const cleaned = normalized.replace(/[^A-Za-z' .-]/g, "").replace(/\s+/g, " ").trim();
  if (cleaned.length < 2 || cleaned.length > 60) return null;
  return cleaned;
}

/** Read a number for confirmation without asking for digit-by-digit repetition. */
function speakNumber(value: string): string {
  if (!value.startsWith("+1")) return value;
  const digits = value.slice(2);
  if (digits.length !== 10) return value;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

function asksAboutHours(text: string): boolean {
  return /\b(?:hours?|open|opening|close|closing|closed)\b/i.test(text);
}

function bounded(value: unknown, minimum: number, maximum: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < minimum || value > maximum) return null;
  return value;
}
