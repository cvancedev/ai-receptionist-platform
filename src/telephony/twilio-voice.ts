import { createHmac, timingSafeEqual } from "node:crypto";
import { isCallId, normalizeTelephoneNumber } from "./call-session";

/**
 * The carrier boundary for Twilio Programmable Voice.
 *
 * The pilot uses `<Gather input="speech">`, which is turn-based over plain
 * HTTP(S): the carrier transcribes one caller utterance, posts it here, and the
 * reply is spoken. That is deliberately the simplest path that can reuse the
 * existing server-side conversation engine, because it needs no WebSocket
 * server, no audio streaming, and no second copy of the dialogue state.
 *
 * Everything a carrier sends is untrusted. A request is accepted only with a
 * valid `X-Twilio-Signature` computed over the exact public URL and every POST
 * parameter, compared in constant time.
 */
export const TWILIO_VOICE_ADAPTER_VERSION = "twilio-voice-adapter/v1" as const;

export const TWILIO_SIGNATURE_HEADER = "x-twilio-signature" as const;

export interface TwilioSignatureInput {
  readonly authToken: string;
  readonly url: string;
  readonly parameters: Readonly<Record<string, string>>;
  readonly signature: string | null;
}

/**
 * Verify a Twilio webhook signature.
 *
 * Twilio's scheme is HMAC-SHA1 over the full URL followed by each parameter name
 * and value in ascending name order, Base64 encoded and compared with the header.
 */
export function verifyTwilioSignature(input: TwilioSignatureInput): boolean {
  const { authToken, url, parameters, signature } = input;
  if (typeof authToken !== "string" || authToken.length < 16) return false;
  if (typeof url !== "string" || url.length === 0) return false;
  if (typeof signature !== "string" || signature.length === 0) return false;

  const payload = Object.keys(parameters)
    .sort()
    .reduce((accumulated, key) => `${accumulated}${key}${parameters[key] ?? ""}`, url);

  const expected = createHmac("sha1", authToken)
    .update(Buffer.from(payload, "utf8"))
    .digest("base64");

  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(signature, "utf8");
  if (left.byteLength !== right.byteLength) return false;
  return timingSafeEqual(left, right);
}

export interface InboundVoiceRequest {
  readonly callId: string;
  readonly fromNumber: string;
  readonly toNumber: string;
  readonly callStatus: string;
  /** The carrier's transcription of the caller's speech, when present. */
  readonly speech: string | null;
  /** Set when the carrier reports low confidence in that transcription. */
  readonly confidence: number | null;
  readonly isFinalTurn: boolean;
}

export type VoiceRequestParseResult =
  | { readonly status: "parsed"; readonly request: InboundVoiceRequest }
  | { readonly status: "rejected"; readonly reason: VoiceRequestRejection };

export type VoiceRequestRejection =
  | "MissingCallIdentifier"
  | "InvalidCallIdentifier"
  | "MissingCallerNumber"
  | "InvalidCallerNumber"
  | "UnsupportedCallStatus";

const TERMINAL_CARRIER_STATUSES: ReadonlySet<string> = new Set([
  "completed",
  "busy",
  "failed",
  "no-answer",
  "canceled",
]);

export function parseInboundVoiceRequest(
  parameters: Readonly<Record<string, string>>,
): VoiceRequestParseResult {
  const callId = parameters.CallSid ?? "";
  if (callId.length === 0) return reject("MissingCallIdentifier");
  if (!isCallId(callId)) return reject("InvalidCallIdentifier");

  const fromNumber = normalizeTelephoneNumber(parameters.From ?? "");
  if (fromNumber === null) {
    // A withheld or anonymous caller ID is not an error the receptionist can
    // fix, but a call without a dialable number cannot be recorded as a callback.
    return reject((parameters.From ?? "").length === 0 ? "MissingCallerNumber" : "InvalidCallerNumber");
  }

  const toNumber = normalizeTelephoneNumber(parameters.To ?? "") ?? "";
  const callStatus = (parameters.CallStatus ?? "").toLowerCase();
  const speech = typeof parameters.SpeechResult === "string"
    ? parameters.SpeechResult.trim()
    : "";
  const confidenceValue = Number.parseFloat(parameters.Confidence ?? "");

  return Object.freeze({
    status: "parsed" as const,
    request: Object.freeze({
      callId,
      fromNumber,
      toNumber,
      callStatus,
      speech: speech.length > 0 ? speech : null,
      confidence: Number.isFinite(confidenceValue) ? confidenceValue : null,
      isFinalTurn: TERMINAL_CARRIER_STATUSES.has(callStatus),
    }),
  });
}

export interface VoiceResponsePlan {
  /** Spoken with text-to-speech. Never trusted markup. */
  readonly say?: string;
  readonly gather?: {
    /** Absolute or relative URL the carrier posts the next utterance to. */
    readonly action: string;
    readonly language?: string;
    readonly speechTimeout?: "auto" | number;
    /** Words the recognizer should favour, e.g. service names. */
    readonly hints?: string;
    readonly timeoutSeconds?: number;
  };
  readonly dial?: string;
  readonly hangup?: boolean;
}

/**
 * Render a TwiML response.
 *
 * Every interpolated value is escaped, because business names, caller speech and
 * configuration all reach this function.
 */
export function renderVoiceResponse(plan: VoiceResponsePlan): string {
  const parts: string[] = [];
  const say = plan.say === undefined ? "" : `<Say voice="Polly.Joanna">${escapeXml(plan.say)}</Say>`;

  if (plan.gather) {
    const attributes = [
      `input="speech"`,
      `action="${escapeXml(plan.gather.action)}"`,
      `method="POST"`,
      `language="${escapeXml(plan.gather.language ?? "en-US")}"`,
      `speechTimeout="${escapeXml(String(plan.gather.speechTimeout ?? "auto"))}"`,
      `timeout="${clampSeconds(plan.gather.timeoutSeconds ?? 6)}"`,
    ];
    if (plan.gather.hints) attributes.push(`hints="${escapeXml(plan.gather.hints)}"`);
    parts.push(`<Gather ${attributes.join(" ")}>${say}</Gather>`);
  } else if (say.length > 0) {
    parts.push(say);
  }

  if (plan.dial) parts.push(`<Dial>${escapeXml(plan.dial)}</Dial>`);
  if (plan.hangup) parts.push("<Hangup/>");
  if (parts.length === 0) parts.push("<Hangup/>");

  return `<?xml version="1.0" encoding="UTF-8"?><Response>${parts.join("")}</Response>`;
}

/** A response for a call the platform cannot serve at all. */
export function renderUnavailableResponse(): VoiceResponsePlan {
  return Object.freeze({
    say: "Sorry, this number is not taking calls right now. Please try again later.",
    hangup: true,
  });
}

function clampSeconds(value: number): number {
  if (!Number.isFinite(value)) return 6;
  return Math.min(20, Math.max(1, Math.round(value)));
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function reject(reason: VoiceRequestRejection): VoiceRequestParseResult {
  return Object.freeze({ status: "rejected" as const, reason });
}
