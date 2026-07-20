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

Assembles a business-scoped context package using versioned platform rules, behavior rules, profile configuration, approved knowledge, structured state, relevant history, current task, customer input, and output requirements. It fails closed on unsafe ambiguity.

## Model Gateway

Provides a provider-independent boundary. It receives a validated package, calls a configured provider, returns normalized raw output and failure metadata, and handles timeouts. It never mutates state or selects tenant, profile, knowledge, permissions, or authority.

## Output Validator

Checks allowed action, business scope, stage, knowledge support, unsupported promises, restricted content, state consistency, correction handling, escalation, and completion. It authorizes, rejects, or routes controlled repair; it does not trust model labels by themselves.

## Handoff Builder

Creates a concise human-readable handoff from validated state, including intent, service, confirmed details, corrections, concerns, missing information, contradictions, escalation, priority, and next action.

## Audit Recorder

Records material decisions and versions: business, profile, state, knowledge, prompt/context components, model proposal, validation result, applied changes, escalation, and handoff.

## Configuration Administration

A future component will let authorized business staff manage profiles and knowledge through draft, review, validation, activation, suspension, and history. Administration UI is outside the first implementation slice; Sprint 3 uses fictional fixtures.

## Customer Chat Experience

Presents authorized messages, accepts customer input, manages accessible interaction states, and displays completion or escalation. It does not contain conversation policy or business rules.

## Component Rule

Components may recommend or derive information only within their boundary. The Application Layer coordinates final authority, and tenant scope is validated at every boundary rather than assumed from upstream callers.
