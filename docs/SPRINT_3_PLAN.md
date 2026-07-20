# Sprint 3 - Conversation Prototype

## Sprint Goal

Build a local, non-production prototype proving that the documented Conversation Engine can process a fictional customer inquiry using one fictional Business Profile, one small approved knowledge fixture, in-memory state, mocked model behavior, a basic customer chat experience, and a visible structured handoff summary.

## Proposed Milestones

## Milestone 3.1: Prototype Foundation

- Define only implementation folders justified by the prototype.
- Add minimal domain types.
- Create fictional profile and approved-knowledge fixtures.
- Preserve the existing public validation website.

## Milestone 3.2: Conversation State Prototype

- Initialize a conversation.
- Track stage, confirmed and missing fields, corrections, and questions already asked.
- Keep state business-scoped and inspectable.

## Milestone 3.3: Deterministic Intake Flow

- Resolve one simple configured service.
- Ask required questions and skip answered fields.
- Apply corrections and completion rules.
- Produce a validated handoff summary.

## Milestone 3.4: Prototype Chat Interface

- Add basic customer input and conversation display.
- Add accessible loading and error states.
- Display completion, escalation, and handoff outcomes.

## Milestone 3.5: Prototype Certification

- Run unit tests and an end-to-end walkthrough.
- Complete accessibility and build checks.
- Synchronize documentation and create a certification record.
- Produce a release recommendation without implying production readiness.

## Explicit Sprint 3 Non-Goals

- No production AI provider
- No authentication or database
- No multi-tenant administration
- No payments, phone, SMS, email, or scheduling integration
- No production deployment requirement
- No real customer data
- No broad industry library
- No autonomous quoting
- No full CRM

## Sprint 3 Completion Standard

Sprint 3 is complete when a fictional customer can complete a structured inquiry through a basic local interface and the application produces a correct, validated handoff summary without a real AI provider.

## Sprint Risks

- Keep UI work subordinate to proving state and handoff correctness.
- Do not add infrastructure to simulate future scale.
- Keep fixtures visibly fictional and outside platform-core logic.
- Treat mocked model output as proposals subject to the same validator planned for real models.
- Stop and reassess if the prototype requires bypassing Sprint 2 boundaries.

Sprint 3 is planned here but does not begin during Milestone 2.7.
