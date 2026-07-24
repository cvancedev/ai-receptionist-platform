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

Future persistence will be required for businesses, profile versions, services, knowledge sources, conversations, state, messages, corrections, escalations, handoffs, audit events, and prompt/context versions. Phase 1 uses in-memory fictional state; no database is selected.

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

| Decision | Remains deferred until |
| --- | --- |
| AI provider and model | A later approved implementation milestone, after provider-neutral context, task, output, failure, and evaluation architecture is complete |
| Database | Phase 4, after in-memory domain behavior proves persistence requirements |
| Authentication provider | A later sprint requiring real business users and administration |
| Hosting architecture | End-to-end MVP planning when runtime, security, and persistence needs are known |
| Embedding system or vector database | Only if Knowledge Retrieval testing proves simpler structured retrieval insufficient |
| Queue system | When durable asynchronous handoff or processing requirements are demonstrated |
| Monitoring vendor | Phase 7 production hardening, after required signals are defined |
| SMS, voice, or email provider | When the corresponding validated communication channel enters scope |

No vendor is selected merely to complete the architecture.

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

## MVP Boundary

The MVP receives an inquiry, understands the general request, gathers required information, confirms understanding, preserves corrections, explains approved next steps, escalates appropriately, and produces a complete human handoff. It is not a CRM, scheduler, payment system, phone system, marketing platform, general automation suite, autonomous employee, or industry-specific application.

## Sprint 4 Architecture Status

Milestones 4.1 through 4.4 define architecture only. Raw output is normalized then validated structurally and semantically for scope, authority, task, profile, state, grounding, safety, and duplicates before deterministic decision. The application alone constructs typed operations and approves release. Existing `ContextBuilder`, `OutputValidator`, and proposal validation code remain certified deferred/placeholder Sprint 3 boundaries, not Milestone 4.4 implementation. No production parser, schema, validator, operation builder, release gate, retry engine, provider, model, API, networking, persistence, authentication, or observability is added. See [Model Output Validation Architecture](MODEL_OUTPUT_VALIDATION_ARCHITECTURE.md) and [Sprint 4 Plan](SPRINT_4_PLAN.md). Sprint 4.5 has not started.
