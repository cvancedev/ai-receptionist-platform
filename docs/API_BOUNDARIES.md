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

Input: validated context package and output requirements. Output: normalized model proposal, provider metadata, or failure information. The gateway cannot choose business, profile, permissions, knowledge, state, task, or action authority.

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

Boundaries should return explicit identity, eligibility, validation, conflict, unavailable, timeout, and authorization outcomes rather than defaulting, guessing, or partially mutating state. Technology-specific error formats are deferred.
