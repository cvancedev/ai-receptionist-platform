# Sprint 7 Test Plan

## Purpose

This document defines the verification gates for Sprint 7 Business
Configuration. Milestones 7.1 through 7.6 provide contract, durable-version,
atomic-activation, opt-in activated-context integration, and failure/recovery
evidence. Milestone 7.7 has not started.

## Milestone 7.1 Contract Verification

`npm.cmd run verify:business-configuration-contracts` proves:

- configuration subjects, operations, validation stages, authorization
  decisions, Business Profile statuses, and knowledge lifecycle states are
  explicit allowlists;
- exact business/profile and knowledge revision scope is required;
- malformed identifiers and versions fail closed;
- snapshots are detached and deeply immutable;
- repository results are explicit rather than boolean or thrown infrastructure
  outcomes;
- repository capabilities are narrow and contain no generic mutation,
  transaction, activation, authorization, release, dispatch, or retry surface;
- existing Business Profile conversation-use validation and knowledge
  structure/scope validation retain their respective authority;
- drafts remain ineligible for the existing conversation-use path;
- cross-business knowledge remains invalid; and
- an industry-like label creates no service, intake field, rule, or workflow.

Static review additionally verifies that Business Configuration contracts
contain no PostgreSQL, SQL, pool, client, transaction-handle, ORM, React, route,
provider, model, or arbitrary-callback types.

## Regression Gate

Every certified Sprint 3 through Sprint 6 verification command must remain
passing. Lint, TypeScript, production build, Markdown links, diff integrity,
prohibited-capability scans, application/domain PostgreSQL leakage scans,
migration checks, dependency checks, and staged-file checks are required.

## Later Milestone Gates

- **7.2:** Business Profile repository contract parity, exact scope, immutable
  revisions, concurrency, corruption, isolation, and real PostgreSQL recovery.

Milestone 7.2 adds `npm.cmd run verify:postgresql-business-profile-versions`
for migration 003, immutable draft creation, exact reads, duplicate and tenant
isolation, audit evidence, decoding, corruption, restart, and prohibited
lifecycle authority.
- **7.3:** Knowledge lifecycle persistence, audience and scope isolation,
  traceability, version history, and ineligible-state rejection.

Milestone 7.3 adds `npm.cmd run verify:postgresql-knowledge-versions` for
migration 004, immutable draft creation, exact scoped reads, duplicate and
tenant isolation, source and audit traceability, corruption, restart,
migration-history rejection, and prohibited lifecycle authority.
- **7.4:** Atomic activation, exactly one active eligible revision, audit
  coupling, rollback, and pinned-conversation behavior.

Milestone 7.4 adds `npm.cmd run verify:postgresql-configuration-activation`
for application-owned eligibility and authorization, migration 005, atomic
success and rollback, replacement, exact active resolution, immutable selected
versions, duplicate and conflicting requests, stale revisions, concurrency,
restart, corruption, tenant isolation, conversation pin preservation, and
prohibited authority.
- **7.5:** Complete. `npm.cmd run verify:activated-configuration-prototype`
  proves exact active and historical configuration resolution, explicitly
  bound knowledge, application-owned conversation eligibility, durable profile
  pinning, deterministic/mock-only progression, restart recovery, reactivation
  behavior, exact conversation ownership, and absence of fixture fallback,
  public administration, or production authentication.
- **7.6:** Complete. `npm.cmd run
  verify:business-configuration-recovery` composes the established Business
  Profile, knowledge, activation, and activated-prototype PostgreSQL suites
  with focused configuration recovery, isolation, corruption, commit-failure,
  and prohibited-capability evidence. The complete command passed against real
  PostgreSQL together with the existing Sprint 6 persistence recovery suites.
- **7.7:** Full evidence-based Sprint 7 certification.

The 7.6 gate is complete. The 7.7 gate remains future evidence and is not
authorized or started.
