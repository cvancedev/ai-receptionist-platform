# Implementation Architecture

## Purpose

This document maps the approved architecture into implementation boundaries. Sprint 3 implements only the certified deterministic local prototype. Sprint 4.1 through 4.4 add provider-independent AI input and output architecture documentation and authorize no AI implementation, vendor, model, API, networking, persistence, or authentication work.

## Customer Experience Layer

Owns customer chat presentation, messages, input, loading and error states, accessibility, channel-specific presentation, and clear escalation and handoff messaging. It displays application-authorized outcomes and never mutates domain state directly.

## Application Layer

Owns conversation orchestration, business resolution, active-profile loading, state management, context assembly, model-output validation, completion checks, handoff creation, and audit coordination. It is the authority connecting all other layers.

## Conversation Engine Layer

Owns current-stage determination, intent and service resolution, next-question selection, corrections, escalation detection, completion readiness, and handoff recommendations.

Deterministic application logic should enforce lifecycle transitions, required-field tracking, corrections, question history, profile eligibility, escalation triggers, completion criteria, and allowed actions wherever practical. A future model may recommend language, interpretations, and candidate updates; those remain proposals until validated.

## Business Configuration Layer

Owns versioned Business Profiles, customer-defined services, intake requirements, hours, service areas, policies, communication preferences, escalation destinations, and handoff rules. Only active validated configuration may be used.

## Knowledge Layer

Owns approved knowledge records, lifecycle states, audience permissions, versions, retrieval eligibility, conflicts, and source traceability. It never treats relevance as authorization.

## AI Integration Layer

Conceptually separates Context Assembly, a future Prompt Composer, the provider-independent Model Gateway, Provider Adapters, Model Output Validation, and the Application Decision Layer.

The Model Gateway accepts only an application-approved provider-neutral request and policy. Provider Adapters translate and normalize one approved provider without business logic. Raw output remains untrusted until validation. The Application Decision Layer may accept, partially accept, modify, retry, reject, fall back, clarify, or escalate.

This layer cannot choose the tenant, profile, permissions, sources, authoritative state, deterministic task, or allowed action. It cannot mutate state or release customer messages directly. No provider or model is selected, and the existing `MockModelGateway` remains a local deterministic stand-in.

## Validation and Safety Layer

Enforces business scope, profile and knowledge eligibility, prompt security, output contracts, state transitions, unsupported-claim detection, tenant isolation, audience restrictions, correction precedence, and escalation. Invalid proposals cannot silently affect responses or state.

## Persistence Layer

Durable persistence is required for business-scoped application state and audit history after the certified deterministic prototype. PostgreSQL was selected during Sprint 6.0 as the relational persistence technology for Sprint 6 because the demonstrated requirements include structured domain data, profile versions, state revisions, relational ownership, optimistic concurrency, atomic transactions, uniqueness, migrations, tenant isolation, durable audit history, and restart recovery.

Milestone 6.2 implements the first approved durable slice for Conversation State. Milestone 6.3 adds the separately injected PostgreSQL Execution Journal adapter, bounded journal migration, shared trusted-result mapper, and scoped immutable decoder. Milestone 6.4 adds a separate opt-in PostgreSQL transaction coordinator that atomically persists an already-approved state replacement and its required journal entry. Milestone 6.5 adds an explicitly opt-in fictional application integration that recovers validated state and audit history through newly created application and persistence objects and resumes deterministic progression from the recovered revision. Milestone 6.6 verifies explicit fail-closed persistence and recovery behavior against disposable PostgreSQL. Milestone 6.7 certifies the complete Sprint 6 boundary and strengthens migration-history compatibility checking. The standalone adapters remain available, and the prototype continues to default to in-memory state and journal stores. No production database connection exists. Milestone 7.1 now adds technology-neutral Business Configuration contracts only; no durable configuration implementation exists.

PostgreSQL provides durability and relational integrity defenses only. It does not own domain rules, transitions, state validation, workflow decisions, AI validation, application decisions, progress, presentation, customer release, or external actions.

## Observability Layer

Future observability should cover request and trace identity, task type, context provenance, provider policy, normalized gateway result, output validation, application decision, state operations, fallback, usage, latency, errors, escalations, knowledge conflicts, completion, and handoff outcomes. No monitoring vendor or audit persistence is selected.

## System Flow

1. Resolve and validate the business and conversation.
2. Load active profile, state, and eligible knowledge.
3. Determine stage and deterministic requirements.
4. Determine whether AI assistance is eligible and valuable for the deterministic task.
5. Assemble and validate context when a model call is allowed.
6. Send a provider-neutral request through the Model Gateway and an approved adapter.
7. Receive normalized raw output or explicit failure information.
8. Parse and validate the proposal.
9. Make an application-owned accept, partial-accept, modify, retry, fallback, reject, clarification, or escalation decision.
10. Apply only authorized typed changes atomically through the State Manager.
11. Release only the approved customer response and any validated handoff.
12. Record material versions, usage, failures, and decisions.

## Technology Decision Timing

| Decision | Current timing or status |
| --- | --- |
| AI provider and model | A later approved implementation milestone, after provider-neutral context, task, output, failure, and evaluation architecture is complete |
| Database | PostgreSQL selected architecturally in Sprint 6.0; Sprint 6 is certified for separate opt-in stores, atomic coordination, restart-safe fictional integration, explicit failure/recovery semantics, tenant isolation, and ordered compatible migration history |
| Authentication provider | A later sprint requiring real business users and administration |
| Hosting architecture | End-to-end MVP planning when runtime, security, and persistence needs are known |
| Embedding system or vector database | Only if Knowledge Retrieval testing proves simpler structured retrieval insufficient |
| Queue system | When durable asynchronous handoff or processing requirements are demonstrated |
| Monitoring vendor | Phase 7 production hardening, after required signals are defined |
| SMS, voice, or email provider | When the corresponding validated communication channel enters scope |

Technology selection does not authorize implementation or grant application authority. Remaining vendors are selected only when their documented requirements and milestone boundaries justify them.

## Risk Register

| Risk | Why it matters | Mitigation | Review point |
| --- | --- | --- | --- |
| Architecture exceeds MVP needs | Slows learning and burdens a small team | Implement only the next vertical slice | Every milestone review |
| Model trusted too early | Can corrupt state or overpromise | Mock first; deterministic validation always | Phases 2 and 3 |
| Cross-business leakage | Severe trust and privacy failure | Scope every boundary and test negative paths | Every data/API phase |
| Configuration becomes hard to maintain | Undermines onboarding and accuracy | Start with one fixture and minimal validated editing | Phases 1 and 5 |
| Knowledge becomes stale | Produces incorrect customer answers | Lifecycle, expiry, review, and traceability | Phases 4–7 |
| Prompt/context growth | Raises cost and loses critical facts | Structured state, prioritization, regression tests | Phases 3 and 7 |
| Provider dependence | Reduces flexibility and resilience | Provider-independent gateway and contracts | Phase 3 selection |
| Feature creep | Delays the core handoff workflow | Enforce explicit non-goals and acceptance criteria | Every milestone |
| Administration built too early | Optimizes configuration before workflow value | Use fixtures until conversation workflow validates | Before Phase 5 |
| Recommendations confused with decisions | Allows unauthorized effects | Application-owned validation and audit | Phases 2–7 |

### Temporary Accepted Dependency Risks

The Next.js 16.2.12 security maintenance upgrade resolves the advisories
affecting Next.js 16.2.10 itself. Two transitive dependency risks remain
temporarily accepted because the current stable Next.js package continues to
declare the vulnerable versions and overriding those declarations would move
outside Next.js's supported dependency ranges:

| Dependency | Installed vulnerable version | Patched floor | Current exposure and disposition |
| --- | --- | --- | --- |
| Next.js-nested PostCSS | `8.4.31` | `8.5.18` | The application processes repository-owned CSS during trusted builds and exposes no attacker-controlled CSS ingestion, transformation, theme upload, or runtime PostCSS path. This is a temporary accepted dependency risk, not permanent remediation. Reevaluate it on every future Next.js upgrade and resolve it before any production capability processes untrusted CSS. |
| Next.js optional Sharp | `0.34.5` | `0.35.0` | The application does not use `next/image`, remote image patterns, image uploads, or another attacker-controlled image-processing path. This is a temporary accepted dependency risk, not permanent remediation. Reevaluate it on every future Next.js upgrade and resolve it before any production capability processes untrusted images. |

The absence of a currently reachable untrusted-input path reduces exposure but
does not make the vulnerable versions acceptable indefinitely. A future
framework release that supports patched PostCSS and Sharp versions is preferred
over unsupported overrides. Any relevant product or deployment change must
reopen these risks before release.

## MVP Boundary

The MVP receives an inquiry, understands the general request, gathers required information, confirms understanding, preserves corrections, explains approved next steps, escalates appropriately, and produces a complete human handoff. It is not a CRM, scheduler, payment system, phone system, marketing platform, general automation suite, autonomous employee, or industry-specific application.

## Sprint 4 Architecture Status

Milestone 4.5 adds an isolated `src/ai` vertical foundation without changing the certified Sprint 3 domain flow. It implements prototype contracts, registries, package builders, gateway/adapter, parsing, validation, duplicate protection, decisions, fictional fixtures, and verification. Existing Sprint 3 `ContextBuilder`, `OutputValidator`, proposal validator, gateway, orchestrator, and UI remain unchanged and separate. No production provider, prompt/schema, mutation/release, API, networking, persistence, authentication, or observability is added. Milestone 4.6 certifies this implementation and its read-only boundaries. See [AI Integration Prototype Foundation](AI_INTEGRATION_PROTOTYPE_FOUNDATION.md) and [Sprint 4 Certification](certification/SPRINT4_CERTIFICATION.md).

## Sprint 5.1 Execution Status

Milestone 5.1 appends an isolated application-controlled execution boundary to the certified AI prototype. An immutable Transition Registry defines one `initialized -> intake` transition. The Transition Validator requires an accepted decision, valid proposal, allowlisted task/proposal/contract, exact scope and revision, legal current stage, and unique execution identity. Only then may the deterministic State Executor submit the existing typed stage update to the in-memory Conversation State Manager.

The certified Sprint 4 read-only path remains available and unchanged. No general operation builder, fact mutation, correction, escalation activation, completion, response release, persistence, networking, external integration, or later Sprint 5 behavior is added. See [State Execution Architecture](STATE_EXECUTION_ARCHITECTURE.md).

## Sprint 5.2 Read-Model Status

Milestone 5.2 adds a separate presentation boundary after state ownership. The fail-closed Conversation Read Model Projector validates a state snapshot and application-resolved required-field/service context, copies display-safe state data, derives only explicit deterministic status, and returns a deeply immutable data contract.

The projector has no state manager, executor, provider, callback, persistence, network, external integration, or customer-release capability. It is not connected to the prototype UI or either orchestration path in this milestone. See [Conversation Read Model](CONVERSATION_READ_MODEL.md).

## Sprint 5.3 Prototype Integration Status

Milestone 5.3 makes the Prototype Chat Session the application-owned integration boundary. The session supplies its existing in-memory Conversation State Manager to the AI Foundation Orchestrator, calls only `runWithExecution()` for the registered AI-controlled transition, resolves projection context, and projects the latest snapshot before UI delivery.

The UI-facing integration result contains only the immutable Conversation Read Model plus copied decision/execution summaries that omit raw state. Rejected execution still projects current valid state; projection failure returns no raw fallback. The certified read-only `run()` path and the one-transition registry remain unchanged. See [Prototype Read Model Integration](PROTOTYPE_READ_MODEL_INTEGRATION.md).

## Sprint 5.4 Execution Journal Status

Milestone 5.4 gives each AI Foundation Prototype Orchestrator an isolated, append-only in-memory Execution Journal. `runWithExecution()` appends the immutable Execution Result after execution and before reading current state. Safe entries contain deterministic identity, sequence, scope, revisions, outcome, reason, and bounded metadata only.

The journal has no executor, state manager, transition, replay, persistence, provider, external-action, customer-release, or UI authority. Malformed results without canonical audit metadata and unknown outcomes fail closed without an entry; append failure is reported separately without rollback. See [Immutable Execution Journal](EXECUTION_JOURNAL.md).

## Sprint 5.5 Progress Engine Status

Milestone 5.5 implements an application-authoritative deterministic evaluator over validated Conversation State, explicit application policy, and required-field/service context. It produces one deeply immutable allowlisted Progress Decision describing what the application should attempt next.

A Progress Decision is not a state operation, transition identifier, execution request, customer message, or release authorization. The Conversation Read Model maps it to descriptive presentation data. Any resulting mutation must still pass through the existing Transition Registry, Transition Validator, State Executor, and Conversation State Manager. Milestone 5.6 certifies Sprint 5.1 through Sprint 5.5 without adding product functionality. See the [Sprint 5 Plan](SPRINT_5_PLAN.md), [Deterministic Conversation Progress Engine](CONVERSATION_PROGRESS_ENGINE.md), and [Sprint 5 Certification](certification/SPRINT5_CERTIFICATION.md).

## Sprint 6.0 Persistence Architecture Status

Milestone 6.0 selects PostgreSQL as Sprint 6's relational durable persistence technology and defines repository, transaction, revision, isolation, audit, migration, failure, and recovery boundaries. The application remains authoritative, and Conversation State remains the authoritative domain representation.

This milestone changes documentation only. The certified in-memory Conversation State store, process-local duplicate guards, and in-memory Execution Journal remain the implemented behavior. No PostgreSQL implementation, dependency, migration, schema, database connection, durable repository, production authentication, provider, customer release, or external business action is added. See the [Sprint 6 Plan](SPRINT_6_PLAN.md).

## Sprint 6.1 Persistence Contract Status

Milestone 6.1 introduces an application-owned `ConversationStore` contract for complete scoped Conversation State creation, reads, and revision-aware replacement. `ConversationStateManager` depends on that contract and still defaults to `InMemoryConversationStore`. Replacement requires the expected stored revision and a candidate that advances exactly one revision; stale, wrong-scope, duplicate, invalid-increment, invalid-record, incompatible-record, and infrastructure outcomes remain explicit without moving transition legality into storage.

The application-owned `ExecutionJournalStore` contract remains limited to trusted-result append and explicitly business/profile/conversation-scoped detached immutable snapshot retrieval. `InMemoryExecutionJournal` remains the default observer and retains its existing metadata validation. It gains no mutation, execution, replay, retry, release, or external-action capability.

These contracts are technology-neutral and expose no SQL, connection, transaction, ORM, driver, or PostgreSQL error type. Milestone 6.1 adds no durability, PostgreSQL implementation, dependency, migration, schema, database connection, transaction coordinator, production authentication, real provider, customer release, or external action. At the completion of Milestone 6.1, Milestone 6.2 had not started.

Future atomic execution will not add transaction control to either domain-facing store contract. Milestone 6.4 may introduce a separate application-owned coordinator that supplies transaction-bound store implementations and alone decides commit or rollback, preserving the existing State Manager, State Executor, and journal responsibilities.

## Sprint 6.2 Durable Conversation State Status

Milestone 6.2 adds a PostgreSQL Conversation Store behind the technology-neutral
application contract. The schema uses a composite
business/profile-version/conversation key, an explicit revision and state
format, and one complete JSONB state document. Create rejects duplicates,
reads require exact scope, and replacement uses an atomic expected-revision
condition with exactly one application-validated revision increment.

Rows remain untrusted storage records. The adapter checks the relational
envelope and state-format version, structurally decodes the complete document,
and runs application-owned Conversation State validation before returning a
detached domain value. Known storage outcomes are translated into contract
failures without exposing SQL, connection, transaction, or driver types.

The Conversation Store contract explicitly supports synchronous and
asynchronous adapters. Existing default manager and prototype behavior remain
synchronous and in-memory; PostgreSQL is used only when its adapter is
explicitly injected and awaited. At the completion of Milestone 6.2, no
journal durability, broader transaction coordination, new transition,
business-rule authority, customer release, external action, or Sprint 6.3 work
had been added. See
[PostgreSQL Development](POSTGRESQL_DEVELOPMENT.md).

## Sprint 6.3 Durable Execution Journal Status

Milestone 6.3 adds a PostgreSQL Execution Journal behind the technology-neutral
application contract. Migration 002 stores only the existing bounded journal
entry fields and journal schema metadata. It includes exact
business/profile/conversation scope and a deterministic sequence index; it
stores no Conversation State snapshot, prompt, raw model output, arbitrary
customer input, provider payload, or credential.

The application-owned journal entry mapper remains the trust boundary for both
in-memory and PostgreSQL append. It validates the immutable Execution Result,
maps only existing outcomes, excludes executor details, and constructs safe
entry data before persistence. The PostgreSQL adapter allocates contiguous
committed sequence values within exact business/profile/conversation scope in
a journal-local transaction. Journal identity and sequence uniqueness are also
scope-bound, preventing cross-business conflicts and sequence leakage. That
transaction has no Conversation Store, State Manager, executor, shared
database handle, or state-and-journal commit authority.

Snapshot retrieval requires exact business/profile/conversation scope, orders
by stored sequence, checks the supported journal schema version, reconstructs
the exact bounded entry shape, and returns deeply immutable detached values.
Invalid scope, incompatible metadata, malformed rows, and infrastructure
failure return explicit fail-closed snapshots with no partial history.

`InMemoryExecutionJournal` remains the synchronous prototype default. An
explicitly injected PostgreSQL journal is asynchronous and awaited by the
controlled execution path. The journal remains unable to execute, mutate,
replay, retry, release, dispatch, or decide business behavior. Milestone 6.3
adds no state-and-journal coordinator, production database connection, or
Sprint 6.4 implementation. See [PostgreSQL Development](POSTGRESQL_DEVELOPMENT.md).

## Sprint 6.4 Transactional Execution Status

Milestone 6.4 introduces the technology-neutral
`TransactionalExecutionPersistenceCoordinator` application contract. It
accepts an explicit scope and one already-approved state-changing Execution
Result, then returns only atomic success or an explicit invalid-input, missing,
revision-conflict, journal-rejection, duplicate, infrastructure, or commit
failure. It exposes no SQL, connection, driver, transaction, executor,
validator, replay, retry, response-release, or external-action capability.

`PostgresqlTransactionalExecutionCoordinator` owns one database client and one
transaction for the durable unit of work. It reuses the existing application
state decoder and journal trust mapper, locks journal identity allocation,
rejects a previously persisted scoped execution identity before mutation,
updates Conversation State only when the stored revision equals the approved
expected revision, appends one bounded journal entry, and commits only after
both writes succeed. Every pre-commit failure rolls back; a commit error is
reported as `TransactionCommitFailed`, never success. No application execution
retry or replay is performed.

The coordinator is opt-in and is not wired into the ordinary prototype. The
existing in-memory stores and standalone PostgreSQL stores remain available.
Migrations 001 and 002 already support the required transaction, scope,
revision, and journal constraints, so Milestone 6.4 adds no migration. See
[PostgreSQL Development](POSTGRESQL_DEVELOPMENT.md).

## Sprint 6.5 Restart-Safe Prototype Status

`PersistenceBackedPrototypeIntegration` is a narrowly scoped, explicitly
injected application seam over the asynchronous Conversation Store, Execution
Journal Store, and transactional persistence coordinator contracts. It has no
PostgreSQL client type and is not referenced by the ordinary prototype or UI.
Initialization delegates to `ConversationStateManager`; duplicate creation
retains the existing explicit store failure.

Recovery reads the exact configured business/profile/conversation state and
journal independently. The state adapter decodes and validates the complete
Conversation State before the integration supplies it to application logic.
The journal is returned only as bounded audit evidence and is never replayed to
construct state. Missing durable state fails closed without initializing an
authoritative in-memory replacement.

For an authorized `begin_intake` decision, the integration seeds a temporary
in-memory execution workspace solely from the recovered state, invokes the
existing mock-only controlled execution path, and sends the approved result to
the atomic coordinator. After the first durable commit, verification closes
all adapter and coordinator instances and proves newly constructed objects
recover revision one, complete state, and the audit entry. The recovered state
produces `clarify_service`; because the registry still contains only
`initialized -> intake`, the integration returns progress-only and performs no
second write.

Milestone 6.5 added no migration, dependency, UI wiring, retry, replay,
customer release, external action, or Milestone 6.6 behavior. See
[PostgreSQL Development](POSTGRESQL_DEVELOPMENT.md).

## Sprint 6.6 Persistence Recovery and Failure Status

Milestone 6.6 verifies the existing application-owned failure classifications
against real disposable PostgreSQL. Database unavailability, malformed or
incompatible records, missing exact scope, wrong business or profile version,
duplicate conversation or execution, stale revision, standalone journal
failure, transactional journal failure, deferred commit failure, and
unsupported schema state all produce explicit safe results.

Fresh application and adapter instances recover successful commits directly
from decoded Conversation State storage and retrieve journal history
independently as audit evidence. Fresh instances after rollback see only the
last committed revision and no failed-operation journal entry. Unsupported
schema state fails without request-time migration or repair. No path retries,
replays the journal, creates fallback authority, switches profile versions,
releases customer content, or dispatches an external action.

The audit demonstrated no production defect, so Milestone 6.6 adds only focused
verification and documentation. It adds no production source, migration,
dependency, schema, transition, default PostgreSQL wiring, or Sprint 6.7 work.

## Sprint 6.7 Certification Status

Sprint 6 is certified for durable, revision-safe, business-scoped persistence
within the fictional prototype boundary. Certification confirms Conversation
State authority, bounded non-replayable journal evidence, application-owned
transaction outcomes, atomic state-and-audit commit, restart after success and
rollback, tenant isolation, sanitized failure behavior, regression safety, and
strict capability limits.

Certification found and corrected one migration-integrity defect. Before any
migration SQL runs, the migration runner now validates existing history as an
exact prefix of the approved version/name sequence. Unknown, newer,
out-of-order, missing-predecessor, or renamed history fails explicitly without
repair or schema mutation.

See [Sprint 6 Certification](certification/SPRINT6_CERTIFICATION.md). This
certification adds no production connection, migration, dependency, provider,
customer release, or external action.

## Sprint 7.0 Business Configuration Planning Status

Milestone 7.0 refines Phase 5 into independently authorized Business
Configuration milestones. It plans technology-neutral configuration contracts,
separate structural and activation validation, durable Business Profile and
knowledge versions, application-owned atomic activation, exact active-version
resolution, explicit authorization inputs, configuration audit, fictional
workflow integration, recovery verification, and certification.

The plan preserves all certified Sprint 6 boundaries. Domain and application
layers retain authority; PostgreSQL remains infrastructure; Conversation State
and the Execution Journal retain their existing roles; the ordinary prototype
remains in memory by default. This milestone changes documentation only. No
Sprint 7.1 implementation, migration, schema, dependency, database operation,
production authentication, provider, customer release, or external action has
started. See the [Sprint 7 Plan](SPRINT_7_PLAN.md).

## Sprint 7.1 Configuration Contract Status

Milestone 7.1 adds an isolated Business Configuration application boundary for
exact Business Profile and knowledge revisions. Explicit allowlists cover
subjects, lifecycle values, operations, validation stages, and authorization
decisions. Scope validators fail closed on malformed business, profile-version,
knowledge-record, or knowledge-version identity. Successful snapshots are
complete, detached, and deeply immutable.

The repository contracts expose only draft creation, exact revision reads, and
recording an already-authorized lifecycle transition. They contain no SQL,
PostgreSQL, connection, transaction-handle, ORM, HTTP, UI, provider, model,
generic CRUD, or arbitrary-mutation capability. Separate application validation
methods preserve the distinction between draft structure, activation
eligibility, and conversation use. Existing Business Profile and knowledge
validators remain unchanged and authoritative for their current active-profile
and knowledge structure/scope responsibilities respectively; knowledge
lifecycle eligibility remains a separate application decision.

Milestone 7.1 is complete and adds no repository implementation, migration, schema, dependency,
database operation, production authorization, active-profile resolver,
activation transaction, prototype wiring, customer release, or external
action. Milestone 7.2 has not started. See
[Business Configuration Architecture](BUSINESS_CONFIGURATION_ARCHITECTURE.md).

## Sprint 7.2 Durable Business Profile Version Status

Milestone 7.2 adds ordered migration 003, an exact-shape application decoder,
and an opt-in PostgreSQL repository behind the 7.1 contract. It creates one
immutable draft revision and reads one exact business/profile version with
explicit outcomes and detached immutable results. PostgreSQL owns durability
and integrity only. Lifecycle transitions, activation, active-profile
selection, knowledge persistence, update/delete, default prototype wiring, and
Milestone 7.3 behavior remain absent.

## Sprint 7.3 Durable Knowledge Version Status

Milestone 7.3 adds ordered migration 004, an application-owned exact-shape
Knowledge Record decoder, and an opt-in PostgreSQL repository behind the 7.1
contract. It creates one immutable draft and reads one exact
business/profile/record/version with explicit outcomes and detached immutable
results. PostgreSQL owns durability and relational integrity only. Lifecycle
transitions, approval, activation, active-configuration resolution, knowledge
retrieval, conflict resolution, update/delete, default prototype wiring, and
Milestone 7.4 behavior remain absent.
