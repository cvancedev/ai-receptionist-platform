# End-to-End Application Contract

## Purpose

Milestone 8.1 defines the technology-neutral application boundary for
preparing one fictional inbound conversation turn. Milestone 8.2 extends that
boundary with application-owned activated context and grounded-source
validation. Milestone 8.3 composes that exact context with the existing
deterministic conversation authorities for a transient multi-turn workflow.

The implemented contracts are in `src/application/end-to-end`. They are
internal application contracts, not HTTP endpoints, route handlers,
serialization formats, or public APIs.

## Turn Input

A start request requires an exact turn, Business Profile, and conversation
identifier; a valid effective timestamp; and one bounded fictional customer
message whose conversation identifier matches the request.

A resume request additionally requires the exact positive Business Profile
version already pinned in Conversation State. Unknown properties, padded or
empty identifiers, invalid versions or timestamps, mismatched conversation
identity, non-customer sources, empty content, and over-limit content fail
before any dependency is called.

## Composition Sequence

1. Validate the complete request shape and exact message/conversation identity.
2. Delegate a start request to certified activated initialization, or a resume
   request to exact pinned recovery.
3. Independently compare the requested scope with the resolved activation,
   Business Profile, Conversation State, read-model identity, and every bound
   Knowledge Record version.
4. Independently validate profile, state, activation, knowledge eligibility,
   effective time, contradictions, and the context size limit.
5. Assemble immutable transient context from the complete pinned Business
   Profile, exact Conversation State revision, explicitly untrusted current
   customer input, and only exact activation-bound knowledge.
6. Expose exact configuration provenance, bounded persisted-status metadata,
   current revision/stage, the application-owned Progress Engine result, and
   derived handoff readiness.
7. Return an explicit application decision that grants no turn-state mutation,
   transition execution, customer release, or external-action authority.

Milestone 8.3 accepts only exact scoped turns with the expected state revision
and next message sequence. It delegates request understanding, required-field
answers, corrections, confirmation, human escalation, and completion to the
existing deterministic Conversation Engine and Conversation State Manager.
Progress/read-model projection, grounding validation, and handoff derivation
remain with their existing application/domain owners. Failed actions are
evaluated against a candidate transient manager and cannot partially advance
the accepted session.

## Output Boundaries

Successful preparation returns exact turn and scope identity; bounded inbound
message persistence metadata; immutable transient activated context;
activation and exact knowledge provenance; deterministic progress; a
no-authority preparation decision; an explicitly unproduced response; and
either `not-ready` handoff status or a handoff derived by the existing Handoff
Builder. Customer content appears only inside the transient context as
`untrusted-customer-input`; it is not represented as persisted metadata.

The grounding validator accepts a future candidate only when it is bounded and
has at least one exact source reference included in the activated context.
Each reference must match record identity, version, source, audience,
effective date, activation revision, and context-policy version. Validation
does not construct a candidate during preparation, execute a task, or grant
delivery authority.

## Explicit Failures

- `InvalidInput`
- `ConfigurationUnavailable`
- `ConversationUnavailable`
- `ScopeMismatch`
- `HandoffUnavailable`
- `ContextUnavailable`
- `CompositionUnavailable`

Lower-layer details are sanitized. Failures do not retry, broaden lookup,
substitute current configuration, fall back to fixtures, mutate state, or
release content.

## Authority Boundaries

- The application coordinator owns request validation, composition sequencing,
  independent exact-scope checks, context eligibility, grounding validation,
  and bounded outcome construction.
- Existing domain validators, Progress Engine, read-model projector, and
  Handoff Builder retain semantic authority.
- The activated configuration and durable conversation integration retain
  selection, exact pinning, eligibility, recovery, and persistence boundaries.
- PostgreSQL remains hidden behind existing technology-neutral contracts.
- The model, fixtures, UI, routes, and stored data gain no decision authority.

The model-controlled Transition Registry and State Executor remain unchanged
and authoritative for model proposals. Milestone 8.3 introduces no model
proposal or new transition; deterministic domain operations continue through
the certified Conversation Engine and State Manager path.

## Current Limitation

The Milestone 8.3 workflow remains transient. Milestone 8.4 separately adds
the opt-in atomic approved-state, execution-evidence, and bounded-message
commit plus restart recovery; evidence never reconstructs authoritative
Conversation State. Milestone 8.5 presents the fixture-backed workflow and an
explicit durable activated mode through bounded UI read models. When no
application runtime is injected, durable mode fails closed without fixture
fallback. No path calls a provider, validates a model-produced draft for
release, releases content, or performs an external action.

Milestone 8.6 evaluates and defers a real provider. The existing provider-
neutral mock and validation contracts remain unchanged; no adapter, network,
credential, provider output, or additional authority enters this boundary.

Milestone 8.7 verifies the composed failure, security, rollback, isolation,
configuration, grounding, and restart boundaries without changing this
contract or adding product behavior. The separately authorized
[Sprint 8 Certification](certification/SPRINT8_CERTIFICATION.md) confirms this
boundary without granting release or Sprint 9 authority.
