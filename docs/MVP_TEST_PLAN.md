# MVP Test Plan

## Unit Testing

Test profile and knowledge eligibility, state transitions, corrections, question selection, completion, escalation, output validation, handoff generation, and tenant-scope validation. Each rule should include valid, invalid, missing, conflicting, and boundary cases.

## Integration Testing

Test profile loading, knowledge retrieval, context assembly, Model Gateway normalization, output validation, state persistence, handoff creation, audit recording, and failure handling across component boundaries.

## End-to-End Testing

Cover a successful new inquiry, ambiguous inquiry, unsupported service, customer correction, missing required information, human request, unavailable or conflicting knowledge, customer departure, escalation, and completed handoff.

## Security Testing

Cover cross-business profile and conversation access, prompt injection, restricted-knowledge requests, invalid output, business identity mismatch, manipulated state, unauthorized configuration changes, and cross-tenant handoff destinations.

## Reliability Testing

Cover model timeout, provider failure, invalid response format, duplicate customer message, repeated processing request, retrieval failure, profile suspension mid-conversation, partial state failure, and safe retry/idempotency behavior.

## Accessibility Testing

Verify keyboard navigation, screen-reader labels, focus management, message announcements, accessible loading and error states, mobile usability, contrast, and readable text.

## Acceptance Criteria

The MVP is acceptable when:

- The customer receives a clear, professional response and next step.
- Required information is gathered without unnecessary repetition.
- Corrections replace prior information and survive handoff.
- Unsupported claims and restricted disclosures are blocked.
- Human requests and escalation triggers are honored.
- Handoffs contain actionable confirmed context plus visible gaps.
- Cross-business data isolation holds at every tested boundary.
- Model or provider failure does not corrupt conversation state.
- Completion cannot occur with unresolved blockers.
- Material business answers remain source-traceable.
- The core workflow passes accessibility review.

## Test Order

1. Deterministic domain unit tests
2. Component contract and integration tests with mocks
3. State persistence and isolation tests when persistence enters scope
4. End-to-end fictional workflow tests
5. Model contract and adversarial tests
6. Reliability, accessibility, performance, and release regression

Real customer data is not required to prove these properties.
