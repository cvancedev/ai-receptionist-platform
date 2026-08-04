# Sprint 7 Plan: Business Configuration

## Status

Milestone 7.0 is the planning and documentation milestone. Sprint 6 is
certified complete. No Sprint 7.1 implementation has started.

This plan preserves the certified Sprint 6 boundaries and refines Phase 5 of
the [Implementation Sequence](IMPLEMENTATION_SEQUENCE.md) into independently
authorized milestones. It does not authorize production code, dependencies,
migrations, schema changes, database connections, or customer release.

## 1. Sprint 7 Objective

Enable one fictional, business-scoped Business Profile and its approved
knowledge to move through a minimal, safe configuration lifecycle without
direct database manipulation.

Sprint 7 will establish explicit draft, validation, review, activation,
suspension, versioning, authorization, persistence, and audit boundaries. The
application remains the sole authority for accepting changes and lifecycle
transitions. The domain remains the authority for configuration meaning and
invariants. PostgreSQL remains subordinate infrastructure.

## 2. Why Sprint 7 Follows Sprint 6

Sprint 6 proved the durable mechanics Sprint 7 needs: technology-neutral
repository contracts, business-scoped isolation, optimistic concurrency,
atomic transactions, ordered migrations, restart recovery, explicit failures,
and durable audit evidence. It deliberately left Business Profiles and
knowledge fixture-backed.

Business Configuration is therefore the next bounded roadmap step. It applies
the certified persistence foundation to configuration ownership and lifecycle
without prematurely connecting providers, communication channels, public
administration, or the end-to-end MVP.

## 3. Major Milestones

### 7.0: Business Configuration Planning

- Define Sprint 7 scope, authority boundaries, milestone gates, verification,
  risks, and documentation prerequisites.
- Refine the roadmap without changing the Phase 5 sequence.
- Add documentation only.

### 7.1: Configuration Contracts and Lifecycle Architecture

- Define technology-neutral repository and application contracts for Business
  Profile versions, knowledge versions, lifecycle transitions, and reads.
- Distinguish structural draft validation from activation eligibility and
  conversation-use validation.
- Define explicit authorization inputs and configuration audit requirements.
- Do not create persistence implementations or migrations.

### 7.2: Durable Business Profile Versions

- Add the smallest explicitly authorized PostgreSQL migration and adapter for
  immutable, business-scoped Business Profile versions.
- Preserve explicit outcomes, optimistic concurrency, and repository
  substitutability.
- Do not persist knowledge or activate configuration in this milestone.

### 7.3: Durable Knowledge Versions and Lifecycle

- Add separately bounded durable storage for business-scoped knowledge records,
  lifecycle state, audience, source traceability, and effective dates.
- Preserve version history; do not add embeddings, vector storage, semantic
  search, ingestion pipelines, or model-generated knowledge.

### 7.4: Atomic Activation and Active-Configuration Resolution

- Implement application-owned activation eligibility and atomic lifecycle
  transitions for one validated configuration version.
- Resolve the active Business Profile and eligible knowledge explicitly by
  business scope and version.
- Pin conversations to the exact Business Profile version selected at their
  start; never silently migrate an existing conversation.

### 7.5: Minimal Fictional Configuration Workflow

- Provide an explicitly opt-in internal workflow that allows one fictional
  business to draft, validate, review, activate, suspend, and inspect its
  essential configuration without direct SQL.
- Integrate only after the lifecycle and persistence boundaries are proven.
- Keep the ordinary deterministic prototype behavior and fixtures available;
  do not add a public admin product or production authentication.

### 7.6: Configuration Failure, Recovery, and Isolation Verification

- Prove invalid configuration, stale revisions, duplicate versions, wrong
  business scope, unauthorized transitions, activation failure, malformed
  storage, and restart recovery fail explicitly and safely.
- Verify failed activation cannot partially change active configuration or its
  required configuration audit evidence.

### 7.7: Sprint 7 Certification

- Audit architecture, lifecycle integrity, authorization boundaries,
  persistence, atomicity, isolation, recovery, regression safety, documentation,
  and prohibited capabilities.
- Correct certification-blocking defects within scope, then determine whether
  Sprint 7 satisfies its exit criteria.

Only Milestone 7.0 is authorized by this plan. Milestones 7.1 through 7.7
require separate instructions and validation before work begins.

## 4. Repository Boundaries

- Domain types and invariants belong under `src/domain` and `src/validation`.
- Application orchestration and lifecycle decisions belong under
  `src/application`.
- Technology-neutral repository contracts belong at the existing application
  persistence boundary; PostgreSQL adapters belong under `src/infrastructure`.
- Migrations remain ordered, additive, narrowly scoped, and owned by the
  PostgreSQL infrastructure boundary.
- Prototype fixtures and opt-in wiring remain under the prototype boundary.
- Configuration audit is distinct from the Conversation Execution Journal;
  conversation audit evidence must not become configuration lifecycle storage.
- Documentation must be updated in the milestone that changes an architectural
  or implementation fact.

Milestone 7.0 changes documentation only. It must not alter `app/`,
`components/`, `src/`, `scripts/`, migrations, dependencies, or generated
artifacts.

## 5. Application Authority Boundaries

The application may:

- accept or reject a requested configuration operation;
- require explicit business scope, expected revision, actor context, and
  authorization decision;
- sequence validation, persistence, and audit work;
- decide whether a version is eligible for review, activation, suspension, or
  conversation use;
- select an exact active configuration version for a new conversation; and
- return explicit, sanitized outcomes.

The application must not delegate these decisions to PostgreSQL, a repository,
the prototype UI, fixtures, a model, or raw customer input. Sprint 7 may use
fictional authorization fixtures for verification, but it must not represent
them as production identity or authentication.

## 6. Domain Authority Boundaries

- A business owns the meaning of its identity, services, policies, terminology,
  intake fields, FAQs, and escalation guidance.
- Platform domain rules own valid shape, lifecycle invariants, allowed
  transitions, version meaning, audience meaning, and activation eligibility.
- Draft structural validation must not be conflated with the existing
  conversation-use requirement for active configuration.
- Knowledge must remain attributable to one Business Profile scope, versioned,
  traceable to a source, audience-qualified, and lifecycle-qualified.
- Industry-specific rules remain Business Profile data, never platform-core
  behavior.
- AI output has no authority to create, approve, activate, or alter
  configuration.

## 7. Persistence Boundaries

- Reuse the certified PostgreSQL and `pg` foundation; Sprint 7 must not add an
  ORM or another persistence category without a separate architectural
  decision.
- Repository contracts remain technology-neutral and expose explicit scoped
  identities, versions, expected revisions, and outcomes.
- PostgreSQL may enforce relational integrity, uniqueness, isolation, and
  atomic commit, but it does not decide business validity or lifecycle intent.
- Versions and required audit evidence are append-only where history matters;
  activation state must not destroy prior versions.
- Activation must atomically preserve the active-version invariant and its
  required configuration audit evidence.
- Reads fail closed on missing scope, malformed data, incompatible schema, or
  ambiguous active configuration. No implicit fixture fallback or repair is
  allowed on a selected durable path.
- Existing Conversation State and Execution Journal authority and transaction
  boundaries remain unchanged.
- Each migration or durable adapter requires its own later milestone
  authorization. Milestone 7.0 creates none.

## 8. Prototype Boundaries

- The ordinary prototype remains synchronous, deterministic, fictional, and
  in memory until a later milestone explicitly opts into configuration
  persistence.
- Existing fixture-backed configuration remains available during incremental
  implementation and regression verification.
- A future Sprint 7 workflow is internal and fictional, not a public admin
  portal, production API, customer release, or claim of operational readiness.
- No real customer data, credentials, provider calls, communications, external
  business actions, or production authentication are allowed.
- Conversation behavior must not expand beyond the certified controlled
  transition and release boundaries.

## 9. Verification Strategy

Every implementation milestone must add focused contract and behavior checks
before broad regression validation. Verification must cover:

- valid and invalid lifecycle transitions;
- structural validation versus activation and conversation-use eligibility;
- business isolation and profile/knowledge ownership;
- immutable version history and exact active-version resolution;
- stale revision and duplicate operation handling;
- authorization-required and unauthorized outcomes;
- atomic activation and required audit evidence;
- restart recovery and deterministic reads;
- malformed, missing, and incompatible durable data;
- in-memory and PostgreSQL contract parity where both implementations exist;
- preservation of Conversation State, Execution Journal, Progress Engine, AI
  advisory, and customer-release boundaries; and
- absence of public administration, real providers, external actions, and
  production claims.

Milestone 7.7 must run the full established project verification suite, real
disposable-PostgreSQL checks for durable paths, Markdown-link verification,
lint, TypeScript, and production build. Each earlier milestone runs the
proportionate subset plus all affected regressions.

## 10. Risks

| Risk | Required control |
| --- | --- |
| Draft validation is confused with active-use validation | Define separate named validation stages and tests before implementation |
| A partial activation leaves multiple active versions or mismatched audit | Use one application-owned transaction with database integrity constraints and rollback verification |
| Configuration changes alter conversations already in progress | Pin each conversation to an exact Business Profile version |
| Knowledge from another business or audience leaks into context | Require business, profile, lifecycle, and audience scope on contracts and reads |
| Database mechanics gain lifecycle authority | Keep decisions in domain/application services and test adapters through technology-neutral contracts |
| Fictional authorization is mistaken for production access control | Keep workflow opt-in and internal; document that production authentication remains absent |
| Sprint 7 grows into an admin platform or end-to-end MVP | Enforce milestone gates and explicit out-of-scope capabilities |
| Migration or stored-data incompatibility causes silent fallback | Fail closed before writes; prohibit repair and fixture fallback on durable paths |
| Configuration audit is coupled to conversation replay | Define a separate bounded configuration audit contract with no execution authority |

The temporary accepted risks for Next-owned PostCSS and Sharp remain governed
by the existing dependency-risk record and must be reevaluated separately; they
do not authorize dependency work in Sprint 7.0.

## 11. Out-of-Scope Items

- Public or production administration UI
- Production authentication, authorization provider, roles, or account recovery
- Real customer or protected production data
- Multi-business onboarding automation or self-service signup
- Billing, subscriptions, analytics, CRM, calendars, telephony, SMS, or email
- Real AI providers, prompt expansion, autonomous configuration, or model-written
  knowledge
- Vector databases, embeddings, semantic search, queues, caches, or analytics
  stores
- Bulk import, website crawling, document ingestion, or industry template
  libraries
- Pricing engines, quoting, booking, payment, refunds, or external business
  actions
- Expansion of the certified conversation transition or customer-release scope
- End-to-end MVP work assigned to Sprint 8
- Dependencies, migrations, schema changes, production code, or database work in
  Milestone 7.0

## 12. Success Criteria

Sprint 7 is complete only when:

- one fictional business can draft, validate, review, activate, suspend, and
  inspect the minimum Business Profile and knowledge set without direct SQL;
- lifecycle authority is explicit, authorization-aware, and application-owned;
- Business Profile and knowledge versions are durable, business-scoped,
  immutable where required, and recoverable after restart;
- exactly one eligible active configuration is resolved explicitly for a
  business, with prior history preserved;
- activation and required configuration audit evidence commit atomically;
- conversations remain pinned to their selected Business Profile version;
- invalid, stale, duplicate, unauthorized, malformed, cross-business, and
  incompatible operations fail explicitly without partial mutation or fallback;
- in-memory prototype behavior and all certified Sprint 3 through Sprint 6
  boundaries continue to pass regression verification;
- documentation describes implemented reality without unsupported product or
  security claims; and
- Sprint 7 certification records evidence that Phase 5 exit criteria are met.

## 13. Proposed Documentation Updates Required Before Implementation

Milestone 7.1 should create or finalize these focused documents before durable
implementation begins:

- `docs/BUSINESS_CONFIGURATION_ARCHITECTURE.md` for components, contracts, and
  authority flow;
- `docs/CONFIGURATION_LIFECYCLE.md` for states, transitions, validation stages,
  versioning, and activation invariants;
- `docs/CONFIGURATION_AUTHORIZATION.md` for actor context, application decisions,
  fictional verification inputs, and the production-authentication boundary;
- `docs/CONFIGURATION_PERSISTENCE.md` for repository contracts, atomicity,
  isolation, migrations, failures, and recovery;
- `docs/SPRINT_7_TEST_PLAN.md` for milestone evidence and certification gates.

As each later milestone is authorized, it must update the relevant existing
documents, including [Business Profile](BUSINESS_PROFILE.md),
[Business Profile validation](BUSINESS_PROFILE_VALIDATION.md),
[Knowledge lifecycle](KNOWLEDGE_LIFECYCLE.md),
[Configuration ownership](CONFIGURATION_OWNERSHIP.md),
[API boundaries](API_BOUNDARIES.md),
[Data and state ownership](DATA_AND_STATE_OWNERSHIP.md), and
[Implementation architecture](IMPLEMENTATION_ARCHITECTURE.md). The README,
roadmap, changelog, and MVP status must stay synchronized with actual progress.

## Roadmap Recommendation

Sprint 7 should remain **Business Configuration** and retain its position as
Phase 5 between Durable Persistence and the End-to-End MVP. Sprint 6 evidence
strengthens rather than changes that sequence.

The roadmap should be refined to list Milestones 7.0 through 7.7 and state the
authority and scope boundaries above. This prevents persistence, configuration,
authentication, provider integration, public administration, and Sprint 8 MVP
work from being collapsed into one feature. It is a scope clarification, not a
roadmap expansion.

## Milestone 7.0 Definition of Done

- This plan addresses the required objective, boundaries, milestones,
  verification, risks, non-goals, success criteria, and documentation work.
- The roadmap keeps Business Configuration as Sprint 7 and records the refined
  milestone sequence.
- Current-status documentation states that Sprint 7.0 planning is complete and
  Sprint 7.1 has not started.
- Documentation links and the established application validation commands pass.
- The diff contains documentation only and remains unstaged and uncommitted.
