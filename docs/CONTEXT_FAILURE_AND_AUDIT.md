# Context Failure and Audit

## Failure Categories

- `InvalidBusinessScope`
- `InvalidConversationScope`
- `ProfileVersionMismatch`
- `MissingRequiredState`
- `MissingTaskDefinition`
- `IneligibleKnowledge`
- `CrossBusinessSourceDetected`
- `CrossConversationSourceDetected`
- `SensitiveDataPolicyFailure`
- `StaleSummary`
- `InvalidSourceVersion`
- `RequiredContextOverBudget`
- `InvalidContextContract`
- `UnresolvedAuthorityConflict`
- `ContextAssemblyCancelled`
- `UnknownContextFailure`

Failures identify the pipeline stage, safe source category or reference, governing policy version, and whether recovery is permitted. They do not embed secrets or rejected sensitive payloads.

## Fail-Closed Behavior

Provider execution is prevented when:

- business or conversation scope cannot be proven;
- profile compatibility cannot be proven;
- required authoritative state is missing;
- restricted data cannot be handled safely;
- authority labels are missing or ambiguous;
- essential context exceeds budget;
- cross-business or cross-conversation data is detected; or
- the output contract is missing or incompatible.

Cancellation also prevents release. Unknown errors are not converted to partial success. A previously validated package cannot be reused after its relevant state or policy binding becomes stale.

## Recovery

The application may:

- rebuild from a fresh state snapshot;
- remove optional context;
- reduce eligible history;
- select fewer knowledge excerpts;
- replace eligible history with a current approved summary;
- request clarification;
- use deterministic fallback;
- escalate through deterministic policy; or
- stop safely.

Recovery cannot weaken business, conversation, profile, privacy, authority, or provenance checks. Every retry builds and validates a new immutable package. AI-free intake, readiness, escalation, completion, and handoff remain available where deterministic policy allows.

## Failure Examples by Task

- Interpretation without a valid profile uses deterministic interpretation or safe clarification.
- Extraction without current field definitions is not sent to a model.
- Clarification without authoritative missing-field state falls back to the deterministic next question.
- Drafting without an approved next action cannot invite the model to invent one.
- A knowledge-grounded answer without eligible knowledge fails grounding.
- A stale summary is removed and eligible originals are reduced again, or the summary task stops.
- An escalation recommendation with ambiguous business or conversation scope never executes.

## Audit Record

Conceptual fields include:

- context package identity and task type;
- business and conversation scope;
- profile version and state revision;
- source categories considered;
- safe source references included;
- excluded counts and reasons;
- sensitive-data transformations;
- reduction steps and summary references;
- budget and validation results;
- failure result and recovery path;
- all governing policy versions;
- assembly duration; and
- trace identifier.

The record distinguishes selection, validation, provider execution, model result, and application decision. A model response is not evidence that the input package was valid or that a proposal was accepted.

## Audit Restrictions

Audit records do not:

- duplicate secrets, credentials, or authentication tokens;
- retain raw prohibited sensitive content;
- preserve excluded payloads merely because they were rejected;
- expose cross-business identifiers unnecessarily;
- store provider hidden reasoning;
- turn customer claims, knowledge, summaries, or model output into authoritative evidence; or
- become an alternate unrestricted context store.

Access, retention, and redaction policy for production audit storage remain future decisions.

## Reproducibility

Where practical, an authorized reviewer can determine:

- which source revisions were considered and used;
- why each source was eligible and included;
- why other sources were excluded;
- which sensitive transformations and reductions ran;
- which summary source range was used;
- which policy and assembler versions governed assembly; and
- which validation result released or rejected the package.

Reproducibility relies on safe references and immutable identifiers; it does not require indefinite duplication of source content.

## Operational Boundary

Audit capture must not make a failed package available to a provider. Failure telemetry and future monitoring remain application-controlled and provider-neutral. No audit store, monitoring vendor, retry engine, queue, or production recovery code is selected or implemented in Milestone 4.2.

## Related Documents

- [Context Package Contract](CONTEXT_PACKAGE_CONTRACT.md)
- [Context Budgeting and Reduction](CONTEXT_BUDGETING_AND_REDUCTION.md)
- [AI Failure and Recovery](AI_FAILURE_AND_RECOVERY.md)
