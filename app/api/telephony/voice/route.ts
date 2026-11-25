import { resolveTelephoneRuntime } from "../../../../src/server/telephony/telephone-runtime";
import {
  TWILIO_SIGNATURE_HEADER,
  parseInboundVoiceRequest,
  renderUnavailableResponse,
  renderVoiceResponse,
  verifyTwilioSignature,
} from "../../../../src/telephony/twilio-voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Carriers post small forms; anything larger is not a call webhook. */
const MAXIMUM_BODY_BYTES = 64 * 1024;
const VOICE_PATH = "/api/telephony/voice";

/**
 * Inbound call handler for Twilio Programmable Voice.
 *
 * The request is authenticated with the carrier's own signature over the exact
 * public URL and every parameter, because this endpoint is public by necessity.
 * Every reply is TwiML generated from a value the application authorized; no
 * caller speech and no business name is ever interpolated unescaped.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await readBoundedBody(request);
  if (body === null) return twiml(renderUnavailableResponse(), 200);

  const parameters = formToRecord(body);
  const resolution = await resolveTelephoneRuntime();

  if (resolution.status === "unavailable") {
    // A spoken apology and a hangup, not an error page: the caller is on a phone.
    return twiml(renderUnavailableResponse(), 200);
  }

  const configuration = resolution.runtime.configuration;
  const signatureValid = verifyTwilioSignature({
    authToken: configuration.authToken,
    url: `${configuration.publicOrigin}${VOICE_PATH}`,
    parameters,
    signature: request.headers.get(TWILIO_SIGNATURE_HEADER),
  });
  if (!signatureValid) {
    // No body and no detail: an unauthenticated caller learns nothing.
    return new Response(null, { status: 403 });
  }

  const parsed = parseInboundVoiceRequest(parameters);
  if (parsed.status === "rejected") {
    return twiml({
      say: "Sorry, I can't take this call. Please call back from a number we can reach.",
      hangup: true,
    }, 200);
  }

  const reply = await resolution.runtime.service.handleVoiceTurn(
    parsed.request,
    parsed.request.speech === null,
  );

  const hints = resolution.runtime.service.speechHintsForCarrier();
  return twiml({
    say: reply.speech,
    gather: reply.endCall || reply.transferTo !== null
      ? undefined
      : {
          action: VOICE_PATH,
          speechTimeout: "auto",
          hints: hints.length > 0 ? hints.join(", ") : undefined,
        },
    dial: reply.transferTo ?? undefined,
    hangup: reply.endCall,
  }, 200);
}

export async function GET(): Promise<Response> {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}

function twiml(plan: Parameters<typeof renderVoiceResponse>[0], status: number): Response {
  return new Response(renderVoiceResponse(plan), {
    status,
    headers: {
      "content-type": "text/xml; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function readBoundedBody(request: Request): Promise<string | null> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/x-www-form-urlencoded")) return null;
  const text = await request.text();
  if (text.length === 0 || text.length > MAXIMUM_BODY_BYTES) return null;
  return text;
}

function formToRecord(body: string): Record<string, string> {
  const record: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(body)) {
    // Duplicate names would let a second value change the signed payload
    // without changing the first, so the request is rejected instead.
    if (key in record) return {};
    record[key] = value;
  }
  return record;
}
