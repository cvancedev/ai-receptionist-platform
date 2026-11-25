# Telephone Pilot — Provider Decision and Cost

Status: **nothing below is activated.** Both live paths are gated by literal
constants (`LIVE_PROVIDER_AUTHORIZED`, `LIVE_TELEPHONY_AUTHORIZED`) set to `false`,
so no configuration, environment variable, or deployment can turn on a paid call.
Activation requires a reviewed code change after the owner approves the spend.

## Chosen stack

| Layer | Provider | Why this one |
| --- | --- | --- |
| Telephony | Twilio Programmable Voice, `<Gather input="speech">` + `<Say>` | Turn-based HTTP. The caller's utterance arrives as a POST parameter and the reply is TwiML, so the existing server-side conversation engine is reused unchanged. No WebSocket server, no audio streaming, no second dialogue state. |
| Speech-to-text | Twilio's bundled speech recognition on `<Gather>` | Already on the call leg; one line item, no extra account or key. |
| Text-to-speech | Twilio `<Say>` (Polly.Joanna) | Included in the call leg at no extra charge. |
| Language model | OpenAI Responses API, `gpt-6-luna` | Cheapest current model that handles strict-JSON interpretation and grounded answering. Already integrated, priced, and budget-guarded in the existing code. |

Rejected for the first pilot: Conversation Relay ($0.07/min, needs a WebSocket
endpoint), Media Streams (needs real-time audio + separate STT/TTS vendors), and
the GPT-6 flagship tiers (roughly 100× the per-turn cost for this workload).

## Verified prices (US, list, checked 25 Nov 2026)

Twilio Programmable Voice:

- Inbound local call: **$0.0085 / min**
- Local number rental: **$1.15 / month**
- Application connect: **$0.0025 / min**
- Gather speech recognition: **$0.02 / use** (one use ≈ one caller turn)
- `<Say>` basic/Polly text-to-speech: **included**
- Call recording, if enabled: $0.0025 / min + $0.0005 / min-month storage

OpenAI (per 1M tokens, standard tier):

- `gpt-6-luna`: **$0.10 input / $0.50 output**
- `gpt-5.6-luna`: $0.20 input / $1.20 output (same-generation alternative)

## Cost of one pilot call

A five-to-six turn call of about three minutes, roughly 1,500 input and 150 output
tokens per turn:

| Item | Amount |
| --- | --- |
| Voice, 3 min | $0.026 |
| Application connect, 3 min | $0.008 |
| Speech recognition, 6 turns | $0.120 |
| Text-to-speech | $0.000 |
| Model, 6 turns | $0.002 |
| **Per call** | **≈ $0.16** |

Fixed: **$1.15 / month** for the number.

At 500 calls a month that is about **$80** in usage. The dominant line is speech
recognition, not the model.

## Spending controls in place

1. **Application budget.** Every priced turn reserves an estimate before the
   provider is called and settles the reported cost afterwards, inside a database
   transaction that re-checks the monthly cap. Default cap $10/month per
   business, hard maximum $1,000.
2. **Fail-closed pricing.** A model without an allowlisted price cannot run at
   all; there is no unpriced provider path.
3. **Call limits.** Maximum 12 turns and 8 minutes per call, enforced by the call
   flow, with an escalation when either is reached.
4. **No recording by default.** Recording stays off, so no recording-consent
   obligation arises for the first pilot.
5. **Provider-side limit.** To be set in the Twilio and OpenAI consoles when the
   accounts are created (see below). Application limits bound our accounting;
   provider limits bound the actual bill if our code is wrong.

## What must be approved before a real call

1. **A Twilio account** with a US local number (+$1.15/month) and a funded
   balance. Needed: account SID, auth token, purchased number.
2. **An OpenAI API key** with a hard monthly spend limit set in their console.
3. **Setting the live gates to `true`** in the two activation modules — a reviewed
   code change, deliberately not a deployment setting.

## Activation steps once approved

1. Apply migration `011_telephone_calls.sql` to the pilot database.
2. Set the server-side variables:
   - `AI_RECEPTIONIST_TWILIO_AUTH_TOKEN` — carrier auth token (signature verification)
   - `AI_RECEPTIONIST_TELEPHONY_PUBLIC_ORIGIN` — the public HTTPS origin
   - `AI_RECEPTIONIST_TELEPHONY_DATABASE_URL` — PostgreSQL connection string
   - `AI_RECEPTIONIST_OWNER_INBOX_TOKEN` — owner's read token for summaries
   - `AI_RECEPTIONIST_OPENAI_API_KEY` — model key
   - `AI_RECEPTIONIST_TELEPHONY_CONFIGURATION` — mode, origin, and number mapping
3. Point the Twilio number's voice webhook at `POST /api/telephony/voice`.
4. Place one internal test call before any customer number is advertised.

## Privacy posture

- Caller numbers are stored because the owner must return the call; they are
  never written to logs, and operational views mask all but the last four digits.
- Only the owner's token can read summaries, and that response is `no-store`.
- Nothing in the pilot schedules appointments, takes payment, or commits the
  business to anything. Every such request is escalated with the caller's details.
