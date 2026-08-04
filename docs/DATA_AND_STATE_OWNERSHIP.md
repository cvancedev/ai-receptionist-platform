# Data and State Ownership

## Platform-Owned Data

Platform rules, behavior standards, safety boundaries, output contracts, prompt-component versions, validation rules, and tenant-isolation policies are platform-owned and cannot be overridden by business or model content.

## Business-Owned Data

Business identity, services, hours, policies, service areas, intake requirements, knowledge, tone, escalation destinations, and handoff rules are business-owned. The platform controls validation and activation eligibility.

## Conversation-Owned Data

Customer messages, claims, confirmed facts, corrections, stage, intent, resolved service, missing fields, asked questions, escalation, and completion belong to one business-scoped conversation and profile context.

## Model-Generated Proposals

Suggested customer responses, state updates, actions, escalation, completion readiness, and knowledge references remain untrusted proposals until application validation. They are not authoritative state.

## Application-Owned Decisions

The application owns accepted state updates, allowed responses, escalation activation, completion determination, handoff creation, audit events, transaction coordination, and retry, repair, rejection, or failure behavior. Persistence infrastructure may commit already-approved state and audit inputs atomically but cannot decide their business meaning.

## Derived Data

| Derived category | Authoritative inputs | Owning validator |
| --- | --- | --- |
| Conversation summary | Validated conversation state and evidence history | State Manager |
| Handoff summary | Validated state plus profile handoff rules | Handoff Builder |
| Progress indicators | Required fields, stage, and completion rules | Conversation Engine |
| Profile validation status | Profile revision and platform validation rules | Profile Service |
| Knowledge eligibility | Source lifecycle, scope, audience, time, and authority | Knowledge Service |
| Context package | Validated profile, knowledge, state, task, and instruction versions | Context Builder |

Derived data remains traceable and cannot silently replace its authoritative inputs.

## Mutation Rules

- The model cannot directly mutate permanent or conversation state.
- Customer corrections supersede prior conversation facts only after validation and dependent reevaluation.
- Conversation data cannot alter a Business Profile or permanent knowledge.
- Business configuration changes require a new validated revision and activation.
- Knowledge changes follow review, approval, versioning, and activation.
- Cross-business reads and mutations are prohibited.
- State updates should be revision-aware and applied consistently with the accepted customer response.
- Rejected proposals remain audit evidence but have no operational authority.
- An approved durable state replacement and its required audit entry commit together or neither commits; storage cannot invent a retry or alternate transition.

## Human Authority

Authorized business users own operational truth and exceptions. The platform enforces boundaries; humans approve configuration, knowledge, unsupported commitments, and disputed outcomes.

## Sprint 7.1 Contract Status

Business-owned configuration remains subject to platform rules and
application-owned validation, authorization decisions, and lifecycle decisions.
Milestone 7.1 requires exact Business Profile and knowledge revision scope and
defines detached immutable repository results. Repositories may record only
already-authorized facts; they cannot decide validity, activation eligibility,
conversation use, or active-version selection.

The three validation stages—draft structure, activation eligibility, and
conversation use—remain distinct. Conversation data and model proposals gain no
configuration authority. No persistent configuration state or ownership rule is
changed in this milestone.

Milestone 7.2 persists already-accepted Business Profile draft revisions and
creation audit evidence. PostgreSQL owns durability and integrity only; the
application retains structural, authorization, lifecycle, activation, and
conversation-use authority.
