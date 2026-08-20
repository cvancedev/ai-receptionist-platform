# Sprint 8 Storage Decision

## Status

Accepted architectural analysis for Milestone 8.1. It authorizes no migration
or implementation.

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

This need does not authorize a migration during Milestone 8.1. Before a later
authorized migration, the application contract must define exact scope and
identity, content bounds, append and duplicate behavior, atomic relationship
to dependent state, privacy minimization, retention, decoder and corruption
failures, restart, concurrency, and technology-neutral outcomes without replay
or workflow authority.

The likely implementation is one narrowly scoped additive migration after
separate authorization. Migrations 001 through 006 must remain unchanged.

## Dependency Decision

No new dependency is necessary. Existing TypeScript contracts, PostgreSQL
foundation, and direct `pg` adapter pattern are sufficient if a later message
store is authorized. No ORM, queue, cache, vector store, analytics store,
provider SDK, or communication dependency is justified.
