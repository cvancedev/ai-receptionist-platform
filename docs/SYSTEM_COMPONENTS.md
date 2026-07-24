# System Components

## Business Resolver

Determines which business owns an interaction. Missing, ambiguous, or conflicting identity blocks processing and must never fall back to another tenant.

## Business Profile Service

Loads the exact active validated profile version and exposes only configuration applicable to the interaction. It does not activate drafts implicitly.

## Knowledge Service

Provides only active, approved, current, relevant, audience-permitted, business-scoped knowledge with source and version traceability. It returns explicit missing or conflict outcomes.

## Conversation State Manager

Maintains lifecycle, confirmed facts, customer claims, corrections, missing information, intent, service, asked questions, escalation, completion, and state revision. It applies only validated transitions.

## Conversation Orchestrator

Coordinates one customer turn:

1. Validate business and conversation identity.
2. Load the active profile.
3. Load current state.
4. Determine the current stage.
5. Retrieve applicable knowledge.
6. Assemble and validate context.
7. Call mocked behavior or the future Model Gateway.
8. Validate the model proposal.
9. Apply allowed state changes.
10. Produce the authorized customer response.
11. Create escalation or handoff records when required.
12. Record traceability.

It owns transaction-level coordination; individual services retain their validation responsibilities.

## Context Builder

Conceptually coordinates the application-owned Context Assembly pipeline for one approved task. It validates business, conversation, profile version, and state revision; selects only eligible sources; projects task-relevant state; filters sensitive data; reduces history and knowledge under application budgets; orders authority deterministically; validates the package; and records provenance.

The model cannot select sources. Released packages are immutable, provider-neutral, and advisory-model input only. The existing component is a deferred interface, not an implementation. See [Context Assembly Architecture](CONTEXT_ASSEMBLY_ARCHITECTURE.md).

## Task Registry

Conceptually validates application-selected task identifiers, versions, MVP allowlist status, compatible context profiles, output contracts, and provider policy. Unknown or deferred tasks fail before composition. No registry is implemented.

## Prompt Composer

Conceptually combines one approved task, validated Context Package, application authority, explicit permissions/prohibitions, compatible output-contract reference, response-style policy, and version metadata into a validated provider-neutral Prompt Package. It cannot select tasks or sources, reinterpret business policy, or promote data into instructions. No Prompt Composer or production prompt exists. See [Prompt Composition Pipeline](PROMPT_COMPOSITION_PIPELINE.md).

## Model Gateway

Provides a provider-independent execution boundary. It receives a validated provider-neutral request, application-approved task and model policy, enforces allowlists and execution limits, routes through one approved Provider Adapter, and returns normalized raw output, usage metadata, or explicit failure information.

It never mutates state or selects tenant, profile, knowledge, permissions, deterministic task, or application authority. The current `MockModelGateway` performs no AI or networking and is not the future production implementation.

## Provider Adapter

Translates one provider-neutral request into one approved provider format and normalizes provider responses, usage, finish reasons, and errors. Provider-specific SDK types stop at this boundary.

An adapter contains no business logic, does not choose providers or models, cannot broaden context or permissions, and cannot release messages or perform state changes. No adapter or provider is selected.

## Output Validator

Parses and checks proposal structure, task type, business and conversation scope, stage, knowledge support, unsupported promises, restricted content, state consistency, correction handling, escalation, completion, and prohibited operations. It returns validation results; it does not trust model or provider labels.

The future boundary is layered across contract-aware inert parsing, structural, scope, proposal, permission/prohibition, semantic, state, profile, grounding, customer-text, and duplicate validation. The existing `OutputValidator` interface and Sprint 3 proposal validator are deferred/placeholder prototype boundaries, not this implementation. See [Model Output Validation Architecture](MODEL_OUTPUT_VALIDATION_ARCHITECTURE.md).

Milestone 4.5 implements these concepts in an isolated `src/ai` prototype rather than replacing existing Sprint 3 components. `AiFoundationPrototypeOrchestrator` coordinates fictional fixtures through a mock adapter and returns an immutable no-effect snapshot.

## Application Decision Layer

Evaluates validated proposals against current deterministic state and may accept, partially accept, modify, request clarification, retry under policy, use deterministic fallback, escalate, or reject. Only this application-owned layer may authorize typed state operations or customer-response release.

Future partial acceptance requires explicit contract support. A general Typed Operation Builder and Response Release Gate remain separate conceptual components and are not implemented. See [Proposal Decision and Application](PROPOSAL_DECISION_AND_APPLICATION.md) and [Customer Response Release](CUSTOMER_RESPONSE_RELEASE.md).

## State Executor

Milestone 5.1 implements a narrow deterministic in-memory execution boundary. The immutable Transition Registry defines one explicit `initialized -> intake` transition. The Transition Validator requires a valid accepted decision, approved task/proposal/contract, exact scope and revision, legal current state, policy compatibility, and a unique execution identity. The State Executor contains no business rules; after validation, it delegates one typed stage update to the existing Conversation State Manager and returns an immutable Execution Result.

Raw output, parsed but unvalidated proposals, malformed or rejected decisions, unknown tasks/proposals/transitions, stale state, illegal transitions, and duplicate executions fail closed without mutation. See [State Execution Architecture](STATE_EXECUTION_ARCHITECTURE.md).

## Handoff Builder

Creates a concise human-readable handoff from validated state, including intent, service, confirmed details, corrections, concerns, missing information, contradictions, escalation, priority, and next action.

## Audit Recorder

Records material decisions and versions: request and trace identity, business, profile, state, task, context sources, provider policy, normalized result, usage, model proposal, validation, application decision, applied changes, fallback, escalation, response release, and handoff. Audit persistence remains deferred.

## Configuration Administration

A future component will let authorized business staff manage profiles and knowledge through draft, review, validation, activation, suspension, and history. Administration UI is outside the first implementation slice; Sprint 3 uses fictional fixtures.

## Customer Chat Experience

Presents authorized messages, accepts customer input, manages accessible interaction states, and displays completion or escalation. It does not contain conversation policy or business rules.

## Component Rule

Components may recommend or derive information only within their boundary. The Application Layer coordinates final authority, and tenant scope is validated at every boundary rather than assumed from upstream callers.

Partial or streamed model output cannot mutate state, activate escalation, determine completion, or trigger external actions. AI-free deterministic behavior remains available whenever the AI Integration Layer is unavailable or ineligible.
