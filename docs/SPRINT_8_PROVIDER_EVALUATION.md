# Sprint 8 Provider Evaluation

## Decision

Milestone 8.6 defers a real development provider. No provider or model is
selected, no adapter is authorized, and the deterministic mock remains the
mandatory baseline and safe fallback.

The potential provider benefit is narrower and more natural interpretation of
unfamiliar free-form language and more varied response wording. The certified
deterministic path already completes every Sprint 8 acceptance scenario:
configured-service understanding, bounded clarification, required-field
collection, correction, grounded knowledge validation, confirmation,
escalation, completion, durable restart, and derived handoff. None of the
Sprint 8 exit criteria requires open-ended language coverage, stylistic
variation, or a real model call. Introducing network, credential, retention,
latency, availability, and cost risk without a demonstrated acceptance gap is
therefore not justified.

The approved Sprint 8 plan also requires separate explicit authorization after
this evaluation gate before any networked development adapter. This evaluation
does not grant that authorization.

## Fixed Evaluation Baseline

The fixed fictional baseline is the existing provider-neutral mock suite and
the Sprint 8 end-to-end scenarios. It deterministically covers valid intent and
candidate extraction, malformed and unknown output, scope and revision
mismatch, invalid and fabricated source references, grounding failure,
provider refusal, incomplete output, provider failure, cancellation, and
attempted model authority over state, escalation, completion, and release.

| Measure | Deterministic baseline | Provider requirement |
| --- | --- | --- |
| Required workflow completion | Passes the certified fictional scenarios | No unmet requirement |
| Grounding and source scope | Exact application validation | Provider labels cannot replace it |
| Invalid-output behavior | Deterministic rejection or bounded fallback | Must be no weaker |
| Latency | Fixed local behavior | No target improvement required by Sprint 8 |
| Availability | No network dependency | Provider failure must preserve this path |
| Handoff and restart | Deterministic and authority-owned | Provider has no role |

A future provider trial is justified only if fixed, versioned fictional inputs
show a material interpretation or drafting improvement over this baseline
while meeting all safety, latency, privacy, and cost thresholds. Qualitative
novelty alone is insufficient.

## Future Provider Boundary

Any later authorized adapter must implement the existing
`ModelProviderAdapter` boundary. It may receive only an application-selected
task and validated, bounded, immutable Prompt Package. Exact request, trace,
business, profile-version, conversation, state-revision, task, context,
contract, attempt, timeout, and cancellation identity must be preserved.

The adapter may translate one approved request and normalize completion,
refusal, incomplete output, timeout, cancellation, rate limit, unavailability,
authentication failure, usage, finish reason, and sanitized diagnostics. Raw
output remains untrusted. It cannot select context, a task, a transition, a
provider fallback, or a retry.

Application-owned parsing, structural validation, scope validation, proposal
validation, grounding, duplicate protection, decision classification,
Transition Registry, Transition Validator, State Executor, Conversation State
Manager, persistence coordination, read-model projection, and Handoff Builder
remain downstream and authoritative. Provider output cannot mutate state,
alter configuration pins, write PostgreSQL or the Execution Journal, create a
handoff, authorize release, or perform an external action.

## Grounding and Failure Policy

- A knowledge answer requires at least one exact source reference already
  present in the activated context.
- Record identity, version, source, audience, effective date, activation
  revision, context policy, business, profile, conversation, and state revision
  must match application-owned inputs.
- Missing, fabricated, unbound, stale, internal-only, or wrong-scope references
  fail closed. Provider citations or confidence do not establish grounding.
- Malformed, oversized, structurally invalid, refused, incomplete, cancelled,
  timed-out, rate-limited, unavailable, or unknown results apply no state,
  persistence, handoff, release, or external effect.
- Timeout and cancellation must be enforced outside provider output. Partial
  output is discarded. A retry, if later authorized, is separately bounded by
  application policy; the adapter cannot retry itself.
- Provider failure may use the existing deterministic path only through an
  application decision. The durable activated path may never substitute
  fixture configuration or conversation state.

## Privacy, Credentials, and Cost

Only fictional data is eligible for a development trial. Context must be
task-minimized and exclude credentials, private keys, environment values,
internal-only knowledge, unrelated history, unrestricted state, and raw
database records. Customer and knowledge instructions remain untrusted data.

A future authorization must name the provider and model/version; document
region, retention and training settings; define deletion and incident
expectations; identify credential ownership and rotation; and prohibit secrets
in source, prompts, logs, browser bundles, journal evidence, and message
evidence. Credentials must be injected only into an approved server-side
development runtime.

The authorization must also define per-task input/output bounds, timeout,
maximum attempts, cancellation, rate-limit handling, and a reviewable fictional
cost ceiling. No usage persistence, billing, or production credential handling
is authorized here.

## SDK and HTTP Assessment

No dependency is justified at this gate. The required operation is one bounded
request/response exchange, so a later trial should first assess the platform's
built-in server-side HTTP capability. A provider SDK is preferable only if it
materially improves required cancellation, transport normalization, or secure
structured output without leaking provider types beyond the adapter. Either
choice requires the same separate authorization and security review.

## Future Trial Acceptance Gate

Before adapter implementation, separate authorization must approve the exact
provider, model/version, runtime, transport choice, data-handling settings,
credential mechanism, timeout, cancellation, retry count, context/output
limits, cost ceiling, and fixed comparison corpus. The trial must measure task
accuracy, exact grounding, invalid-output rate, p50/p95 latency, refusal and
failure behavior, and deterministic fallback. The mock suite remains mandatory
and provider results may not weaken any certified verifier.

## Scope Result

Milestone 8.6 is complete as an evaluated deferral. It adds no adapter,
networking, external call, provider SDK, credential, dependency, lockfile,
migration, schema, route, persistence behavior, customer release, external
action, or Milestone 8.7 capability.
