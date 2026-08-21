# Sprint 8 Storage Decision

## Status

Accepted in Milestone 8.1 and implemented under the separate Milestone 8.4
authorization.

## Existing Durable Coverage

Migrations 001 through 006 durably cover complete Conversation State and exact
profile pins, execution evidence, atomic approved state/evidence commits,
configuration versions, activation, selected knowledge, lifecycle envelopes,
and configuration audit evidence.

Conversation State preserves confirmed facts, customer claims, corrections,
missing fields, asked-question identifiers, escalation, completion, final
snapshots, sources, sequence values, and revisions.

## Handoff Decision

A separate durable handoff record is not required for the approved Sprint 8
contract. The Handoff Builder derives it deterministically from one validated
Conversation State snapshot and its exact pinned Business Profile. Milestone
8.1 verification proves readiness and summary identity are reproducible from
those authoritative inputs.

Assignment, acknowledgement, dispatch, or follow-up state would be a distinct
later workflow and storage decision. It is not part of Milestone 8.1.

## Message-Evidence Decision

A separate durable, append-only message-evidence record will be required
before Sprint 8 can certify restart-safe transcript and context provenance.
Existing storage preserves facts and source identifiers but not bounded message
content needed to reconstruct conversation entries after restart. The current
AI prototype uses fixture entries, which cannot serve as fallback on the
durable activated path.

Milestone 8.4 supplies the later authorization through additive migration 007.
The application contract defines exact scope and
identity, content bounds, append and duplicate behavior, atomic relationship
to dependent state, privacy minimization, retention, decoder and corruption
failures, restart, concurrency, and technology-neutral outcomes without replay
or workflow authority.

The implementation is one narrowly scoped additive migration. Migrations 001
through 006 remain unchanged. Evidence includes exact business, pinned profile
version, conversation, activation revision, message, turn, sequence, bounded
customer content, resulting state revision, format version, and recorded time.
It remains subordinate evidence and is never replayed to construct state or
authorize workflow progression.

## Dependency Decision

No new dependency is necessary. Existing TypeScript contracts, PostgreSQL
foundation, and direct `pg` adapter pattern are sufficient if a later message
store is authorized. No ORM, queue, cache, vector store, analytics store,
provider SDK, or communication dependency is justified.
