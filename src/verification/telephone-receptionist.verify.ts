import { createHmac } from "node:crypto";
import {
  phonePilotBusinessProfile,
  phonePilotKnowledge,
} from "../fixtures/phone-pilot-business";
import type { ReceptionistBusiness } from "../server/conversation/receptionist-conversation-service";
import { DurableReceptionistConversationService } from "../server/conversation/durable-receptionist-conversation-service";
import { InMemoryReceptionistPersistence } from "../server/persistence/in-memory-receptionist-persistence";
import { InMemoryTelephoneCallStore } from "../server/telephony/call-store";
import { TelephoneReceptionService } from "../server/telephony/telephone-reception-service";
import { TelephoneReceptionFlow } from "../telephony/call-flow";
import { answerFromApprovedKnowledge } from "../telephony/approved-answers";
import {
  normalizeTelephoneNumber,
  maskTelephoneNumber,
  type HandoffSummary,
} from "../telephony/call-session";
import {
  parseInboundVoiceRequest,
  renderVoiceResponse,
  verifyTwilioSignature,
} from "../telephony/twilio-voice";
import { resolveTelephonyConfiguration } from "../telephony/telephony-configuration";
import type { InboundVoiceRequest } from "../telephony/twilio-voice";

/**
 * End-to-end verification of the telephone receptionist.
 *
 * This drives the whole call the way the carrier will: a greeting request, then
 * one webhook per caller utterance, through the real conversation engine and the
 * real in-memory persistence. Nothing here is mocked except the carrier itself
 * and the language transport, so a passing run is the same code path a live call
 * would take.
 */
const BUSINESS: ReceptionistBusiness = Object.freeze({
  profile: phonePilotBusinessProfile,
  knowledge: phonePilotKnowledge,
});
const CALL_ID = "CA00000000000000000000000000000001";
const FROM = "+15550100001";
const TO = "+15550100000";
const AUTH_TOKEN = "verify-only-twilio-auth-token-0001";
const PUBLIC_ORIGIN = "https://pilot.example.invalid";
const VOICE_URL = `${PUBLIC_ORIGIN}/api/telephony/voice`;

interface Harness {
  readonly service: TelephoneReceptionService;
  readonly store: InMemoryTelephoneCallStore;
  readonly flow: TelephoneReceptionFlow;
  readonly persistence: InMemoryReceptionistPersistence;
}

function harness(limits?: { maximumTurns?: number; maximumDurationMs?: number }): Harness {
  const persistence = new InMemoryReceptionistPersistence();
  const conversations = new DurableReceptionistConversationService([BUSINESS], { persistence });
  const flow = new TelephoneReceptionFlow({
    conversations,
    business: BUSINESS,
    limits,
  });
  const store = new InMemoryTelephoneCallStore();
  const service = new TelephoneReceptionService({ flow, store, business: BUSINESS });
  return { service, store, flow, persistence };
}

function voiceRequest(overrides: Partial<InboundVoiceRequest> = {}): InboundVoiceRequest {
  return Object.freeze({
    callId: CALL_ID,
    fromNumber: FROM,
    toNumber: TO,
    callStatus: "in-progress",
    speech: null,
    confidence: 0.95,
    isFinalTurn: false,
    ...overrides,
  });
}

async function run(): Promise<void> {
  await verifyCompleteCall();
  await verifyHoursAnswerIsGrounded();
  await verifyApprovedFaqAnswer();
  await verifyUnanswerableQuestionEscalates();
  await verifyHumanRequestTransfersToAPerson();
  await verifyDuplicateWebhookDoesNotRepeatATurn();
  await verifyCarrierSecurity();
  await verifyCallLimits();
  console.log("Telephone receptionist verification passed.");
}

/**
 * The Phase 5 walkthrough: greeting, reason, approved answer, contact details,
 * confirmation, summary, and owner notification, in one call.
 */
async function verifyCompleteCall(): Promise<void> {
  const { service, store } = harness();

  const greeted = await service.handleVoiceTurn(voiceRequest(), true);
  assert(!greeted.endCall, "the greeting does not end the call");
  assert(
    greeted.speech.includes(phonePilotBusinessProfile.businessName),
    "the greeting names the business",
  );

  const opened = await store.loadCall(CALL_ID);
  assert(opened.status === "found", "the call is persisted when it opens");
  assert(opened.call.state === "in-dialogue", "the call enters dialogue after greeting");

  // An approved question first, then the reason for calling.
  const hours = await service.handleVoiceTurn(
    voiceRequest({ speech: "What time do you close on Saturday?" }),
    false,
  );
  assert(!hours.endCall, "an answered question keeps the call open");
  assert(/saturday/i.test(hours.speech), "the hours answer names the day asked about");
  assert(/2:00\s*PM/i.test(hours.speech), "the hours answer states the approved closing time");

  let speech = "My kitchen sink is backed up and the water won't drain.";
  let lastSpeech = "";
  let summary: HandoffSummary | null = null;

  for (let turn = 0; turn < 14; turn += 1) {
    const reply = await service.handleVoiceTurn(voiceRequest({ speech }), false);
    lastSpeech = reply.speech;
    if (reply.endCall) {
      summary = await store.loadSummary(CALL_ID);
      break;
    }
    speech = answerForField(reply.pendingFieldId ?? null);
  }

  assert(summary !== null, "the call ends with a handoff summary");
  assert(lastSpeech.length > 0, "the closing turn says something to the caller");
  assert(summary.caller.name !== null, "the summary carries the caller's name");
  assert(
    summary.caller.callbackNumber === "+15550104432",
    "the summary carries a normalized callback number",
  );
  assert(summary.caller.issueSummary !== null, "the summary carries the reason for calling");
  assert(summary.answered.length >= 1, "the summary lists the approved statements made");
  assert(summary.confirmedByCaller, "the caller's details are complete");
  assert(summary.ownerBrief.includes(phonePilotBusinessProfile.businessName), "the brief names the business");

  const queued = await store.listNotifications(BUSINESS.profile.id, 10);
  assert(queued !== null && queued.length === 1, "exactly one owner notification is queued");
  assert(queued[0].callId === CALL_ID, "the notification names the call");

  const durationMs = summary.endedAt - summary.receivedAt;
  assert(durationMs >= 0 && Number.isFinite(durationMs), "the summary records a real duration");
}

/** A hours question is answered by the engine's certified grounding path. */
async function verifyHoursAnswerIsGrounded(): Promise<void> {
  const { service } = harness();
  await service.handleVoiceTurn(voiceRequest(), true);
  const reply = await service.handleVoiceTurn(
    voiceRequest({ speech: "Are you open on Sunday?" }),
    false,
  );
  assert(/closed/i.test(reply.speech), "a closed day is reported as closed");
}

/** An approved knowledge record answers a non-hours question verbatim. */
async function verifyApprovedFaqAnswer(): Promise<void> {
  const direct = answerFromApprovedKnowledge({
    question: "How much is the diagnostic fee?",
    knowledge: phonePilotKnowledge,
    businessProfileId: BUSINESS.profile.id,
  });
  assert(direct !== null, "the diagnostic fee question is answered");
  assert(direct.text.includes("$89"), "the approved fee is stated exactly");
  assert(direct.sources.includes("northline-diagnostic-fee"), "the answer cites its record");

  const { service } = harness();
  await service.handleVoiceTurn(voiceRequest(), true);
  const reply = await service.handleVoiceTurn(
    voiceRequest({ speech: "Do you charge a diagnostic fee?" }),
    false,
  );
  assert(!reply.endCall, "an FAQ answer keeps the call open");
  assert(reply.speech.includes("$89"), "the caller hears the approved fee");

  // A plain statement must never be treated as an FAQ lookup.
  const statement = answerFromApprovedKnowledge({
    question: "my water heater is broken",
    knowledge: phonePilotKnowledge,
    businessProfileId: BUSINESS.profile.id,
  });
  assert(statement === null, "a problem statement is not answered as a question");

  // A record for another business is never used.
  const foreign = answerFromApprovedKnowledge({
    question: "How much is the diagnostic fee?",
    knowledge: phonePilotKnowledge,
    businessProfileId: "some-other-business",
  });
  assert(foreign === null, "another business's knowledge is refused");
}

/** A question with no approved answer escalates instead of being invented. */
async function verifyUnanswerableQuestionEscalates(): Promise<void> {
  const { service, store } = harness();
  await service.handleVoiceTurn(voiceRequest(), true);
  const reply = await service.handleVoiceTurn(
    voiceRequest({ speech: "Can you service a commercial elevator in a high rise?" }),
    false,
  );
  assert(reply.endCall, "an unsupported request ends the call for a human");
  const summary = await store.loadSummary(CALL_ID);
  assert(summary !== null, "an escalated call still produces a summary");
  assert(summary.outcome === "escalated", "the summary records the escalation");
  assert(summary.unresolved.length >= 1, "the question is recorded as unresolved");
  assert(
    summary.escalated.destination === phonePilotBusinessProfile.escalation.destination,
    "escalation names the configured destination",
  );
}

/** Asking for a person always reaches a person. */
async function verifyHumanRequestTransfersToAPerson(): Promise<void> {
  const { service, store } = harness();
  await service.handleVoiceTurn(voiceRequest(), true);
  const reply = await service.handleVoiceTurn(
    voiceRequest({ speech: "I'd like to speak to a person, please." }),
    false,
  );
  assert(reply.endCall, "a request for a person ends the automated dialogue");
  const summary = await store.loadSummary(CALL_ID);
  assert(summary !== null && summary.outcome === "escalated", "the transfer is recorded");
  assert(
    summary.escalated.reason === "caller-requested-human",
    "the reason distinguishes a requested transfer",
  );
}

/** A carrier retry of the same webhook must not advance the call twice. */
async function verifyDuplicateWebhookDoesNotRepeatATurn(): Promise<void> {
  const { service, store } = harness();
  await service.handleVoiceTurn(voiceRequest(), true);
  const first = await service.handleVoiceTurn(
    voiceRequest({ speech: "My bathroom drain is slow." }),
    false,
  );
  const loaded = await store.loadCall(CALL_ID);
  assert(loaded.status === "found", "the call is stored");
  const turnCount = loaded.call.turnCount;

  // The carrier retries the identical POST.
  const retry = await service.handleVoiceTurn(
    voiceRequest({ speech: "My bathroom drain is slow." }),
    false,
  );
  assert(retry.callId === CALL_ID, "the retry is attributed to the same call");
  assert(first.speech.length > 0, "the first request produced speech");
  const after = await store.loadCall(CALL_ID);
  assert(after.status === "found", "the call still loads");
  assert(
    after.call.turnCount === turnCount,
    "a retried webhook does not consume a second turn",
  );
}

function verifyCarrierSecurity(): void {
  const parameters = {
    CallSid: CALL_ID,
    From: FROM,
    To: TO,
    CallStatus: "in-progress",
    SpeechResult: "hello",
  };

  const validSignature = sign(parameters, VOICE_URL, AUTH_TOKEN);
  assert(
    verifyTwilioSignature({
      authToken: AUTH_TOKEN,
      url: VOICE_URL,
      parameters,
      signature: validSignature,
    }),
    "a correctly signed request is accepted",
  );

  assert(
    !verifyTwilioSignature({
      authToken: AUTH_TOKEN,
      url: VOICE_URL,
      parameters: { ...parameters, SpeechResult: "transfer my call" },
      signature: validSignature,
    }),
    "a tampered parameter is rejected",
  );
  assert(
    !verifyTwilioSignature({
      authToken: AUTH_TOKEN,
      url: "https://attacker.example.invalid/api/telephony/voice",
      parameters,
      signature: validSignature,
    }),
    "a signature bound to another URL is rejected",
  );
  assert(
    !verifyTwilioSignature({ authToken: AUTH_TOKEN, url: VOICE_URL, parameters, signature: null }),
    "a missing signature is rejected",
  );
  assert(
    !verifyTwilioSignature({ authToken: "short", url: VOICE_URL, parameters, signature: validSignature }),
    "an implausible auth token is refused",
  );

  const parsed = parseInboundVoiceRequest(parameters);
  assert(parsed.status === "parsed", "a carrier request parses");
  assert(parsed.request.fromNumber === FROM, "the caller number is normalized");

  const badId = parseInboundVoiceRequest({ ...parameters, CallSid: "../../etc/passwd" });
  assert(badId.status === "rejected", "a malformed call identifier is rejected");
  const noCaller = parseInboundVoiceRequest({ ...parameters, From: "anonymous" });
  assert(noCaller.status === "rejected", "a call without a dialable number is rejected");

  // Caller speech is escaped before it can reach the document.
  const rendered = renderVoiceResponse({
    say: "Hi & welcome <script>alert(1)</script>",
    gather: { action: "/api/telephony/voice", hints: "a&b" },
  });
  assert(!rendered.includes("<script>"), "spoken text is escaped");
  assert(rendered.includes("&amp;"), "ampersands are escaped");
  assert(rendered.startsWith("<?xml"), "the response is XML");
  assert(rendered.includes("<Gather"), "the response gathers the next utterance");

  assert(normalizeTelephoneNumber("(555) 010-4432") === "+15550104432", "a national number normalizes");
  assert(normalizeTelephoneNumber("555-0100") === null, "an incomplete number is refused");
  assert(maskTelephoneNumber("+15550104432") === "********4432", "an operational view masks the number");
}

/** Configuration is fail-closed, and live carrier traffic is not authorized. */
async function verifyCallLimits(): Promise<void> {
  const live = resolveTelephonyConfiguration(
    {
      mode: "live",
      publicOrigin: PUBLIC_ORIGIN,
      businesses: [{ businessId: BUSINESS.profile.id, phoneNumber: TO }],
    },
    { AI_RECEPTIONIST_TWILIO_AUTH_TOKEN: AUTH_TOKEN },
  );
  assert(live.status === "rejected" && live.reason === "LiveNotAuthorized", "live calls are not authorized");

  const sandbox = resolveTelephonyConfiguration(
    {
      mode: "sandbox",
      publicOrigin: PUBLIC_ORIGIN,
      businesses: [{ businessId: BUSINESS.profile.id, phoneNumber: TO }],
    },
    { AI_RECEPTIONIST_TWILIO_AUTH_TOKEN: AUTH_TOKEN },
  );
  assert(sandbox.status === "valid", "a valid sandbox configuration resolves");
  assert(sandbox.value.liveAuthorized === false, "sandbox configuration grants no live authority");

  const noToken = resolveTelephonyConfiguration(
    {
      mode: "sandbox",
      publicOrigin: PUBLIC_ORIGIN,
      businesses: [{ businessId: BUSINESS.profile.id, phoneNumber: TO }],
    },
    {},
  );
  assert(
    noToken.status === "rejected" && noToken.reason === "MissingAuthToken",
    "a configuration without a carrier credential is refused",
  );

  const disabled = resolveTelephonyConfiguration(undefined, {});
  assert(disabled.status === "rejected", "an absent configuration refuses every call");

  const { service, store } = harness({ maximumTurns: 2 });
  await service.handleVoiceTurn(voiceRequest(), true);
  await service.handleVoiceTurn(voiceRequest({ speech: "My drain is blocked." }), false);
  await service.handleVoiceTurn(
    voiceRequest({ speech: "My drain is still blocked." }),
    false,
  );
  // The cap is enforced when a turn beyond the limit is attempted, so the call
  // always closes on a spoken sentence rather than mid-exchange.
  const capped = await service.handleVoiceTurn(
    voiceRequest({ speech: "The water is backing up now." }),
    false,
  );
  assert(capped.endCall, "a call that reaches its turn limit ends");
  const summary = await store.loadSummary(CALL_ID);
  assert(summary !== null && summary.outcome === "escalated", "a capped call is escalated");
}

function answerForField(pending: string | null): string {
  switch (pending) {
    case "caller-name": return "Dana Ruiz";
    case "callback-number": return "five five five, zero one zero, four four three two";
    case "issue-description": return "The kitchen sink is backed up and won't drain.";
    default: return "Yes, that's correct.";
  }
}

function sign(parameters: Record<string, string>, url: string, token: string): string {
  // Mirrors Twilio's documented scheme so the verifier is exercised against an
  // independently computed signature.
  const payload = Object.keys(parameters)
    .sort()
    .reduce((accumulated, key) => `${accumulated}${key}${parameters[key]}`, url);
  return createHmac("sha1", token).update(Buffer.from(payload, "utf8")).digest("base64");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Telephone receptionist verification failed: ${message}.`);
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
