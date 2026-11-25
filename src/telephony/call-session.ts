/**
 * Telephone call state for the pilot receptionist.
 *
 * A call is the audio-side counterpart of a conversation: it holds who called,
 * what was said, what the receptionist is allowed to claim was agreed, and how
 * the call ended. It never holds a credential, a session token, or model text
 * that the application did not authorize.
 *
 * Numbers are stored in a normalized E.164 form because the owner needs to call
 * the customer back. They are PII, so nothing in this module logs a value, and
 * the operational views mask them.
 */
export const CALL_STATES = [
  "greeting",
  "in-dialogue",
  "awaiting-confirmation",
  "completed",
  "escalated",
  "abandoned",
  "failed",
] as const;

export type CallState = (typeof CALL_STATES)[number];

/** Call states from which no further turn may be accepted. */
export const TERMINAL_CALL_STATES: ReadonlySet<CallState> = new Set([
  "completed",
  "escalated",
  "abandoned",
  "failed",
]);

export interface CallerContact {
  readonly name: string | null;
  readonly callbackNumber: string | null;
  readonly issueSummary: string | null;
}

export interface CallTranscriptEntry {
  readonly sequence: number;
  readonly role: "caller" | "assistant";
  readonly text: string;
  readonly at: number;
}

/** A question the receptionist could not answer from approved information. */
export interface UnansweredQuestion {
  readonly question: string;
  readonly reason: UnansweredReason;
  readonly at: number;
}

export type UnansweredReason =
  | "no-approved-information"
  | "outside-configured-services"
  | "provider-unavailable"
  | "budget-exhausted"
  | "transcription-unusable";

export interface CallEscalation {
  readonly escalated: boolean;
  readonly reason: string | null;
  readonly destination: string | null;
}

export interface RecordingConsent {
  /** True once the recording notice has actually been spoken. */
  readonly announced: boolean;
  /** Null until the caller has had a chance to respond. */
  readonly consented: boolean | null;
}

export interface ApprovedStatement {
  readonly text: string;
  readonly sources: readonly string[];
}

export interface TelephoneCall {
  readonly callId: string;
  readonly businessProfileId: string;
  readonly businessProfileVersion: number;
  readonly conversationId: string;
  readonly fromNumber: string;
  readonly toNumber: string;
  readonly startedAt: number;
  readonly lastActivityAt: number;
  readonly state: CallState;
  readonly consent: RecordingConsent;
  readonly contact: CallerContact;
  readonly transcript: readonly CallTranscriptEntry[];
  readonly unanswered: readonly UnansweredQuestion[];
  /** Approved statements actually spoken, with the records they came from. */
  readonly answered: readonly ApprovedStatement[];
  readonly turnCount: number;
  /**
   * Digest of the caller utterance most recently handled, used to recognise a
   * carrier retry of the same webhook instead of processing it twice.
   */
  readonly lastUtteranceDigest: string | null;
  readonly escalation: CallEscalation;
}

export interface HandoffSummary {
  readonly callId: string;
  readonly businessProfileId: string;
  readonly businessName: string;
  readonly receivedAt: number;
  readonly endedAt: number;
  readonly durationMs: number;
  readonly outcome: CallState;
  readonly caller: {
    readonly name: string | null;
    readonly callbackNumber: string | null;
    readonly issueSummary: string | null;
  };
  /** Approved statements the receptionist actually made, with their sources. */
  readonly answered: readonly { readonly text: string; readonly sources: readonly string[] }[];
  /** Questions that must be answered by a person, with why. */
  readonly unresolved: readonly { readonly question: string; readonly reason: UnansweredReason }[];
  readonly escalated: CallEscalation;
  /** True only when the caller's own words confirm the details above. */
  readonly confirmedByCaller: boolean;
  /** One-paragraph, copy-ready text for the owner. */
  readonly ownerBrief: string;
}

export const MAXIMUM_TRANSCRIPT_ENTRIES = 60;
export const MAXIMUM_SPOKEN_TEXT_LENGTH = 900;
export const MAXIMUM_CALL_DURATION_MS = 10 * 60 * 1_000;
export const MAXIMUM_CALL_TURNS = 24;

const CALL_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
/** 8-15 digits, matching the E.164 subscriber limits. */
const E164_PATTERN = /^\+[1-9][0-9]{7,14}$/;

export function isCallId(value: unknown): value is string {
  return typeof value === "string" && CALL_ID_PATTERN.test(value);
}

/**
 * Normalize a telephone number to E.164, or reject it.
 *
 * A caller's spoken number arrives with spaces, dashes, dots, or parentheses.
 * Anything that is not unambiguously a full number with a country code is
 * refused, so a summary never carries a number that cannot be dialed.
 */
export function normalizeTelephoneNumber(
  value: unknown,
  defaultCountryCode = "1",
): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 32) return null;
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/[^0-9]/g, "");
  if (hasPlus) {
    const candidate = `+${digits}`;
    return E164_PATTERN.test(candidate) ? candidate : null;
  }
  // A bare national number is accepted only when it fills a known country code.
  if (digits.length === 10 && /^[2-9]/.test(digits)) {
    return `+${defaultCountryCode}${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

/** Mask a number for an operational view while keeping the last four digits. */
export function maskTelephoneNumber(value: string | null): string | null {
  if (value === null) return null;
  if (value.length <= 4) return "****";
  return `${"*".repeat(value.length - 4)}${value.slice(-4)}`;
}

export function isSpokenText(value: unknown): value is string {
  return typeof value === "string"
    && value.trim().length > 0
    && value.length <= MAXIMUM_SPOKEN_TEXT_LENGTH
    && !CONTROL_CHARACTERS.test(value);
}

export interface CreateCallInput {
  readonly callId: string;
  readonly businessProfileId: string;
  readonly businessProfileVersion: number;
  readonly conversationId: string;
  readonly fromNumber: string;
  readonly toNumber: string;
  readonly now: number;
}

export function createTelephoneCall(input: CreateCallInput): TelephoneCall {
  return Object.freeze({
    callId: input.callId,
    businessProfileId: input.businessProfileId,
    businessProfileVersion: input.businessProfileVersion,
    conversationId: input.conversationId,
    fromNumber: input.fromNumber,
    toNumber: input.toNumber,
    startedAt: input.now,
    lastActivityAt: input.now,
    state: "greeting" as const,
    consent: Object.freeze({ announced: false, consented: null }),
    contact: Object.freeze({ name: null, callbackNumber: null, issueSummary: null }),
    transcript: Object.freeze([]),
    unanswered: Object.freeze([]),
    answered: Object.freeze([]),
    turnCount: 0,
    lastUtteranceDigest: null,
    escalation: Object.freeze({ escalated: false, reason: null, destination: null }),
  });
}

/** Append one spoken turn, keeping the transcript bounded and ordered. */
export function appendTranscript(
  call: TelephoneCall,
  role: "caller" | "assistant",
  text: string,
  at: number,
): TelephoneCall {
  const next: CallTranscriptEntry = Object.freeze({
    sequence: call.transcript.length + 1,
    role,
    text,
    at,
  });
  const transcript = [...call.transcript, next].slice(-MAXIMUM_TRANSCRIPT_ENTRIES);
  return Object.freeze({ ...call, transcript: Object.freeze(transcript), lastActivityAt: at });
}

export function recordUnanswered(
  call: TelephoneCall,
  question: string,
  reason: UnansweredReason,
  at: number,
): TelephoneCall {
  const entry: UnansweredQuestion = Object.freeze({ question, reason, at });
  const unanswered = [...call.unanswered, entry].slice(-20);
  return Object.freeze({ ...call, unanswered: Object.freeze(unanswered), lastActivityAt: at });
}

export function withUtteranceDigest(
  call: TelephoneCall,
  digest: string,
): TelephoneCall {
  return Object.freeze({ ...call, lastUtteranceDigest: digest });
}

export function recordApprovedAnswer(
  call: TelephoneCall,
  statement: ApprovedStatement,
): TelephoneCall {
  const answered = [...call.answered, statement].slice(-20);
  return Object.freeze({ ...call, answered: Object.freeze(answered) });
}

export function withContact(
  call: TelephoneCall,
  patch: Partial<CallerContact>,
): TelephoneCall {
  const name = patch.name !== undefined ? patch.name : call.contact.name;
  const callbackNumber = patch.callbackNumber !== undefined
    ? patch.callbackNumber
    : call.contact.callbackNumber;
  const issueSummary = patch.issueSummary !== undefined
    ? patch.issueSummary
    : call.contact.issueSummary;
  return Object.freeze({
    ...call,
    contact: Object.freeze({ name, callbackNumber, issueSummary }),
  });
}

export function withState(
  call: TelephoneCall,
  state: CallState,
  at: number,
): TelephoneCall {
  return Object.freeze({ ...call, state, lastActivityAt: at });
}

export function withEscalation(
  call: TelephoneCall,
  reason: string,
  destination: string | null,
  at: number,
): TelephoneCall {
  return Object.freeze({
    ...call,
    state: "escalated" as const,
    lastActivityAt: at,
    escalation: Object.freeze({
      escalated: true,
      reason: sanitizeReason(reason),
      destination,
    }),
  });
}

/**
 * Reasons are internal classification codes, never caller speech, so a summary
 * does not repeat a caller's wording in an operational field.
 */
function sanitizeReason(reason: string): string {
  const normalized = reason.replace(/[^A-Za-z0-9._:-]/g, "-").slice(0, 64);
  return normalized.length > 0 ? normalized : "unspecified";
}

export interface CallLimits {
  readonly maximumTurns: number;
  readonly maximumDurationMs: number;
}

export type CallLimitReached = "turn-limit" | "duration-limit" | null;

export function callLimitReached(
  call: TelephoneCall,
  limits: CallLimits,
  now: number,
): CallLimitReached {
  if (call.turnCount >= limits.maximumTurns) return "turn-limit";
  if (now - call.startedAt >= limits.maximumDurationMs) return "duration-limit";
  return null;
}

export function isTerminal(call: TelephoneCall): boolean {
  return TERMINAL_CALL_STATES.has(call.state);
}
