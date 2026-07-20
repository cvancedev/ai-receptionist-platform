# Implementation Sequence

## Strategy

Build small vertical slices that produce observable customer and handoff outcomes. Do not build every infrastructure layer independently before validating the workflow.

## Phase 1: Local Conversation Prototype

- **Goal:** Prove the smallest end-to-end conversation shape without persistence or production AI.
- **Scope:** One fictional profile, small static knowledge set, in-memory state, deterministic mocked output, basic chat, state and handoff inspection.
- **Deliverables:** Local fictional inquiry from greeting to visible handoff.
- **Non-goals:** Authentication, database, provider, real users, configuration UI, deployment.
- **Entry criteria:** Sprint 2 architecture complete and fixtures approved as fictional.
- **Exit criteria:** One inquiry completes without modifying the public website behavior or using real data.
- **Testing:** Basic unit checks, walkthrough, accessibility smoke test, lint, TypeScript, build.

## Phase 2: Deterministic Conversation Engine

- **Goal:** Prove core correctness independently of model behavior.
- **Scope:** Lifecycle, required fields, corrections, question history, intent/service path, completion, escalation, and handoff generation.
- **Deliverables:** Deterministic domain behavior exercised by fixtures and tests.
- **Non-goals:** Real model, persistence, multi-tenant administration.
- **Entry criteria:** Phase 1 reveals a viable inquiry and handoff path.
- **Exit criteria:** State changes and outcomes pass defined unit and scenario tests without model judgment.
- **Testing:** State transitions, corrections, repetition, escalation, completion, tenant-scope inputs, handoff output.

## Phase 3: Model Gateway Prototype

- **Goal:** Evaluate whether a model can add useful language and interpretation without controlling rules.
- **Scope:** Provider-independent interface, one development adapter after evaluation, context assembly, output normalization, validation, rejection, and mocked fallback.
- **Deliverables:** Model proposals pass through the same deterministic validator.
- **Non-goals:** Production provider commitment, autonomous effects, broad prompt optimization.
- **Entry criteria:** Output contract and deterministic rules are executable and tested.
- **Exit criteria:** Invalid proposals cannot mutate state; comparison scenarios demonstrate measurable value.
- **Testing:** Contract, timeout, invalid output, injection, knowledge grounding, regression, and provider-failure paths.

## Phase 4: Persistence

- **Goal:** Make validated state durable using requirements proven by earlier phases.
- **Scope:** Profiles, knowledge, conversations, messages, state, handoffs, and audit records.
- **Deliverables:** Selected storage design, migrations, repositories, revision controls, and recovery behavior.
- **Non-goals:** Full administration suite or unrelated analytics.
- **Entry criteria:** Domain objects and access patterns are stable enough to evaluate databases.
- **Exit criteria:** Restart-safe flows preserve isolation, corrections, traceability, and idempotency.
- **Testing:** Persistence integration, concurrency, recovery, tenant isolation, migration, and failure atomicity.

## Phase 5: Business Configuration

- **Goal:** Replace fixtures with the minimum safe workflow for one business profile and knowledge set.
- **Scope:** Draft, validate, review, activate, suspend, and inspect essential configuration.
- **Deliverables:** Minimal authorized configuration path and lifecycle validation.
- **Non-goals:** Full administration suite, bulk import, complex role management, industry library.
- **Entry criteria:** Persistence and validation boundaries are proven.
- **Exit criteria:** One business can safely activate configuration without direct data manipulation.
- **Testing:** Lifecycle, invalid configuration, audience, stale knowledge, permissions, and audit history.

## Phase 6: End-to-End MVP

- **Goal:** Connect the validated customer-to-human workflow.
- **Scope:** Chat, active profile, approved knowledge, engine, selected provider, output validation, persistence, and handoff.
- **Deliverables:** Working MVP meeting [MVP Requirements](MVP_REQUIREMENTS.md).
- **Non-goals:** CRM, scheduling, payments, phone, broad integrations, autonomous quoting.
- **Entry criteria:** Earlier components pass isolation and contract tests.
- **Exit criteria:** MVP acceptance scenarios pass with actionable handoffs and safe provider failures.
- **Testing:** Full unit, integration, end-to-end, security, reliability, and accessibility plan.

## Phase 7: Hardening

- **Goal:** Prepare the validated MVP for controlled production evaluation.
- **Scope:** Security, tenant isolation, prompt injection, failure recovery, observability, accessibility, performance, and production configuration.
- **Deliverables:** Risk review, operational runbooks, monitored failure paths, and release recommendation.
- **Non-goals:** Feature expansion unrelated to validated MVP reliability.
- **Entry criteria:** End-to-end MVP meets functional acceptance criteria.
- **Exit criteria:** Critical risks have tested controls and accountable owners.
- **Testing:** Adversarial, load appropriate to expected use, recovery, accessibility, security, and regression suites.

## Sequencing Guardrails

- A phase starts only when its entry criteria are met.
- Findings may narrow later scope; they do not automatically authorize expansion.
- Mocked behavior remains available for deterministic testing after provider integration.
- Provider and database selection occur only at their documented point of need.
