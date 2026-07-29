# Sprint 5 Plan

## Purpose

Sprint 5 establishes controlled, deterministic conversation progression inside the application's own process-local, in-memory authority boundary.

By the end of Sprint 5, the platform should be able to:

- accept validated application decisions;
- execute explicitly permitted internal state transitions;
- expose immutable conversation projections;
- integrate those projections safely with the fictional prototype;
- record immutable execution audit history; and
- deterministically derive the next permitted workflow intent.

Sprint 5 does not authorize persistence, external networking, real model providers, customer communication, customer-release authority, scheduling, CRM integration, or external business action execution.

## Governing Principles

- The application remains authoritative. AI output is advisory.
- Conversation State remains authoritative for current state.
- The Transition Registry, Transition Validator, and State Executor remain authoritative for controlled mutation.
- The Conversation Read Model remains a read-only presentation boundary.
- The Execution Journal remains an append-only observer, not an executor or state source.
- Unknown, malformed, contradictory, stale, duplicate, or unauthorized inputs fail closed.
- Every milestone must preserve deterministic behavior and the prohibited-capability boundary.

## Milestone 5.1 — Controlled Conversation Execution

**Status: Complete**

Milestone 5.1 added one explicit immutable `initialized -> intake` transition, a fail-closed Transition Validator, process-local duplicate protection, a deterministic State Executor, and deeply immutable Execution Results.

The model-facing Application Decision continues to deny direct mutation and customer release. Only the application-owned execution boundary may submit a registered typed transition to the in-memory Conversation State Manager.

See [State Execution Architecture](STATE_EXECUTION_ARCHITECTURE.md).

## Milestone 5.2 — Immutable Conversation Read Model

**Status: Complete**

Milestone 5.2 added a deterministic, fail-closed projector that converts a validated Conversation State snapshot and application-resolved context into a deeply immutable presentation contract.

The read model exposes copied identity, progress, facts, corrections, missing fields, questions, escalation/completion status, and a descriptive recommended action. It has no mutation, execution, provider, persistence, networking, callback, or customer-release capability.

See [Conversation Read Model](CONVERSATION_READ_MODEL.md).

## Milestone 5.3 — Prototype Read-Model Integration

**Status: Complete**

Milestone 5.3 connected the prototype session's shared in-memory Conversation State Manager to controlled execution and read-model projection.

The UI receives only the immutable read model and safe copied decision/execution summaries. It receives no raw Conversation State, State Manager, State Executor, transition request, provider, or side-effecting capability.

See [Prototype Read Model Integration](PROTOTYPE_READ_MODEL_INTEGRATION.md).

## Milestone 5.4 — Immutable Execution Journal

**Status: Complete**

Milestone 5.4 added a deterministic, append-only, process-local Execution Journal after immutable Execution Result creation.

Journal entries contain bounded safe audit metadata rather than raw state, prompts, model output, or arbitrary customer input. The journal cannot validate, authorize, execute, replay, retry, persist, or mutate anything.

See [Immutable Execution Journal](EXECUTION_JOURNAL.md).

## Milestone 5.5 — Deterministic Conversation Progress Engine

**Status: Planned**

### Objective

Introduce an application-authoritative, deterministic progress engine that derives what the conversation should do next from validated conversation state and explicit application policy.

The AI remains advisory. Model output cannot select, broaden, replace, or override workflow authority.

### Conceptual Flow

```text
validated Conversation State
  + explicit Application Policy
  + required-field and service context
  -> Deterministic Conversation Progress Engine
  -> allowlisted Progress Decision
  -> existing controlled execution architecture
```

The Progress Engine answers:

> What should the deterministic application attempt next?

It does not answer:

> How should state be mutated?

Mutation authority remains with the Transition Registry, Transition Validator, State Executor, and Conversation State Manager. A Progress Decision is not a transition identifier, execution request, state operation, customer message, or release authorization.

### Planned Input and Policy Boundary

The implementation must define an explicit immutable input contract containing only the information required to evaluate progress, including:

- validated conversation identity, stage, and revision;
- application-resolved service status;
- application-resolved required-field identifiers;
- confirmed-fact presence needed for completeness checks;
- missing required fields;
- correction-aware state needed to identify reopened requirements;
- clarification requirements;
- escalation state;
- completion eligibility; and
- explicit versioned deterministic application policy.

The engine must not accept raw model output, prompts, arbitrary provider metadata, unvalidated state, mutable state-manager references, executors, callbacks, or external capabilities.

Input validation must fail closed when identity, revision, stage, policy, required-field context, service context, or internally consistent progress facts cannot be established.

### Planned Responsibilities

The engine is responsible only for deterministic evaluation of:

- conversation stage;
- service-resolution state;
- required-field completeness;
- missing required fields;
- correction-aware reopened requirements;
- clarification requirements;
- escalation state;
- completion eligibility; and
- existing deterministic application policy.

The engine may select one allowlisted workflow intent. It may not construct arbitrary state operations, invent transitions, mutate state, execute a transition, communicate with customers, release content, persist data, or invoke a business action.

### Planned Progress-Decision Vocabulary

The existing Conversation Read Model uses this descriptive recommended-action vocabulary:

- `begin_intake`
- `ask_required_field`
- `clarify_service`
- `review_escalation`
- `intake_complete`
- `none`

Sprint 5.5 will align Progress Decisions with these exact string values, but the architectural contracts remain distinct:

- a **Conversation Read Model action** is a descriptive presentation projection with no authority;
- a **Progress Decision** is an application-owned deterministic workflow intent with no mutation authority; and
- a **transition identifier** is a registry-owned executable transition identity that still requires validation.

A separate Progress Decision type is justified because the application layer must not depend on a presentation contract for workflow authority. The implementation should define an explicit, exhaustively verified mapping between the Progress Decision vocabulary and the read-model recommendation vocabulary rather than creating additional synonymous values.

The planned decision meanings are:

| Progress Decision | Deterministic meaning |
| --- | --- |
| `begin_intake` | The validated initialized conversation is eligible to attempt the existing registered intake transition. |
| `ask_required_field` | Intake remains incomplete and an application-resolved required field must be gathered. |
| `clarify_service` | Service resolution is absent or ambiguous and deterministic clarification is required. |
| `review_escalation` | Existing escalation state requires application or human review before routine progression. |
| `intake_complete` | Application completion rules are satisfied or the validated state is already at completion/handoff. |
| `none` | No permitted workflow intent applies, including explicitly terminal or abandoned conditions. |

`none` is a valid decision for a validated state with no applicable action. It must not be used as a fallback for malformed or contradictory input; those inputs require a fail-closed validation result.

### Planned Decision Precedence

The implementation must document and verify an explicit precedence order. At minimum, it must ensure:

1. malformed or contradictory input fails closed before decision selection;
2. escalation requirements cannot be bypassed by routine intake progression;
3. completion cannot be inferred until application completion rules pass;
4. service ambiguity produces clarification rather than field collection;
5. optional facts never satisfy required-field completeness;
6. correction-reopened requirements remain missing until deterministically resolved; and
7. initialized conversations cannot skip the registered controlled-execution boundary.

The exact precedence must be derived from current validated domain rules during implementation and must not be inferred from model content.

### Relationship to Controlled Execution

The Progress Engine does not directly call the State Executor.

Any future execution resulting from a Progress Decision must:

1. map the allowlisted decision to an explicitly registered transition, if one exists;
2. construct a canonical execution request through application-owned code;
3. pass current scope, revision, decision, proposal, policy, and duplicate validation;
4. execute only through the existing State Executor; and
5. produce the existing immutable Execution Result and journal outcome.

Sprint 5.5 does not authorize a new transition. The current registry remains limited to `initialized -> intake`.

### Strict Prohibitions

Milestone 5.5 must not introduce:

- persistence or database access;
- filesystem, browser, or cookie storage;
- external networking or external business APIs;
- real model providers;
- email, SMS, telephony, or other customer communication;
- scheduling or CRM integration;
- background workers;
- customer-release authorization;
- journal replay;
- retries;
- arbitrary model-generated actions;
- direct state mutation from a Progress Decision; or
- unrelated UI redesign.

### Planned Verification

The focused Sprint 5.5 verification must prove:

- identical validated state and policy input produces equivalent Progress Decisions;
- only allowlisted Progress Decisions can be produced;
- malformed or contradictory input fails closed;
- missing required fields are handled deterministically;
- optional facts cannot satisfy required fields;
- service ambiguity produces deterministic clarification behavior;
- escalation state is respected;
- completion is never inferred without satisfying application rules;
- correction-reopened requirements are preserved;
- AI output cannot override Progress Decisions;
- Progress Decisions cannot mutate state directly;
- Progress Decisions cannot bypass transition validation;
- the current transition registry remains unchanged;
- existing Execution Journal behavior remains intact;
- the existing Conversation Read Model remains immutable;
- customer release remains unauthorized; and
- prohibited capabilities remain absent.

All Sprint 3, Sprint 4, and Sprint 5.1–5.4 verification suites must continue to pass.

### Definition of Done

Milestone 5.5 is complete only when:

- typed Progress Engine input, policy, decision, validation, and result contracts exist;
- the deterministic evaluator is implemented;
- policy and input ownership boundaries are explicit;
- validation fails closed for malformed or contradictory input;
- the allowlist and precedence rules are exhaustive and documented;
- the read-model recommendation mapping is explicit and verified;
- focused verification covers deterministic, failure, authority, and prohibited-capability boundaries;
- implementation and architecture documentation are current;
- every existing regression suite passes;
- lint, TypeScript validation, production build, Markdown links, and diff checks pass;
- no prohibited capability is introduced;
- exactly one scoped commit is created for Sprint 5.5;
- no release tag is created; and
- Sprint 5.6 certification has not started.

## Milestone 5.6 — Sprint 5 Certification

**Status: Planned**

### Objective

Certify Sprint 5.1 through Sprint 5.5 as one coherent controlled-conversation architecture before any later milestone expands system authority.

Certification is evidence-based and adds no product functionality.

### Planned Certification Scope

Certification must include:

- architecture audit;
- state-integrity audit;
- deterministic-progress audit;
- execution-boundary audit;
- Conversation Read Model audit;
- prototype-integration audit;
- Execution Journal audit;
- regression audit;
- prohibited-capability scan;
- documentation review; and
- the full repository validation suite.

Every certification claim must identify implementation evidence, verification evidence, residual limitations, and a PASS or FAIL result. Historical Sprint 4 certification remains unchanged.

### Allowed Decisions

The final certification must use exactly one conclusion:

- `CERTIFIED`
- `CERTIFIED WITH DOCUMENTED LIMITATIONS`
- `NOT CERTIFIED`

Certification must not be automatic. Process-local state, duplicate protection, and journal storage; non-atomic execution and journaling; deterministic fictional mock AI; the explicit transition allowlist; absent customer-release authority; and absent external integrations are expected limitations unless Sprint requirements change.

### Release Boundary

If certification passes, Sprint 5 may be proposed for release publication as `v0.6.0`.

Certification does not create or push the tag. Release publication requires separate authorization after the certification commit has been reviewed.

### Definition of Done

Milestone 5.6 is complete only when:

- every Sprint 5.1–5.5 requirement is traced to evidence;
- all planned audits are complete;
- all applicable verification and production-build checks pass;
- documentation accurately describes implemented behavior and limitations;
- one evidence-supported certification decision is recorded;
- exactly one scoped Sprint 5 certification commit is created;
- no product authority is expanded; and
- no tag is created or pushed.

## Sprint 5 Completion Boundary

Sprint 5 completion proves controlled, deterministic in-memory conversation progression. It does not prove production readiness.

Even after successful certification, the system must still stop before:

- persistence;
- external networking;
- real model providers;
- customer communication;
- customer-release authorization;
- scheduling;
- CRM integration; and
- external business action execution.

Any later expansion of these boundaries requires its own explicit milestone, architecture, validation, and authorization.
