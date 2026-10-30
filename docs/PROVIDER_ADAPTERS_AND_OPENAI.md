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
