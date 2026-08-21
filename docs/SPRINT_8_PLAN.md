# Sprint 8 Plan: End-to-End MVP

## Status

Milestones 8.0 through 8.5 are complete. Sprints 1 through 7 remain certified
complete. Milestone 8.6 has not started.

This plan refines Phase 6 of the [Implementation Sequence](IMPLEMENTATION_SEQUENCE.md)
without changing its position or expanding it into production release. Each
implementation milestone requires separate authorization.

## 1. Objective

Connect the certified conversation, AI-control, persistence, and Business
Configuration foundations into one internal, fictional, restart-safe
customer-to-human workflow. The workflow must begin from one explicitly
activated Business Profile, use only knowledge bound to that activation,
preserve the exact profile-version pin, complete deterministic intake, and
produce an actionable validated handoff.

Sprint 8 proves an integrated MVP candidate. It does not place the product in
production, release responses to real customers, or authorize external
business actions.

## 2. Why Sprint 8 Follows Sprint 7

Sprint 6 certified durable Conversation State, execution evidence, atomic
execution persistence, isolation, and restart recovery. Sprint 7 certified the
application-owned configuration lifecycle, exact activated profile and
knowledge resolution, durable profile-version pinning, and suspension
ineligibility. Those entry criteria make integration the next roadmap step.

Building the end-to-end path earlier would have coupled conversation behavior
to fixtures or ungoverned configuration. Sprint 8 can now compose established
contracts without transferring authority to PostgreSQL, a model, or the UI.

## 3. Milestones

### 8.0: End-to-End MVP Planning

**Status: Complete; ready for plan review**

- Define the acceptance workflow, milestone gates, authority boundaries,
  storage decision gate, provider decision gate, and verification plan.
- Synchronize current-status documentation only.
- Add no implementation, migration, schema, dependency, or provider.

### 8.1: End-to-End Contracts and Application Composition

**Status: Complete**

- Define technology-neutral contracts for one inbound fictional turn, exact
  conversation scope, application decisions, validated response candidates,
  progress, handoff readiness, and explicit failures.
- Define an application-owned coordinator that composes existing services
  without implementing provider, persistence, or UI details.
- Decide, from acceptance evidence, whether a separate durable message or
  handoff record is required. Do not create a migration in this milestone.

Milestone 8.1 implements an application-owned preparation boundary that
validates one bounded fictional turn, delegates only to certified activated
initialization or pinned recovery, independently rechecks exact resolved
scope, exposes bounded progress and handoff readiness, and withholds message
persistence, turn processing, mutation, response production, release, and
external action. The [storage decision](SPRINT_8_STORAGE_DECISION.md) finds no
need for a separate handoff record and records the later need for durable
message evidence without authorizing a migration.

### 8.2: Activated Context and Grounded Knowledge

**Status: Complete**

- Build context only after exact conversation ownership and historical
  activation resolution succeed.
- Include the pinned Business Profile and only activation-bound, active,
  customer-eligible Knowledge Record versions.
- Preserve source identity, audience, effective-time, version, and policy
  provenance through output validation.
- Fail closed for missing, suspended, malformed, stale, cross-business,
  unbound, or contradictory context. Never fall back to fixtures on this path.

Milestone 8.2 extends the application-owned preparation boundary with one
bounded, immutable, transient context assembled only after exact activated
configuration and durable conversation recovery succeed. The context carries
the complete pinned Business Profile, exact Conversation State revision,
explicitly untrusted current customer input, and only activation-bound,
active, effective, customer-eligible Knowledge Record versions. A separate
grounding validator accepts future response candidates only when every source
reference exactly matches that context, preserves source, audience,
effective-time, version, activation, and policy provenance, and continues to
deny customer release. No task execution, transition, message persistence,
provider, migration, dependency, UI, or fixture fallback is added.

### 8.3: Deterministic Multi-Turn Conversation Workflow

**Status: Complete**

- Connect greeting, request understanding, service resolution, relevant
  questions, corrections, confirmation, escalation, completion, next steps,
  and handoff through existing application/domain boundaries.
- Extend the Transition Registry only for transitions demonstrated by the
  approved state model and acceptance scenarios. Every transition remains
  application-validated and executor-controlled.
- Keep the model advisory. Candidate facts and wording cannot directly mutate
  state, decide completion, activate escalation, or authorize release.

Milestone 8.3 adds a transient, application-owned workflow seeded only from
the exact eligible activated context created in Milestone 8.2. It composes the
existing deterministic Conversation Engine, Conversation State Manager,
Progress Engine/read-model projection, Grounding Validator, and Handoff
Builder for bounded multi-turn progression, clarification, correction,
confirmation, escalation, completion, and derived handoff. Exact activation,
profile-version, conversation, revision, message-sequence, and duplicate
guards fail closed. No message, state replacement, or execution evidence is
persisted by this workflow; durable turn atomicity and restart evidence remain
Milestone 8.4. No fixture fallback, provider, release, external action,
migration, dependency, route, or UI is added.

### 8.4: Durable Turn, Handoff, and Restart Boundary

**Status: Complete**

- Persist each approved state replacement and required execution evidence
  atomically through the certified transaction boundary.
- Derive the handoff from validated pinned state and profile rules; prove it is
  reproducible after restart.
- Preserve idempotency, optimistic concurrency, exact scope, and explicit
  commit-failure outcomes.
- Add an ordered additive migration only if the 8.1 contract decision proves
  that restart-safe transcript or handoff acceptance cannot be met by the
  existing Conversation State and journal. A migration requires its own
  explicit milestone authorization and may not make stored data authoritative.

Milestone 8.4 adds bounded append-only customer message evidence through
migration 007 because Conversation State cannot reproduce bounded transcript
content after restart. The existing transaction coordinator couples that
subordinate evidence to approved state and Execution Journal commits. Restart
reads authoritative state directly, separately decodes ordered evidence with
exact activation provenance, and derives handoff again from validated pinned
state and profile. No handoff record, replay, fallback, release, provider,
external action, dependency, route, or UI is added.

### 8.5: Internal Fictional MVP Experience

**Status: Complete**

- Integrate the end-to-end path into the existing prototype surface with the
  smallest accessible UI change needed to exercise and inspect the fictional
  workflow.
- Show bounded conversation, progress, safe failure, and validated handoff
  read models; never expose raw persistence or internal model payloads.
- Keep the current fixture-backed deterministic prototype available as a
  regression and demonstration mode. The durable activated mode is explicit
  and has no fixture fallback.

Milestone 8.5 adds an accessible mode selector and bounded internal experience
to the existing prototype surface. Fixture-backed deterministic operation
remains the default demonstration path. Durable activated operation is
explicit and fails closed when no application-injected runtime is present; the
browser does not open a database connection, read a repository, construct
authoritative state, or substitute fixtures. The surface renders only the
existing conversation read model, progress, safe failure, and derived handoff.
No route, migration, schema, dependency, provider, release authority, external
action, authentication, or Milestone 8.6 behavior is added.

### 8.6: Provider Evaluation and Conditional Development Adapter

**Status: Not Started**

- Evaluate whether a provider materially improves language interpretation or
  response drafting over the deterministic/mock baseline using fixed fictional
  scenarios and the certified provider-neutral contracts.
- Record a provider decision, privacy/security constraints, failure policy,
  cost bounds, and measurable acceptance evidence.
- A networked development adapter may be implemented only under separate
  explicit authorization after the evaluation gate. It must remain optional,
  non-production, and subordinate to the same validation and decision path.
- The deterministic mock remains the mandatory regression path and safe
  fallback. Deferring a provider does not authorize weaker validation.

### 8.7: End-to-End Failure, Security, and Recovery Verification

**Status: Not Started**

- Prove isolation, restart, concurrency, duplicate, invalid-output,
  unavailable-provider, suspended-configuration, and partial-failure behavior.
- Verify privacy minimization, source traceability, fail-closed release, and
  absence of external actions or production credentials.
- Run the complete certified Sprint 3 through Sprint 7 regression matrix.

### 8.8: Sprint 8 Certification

**Status: Not Started**

- Audit every Sprint 8 exit criterion, architecture boundary, migration and
  dependency decision, acceptance scenario, documentation claim, and
  prohibited capability.
- Create evidence-based certification only after all required deterministic
  and applicable provider-backed scenarios pass.
- Do not authorize customer release or Sprint 9 hardening work.

## 4. End-to-End Conversation Flow

1. The application receives a fictional inbound message with an exact business
   and conversation identity.
2. For a new conversation, it resolves the current activated Business Profile
   and bound knowledge, validates eligibility, and persists the exact profile
   version in Conversation State.
3. For an existing conversation, it proves exact ownership and reloads the
   historical configuration selected by the persisted pin. It never repins to
   a newer activation.
4. The application builds bounded context from trusted configuration,
   conversation evidence, the current input, task policy, and source versions.
5. Deterministic rules select progress and the allowed task. A mock or later
   approved development provider may return an untrusted proposal.
6. Parsing, output contracts, source-reference validation, duplicate guards,
   and application decisions accept or reject the proposal.
7. Only an application-constructed operation may reach the Transition
   Validator, State Executor, and Conversation State Manager.
8. Approved durable state and required execution evidence commit atomically.
9. The application projects the next question, correction request,
   confirmation, escalation, or completion through bounded read models.
10. At readiness, the Handoff Builder derives an actionable summary from the
    exact validated state and pinned profile rules. No message or external
    dispatch occurs.

## 5. Authority and Architecture Boundaries

### Application authority

The application owns scope validation, context eligibility, task selection,
proposal acceptance, operation construction, progress, completion,
escalation, response-release decisions, transaction coordination, and handoff
creation. Sprint 8 does not authorize actual customer release.

### Domain authority

Domain types and validators own conversation, configuration, knowledge,
lifecycle, transition, completion, correction, escalation, and handoff
meaning. Industry-specific behavior remains configuration data. New states or
transitions require explicit invariants and focused verification.

### Model authority

A model may propose bounded interpretation, candidate facts, grounded answer
content, escalation recommendations, summaries, or response wording. It may
not mutate state, choose configuration, invent knowledge, decide business
policy, execute actions, or release content.

### Persistence authority

PostgreSQL owns durable storage, relational integrity, uniqueness, locking,
atomic commit, and ordered migration history. It does not select profiles,
validate business meaning, authorize transitions, repair data, retry work,
or decide handoff readiness. Technology-neutral contracts must contain no SQL,
driver, pool, client, or transaction-handle types.

### Prototype and UI authority

The existing fixture-backed prototype remains intact. The persistence-backed
activated path remains opt-in, fictional, and fail-closed. UI code may submit
input and render approved read models; it cannot read repositories directly,
construct authoritative state, activate configuration, or release messages.

## 6. Persistence, Pinning, and Recovery Requirements

- Every operation requires exact business, Business Profile version, and
  conversation identity; knowledge additionally requires exact record and
  revision identity.
- Initial conversation creation pins the exact eligible active profile.
- Later activation never repins an existing conversation; only a new fictional
  conversation may select the newer active configuration.
- Recovery reconstructs historical activated context only after the exact
  Conversation State read proves ownership.
- No nearest-version, current-version substitution, broad lookup, cross-scope
  disclosure, fixture fallback, or silent repair is allowed.
- State revision and execution identity remain concurrency and idempotency
  inputs. Ambiguous commit outcomes fail explicitly and recover by reading
  authoritative committed state, not replaying journal evidence.
- Handoff is derived from validated state. If later evidence requires durable
  transcript or handoff storage, that storage must remain subordinate and
  business-scoped with explicit retention and minimization rules.

## 7. What Remains Mocked and What Becomes Implemented

The deterministic mock provider, fictional data, local prototype, and
fixture-backed regression path remain. No real customer, production channel,
production authentication, production database configuration, or external
action enters scope.

Sprint 8 implementation may make the application composition real within the
repository: activated configuration, conversation processing, validated
state changes, durable restart recovery, read-model projection, and handoff
generation can operate as one internal fictional workflow. That is development
MVP behavior, not production behavior or customer release.

A real provider is not assumed. The roadmap includes a selected provider in
Phase 6 but also subjects providers to separate evaluation. Milestone 8.6
preserves both statements by making evaluation mandatory and any networked
adapter conditional on a later explicit authorization.

## 8. Security and Privacy Boundaries

- Fictional data only until a later production-readiness phase authorizes real
  data handling.
- Minimize context to the task; preserve source and version provenance; exclude
  credentials, internal-only knowledge, and unrelated conversation data.
- Reject prompt or knowledge instructions that conflict with platform policy.
- Use explicit timeouts, cancellation, bounded retries, size limits, and
  sanitized failures for any later networked adapter.
- Never log secrets, raw credentials, private keys, unrestricted prompts, or
  unnecessary customer content.
- Require exact tenant and conversation scope at every repository and context
  boundary.
- No production identity claim may be based on fictional authorization inputs.

## 9. Prohibited Scope

- Production launch, customer response release, or real customer data
- Voice, telephony, outbound calling, SMS, email delivery, or other channels
- Authentication, accounts, roles, self-service onboarding, or public admin UI
- Billing, payments, quotes, refunds, booking, scheduling, calendars, or CRM
- External business actions, tools, webhooks, autonomous follow-up, or dispatch
- Model-controlled state, configuration, completion, escalation, or handoff
- Generic CRUD, arbitrary configuration mutation, bulk ingestion, crawling,
  embeddings, vector databases, semantic search, queues, caches, or analytics
- Silent repinning, broad lookup, cross-business fallback, or storage repair
- Unrelated website redesign or Sprint 9 hardening implementation

## 10. Exit Criteria

Sprint 8 is complete only when:

- one internal fictional inquiry completes from activated greeting through
  actionable validated handoff using exact Business Profile and knowledge
  versions;
- every accepted state change traverses the application decision, Transition
  Registry, Transition Validator, State Executor, State Manager, and required
  persistence boundary;
- corrections, question history, unsupported requests, escalation,
  confirmation, completion, and handoff meet the MVP requirements;
- restart preserves Conversation State, exact profile pin, knowledge
  provenance, required execution evidence, progress, and reproducible handoff;
- reactivation affects only newly initialized conversations;
- wrong-business, wrong-profile, wrong-knowledge, wrong-conversation, stale,
  duplicate, malformed, suspended, unavailable, and commit-failure cases fail
  closed without disclosure, fallback, partial authority, or external effect;
- the ordinary fixture-backed and deterministic mock paths remain passing;
- provider evaluation is documented and any approved adapter remains optional,
  bounded, validated, and safely replaceable by the mock path;
- accessibility, security, privacy, reliability, migration, dependency, and
  full regression gates pass; and
- certification finds no production release, authentication, channel,
  external-action, or Sprint 9 capability.

## 11. Migration and Dependency Assessment

No migration or dependency change is necessary for Milestone 8.0, 8.1, or the
initial deterministic composition. Existing migrations 001 through 006 cover
Conversation State, execution evidence, configuration versions, activation,
and lifecycle evidence.

The repository does not currently provide a separate durable message or
handoff record. Milestone 8.1 must decide whether the acceptance requirement
for restart-safe conversation history and handoff can be met by authoritative
Conversation State plus deterministic derivation. If it cannot, Milestone 8.4
may propose the smallest additive migration under separate authorization.
Milestone 8.4 authorization resolved that gate and adds migration 007 only for
bounded append-only message evidence. Migrations 001 through 006 are unchanged.

No provider SDK or new persistence category is selected. A provider adapter
should prefer existing provider-neutral contracts and platform capabilities;
any dependency must be justified by the 8.6 evaluation, security-reviewed,
exactly scoped, and separately authorized. An ORM, vector store, queue, cache,
analytics store, or communication SDK is not justified.

## 12. Risks

| Risk | Required control |
| --- | --- |
| Integration bypasses certified authorities | Compose existing contracts; test every state change through the full controlled path |
| Current activation silently replaces a conversation pin | Resolve historical configuration only after exact Conversation State ownership proof |
| Knowledge leaks across business, audience, or activation | Require exact bound versions and provenance in context and output validation |
| Model wording is mistaken for accepted state or releasable content | Keep proposals inert until application validation; keep customer release disabled |
| Durable transcript scope grows privacy exposure | Contract-first minimization and retention decision before any schema change |
| Partial state/audit writes create false progress | Preserve atomic transaction and explicit ambiguous-commit recovery semantics |
| Provider evaluation becomes an implicit production commitment | Separate evaluation, adapter authorization, and production release decisions |
| Prototype UI gains workflow authority | Render bounded read models and prohibit direct repository/state construction |
| Sprint 8 expands into channels or administration | Enforce the milestone and prohibited-capability scans |

## 13. Documentation Required Before Implementation

Milestone 8.1 should create or update, before later implementation:

- an end-to-end application contract and sequence document;
- a response-release boundary documenting that release remains disabled;
- a durable message/handoff storage decision record if the gap analysis
  requires one;
- a provider evaluation record before any networked adapter;
- updates to API boundaries, data ownership, context architecture, state
  execution, conversation flow, recovery, and PostgreSQL development guidance
  only when their implemented facts change; and
- synchronized README, roadmap, changelog, MVP status, test plan, and final
  certification evidence.

## Roadmap Review

The roadmap correctly defines Sprint 8 as the End-to-End MVP after durable
persistence and Business Configuration. It should remain in that position.

The only needed refinement is to make its internal fictional boundary and
provider gate explicit. Phase 6 lists a selected provider, while the roadmap
says provider choice remains subject to separate evaluation. These statements
are compatible only if evaluation precedes and separately authorizes any
adapter. Sprint 8 must not be described as production release; Sprint 9 remains
the later hardening and controlled-production-evaluation phase.

## Milestone 8.0 Definition of Done

- This plan and the [Sprint 8 Test Plan](SPRINT_8_TEST_PLAN.md) define scope,
  sequencing, boundaries, evidence, risks, and decision gates.
- Current-status documentation records Sprint 8 planning without claiming
  implementation.
- Documentation links, lint, TypeScript, and build validation pass.
- The diff contains documentation only and remains unstaged and uncommitted.
