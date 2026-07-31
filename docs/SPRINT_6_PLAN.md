# Sprint 6 Plan

## Purpose

Sprint 6 establishes durable relational persistence after the certified deterministic, process-local architecture delivered in Sprints 3 through 5.

Persistence provides durability only. It does not become a source of business rules, workflow decisions, transition authority, AI authority, presentation behavior, or customer-release authority. Conversation State remains the authoritative domain representation, and every loaded record must pass application-owned validation before the application may use it as authoritative state.

By the end of Sprint 6, the fictional prototype should be able to commit an authorized conversation transition and its required audit record atomically, restart, reload the exact business-scoped state and audit history, and continue deterministic progression without weakening any certified boundary.

Sprint 6 does not authorize production readiness or real customer data.

## Governing Principles

- The application remains authoritative. AI output remains advisory.
- Persistence records application decisions; it does not make them.
- PostgreSQL constraints provide integrity defenses, not business-logic authority.
- Conversation State remains the canonical domain representation.
- Persisted data is untrusted until decoded, scope-checked, schema-compatible, and validated by the application.
- Every persistence operation is explicitly scoped by business, Business Profile version where applicable, and conversation.
- Authoritative updates use optimistic concurrency and an expected revision.
- A required state change and its execution audit entry succeed or fail together.
- Duplicate identities are rejected by durable uniqueness guarantees and application policy.
- Persistence failures are explicit, bounded, and fail closed.
- Repository contracts remain application-owned and technology-neutral.
- In-memory adapters remain available for deterministic unit and architecture verification.
- No database trigger, stored procedure, query, or repository adapter may select transitions, infer progress, validate AI output, or authorize customer release.

## Certified Responsibilities That Must Not Move

| Boundary | Retained responsibility | Persistence relationship |
| --- | --- | --- |
| Conversation State Manager | Validates initialization, reads current state, and applies typed validated state updates | Uses an application-owned state repository; remains the state-management boundary |
| Transition Registry | Defines the explicit versioned transition allowlist | Is not stored as mutable database policy in Sprint 6 |
| Transition Validator | Validates request, scope, revision, task, proposal, policy, legality, and duplicate conditions | Receives validated loaded state and durable duplicate evidence through controlled application coordination |
| State Executor | Converts an approved transition into the existing typed state-manager operation | Does not issue SQL or own transaction policy |
| Conversation Progress Engine | Derives one allowlisted workflow intent from validated state and policy | Does not read persistence directly |
| Conversation Read Model | Projects immutable presentation data | Receives validated state; never treats a row or query result as authoritative directly |
| Execution Journal | Records bounded append-only execution audit metadata | Gains durability but no execution, mutation, replay, retry, release, or external-action authority |
| AI validation and Application Decision | Treat model output as untrusted and decide whether a proposal is acceptable | Do not gain database access or mutation authority |

The existing controlled path remains conceptually intact:

```text
advisory model output
  -> application parsing and validation
  -> Application Decision
  -> Transition Registry and Transition Validator
  -> State Executor
  -> Conversation State Manager
  -> validated Conversation State
```

Sprint 6 adds a durable commit boundary around the final authoritative state replacement and required execution audit. It does not reorder or bypass the preceding authority checks.

## PostgreSQL Selection

PostgreSQL is the sole persistence technology selected for Sprint 6.

The selection follows demonstrated requirements:

- **Structured domain data:** Conversation State and journal entries have explicit typed shapes, identities, revisions, statuses, and relationships.
- **Relational ownership:** Business-scoped conversations, profile versions, and execution entries require clear ownership and referential integrity.
- **Business Profile versions:** A conversation is pinned to a positive Business Profile version that must remain scope-consistent.
- **Conversation State revisions:** Authoritative replacement requires an exact expected revision and a single next revision.
- **Atomic transactions:** A successful state replacement and its required audit record must commit or roll back together.
- **Optimistic concurrency:** Conditional updates and affected-row checks can reject stale writers without serializing all readers.
- **Uniqueness guarantees:** Conversation and execution identities require durable, business-scoped uniqueness.
- **Audit records:** Append-only relational entries need ordered, queryable identity and revision metadata.
- **Migrations:** Versioned schema evolution and compatibility checks are required as persisted contracts change.
- **Tenant isolation:** Composite business-scoped keys and constraints provide defense in depth against cross-business access.
- **Recovery:** Transactional durability, restart behavior, backup compatibility, and established operational tooling support the required recovery model.

PostgreSQL is selected as a capability, not as an authority boundary. Application-owned contracts must prevent PostgreSQL types and client APIs from leaking into domain or deterministic workflow logic.

Sprint 6 does not select or introduce a vector database, queue, cache, analytics database, embedded database, or second persistence technology. Those capabilities are neither required by the demonstrated persistence problem nor authorized by this sprint.

## Persistence Ownership

### Application ownership

The application owns:

- persistence use-case orchestration;
- repository contracts;
- transaction boundaries;
- canonical serialization and decoding;
- persisted-record validation;
- business and conversation scope;
- expected-revision policy;
- idempotency identity and duplicate meaning;
- migration compatibility requirements;
- failure classification; and
- the decision to commit or roll back.

### Adapter ownership

The PostgreSQL adapter may:

- execute parameterized statements;
- map application persistence records to relational storage;
- participate in an application-owned transaction;
- enforce declared relational, uniqueness, and revision constraints;
- translate known database outcomes into application persistence results; and
- expose health and schema-compatibility failures without hiding them.

The adapter may not:

- choose or validate a business transition;
- construct workflow policy;
- infer missing fields, completion, escalation, or next action;
- accept model output as state;
- authorize customer-visible content;
- retry an authoritative operation autonomously;
- silently repair malformed records; or
- return an unvalidated record as Conversation State.

### Transaction ownership

An application-owned transactional execution coordinator will eventually define the unit of work. It will coordinate revision-aware state replacement and required journal append through transaction-capable persistence ports.

The coordinator does not replace the State Executor or Conversation State Manager. It preserves their validated deterministic result and controls only whether the resulting durable writes commit together. Repository adapters participate in the transaction but do not decide its business meaning.

Milestone 6.0 defines this ownership only. It implements no coordinator, contract, or adapter.

## Durable Entity Categories

Sprint 6 recognizes these durable categories:

1. **Conversation State snapshots**
   - one current authoritative snapshot per business-scoped conversation;
   - pinned Business Profile version;
   - current non-negative revision;
   - the complete existing Conversation State contract.
2. **Execution Journal entries**
   - append-only, bounded audit metadata derived from trusted Execution Results;
   - business, conversation, profile-version, execution, request, trace, transition, outcome, and revision metadata;
   - durable ordering within the defined scope.
3. **Schema migration history**
   - the applied relational schema version and migration history needed to establish compatibility.
4. **Business Profile version references**
   - durable scope references needed to ensure a conversation is bound to the intended profile version;
   - Sprint 6 must not invent a second Business Profile authority or silently substitute another version.

The initial implementation scope is Conversation State and the Execution Journal. Full Business Profile persistence, knowledge persistence, message transcripts, customer communications, analytics, background jobs, and external-action records require separately authorized milestones.

## Storage Shape

The planned Conversation State storage uses a relational identity and concurrency envelope with one canonical versioned state document:

- relational columns hold business scope, conversation identity, Business Profile version, current revision, record format version, and persistence timestamps;
- a versioned PostgreSQL `jsonb` document preserves the complete nested Conversation State snapshot without creating multiple competing representations of facts, claims, corrections, questions, escalation, and final snapshot;
- composite keys and constraints protect business ownership, uniqueness, positive profile version, and non-negative revision;
- application validation confirms that relational envelope values exactly match the decoded document.

The state document is not accepted merely because it is valid JSON or satisfies database checks. The application must decode the exact supported format, reject unknown or incompatible authoritative shapes, validate the complete Conversation State, and verify scope and revision consistency.

The planned Execution Journal uses relational columns for its bounded typed entry contract. Bounded versioned metadata may use `jsonb` only where it avoids artificial schema fragmentation and remains runtime validated. The journal must not contain Conversation State snapshots, unrestricted prompts, raw model output, arbitrary customer input, provider payloads, executable instructions, callbacks, or secrets.

This hybrid design favors a small team's maintainability: relational columns enforce ownership, concurrency, and uniqueness, while one canonical state document avoids duplicating nested domain authority across a premature normalized schema.

## Business and Tenant Isolation

The Business Profile identifier is the current tenant-scoping key for Sprint 6 planning. Every conversation-state and journal operation must require explicit business scope; an unscoped repository method is prohibited.

Required controls include:

- composite keys or unique constraints that include `businessProfileId`;
- lookup and update predicates that include business, conversation, and applicable profile version;
- foreign-key or equivalent relational ownership constraints when the referenced profile-version persistence exists;
- exact envelope-to-document scope validation after load;
- no fallback lookup by conversation ID alone;
- indistinguishable not-found behavior for a missing conversation and a conversation outside the requested business scope where disclosure would create an isolation risk;
- transaction-local scope that cannot change between state replacement and journal append; and
- negative verification proving one business cannot read, replace, or journal against another business's conversation.

Database roles or PostgreSQL row-level security may later provide defense in depth, but neither may replace application-owned scope checks. Their adoption requires explicit implementation design and verification; Milestone 6.0 does not select them as a substitute for repository boundaries.

## Repository Boundaries

Milestone 6.1 defines technology-neutral application contracts for two responsibilities.

### Conversation State persistence

The state repository must support the conceptual capabilities needed to:

- create one validated initial state in an explicit business scope;
- load one business-scoped conversation;
- replace a validated current state only when its persisted revision equals the supplied expected revision; and
- return explicit typed outcomes for success, duplicate, not found or inaccessible scope, stale revision, invalid record, incompatible format, and infrastructure failure.

It must not accept an arbitrary partial patch or expose a general query builder. The Conversation State Manager continues to create and validate complete state snapshots and typed updates.

The future architecture must allow equivalents of:

- `InMemoryConversationStore`; and
- `PostgresConversationStore`

behind the same application-owned contract. The in-memory adapter remains the default for deterministic tests that do not claim durable, transactional, or restart behavior.

### Execution Journal persistence

The journal repository must support:

- appending one trusted bounded entry within the explicit business and conversation scope;
- reading an immutable scoped snapshot or ordered page for audit verification; and
- participating in the same transaction as a successful state replacement when that audit is required.

It must expose no update, delete, replay, retry, dispatch, execution, release, or arbitrary-query capability.

### Contract design constraints

- Domain and application layers depend on contracts, not PostgreSQL client types.
- Contract inputs and results are immutable or treated as immutable.
- Repository failures use stable application categories and retain safe diagnostic causes internally.
- A repository cannot silently convert a duplicate into success.
- A repository cannot retry a transaction without application-owned idempotency and retry policy.
- Loaded values remain persistence records until application decoding and validation succeeds.
- Contract design must not make an in-memory adapter falsely claim database transaction or restart guarantees.

No repository interface is implemented during Milestone 6.0.

## Durable Conversation State

Milestone 6.2 will persist every field in the existing Conversation State contract:

- `conversationId`
- `businessProfileId`
- `businessProfileVersion`
- `authorizedEscalationDestination`
- `revision`
- `stage`
- `confirmedFacts`
- `customerClaims`
- `corrections`
- `missingFields`
- `askedQuestions`
- `escalation`
- `completionState`
- `finalSnapshot`

The durable representation must preserve order where order is part of the contract, nullability, exact identifiers, evidence source fields, sequence values, correction history, escalation details, and final-snapshot content. It must not recompute or omit a field during round-trip storage.

Every load follows this boundary:

```text
database record
  -> exact persistence-record decoding
  -> supported format-version check
  -> relational envelope/document consistency check
  -> requested business/conversation/profile scope check
  -> complete Conversation State validation
  -> detached immutable application snapshot
```

Any malformed, unsupported, contradictory, or scope-inconsistent record fails closed. It is not silently defaulted, repaired, promoted to a newer profile version, projected to the UI, or supplied to the Progress Engine or AI context.

## Durable Execution Journal

Milestone 6.3 adds an opt-in durable append-only adapter while preserving the certified journal trust boundary and the process-local default.

The durable journal:

- accepts only a trusted bounded execution audit contract;
- preserves stable journal, execution, request, trace, proposal, task, transition, conversation, business, and profile identities;
- preserves expected, previous, and resulting revisions;
- preserves an allowlisted outcome and reason;
- uses a durable ordering rule whose scope and tie-breaking are explicit;
- rejects conflicting duplicate execution identities;
- returns detached immutable records; and
- remains an observer of application-authorized execution.

The journal remains unable to:

- execute;
- mutate state;
- replay;
- retry;
- authorize customer release; or
- invoke external actions.

It must not store unrestricted raw prompts, raw model output, arbitrary customer input, full provider payloads, raw Conversation State snapshots, or executor detail strings that could become an accidental sensitive-data channel.

Append-only means application contracts expose no update or delete. Operational retention, legal deletion, and administrative repair are separate future governance concerns and must not be disguised as workflow capabilities.

## Optimistic Concurrency and Revision Enforcement

Milestone 6.4 will use optimistic concurrency for authoritative replacement:

1. Load and validate state in the exact business, conversation, and profile-version scope.
2. Validate the execution request against that state and its revision.
3. Apply the legal deterministic update through existing application authority.
4. Require the new state revision to equal the expected revision plus one.
5. Replace the durable row only when its current revision still equals the expected revision.
6. Treat zero affected rows as an explicit stale, missing, or scope failure resolved without broadening access.
7. Append the required audit entry within the same database transaction.
8. Commit once; otherwise roll back the complete unit.

A conceptual conditional replacement is:

```text
match businessProfileId
  + conversationId
  + businessProfileVersion
  + revision = expectedRevision
replace with validated new state
  + revision = expectedRevision + 1
```

Database locking or transaction isolation may support the operation, but it must not replace the expected-revision predicate. No last-write-wins update is permitted.

## Idempotency and Duplicate Protection

The existing process-local duplicate guards remain valid deterministic safeguards, but they are insufficient after restart or across application instances.

Sprint 6 will add durable uniqueness for canonical execution identity within explicit business and conversation scope. Milestone 6.1 establishes the future durable identity as the canonical execution ID within its Business Profile and conversation scope. Request, proposal, transition, profile-version, and expected-revision metadata remain required integrity evidence rather than alternate caller-selected identities. Durable enforcement begins only in a later explicitly authorized milestone.

Required behavior:

- the same execution identity cannot apply the same or a different state change twice;
- a conflicting duplicate is explicit and cannot be interpreted as a new success;
- a previously committed execution can be recognized after restart;
- a rolled-back execution leaves no committed state or journal record and does not masquerade as completed;
- idempotency does not authorize automatic retry; and
- journal presence alone does not authorize replay or reconstruct state authority.

An intentionally repeated caller operation may receive a safe result describing the already committed outcome only after application-owned identity and scope validation. It must not execute again or expose another business's record.

## Transactional Execution

Milestone 6.4 will establish this atomic flow:

```text
validated current state
  -> validated execution request
  -> legal transition
  -> deterministic state update
  -> revision-aware durable replacement
  -> durable execution audit
  -> atomic commit
```

The transaction begins only after enough input and scope validation exists to identify a safe unit of work. The application-owned coordinator then:

- binds one database transaction to one business-scoped execution;
- performs the conditional state replacement;
- appends the required trusted audit record;
- verifies both durable operations succeeded exactly once; and
- commits or rolls back.

If the state replacement succeeds but journal append fails, the transaction rolls back the state replacement. If the state replacement is stale, no applied audit entry is appended. Rejected attempts may be journaled separately only when their identity is trustworthy and the documented audit policy calls for it; they cannot be confused with the required atomic audit of an applied transition.

The persistence adapter may surface retryable database conditions as typed failures. It may not retry autonomously. Any future retry policy must be application-owned, bounded, idempotent, observable, and separately authorized.

## Migration Ownership

The application repository owns versioned, reviewable PostgreSQL migrations and compatibility policy.

Milestone 6 implementation must establish:

- ordered migration identities;
- forward-only production migration files unless an explicitly reviewed recovery operation requires otherwise;
- a schema-version compatibility check before persistence-backed operation;
- no destructive automatic migration at application request time;
- no silent coercion of incompatible persisted records;
- deployment sequencing that can stop safely when application and schema versions are incompatible;
- migration verification against an empty database and a supported previous schema state; and
- documented backup, restore, or roll-forward recovery expectations before a destructive schema change is ever authorized.

Database schema version and Conversation State document format version are related but distinct. A schema migration cannot silently upgrade domain meaning without an application-owned decoder, validation, and migration plan.

No migration is created during Milestone 6.0.

## Failure Semantics

All persistence operations return explicit outcomes. Infrastructure exceptions must be translated at the adapter boundary without exposing credentials, SQL text containing data, or raw customer content.

At minimum, Sprint 6 must distinguish:

- unavailable persistence;
- transaction failure;
- duplicate conversation;
- duplicate execution;
- stale revision;
- malformed stored state;
- incompatible stored format or schema;
- missing or inaccessible conversation;
- wrong business scope;
- Business Profile version mismatch;
- required journal append failure; and
- unexpected adapter failure.

Failures must:

- fail closed;
- preserve the last committed state;
- produce no partial applied audit;
- avoid customer-release or external-action side effects;
- remain distinguishable for safe application handling and observability;
- avoid leaking whether a resource exists in another business scope; and
- never trigger an invented retry, replay, fallback profile, default state, or last-write-wins update.

## Recovery and Restart Semantics

A successful commit is durable only when both the new state and required applied-execution audit are visible after reconnect or process restart.

A rollback is complete only when neither the candidate state revision nor its required applied audit is visible after reconnect or restart.

Recovery must establish:

- database unavailability cannot cause fallback to a fresh authoritative in-memory conversation;
- an incompatible schema prevents persistence-backed startup or readiness;
- a loaded record is revalidated after every restart;
- current state is recovered from Conversation State storage, not reconstructed by journal replay;
- journal history is audit evidence, not a state-rebuild command stream;
- durable duplicate protection survives restart;
- transaction ambiguity is resolved through application-owned idempotency lookup before any separately authorized retry;
- corrupt or inconsistent records are quarantined from authoritative use and surfaced explicitly; and
- recovery does not promote a different Business Profile version.

## Milestone Plan

### 6.0 - Persistence Architecture and Storage Selection

**Status: Complete**

Define persistence ownership, entity categories, storage shape, repository and transaction boundaries, business isolation, optimistic concurrency, revision enforcement, idempotency, migrations, validation, failure and recovery semantics, audit durability, restart expectations, and technology selection.

Deliverable:

- this planning document only.

Milestone 6.0 does not implement a repository contract, install a database package, create a migration, connect to PostgreSQL, or modify production source.

### 6.1 - Persistence Contracts and Repository Boundaries

**Status: Complete**

Define technology-neutral application-owned contracts for Conversation State persistence, Execution Journal persistence, and the minimum transaction participation required for atomic execution.

The milestone must:

- preserve the Conversation State Manager as the state-management boundary;
- preserve the journal as an append-only observer;
- support equivalent in-memory and PostgreSQL adapters without leaking PostgreSQL types;
- define immutable inputs and explicit typed outcomes;
- define scope, expected-revision, duplicate, invalid-record, and infrastructure failures;
- state which guarantees are common and which are adapter-specific;
- retain existing in-memory implementations for deterministic tests; and
- add no PostgreSQL implementation beyond what that milestone explicitly authorizes.

Milestone 6.1 implements the Conversation Store and Execution Journal Store contracts, refactors both in-memory stores to satisfy them, and makes the Conversation State Manager depend on the Conversation Store abstraction. Replacement requires explicit business/profile/conversation scope, an expected current revision, and exactly one revision increment. Journal retrieval also requires explicit business/profile/conversation scope. Duplicate, missing-scope, scope-mismatch, revision-conflict, invalid-increment, invalid-record, incompatible-record, and persistence failures are explicit contract outcomes.

The in-memory adapters remain the default deterministic prototype behavior. The contracts add no durability, transaction coordinator, PostgreSQL adapter, dependency, migration, schema, database connection, replay, retry, release, or external-action authority.

The persistence contracts intentionally expose no transaction object. A later Milestone 6.4 application-owned coordinator may supply transaction-bound implementations of both contracts so state replacement and required journal append share one unit of work. This preserves the Milestone 6.1 contracts and keeps transaction lifecycle and commit authority outside the domain, State Manager, State Executor, and journal.

### 6.2 - Durable Conversation State

**Status: Complete**

Implement and verify PostgreSQL persistence for every existing Conversation State field using the approved repository contract and storage shape.

The milestone must prove:

- complete round-trip fidelity;
- business/profile/conversation isolation;
- immutable detached reads;
- persisted-record decoding and validation;
- malformed and incompatible records fail closed;
- duplicate initialization is rejected;
- missing and wrong-scope reads are safe; and
- the deterministic in-memory suite remains unchanged and passing.

Milestone 6.2 implements a direct `pg` adapter behind the application-owned
Conversation Store contract. A versioned migration stores the relational
business/profile/conversation identity, revision, state-format version, and one
complete JSONB Conversation State document. Application-owned decoding and
validation run after retrieval, and an atomic `UPDATE ... WHERE revision =`
predicate rejects stale replacement without mutation.

The Conversation Store contract now distinguishes synchronous and asynchronous
adapter operation modes without exposing PostgreSQL types. The default
Conversation State Manager remains synchronous and in-memory; an explicitly
injected PostgreSQL store uses awaited manager operations. Dedicated
real-PostgreSQL verification uses an isolated temporary schema and proves
migration, scope isolation, round-trip fidelity, detached reads, restart
recovery, optimistic concurrency, and malformed/incompatible record rejection.

This milestone adds no durable Execution Journal, state-and-journal transaction
coordinator, prototype database dependency, customer release, external action,
or Sprint 6.3 implementation.

### 6.3 - Durable Execution Journal

**Status: Complete**

Implement and verify durable append-only audit storage behind the approved journal contract.

The milestone must prove:

- bounded trusted metadata only;
- durable ordering and uniqueness;
- immutable detached reads;
- business and conversation isolation;
- append-only application capabilities;
- explicit append failures; and
- no execution, mutation, replay, retry, release, provider, or external-action authority.

Milestone 6.3 implements a direct `pg` adapter behind the application-owned
Execution Journal Store contract. Migration 002 stores every bounded safe
journal-entry field, an explicit journal schema version, and a scoped ordering
index without storing state snapshots, prompts, raw model output, arbitrary
customer input, or credentials.

The existing trusted-result rules are centralized in the application-owned
journal entry mapper and shared by both adapters. PostgreSQL append validates
before insertion, allocates a contiguous committed sequence inside exact
business/profile/conversation scope and a journal-local transaction, and
creates a scope-unique sequence-qualified immutable journal identity. Snapshot
retrieval requires exact business/profile/conversation
scope, orders by sequence, reconstructs detached immutable entries, and fails
closed for invalid scope, incompatible format, malformed storage, or database
failure.

The technology-neutral contract supports synchronous and asynchronous journal
adapters. `InMemoryExecutionJournal` remains the prototype default; an
explicitly injected PostgreSQL journal is awaited by the controlled execution
path. The journal-local append transaction does not include Conversation State
and creates no shared transaction object. Atomic state-and-journal commit,
durable execution identity coordination, and competing-writer integration
remain Milestone 6.4 work.

Dedicated real-PostgreSQL verification proves ordered migrations, trusted and
rejected append behavior, duplicate-outcome preservation, deterministic
sequence and identity, complete safe-field round trips, scoped isolation,
store recreation, async injection, corruption rejection, explicit persistence
failures, default in-memory compatibility, and prohibited-capability absence.

This milestone adds no execution, mutation, replay, retry, customer release,
external action, production database connection, or Sprint 6.4 implementation.

### 6.4 - Transactional Execution and Concurrency

**Status: Not started**

Integrate application-owned transaction coordination so an authorized revision-aware state replacement and required audit append commit atomically.

The milestone must prove:

- expected-revision validation;
- optimistic concurrency under competing writers;
- stale-writer rejection;
- durable duplicate execution protection;
- business-scope enforcement;
- atomic state and required audit commit;
- rollback on every intermediate failure;
- explicit transaction ambiguity handling; and
- no silently invented retry authority.

### 6.5 - Restart-Safe Prototype Integration

**Status: Not started**

Create a persistence-backed fictional prototype path demonstrating:

1. conversation initialization;
2. controlled execution;
3. durable commit;
4. process restart;
5. scoped reload;
6. preserved revision, state, and audit history; and
7. continued deterministic progression.

The deterministic mock adapter remains the only AI provider. The integration uses fictional data, adds no customer communication, and must keep the UI outside repository and execution authority.

### 6.6 - Persistence Recovery and Failure Semantics

**Status: Not started**

Verify at minimum:

- database unavailable;
- transaction failure;
- duplicate conversation;
- duplicate execution;
- stale revision;
- malformed stored state;
- missing conversation;
- wrong business scope;
- Business Profile version mismatch;
- journal failure;
- restart after successful commit;
- restart after rollback; and
- incompatible migration or schema state where applicable.

Each case must have an explicit safe application result, no partial authority, no data-scope disclosure, and no unauthorized retry or fallback.

### 6.7 - Sprint 6 Certification

**Status: Not started**

Certify Sprint 6 through evidence-based audits covering:

- persistence architecture;
- repository boundaries;
- state integrity;
- optimistic concurrency;
- transaction atomicity;
- journal durability;
- restart and recovery;
- business isolation;
- migrations;
- regression;
- prohibited-capability scanning;
- documentation; and
- the full validation suite.

Every certification claim must identify implementation evidence, verification evidence, limitations, and a PASS or FAIL result.

The allowed conclusion is exactly one of:

- `CERTIFIED`
- `CERTIFIED WITH DOCUMENTED LIMITATIONS`
- `NOT CERTIFIED`

Certification adds no product authority and creates no release tag unless separately authorized.

## Verification Strategy

Sprint 6 implementation verification will use three layers:

1. **Deterministic contract verification**
   - shared repository behavior suites run against the in-memory and PostgreSQL adapters where guarantees overlap;
   - existing Sprint 3 through Sprint 5 verification remains passing.
2. **PostgreSQL integration verification**
   - real transactional behavior, constraints, migrations, concurrency, isolation, restart, rollback, and recovery are tested against an isolated test database;
   - mocks are not accepted as evidence for PostgreSQL guarantees.
3. **Boundary and prohibited-capability verification**
   - source, dependency, and runtime scans confirm that persistence has not introduced provider, communication, release, background-worker, autonomous-retry, or external-business-action authority.

Milestone-specific verification must be proportionate to the authority introduced. Certification requires the full repository validation suite, production build, migration verification, Markdown link verification, diff integrity, and a clean prohibited-capability scan.

## Strict Sprint 6 Boundary

Sprint 6 does not authorize:

- customer communication;
- customer-response release;
- real AI providers;
- email;
- SMS;
- telephony;
- scheduling;
- CRM integration;
- payment processing;
- external business actions;
- production authentication;
- background workers;
- autonomous retries; or
- unrelated UI redesign.

The only new external network connection eventually permitted within Sprint 6 is the selected PostgreSQL connection when an implementation milestone explicitly authorizes it. Milestone 6.0 remains documentation-only.

## Milestone 6.0 Definition of Done

Milestone 6.0 is complete only when:

- `docs/SPRINT_6_PLAN.md` exists;
- persistence responsibilities are explicit;
- PostgreSQL selection is justified;
- repository boundaries are documented;
- transaction ownership is documented;
- optimistic concurrency is documented;
- tenant and business isolation are explicit;
- failure and recovery semantics are defined;
- prohibited capabilities remain absent;
- no production source code is modified;
- no database dependency is installed;
- no migration is created; and
- Sprint 6.1 has not begun.

## Sprint 6 Completion Boundary

Successful Sprint 6 certification will prove durable, revision-safe, business-scoped persistence for the fictional prototype within the certified application-authority architecture.

It will not prove production authentication, customer communication, customer-release safety, real-provider reliability, scheduling, CRM behavior, payment handling, background processing, external business actions, or complete production operations. Each later authority expansion requires its own explicit architecture, implementation, verification, and authorization.
