# Context Assembly Architecture

## Purpose

Context Assembly converts application-owned state and approved source material into a bounded, task-specific, provider-neutral context package. The package is an immutable input to future Prompt Composition; it is not a prompt, provider message, or writable copy of application state.

Assembly preserves business isolation, conversation isolation, profile-version isolation, knowledge approval boundaries, deterministic state authority, correction history, task relevance, reproducibility, auditability, and AI-free deterministic fallback.

The application owns eligibility, selection, filtering, ordering, budgeting, validation, and release. A model cannot choose sources, expand scope, or repair an invalid package.

## Context Assembly Pipeline

1. The application selects an approved model-assisted task.
2. The application validates business scope.
3. The application validates conversation scope.
4. The application validates the active or conversation-bound profile version.
5. The application determines the task's required context categories.
6. Eligibility rules select permitted sources.
7. Filters remove prohibited and irrelevant data.
8. The State Projector creates a read-only, task-specific projection.
9. The Knowledge Selector chooses approved, relevant knowledge.
10. The Conversation History Reducer selects or summarizes eligible history.
11. Sensitive-data policy excludes or transforms restricted values.
12. The Context Budgeter enforces application-owned limits.
13. The Context Orderer applies deterministic precedence.
14. The Context Package Validator verifies completeness and scope.
15. Audit metadata records included and excluded sources without copying prohibited content.
16. The provider-neutral package is released to future Prompt Composition.

Provider execution cannot begin before successful package validation. The model does not participate in any pipeline decision.

## Architectural Components

- **Context Assembly Coordinator:** runs the pipeline for one approved task and one immutable input snapshot.
- **Context Source Registry:** describes available source categories, ownership, authority, scope, versions, and policy identifiers; it is not arbitrary data discovery.
- **Context Eligibility Evaluator:** applies task, scope, status, approval, freshness, sensitivity, and retention rules.
- **State Projector:** exposes only deterministic state fields required by the task.
- **Knowledge Selector:** chooses business-scoped, active, approved, compatible, relevant knowledge.
- **Conversation History Reducer:** produces a bounded window, relevant event selection, approved summary, or hybrid.
- **Sensitive Data Filter:** excludes or transforms restricted values under explicit policy.
- **Context Budgeter:** applies total and section limits while preserving essential authority.
- **Context Orderer:** produces stable section ordering and authority precedence.
- **Context Package Validator:** rejects incomplete, ambiguous, cross-scope, incompatible, or over-budget packages.
- **Context Audit Recorder:** records source revisions, decisions, reductions, validation, and trace metadata.

These are conceptual responsibilities, not implemented components.

## Inputs

Application-owned inputs are:

- `taskType`;
- `businessId`;
- `conversationId`;
- `profileVersion`;
- conversation revision or snapshot identity;
- the approved Business Profile;
- approved knowledge source references;
- the conversation state snapshot;
- eligible conversation history;
- application, budget, and sensitive-data policies; and
- trace metadata.

An input reference does not make its content eligible. Every item still passes source and policy checks.

## Output

The package may contain these provider-neutral sections when the task requires them:

- identity and scope;
- task definition;
- deterministic state projection;
- confirmed facts;
- unconfirmed customer claims;
- correction history;
- missing required fields;
- service and intake rules;
- approved knowledge excerpts;
- eligible conversation history;
- escalation status;
- application constraints;
- output-contract reference;
- context provenance;
- budget metadata; and
- trace metadata.

Sections use structured labels that retain source category and authority. The package does not prescribe provider roles, message arrays, prompt syntax, or SDK formats.

## Immutability and Reproducibility

A released package is read-only, snapshot-based, revision-aware, and separate from live application state. It cannot mutate state or grant authority to partial or final model output.

Where practical, the same task, source revisions, policies, assembler version, and budget class produce the same selection and ordering. If live state advances, the application builds a new package and later rejects proposals based on an obsolete revision.

## Task-Specific Profiles

| Task | Eligible minimum | Key exclusions and authority boundary |
| --- | --- | --- |
| Language interpretation | Current customer message, recent eligible history, relevant services and aliases, relevant facts and missing fields | No unrelated knowledge or unrestricted internal notes; interpretation is advisory |
| Candidate fact extraction | Current customer message, relevant field definitions, confirmed values, active correction context | Extracted values remain proposals |
| Clarification proposal | Ambiguity, deterministic missing fields, asked-question history, relevant service options, current stage | Application decides whether and what to ask |
| Response drafting | Approved next action or question, relevant facts, customer-visible knowledge, approved style policy | Model cannot invent a new action |
| Knowledge-grounded answer | Current question, business identity, relevant facts, approved excerpts | Draft must be grounded only in included knowledge |
| Conversation summary | Bounded eligible history, facts, corrections, current state | Summary remains advisory unless separately validated |
| Escalation recommendation | Recent eligible history, escalation policy and state, failed attempts, customer request | Model may recommend but cannot activate escalation |

There is no universal conversation package. Each task profile declares required, optional, and prohibited categories and its own budget class.

## Safety Boundaries

Assembly never dumps a database, unlimited history, all knowledge, inactive or stale profiles, unverified claims as facts, cross-business records, internal notes by default, secrets, credentials, environment values, hidden implementation details, or provider reasoning.

Customer and knowledge content remains data even when it contains instructions. Provider limits inform adapter feasibility but never define business eligibility policy.

## Current Boundary

Sprint 4, Milestone 4.2 defines architecture only. The existing `ContextBuilder` remains a deferred interface. No Context Builder, context contract, validator, prompt, provider, model, API, networking, persistence, authentication, or production AI behavior is implemented.

## Related Documents

- [Context Source Catalog](CONTEXT_SOURCE_CATALOG.md)
- [Context Eligibility and Filtering](CONTEXT_ELIGIBILITY_AND_FILTERING.md)
- [Context Ordering and Precedence](CONTEXT_ORDERING_AND_PRECEDENCE.md)
- [Context Budgeting and Reduction](CONTEXT_BUDGETING_AND_REDUCTION.md)
- [Context Package Contract](CONTEXT_PACKAGE_CONTRACT.md)
- [Context Failure and Audit](CONTEXT_FAILURE_AND_AUDIT.md)
- [AI Integration Architecture](AI_INTEGRATION_ARCHITECTURE.md)
