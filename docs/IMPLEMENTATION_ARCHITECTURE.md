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

## Planned Sprint 5.5 Progress Engine

Milestone 5.5 is planned as an application-authoritative deterministic evaluator over validated Conversation State, explicit application policy, and required-field/service context. It will produce one allowlisted Progress Decision describing what the application should attempt next.

A Progress Decision will not be a state operation, transition identifier, execution request, customer message, or release authorization. Any resulting mutation must still pass through the existing Transition Registry, Transition Validator, State Executor, and Conversation State Manager. Milestone 5.6 will then certify Sprint 5.1 through Sprint 5.5 without adding product functionality. See the [Sprint 5 Plan](SPRINT_5_PLAN.md).
