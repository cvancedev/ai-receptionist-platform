# Sprint 7 Test Plan

## Purpose

This document defines the verification gates for Sprint 7 Business
Configuration. Milestone 7.1 implements only the contract-focused portion.

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
- **7.5:** Opt-in fictional workflow integration without direct SQL, public
  administration, or production authentication claims.
- **7.6:** Complete failure, recovery, isolation, malformed-data, and prohibited
  capability matrix.
- **7.7:** Full evidence-based Sprint 7 certification.

These later gates describe required future evidence; they do not authorize or
implement later milestones.
