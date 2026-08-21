# MVP Requirements

## Executive Summary

The MVP is a dependable AI receptionist for small, inquiry-driven service businesses. It should respond to an inquiry, understand the customer's need, use the business's approved profile, gather complete relevant information, confirm accuracy, produce a useful summary, explain an approved next step, and hand judgment back to human staff.

The AI Core remains industry-agnostic. Each customer business supplies a Business Profile containing its identity, configured services, terminology, intake requirements, knowledge, policies, and customer-defined workflows.

## Problem Statement

Small service-business teams cannot always respond while working, traveling, or helping another customer. When the first response is delayed or incomplete, important details and follow-up opportunities can be missed.

## Target Customer

The target customer is an owner or manager of a small, inquiry-driven service business. The business handles recurring customer questions and needs a consistent first response plus a clear human handoff from each conversation.

## Core Value Proposition

Provide a trustworthy first response that captures the customer's request and gives human staff a complete, readable next step, without pretending the AI can make unapproved business decisions.

## Must-Have Features

- A professional greeting informed by the Business Profile
- Clear understanding of the customer's request in their own words
- Universal intake categories combined with profile-defined requirements
- An industry-agnostic Conversation Engine that preserves evidence, corrections, and progress
- Application-controlled, business-scoped context assembly
- Validation of model-proposed responses, state updates, and actions before use
- Provider-independent model execution behind application-owned policy and adapters
- AI-free deterministic fallback when model assistance is unavailable, ineligible, or invalid
- Relevant questions for configured services and customer-defined workflows
- Answers grounded only in approved business knowledge
- Source and version traceability for material business answers
- Natural confirmation and correction of captured details
- A structured, readable inquiry summary
- An approved explanation of next steps
- Clear handling of uncertainty and human escalation
- Guardrails against invented answers, pressure, unsupported promises, and replacement of human judgment
- A dependable handoff that preserves customer context for staff

## Future Features

- Automated scheduling when business rules and safeguards are validated
- Automated follow-up
- Calendar and business-system integrations
- Additional communication channels
- Multilingual experiences
- Reporting and analytics after a measurement and privacy plan exists
- Expanded Business Profile capabilities supported by validated customer needs

## Explicit Non-Goals

- Embedding industry-specific workflows, terminology, services, or policies in the platform core
- Replacing human judgment or customer relationships
- Providing autonomous quotes, binding prices, contracts, or guarantees
- Promising availability, arrival times, response times, or service outcomes without approved guidance
- Processing payments
- Acting as a general CRM, dispatch, accounting, or all-in-one operations platform
- Automating customer-defined workflows before their architecture and safeguards are validated
- Implementing AI, APIs, authentication, storage, forms, or dashboards during documentation architecture milestones
- Allowing partial or streamed model output to mutate authoritative state

## Success Criteria

The MVP will be considered successful when customer and business testing shows that it can:

- Apply a business's profile without introducing industry assumptions
- Capture required universal information and relevant profile-defined context consistently
- Let customers correct misunderstandings before the conversation ends
- Produce a summary that staff can act on without reconstructing the conversation
- Answer from approved business knowledge and surface missing knowledge honestly
- Explain next steps without unsupported commitments
- Escalate uncertainty and judgment to a person
- Reduce repetitive intake effort while maintaining a respectful customer experience
- Earn validation from service-business owners before the product scope expands

Implementation order, component boundaries, and the fictional local prototype are defined in [Implementation Architecture](IMPLEMENTATION_ARCHITECTURE.md), [Implementation Sequence](IMPLEMENTATION_SEQUENCE.md), and [Sprint 3 Plan](SPRINT_3_PLAN.md).

## Prototype Certification Status

Sprint 3 certifies the local conversation prototype, not the production MVP. The prototype proves deterministic Business-Profile-driven service resolution, required-field intake, corrections, state isolation, readiness, escalation state, and validated handoff generation using fictional data and in-memory state.

The production MVP still requires the deferred capabilities above, including an evaluated Model Gateway, application-controlled context assembly, output authorization, authentication, persistence, approved knowledge operations, a real communication channel, and production reliability and security review. See [Sprint 3 Certification](SPRINT_3_CERTIFICATION.md) for the verified boundary.

## Sprint 4 Architecture Status

Sprint 4.1 defines how future AI assistance remains provider-independent, application-controlled, validation-bound, bounded in cost and retries, and optional to deterministic operation. Milestone 4.2 defines task-specific Context Assembly with application-owned source eligibility, strict business/conversation/profile-version isolation, explicit authority labels, bounded reduction, provider-neutral packages, and audit provenance.

Milestone 4.3 defines the MVP task allowlist, deterministic task selection, and provider-neutral Prompt Packages. Milestone 4.4 defines allowlisted proposals, narrow Output Contracts, layered validation, deterministic decisions, application-constructed operations, bounded recovery, duplicate guards, and customer-release approval.

Milestone 4.5 implements only the provider-neutral mock foundation: typed prototype contracts, registries, immutable packages, a deterministic mock adapter, bounded parser, explicit validation, duplicate guard, decision classifier, and verification. It stops before state mutation or customer release and leaves the deterministic Sprint 3 prototype unchanged.

No real provider/model/SDK, production prompt/schema, public API, production database connection, authentication, billing, or delivery integration exists. Sprints 4 through 7 are certified complete. Milestones 8.1 and 8.2 define and verify the internal application preparation boundary, exact activated context, durable profile-version scope, activation-bound knowledge, deterministic progress, derived handoff readiness, and exact grounded-source validation. Milestone 8.3 composes those boundaries with the certified deterministic Conversation Engine and State Manager for transient multi-turn collection, clarification, correction, confirmation, escalation, completion, and handoff. Milestone 8.4 adds opt-in atomic persistence of approved state, required execution evidence, and bounded append-only customer-message evidence, plus restart recovery and deterministic handoff reproduction. Milestone 8.5 adds a bounded internal fictional experience with the fixture-backed regression mode intact and an explicit fail-closed durable activated mode. Milestone 8.6 evaluates and defers a real provider because no Sprint 8 acceptance gap requires one; the deterministic mock remains mandatory. Milestone 8.7 verifies the integrated failure, security, rollback, isolation, and restart matrix without adding product behavior. Customer input remains untrusted and release remains prohibited. Milestone 8.8 is Not Started, and no public administration, production authentication, provider integration, external action, customer release, or dependency change exists. See [End-to-End Application Contract](END_TO_END_APPLICATION_CONTRACT.md), [Sprint 8 Storage Decision](SPRINT_8_STORAGE_DECISION.md), [Sprint 8 Provider Evaluation](SPRINT_8_PROVIDER_EVALUATION.md), [Sprint 8 Failure, Security, and Recovery Evidence](SPRINT_8_FAILURE_SECURITY_RECOVERY.md), and [Sprint 8 Test Plan](SPRINT_8_TEST_PLAN.md).
