# Product Roadmap

This roadmap establishes the current development sequence. Items identified as future possibilities are uncommitted and will be evaluated before development.

## Sprint 0: Foundation (Complete)

- Milestone 0.1: Initialize Next.js project — Complete
- Milestone 0.2: Project structure and governing documentation — Complete
- Milestone 0.3: Centralized brand configuration — Complete
- Milestone 0.4: Establish the design foundation — Complete
- Milestone 0.5: Foundation certification — Complete

## Sprint 1: Marketing Website (Complete)

- Milestone 1.1: Customer validation homepage — Complete
- Milestone 1.2: Early-access contact experience and supporting legal pages — Complete
- Milestone 1.3: Deployment readiness, SEO foundation, and final customer-validation review — Complete

### Sprint Goals

- Homepage
- Product explanation
- How it works
- Trust and reliability messaging
- Email-based early-access contact experience
- Responsive and accessible presentation

Multiple marketing pages will not be introduced unless a demonstrated need justifies them.

## Sprint 2: Customer Discovery and Architecture (Complete)

- Milestone 2.1: Universal intake and conversation architecture — Complete
- Milestone 2.2: AI Behavior & Conversation Intelligence — Complete
- Milestone 2.3: Business Profile Architecture — Complete
- Milestone 2.4: Conversation Engine Architecture — Complete
- Milestone 2.5: Knowledge Architecture — Complete
- Milestone 2.6: Prompt & Context Architecture — Complete
- Milestone 2.7: Implementation Planning — Complete

### Sprint Goals

- Maintain a clear record of validated customer evidence, assumptions, and open questions
- Define the minimum universal intake shared by service businesses and keep exact requirements profile-driven
- Define a trustworthy end-to-end conversation flow
- Define consistent personality, questioning, escalation, and customer experience standards
- Define a Business Profile for customer-configured services, knowledge, policies, terminology, and workflows
- Keep the AI Core industry-agnostic while supporting customer-defined workflows
- Establish a disciplined MVP boundary before selecting AI or communication providers

## Sprint 3: Conversation Prototype (Complete)

- Milestone 3.1: Prototype Foundation — Complete
- Milestone 3.2: Conversation State Prototype — Complete
- Milestone 3.3: Deterministic Intake Flow — Complete
- Milestone 3.4: Prototype Chat Interface — Complete
- Milestone 3.5: Prototype Certification — Complete

Sprint 3 uses fictional configuration, in-memory state, and mocked model behavior. It does not introduce authentication, persistence, a production AI provider, or real customer data.

Sprint 3 certification confirms deterministic behavior, validated state and handoff boundaries, Business Profile and profile-version isolation, presentation-only UI behavior, and regression coverage across the complete prototype.

The numbered sequence after Sprint 3 remains provisional and must be reassessed using prototype evidence. Authentication and authorization must precede any real protected business data or administration workflow.

## Sprint 4: Provider-Independent AI Integration Architecture

- Milestone 4.1: AI Integration Architecture — Complete
- Milestone 4.2: Context Assembly Architecture — Complete
- Milestone 4.3: Prompt and Task Architecture — Complete
- Milestone 4.4: Model Output and Proposal Validation Architecture — Complete
- Milestone 4.5: AI Integration Prototype Foundation — Complete
- Milestone 4.6: Sprint 4 Certification — Complete

Sprint 4 keeps the deterministic application authoritative. Milestone 4.5 implements the typed provider-neutral flow with immutable packages, allowlisted registries, a deterministic mock adapter, inert parsing, layered prototype validation, duplicate protection, and read-only decisions. Milestone 4.6 certifies its architecture, fail-closed security, deterministic mock path, prohibited boundaries, regressions, and documentation. Sprint 4 introduces no real provider/model/SDK, network, production prompt/schema, mutation, delivery, persistence, authentication, or customer-facing AI.

The detailed sequence and guardrails are defined in [Sprint 4 Plan](docs/SPRINT_4_PLAN.md), with results in [Sprint 4 Certification](docs/certification/SPRINT4_CERTIFICATION.md).

## Sprint 5: Controlled Application Execution (Complete)

- Milestone 5.1: Controlled Conversation Execution — Complete

- Milestone 5.2: Immutable Conversation Read Model — Complete
- Milestone 5.3: Prototype Read Model Integration — Complete
- Milestone 5.4: Immutable Execution Journal — Complete
- Milestone 5.5: Deterministic Conversation Progress Engine — Complete
- Milestone 5.6: Sprint 5 Certification — Complete

Milestone 5.1 appends an application-owned Transition Registry, Transition Validator, duplicate guard, and State Executor to the certified Sprint 4 pipeline. It implements one explicit deterministic in-memory `initialized -> intake` transition and immutable Execution Results. It introduces no persistence, networking, external integration, customer communication, authentication change, UI redesign, or real provider.

Milestone 5.2 adds an isolated, fail-closed projector that converts validated conversation snapshots and application-resolved intake context into a deeply immutable presentation contract. It derives bounded required-field progress, allowlisted next-action descriptions, and status flags without exposing state, executing transitions, authorizing customer release, or changing the existing UI.

Milestone 5.3 connects the shared in-memory controlled-execution state to the read-model projector and adapts the existing prototype session and panels to consume only a UI-safe immutable result. Raw state and execution machinery remain private, rejected execution retains the current projection, and projection failure exposes no raw fallback.

Milestone 5.4 records trusted immutable Execution Results in an isolated deterministic, append-only, process-local journal after execution. Entries contain only safe identity, revision, outcome, reason, and journal metadata; the journal has no execution, state, replay, persistence, external-action, or UI authority.

Milestone 5.5 adds an application-authoritative deterministic Progress Engine that derives one allowlisted workflow intent from validated state, explicit policy, and required-field/service context. The Conversation Read Model maps that decision to presentation data. The engine cannot mutate state or bypass the existing Transition Registry, Transition Validator, or State Executor.

Milestone 5.6 certifies Sprint 5.1 through Sprint 5.5 through evidence-based architecture, state-integrity, determinism, execution, read-model, integration, journal, regression, boundary, and documentation audits. Sprint 5 is certified complete. A separately authorized release publication may use `v0.6.0`; certification does not create or push the tag.

The complete sequence, boundaries, planned verification, and definitions of done are documented in the [Sprint 5 Plan](docs/SPRINT_5_PLAN.md).

## Sprint 6: Durable Persistence Foundation

- Milestone 6.0: Persistence Architecture and Storage Selection — Complete
- Milestone 6.1: Persistence Contracts and Repository Boundaries — Complete
- Milestone 6.2: Durable Conversation State — Complete
- Milestone 6.3: Durable Execution Journal — Complete
- Milestone 6.4: Transactional Execution and Concurrency — Complete
- Milestone 6.5: Restart-Safe Prototype Integration — Complete
- Milestone 6.6: Persistence Recovery and Failure Semantics — Complete
- Milestone 6.7: Sprint 6 Certification — Complete

Sprint 6 implements Phase 4 of the [Implementation Sequence](docs/IMPLEMENTATION_SEQUENCE.md). It adds durable, business-scoped persistence only through explicitly authorized implementation milestones while preserving the application as the authority. The complete sequence and boundaries are defined in the [Sprint 6 Plan](docs/SPRINT_6_PLAN.md).

Milestone 6.7 certifies the complete Sprint 6 persistence architecture,
revision and transaction integrity, durable journal, restart and failure
semantics, tenant isolation, migrations, regressions, and prohibited-capability
boundaries. Certification corrected incompatible migration-history handling
without adding a migration or product capability. Sprint 6 is certified
complete; at certification, Sprint 7 had not started. See
[Sprint 6 Certification](docs/certification/SPRINT6_CERTIFICATION.md).

## Sprint 7: Business Configuration

- Milestone 7.0: Business Configuration Planning — Complete
- Milestone 7.1: Configuration Contracts and Lifecycle Architecture — Complete
- Milestone 7.2: Durable Business Profile Versions — Complete
- Milestone 7.3: Durable Knowledge Versions and Lifecycle — Complete
- Milestone 7.4: Atomic Activation and Active-Configuration Resolution — Complete
- Milestone 7.5: Minimal Fictional Configuration Workflow — Complete
- Milestone 7.6: Configuration Failure, Recovery, and Isolation Verification — Complete
- Milestone 7.7: Sprint 7 Certification — Complete

Before Milestone 7.7 certification, a narrowly scoped lifecycle remediation
completes the already-approved Sprint 7 exit criterion for application-owned
draft review, knowledge approval, activation prerequisites, suspension, and
inspection without direct SQL lifecycle seeding. It adds no Sprint 8 scope.

Sprint 7 is certified complete. The certification confirms application-owned
lifecycle authority, durable exact versions, atomic activation, pinned
conversation recovery, isolation, bounded audit, suspension ineligibility, and
the complete regression matrix. See [Sprint 7 Certification](docs/certification/SPRINT7_CERTIFICATION.md).

Sprint 7 remains Phase 5 of the [Implementation Sequence](docs/IMPLEMENTATION_SEQUENCE.md). It applies the certified Sprint 6 persistence foundation to the minimum safe Business Profile and approved-knowledge lifecycle for one fictional business. Application-owned validation, authorization decisions, versioning, activation, audit, isolation, and recovery remain explicit; PostgreSQL remains subordinate infrastructure.

Milestone 7.0 defines the sequence and boundaries in the [Sprint 7 Plan](docs/SPRINT_7_PLAN.md). Milestone 7.1 adds only technology-neutral Business Profile and knowledge revision contracts, exact scope validation, immutable snapshot support, explicit lifecycle, validation, authorization, audit, repository outcomes, and focused verification. No repository implementation, migration, schema change, dependency, production authentication, public administration, provider integration, external action, end-to-end MVP work, or Milestone 7.2 implementation has started.

## Sprint 8: End-to-End MVP

**Status: Complete; certified**

Connect the validated customer-to-human workflow only after the persistence and Business Configuration phases pass their entry and exit criteria. Communication and AI providers remain subject to separate technical and business evaluation.

Milestone 8.0 defines the proposed internal fictional MVP sequence, authority
boundaries, provider decision gate, persistence gap decision, acceptance
criteria, and verification strategy in the [Sprint 8 Plan](docs/SPRINT_8_PLAN.md)
and [Sprint 8 Test Plan](docs/SPRINT_8_TEST_PLAN.md). It adds documentation only.
Sprint 8 does not authorize production release, real customer data,
authentication, communication channels, or external business actions.

Milestone 8.1 adds only the internal technology-neutral contracts and
application preparation boundary for one exact fictional start or resume
turn. It reuses activated configuration, durable pin recovery, deterministic
progress, and handoff derivation without message processing or persistence,
provider integration, state execution, customer release, UI work, migration,
schema change, or dependency change.

Milestone 8.2 adds bounded transient context assembly after exact activated
configuration and durable conversation recovery. It includes the pinned
Business Profile, exact state revision, untrusted current input, and only
activation-bound, active, effective, customer-eligible knowledge. Exact
grounding validation preserves complete source provenance and denies release.
It adds no multi-turn execution, message persistence, provider, UI, migration,
schema change, dependency, production release, or external action.

Milestone 8.3 adds the smallest transient deterministic multi-turn workflow
over the exact activated context. Existing application/domain authorities own
ordered intake, clarification, correction, confirmation, escalation,
completion, grounded candidates, progress, and derived handoff. Exact scope,
revision, message sequence, and duplicate checks fail closed. It adds no
durable turn/message evidence, migration, dependency, provider, UI, release,
external action, or Milestone 8.4 behavior.

Milestones 8.4 through 8.8 complete durable turn/message persistence and
restart, the bounded internal fictional experience, provider evaluation and
deferral, integrated failure/security/recovery verification, and Sprint 8
certification. See the [Sprint 8 Certification](docs/certification/SPRINT8_CERTIFICATION.md).

## Sprint 9: Customer Validation and Hardening

**Status: Planning complete; Milestone 9.1 Not Started**

- Real-world testing
- Reliability improvements
- Usability improvements
- Security review
- Bug fixes
- Customer feedback

Sprint 9 implements Phase 7 of the
[Implementation Sequence](docs/IMPLEMENTATION_SEQUENCE.md): prepare the
validated MVP for a separately authorized controlled-production evaluation.
It does not itself authorize launch, real customer data, customer response
release, a provider, a communication channel, or an external action. The
milestone gates are defined in the [Sprint 9 Plan](docs/SPRINT_9_PLAN.md) and
[Sprint 9 Test Plan](docs/SPRINT_9_TEST_PLAN.md).

## Future Features (Uncommitted)

The following are possibilities, not current development commitments:

- Scheduling
- Automated follow-up
- Calendar integrations
- Additional communication channels
- Analytics
- Additional AI employee roles
- Authentication and protected business administration when real business-user workflows require them
