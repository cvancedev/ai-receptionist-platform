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

## Sprint 6: AI Receptionist MVP

- Receive a customer interaction through the chosen communication provider
- Gather required customer details
- Produce a structured summary
- Create a lead
- Notify the business owner
- Support clear escalation or human handoff

Communication and AI providers will be selected only after technical and business evaluation.

## Sprint 7: Customer Validation

- Real-world testing
- Reliability improvements
- Usability improvements
- Security review
- Bug fixes
- Customer feedback

## Future Features (Uncommitted)

The following are possibilities, not current development commitments:

- Scheduling
- Automated follow-up
- Calendar integrations
- Additional communication channels
- Analytics
- Additional AI employee roles
- Authentication and protected business administration when real business-user workflows require them
