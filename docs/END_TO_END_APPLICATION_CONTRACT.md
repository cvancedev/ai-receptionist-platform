# End-to-End Application Contract

## Purpose

Milestone 8.1 defines the technology-neutral application boundary for
preparing one fictional inbound conversation turn. It composes certified
activated-configuration, exact conversation recovery, progress projection,
and handoff derivation without processing the message or granting new
authority.

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
4. Expose only exact configuration provenance, bounded message metadata,
   current revision/stage, the application-owned Progress Engine result, and
   derived handoff readiness.
5. Return an explicit application decision that grants no turn-state mutation,
   transition execution, customer release, or external-action authority.

Milestone 8.1 does not assemble AI context, interpret content, select a model
task, execute a transition, persist message content, or produce a response.

## Output Boundaries

Successful preparation returns exact turn and scope identity; bounded inbound
message identity and sequence without content; activation and exact knowledge
provenance; deterministic progress; a no-authority preparation decision; an
explicitly unproduced response; and either `not-ready` handoff status or a
handoff derived by the existing Handoff Builder.

The contract defines the shape a future validated response candidate must
have, including exact source references. No candidate is constructed in
Milestone 8.1, and delivery authority remains false.

## Explicit Failures

- `InvalidInput`
- `ConfigurationUnavailable`
- `ConversationUnavailable`
- `ScopeMismatch`
- `HandoffUnavailable`
- `CompositionUnavailable`

Lower-layer details are sanitized. Failures do not retry, broaden lookup,
substitute current configuration, fall back to fixtures, mutate state, or
release content.

## Authority Boundaries

- The application coordinator owns request validation, composition sequencing,
  independent exact-scope checks, and bounded outcome construction.
- Existing domain validators, Progress Engine, read-model projector, and
  Handoff Builder retain semantic authority.
- The activated configuration and durable conversation integration retain
  selection, exact pinning, eligibility, recovery, and persistence boundaries.
- PostgreSQL remains hidden behind existing technology-neutral contracts.
- The model, fixtures, UI, routes, and stored data gain no decision authority.

## Current Limitation

Preparation accepts fictional message content only long enough to validate the
turn boundary. It neither returns nor persists that content. Activated-context
construction is Milestone 8.2, and multi-turn processing is Milestone 8.3.
The ordinary fixture-backed prototype remains unchanged.
