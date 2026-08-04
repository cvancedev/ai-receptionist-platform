# Configuration Persistence

## Purpose

This document defines the technology-neutral repository boundary introduced in
Milestone 7.1. It does not implement PostgreSQL configuration storage, a schema,
a migration, a transaction, or a database connection.

## Repository Responsibilities

The Business Profile and knowledge repositories may eventually:

- create one application-accepted draft revision;
- read one exact business/profile or business/profile/knowledge revision; and
- record one application-authorized lifecycle transition with expected-revision
  and audit context.

Successful reads return complete, detached, deeply immutable snapshots.
Failures use explicit contract reasons for invalid scope, missing or duplicate
revision, revision conflict, rejected input, invalid or incompatible stored
record, and infrastructure failure.

## Repository Non-Authority

Repositories do not:

- validate business meaning or completeness;
- decide review, approval, activation, suspension, or conversation eligibility;
- authenticate or authorize an actor;
- select an active profile or eligible knowledge;
- infer configuration from an industry label;
- expose generic CRUD or query behavior;
- mutate Conversation State or the Execution Journal;
- retry, repair, replay, release customer content, or call external systems.

## Technology Boundary

Contracts expose no PostgreSQL, SQL, pool, client, transaction, ORM, HTTP, or UI
types. PostgreSQL remains the approved relational persistence technology for
future explicitly authorized durable milestones, but its implementation details
must stay under infrastructure.

## Scope and Concurrency

Every operation requires exact business and profile-version scope. Knowledge
adds exact record identity and version. Lifecycle changes carry an expected
revision so a future application can distinguish stale work without permitting
last-write-wins replacement.

Milestone 7.1 does not define a database revision column, schema, transaction
isolation level, or migration. Those are implementation facts for later
authorized milestones.

## Atomicity and Audit

The contracts carry required audit context so later lifecycle-changing storage
can preserve the application decision and evidence together. The atomic
activation invariant belongs to Milestone 7.4; Milestone 7.1 neither implements
nor simulates it.

Configuration audit is a separate bounded concern from conversation execution
audit. Neither journal may become domain state or replay authority.

## Current Implementation Status

Milestone 7.2 adds migration 003 and an opt-in PostgreSQL Business Profile
version repository. It creates one immutable draft revision, reads one exact
business/profile version, stores repository revision and creation audit
evidence, validates untrusted JSONB, and returns detached immutable results.
No knowledge repository, lifecycle transition, activation, update/delete,
default prototype wiring, or Milestone 7.3 behavior exists.
