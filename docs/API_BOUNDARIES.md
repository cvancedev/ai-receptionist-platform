# API Boundaries

## Purpose

These are conceptual service boundaries, not endpoints, HTTP methods, framework handlers, or implementation authorization.

## Customer Conversation Boundary

Conceptual operations: start a conversation, send a customer message, retrieve authorized conversation status, receive a customer-facing response, and request human assistance.

## Conversation Orchestration Boundary

Processes one conversation turn. Inputs may include business identity, conversation identity, latest message, channel context, and an idempotency reference. Outputs may include the authorized response, validated state revision, requested action, escalation, completion, and traceability metadata.

## Business Profile Boundary

Conceptual operations: retrieve active profile, validate profile, create draft revision, review revision, activate validated revision, and suspend profile.

## Knowledge Boundary

Conceptual operations: submit, review, activate, retrieve eligible, suspend, supersede, and inspect source history. Retrieval always requires business, audience, time, and context scope.

## Model Gateway Boundary

Conceptual input: a provider-neutral request containing request identity, validated business and conversation scope, profile version, application-selected task type, approved context package, output-contract version, model policy, timeout policy, retry eligibility, and trace metadata.

Conceptual output: normalized raw result, provider and model execution metadata, usage, finish information, or an explicit result category such as success, refusal, invalid output, timeout, rate limited, unavailable, authentication failure, policy blocked, cancelled, or unknown failure.

The gateway cannot choose business, profile, permissions, knowledge, authoritative state, deterministic task, customer response, or action authority. Provider success is not proposal validation or application acceptance.

## Provider Adapter Boundary

Conceptual input: one approved provider-neutral request plus the provider and model selected through application policy. Conceptual output: normalized provider response, usage, finish reason, cancellation status, or error.

Provider-specific SDK types and behavior remain inside the adapter. The adapter cannot contain business logic, select another provider, broaden context, mutate state, send customer messages, or hide failures.

## Model Output Validation Boundary

Input: raw normalized output, selected task and output contract, current validated state and revision, and permitted context provenance. Output: validated proposal parts and explicit rejection reasons.

Validation cannot apply state or release a response. Invalid, stale, cross-business, unsafe, unsupported, or improperly grounded output fails closed.

## Application Decision Boundary

Input: current authoritative state, deterministic task, gateway result, and validation result. Output: accept, partial accept, modify, clarification, bounded retry, deterministic fallback, escalation, or rejection.

Only approved typed operations may pass from this boundary to the Conversation State Manager. Only approved customer-facing content may pass to a channel.

## Handoff Boundary

Conceptual operations: create, retrieve, assign destination, mark acknowledged, and record follow-up outcome. Destinations must belong to the active business.

## Administrative Boundary

Future authorized operations manage profile and knowledge drafts, reviews, activation, suspension, and history. This boundary is outside Sprint 3's first slice.

## Security Requirements

Every boundary must address:

- Business and conversation scope
- Authentication and authorization when those capabilities enter scope
- Input and output validation
- Rate limiting when exposed beyond local prototype use
- Auditability
- Idempotency for repeatable mutations
- Explicit failure behavior
- Revision or concurrency safety where state changes
- No cross-business leakage
- Least necessary data return

## Failure Contract

Boundaries should return explicit identity, eligibility, validation, conflict, unavailable, timeout, and authorization outcomes rather than defaulting, guessing, or partially mutating state. Technology-specific error formats, providers, models, protocols, routes, and serialization remain deferred.

## Current Milestone Boundary

These are architecture boundaries only. No endpoints, API routes, provider calls, adapters, networking, authentication, persistence, retries, or streaming are implemented in Sprint 4, Milestone 4.1.
