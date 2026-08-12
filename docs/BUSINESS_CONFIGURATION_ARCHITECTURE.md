# Business Configuration Architecture

## Purpose

This document defines the Milestone 7.1 application boundary for versioned
Business Profiles and business-approved knowledge. It establishes contracts and
authority only. It does not implement a repository, lifecycle workflow,
database schema, migration, user interface, API, authentication system, or
active-configuration resolver.

## Components

### Domain Configuration

The existing `BusinessProfile`, `BusinessProfileStatus`, `KnowledgeRecord`, and
knowledge lifecycle values remain the domain vocabulary. Business Profile
statuses and knowledge lifecycle states are explicit allowlists.

### Scope Validation

Every Business Profile operation requires a canonical Business Profile ID and
positive profile version. Every knowledge operation additionally requires a
canonical knowledge-record ID and positive record version. Missing, padded,
empty, non-integer, zero, or negative scope fails closed before repository use.

### Application Validation

Three separate contract methods prevent different questions from being
collapsed into one ambiguous validation result:

1. **Draft structure:** Is the submitted shape suitable for continued editing?
2. **Activation eligibility:** Is the revision complete, reviewed, consistent,
   and eligible for an application activation decision?
3. **Conversation use:** Is the exact active revision safe and eligible for the
   current conversation boundary?

The existing Business Profile validator remains authoritative for its current
active-profile conversation-use checks. The existing knowledge validator
remains authoritative for record structure, lifecycle-vocabulary, and business
scope; because it accepts any recognized lifecycle state, it is not by itself a
conversation-use eligibility decision. Milestone 7.1 does not weaken or replace
either validator.

### Application Operations

The allowlisted vocabulary is create draft, validate, submit for review,
approve, activate, suspend, and inspect. These values describe requested
application work; they do not implement or authorize a transition.

Every future change request must carry exact scope, expected revision, explicit
authorization context, and required audit context. Application services—not a
repository, database, UI, model, or caller—will decide whether the request is
valid and may proceed.

### Repository Contracts

The `BusinessProfileVersionRepository` and `KnowledgeVersionRepository` expose
only:

- create one draft revision;
- read one exact revision; and
- record one already-authorized lifecycle transition.

They expose no delete, generic query, transaction handle, arbitrary callback,
approval, activation decision, validation decision, retrieval, model, release,
or external-action capability. Results distinguish success from explicit
bounded failures and must return detached immutable snapshots.

## Authority Flow

1. A future caller supplies a scoped request and actor context.
2. The application verifies scope and authorization.
3. The applicable domain validation stage evaluates the requested revision.
4. The application accepts or rejects the requested lifecycle operation.
5. Only an accepted operation may reach a repository contract.
6. Infrastructure may persist the accepted fact and return an explicit result.
7. The application interprets the result and controls any later use.

Milestone 7.1 implements only the contracts, scope checks, immutable snapshot
support, and verification for this flow.

## Prohibited Authority

- A model cannot create, edit, approve, activate, or suspend configuration.
- A database cannot decide validity, eligibility, authorization, or lifecycle
  intent.
- A UI or API cannot bypass application decisions.
- Conversation facts cannot become Business Profile or permanent knowledge.
- Industry labels cannot create services, fields, policies, or workflows.
- Business content cannot weaken platform safety, privacy, honesty,
  accessibility, or reliability requirements.

## Current Limit

Milestone 7.4 adds an application coordinator that loads exact immutable
revisions, owns authorization and activation eligibility, and sends only an
approved activation to a technology-neutral atomic store. The store records
immutable activation history, selected knowledge, and one active pointer per
business without changing version documents. Milestone 7.5 adds an opt-in
fictional conversation integration that reconstructs and validates the exact
activated profile and bound knowledge, persists the selected profile version,
and proves exact conversation ownership before pinned context construction.
The ordinary prototype remains fixture-backed, public administration remains
absent, and Milestone 7.6 has not started.
