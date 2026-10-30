# Provider Adapters: OpenAI Responses

Stage B2.4B.2A adds a server-only adapter that speaks OpenAI's Responses API
from the existing provider-neutral seam. It is **not wired into any runtime**:
pilot configuration still reports `providerNetworkExecution: "disabled"`, and
nothing under `src/server/pilot`, `src/server/http`, or `app/` references it.
Its only caller today is `verify:openai-responses-adapter`, which runs entirely
against a loopback fake.

## Where it sits

```
turn (application, offline today)
  → runAiDemoTurn: route → context → prompt → render (application-owned)
  → OfflineTransport                       ← the seam
        ├── simulated-model-transport/v1   (browser demo and pilot default)
        ├── fake-local-provider/v1         (B2.4A failure modes)
        ├── provider-http-envelope/v1      (B2.1 certified transport)
        └── openai-responses-adapter/v1    (this stage, unreachable)
  → BoundedRawOutputParser → proposal validator → grounding → app decision
```

The adapter is one `OfflineTransport` implementation, so every existing
boundary holds unchanged: the reservation is placed before it is called, the
output is parsed and validated by the application, and only the application can
release text or change state.

## Wire mapping

| Application envelope | OpenAI Responses request |
| --- | --- |
| `instructions` | `instructions` (unchanged text) |
| `input` | `input` (unchanged text) |
| rendered `schema` | `text.format = { type: "json_schema", strict: true, name, schema }` |
| application output budget | `max_output_tokens` (bounded 1–4096, default 512) |
| allowlisted model | `model` |
| — | `store: false` |

The rendered contract is **not** JSON Schema, so the adapter translates it: the
advertised `properties` are exactly the contract's required fields with
`additionalProperties: false`; optional contract fields are deliberately not
advertised, so a model cannot fabricate a field the application did not ask for.
`string` and `string_array` carry `maxLength` / `maxItems`; any contract that
uses `record` or `record_array` is refused, because strict mode cannot express
unbounded keys.

No tools are sent, no streaming is requested, no `temperature` is set, and the
internal `attemptId` stays out of the body.

Response translation (`output[] → envelope`):

| OpenAI response | Application envelope |
| --- | --- |
| `output_text` part | `rawOutput` (validated against the contract schema before return) |
| `refusal` part | `status: "refused"` |
| `status: "incomplete"` + `max_output_tokens` | `status: "incomplete"`, `finishReason: "length"` |
| `usage.input_tokens` / `output_tokens` | `usage.inputUnits` / `outputUnits` |
| missing `usage` | `usage: undefined` → the turn settles the conservative estimate |

## Fail-closed rules

The adapter refuses rather than guesses:

- **Envelope:** a duplicate member name (checked by the certified structural
  scanner, not a regular expression), non-JSON, a non-object, an unknown status,
  or a non-terminal status (`queued`, `in_progress`) is a failure.
- **Action-shaped output:** any `function_call`, `custom_tool_call`,
  `computer_call`, `web_search_call`, `file_search_call`,
  `code_interpreter_call`, `image_generation_call`, `mcp_call`, or
  `local_shell_call` item is a failure. The application offers no tools, so a
  tool item means the provider is acting outside the approved contract.
  `reasoning` items are ignored; any other unknown item type is a failure.
- **Text:** zero or two `output_text` parts is a failure ("refuse to choose"),
  and non-text content parts are a failure.
- **Schema:** the text is validated by `validateProviderOutput` before it becomes
  a proposal, so invalid JSON, missing required fields, wrong types, unexpected
  fields, and out-of-limit strings or arrays are all refused by the same
  certified code the other transports use.
- **Transport:** redirects are refused (never followed), non-JSON content types
  are refused, the response body is read under a byte ceiling, and every error
  category is sanitized. Provider response text and the credential never appear
  in a result.

## Network and credential discipline

- One allowlisted origin. `baseUrl` must be an origin (a path, query, or
  fragment is a configuration error), HTTPS is required except for an explicit
  loopback verification server, embedded credentials in the URL are refused, and
  a supplied `allowedOrigins` list can only narrow the endpoint's own origin.
- The credential is read per attempt from a server-side reference and sent only
  as `Authorization: Bearer …`. It is never placed in the body, a result, a log,
  or an error, and it is refused if it is empty, over 4096 characters, or
  contains whitespace or control characters.
- A caller `AbortSignal` and the application timeout both terminate the attempt;
  a cancellation or deadline that lands while the body is being read is never
  reported as a completed result.

## Spending protection

Nothing changed in the reservation design, and the adapter gets no bypass:

- `DurableReceptionistConversationService` still runs
  `validate → authorize → reserve → provider → validate → commit/settle`.
- An unpriced provider/model fails closed **before** the transport is called.
  The allowlist currently prices `openai / gpt-6-luna` only; `gpt-5.6` has no
  entry, so a live turn refuses today. Verification asserts exactly that.
- Reported usage settles the reported cost; a response with no usage settles the
  conservative estimate rather than a guessed zero.
- Verification proves the reservation exists before the fake is called, and that
  a turn above the monthly cap reaches the fake zero times.

## What remains before a live call

1. **Pricing.** Verify `gpt-5.6` input/output rates from the official pricing
   page, add an `openai / gpt-5.6` allowlist entry with a conservative margin,
   and re-run `verify:pilot-budget-reservations`.
2. **Reported usage wiring.** The pilot runtime must supply `reportedUsage` from
   the provider result so settlement uses real token counts; the hook exists and
   is exercised here, but the runtime does not populate it yet.
3. **Endpoint authorization.** Add `https://api.openai.com` to the approved
   origin list for the pilot environment and keep the transport's own ceiling
   under the reservation's worst-case budget.
4. **Provider spend limit.** Set an independent project spend limit in the
   provider dashboard; the application cap is not a provider-side limit.
5. **Explicit activation.** A separately authorized stage must introduce a pilot
   provider mode that is still `disabled` by default, with its own verification
   and a single acceptance question.
6. **Credential handling.** A dedicated project key, set outside chat, never in
   source, never in a client bundle.

## Known limitations

- The adapter sends the rendered prompt as one `input` string; it does not use
  multi-turn `previous_response_id` continuity. Each turn is self-contained,
  which is what the deterministic context package already assumes.
- Optional contract fields are not advertised, so a live model will not produce
  `limitationNote` or similar optional values. The validator accepts their
  absence.
- Non-text output items (images, audio) and tool-related items are refused, so a
  future multimodal or tool-using receptionist needs a new contract, not a
  loosened adapter.
- The adapter is unit-verified against a faithful fake, not against OpenAI. The
  first live call remains unproven until an authorized stage runs it.

## Stage B2.4B.2B — model selection and usage settlement

Readiness only. Network execution is still `disabled`; nothing here enables a
provider, spends money, or contacts OpenAI.

### Model choice and verified pricing

Prices below were read from the official OpenAI documentation on 2026-10-30.
They are a dated snapshot, not a contractual rate, and every allowlist entry is
marked `provisional: true` for that reason.

| Model | Input / 1M | Output / 1M | Structured outputs | Role |
|---|---:|---:|---|---|
| `gpt-6-luna` | $0.10 | $0.50 | Supported | **Recommended** |
| `gpt-5.6-luna` | $0.20 | $1.20 | Supported | Approved alternative |
| `gpt-5.6-sol` | $4.00 | $20.00 | Supported | Not allowlisted |
| `gpt-6-astra` | $10.00 | $50.00 | Supported | Not allowlisted |

`gpt-6-luna` is the recommendation because it is the cheapest current model that
still supports strict JSON schema output on the Responses API, and this workload
is short, grounded question answering rather than open-ended reasoning. The
GPT-5.6 flagship costs roughly forty times as much per turn and nothing in the
brief needs it, so the earlier assumption that GPT-5.6 was required does not
hold. An unlisted model resolves to no price at all, which fails closed: a turn
cannot reserve spending for it and therefore cannot reach a provider.

Per-turn cost at the application's 4,000 input / 512 output token budgets, with
the 25% safety margin:

- `gpt-6-luna`: 820 micro-units (≈$0.00082) reserved per turn, so the $10 monthly
  pilot cap covers 12,195 worst-case turns.
- `gpt-5.6-luna`: 1,769 micro-units (≈$0.0018) reserved per turn, or 5,652 turns.

Actual usage is normally far below the budget, so real cost per turn is lower
still; the reservation is deliberately the worst case.

The provider bills double input and 1.5× output above 272,000 input tokens. The
application's 4,000-token input budget and 200,000-token estimate ceiling both
stay below that threshold, so no estimate can under-price a surcharged request.
The suite asserts this rather than leaving it as an assumption.

### Usage accounting

The turn result now carries the usage the provider reported. The conversation
service holds it on the conversation, not on the service, so a turn running
concurrently in another conversation cannot have its usage attributed to this
one's settlement; the durable layer reads it and settles that cost. Behavior:

- Reported usage settles the reported cost.
- A missing usage record settles the conservative reservation estimate.
- A missing usage record **never** settles zero. The transport collapses an
  absent record to zero units, and a real request always consumes at least one
  input token, so zero input units is treated as "not reported" rather than as a
  free turn.
- A duplicate `turnId` replays from its receipt and is charged exactly once.
- A confirmed provider failure releases nothing that might still have been
  billed: the reservation is held for reconciliation, and the turn charges zero.

Because reported usage now settles, the B2.4A budget suite asserts the reported
charge rather than the estimate. Its fake provider reports the token counts the
simulated transport derives from the rendered prompt, so the suite prices
exactly what was billed instead of assuming a constant.

### Provider configuration

`src/server/pilot/pilot-provider-configuration.ts` validates the only endpoint
and models the application has verified. It authorizes nothing:

- `mode` must be the literal `"disabled"`, and must be stated. It is never
  defaulted, because it is the authorization switch.
- The origin must be exactly `https://api.openai.com`; a lookalike, an alternate
  host, or plaintext HTTP is refused.
- The model must be one of the two approved, priced models.
- The credential is supplied as the **name** of a server-side variable. A
  key-shaped value is refused rather than stored, so a pasted secret cannot reach
  source control or a log through this path.
- Output budget and timeout are bounded.

The adapter itself is unchanged from B2.4B.2A except for the usage plumbing above,
and no runtime module references it. The suite enforces that with a static scan,
so a future wiring change that forgets the guard fails verification instead of
production.

### What remains before a live call (updated)

1. Wire the configured model into a pilot provider mode that is still disabled by
   default, with its own verification and a single acceptance question.
2. Set a dedicated project key into the named variable outside chat, plus an
   independent provider-side project spend limit. The application cap cannot
   constrain OpenAI's own billing.
3. Re-verify the price on the official page immediately before activation, since
   the snapshot is provisional and the flagship's promotional pricing is
   time-limited.
4. Run one authorized acceptance call and reconcile the settled charge against the
   provider dashboard.
