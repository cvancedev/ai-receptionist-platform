# Conversation Read Model

## Purpose

Sprint 5.2 adds a stable, immutable presentation boundary for conversation state. The Conversation Read Model describes one validated in-memory state snapshot without exposing the state object, state manager, executor, provider, or any side-effecting capability.

Projection is read-only. It cannot execute a transition, mutate a conversation, authorize a customer response, activate escalation, mark completion, persist data, perform networking, or invoke a business action.

## Boundary

```text
validated Conversation State snapshot
  + application-resolved projection context
  -> fail-closed Conversation Read Model Projector
  -> deeply immutable Conversation Read Model
```

The projector is not integrated into the prototype UI or either AI orchestration path in this milestone. The existing panels continue to behave exactly as before.

## Inputs

`ConversationReadModelProjector.project()` accepts `unknown` inputs and validates them before projection:

1. a structurally valid `ConversationState` snapshot that also passes the existing Conversation State validator; and
2. an application-owned projection context containing:
   - the exact required-field identifiers applicable to the current intake; and
   - an already resolved active service identifier, or `null`.

Required fields must be supplied explicitly because satisfied fields leave `missingFields`, while confirmed optional fields may also exist. Counting state collections without this context would produce incorrect progress. Service resolution remains application-owned because state alone cannot prove that a confirmed service identifier belongs to an active validated Business Profile.

A non-null resolved service must match the confirmed `requested-service` fact. Missing-field identifiers must belong to the supplied required-field set, and every required field must be represented as either confirmed or missing, never both. Invalid structure, invalid state, duplicated or empty context fields, and inconsistent context fail closed with an immutable error result. The projector does not repair inputs.

## Read Model Contract

The deeply readonly result contains:

- conversation, business, and Business Profile-version identity;
- stage and source revision;
- resolved service identifier, when application resolution supplies one;
- copied confirmed facts in deterministic sequence and field order;
- copied correction history in deterministic sequence and field order;
- copied missing-required-field and asked-question arrays;
- escalation status and reason;
- completion status;
- deterministic status flags;
- one allowlisted recommended next action;
- required-field completion progress; and
- schema, revision, and deterministic-projection metadata.

The projection intentionally omits internal customer-claim history, escalation trigger source and destination, final snapshots, mutation APIs, state-manager references, executor references, callbacks, provider data, and release mechanisms.

## Immutability

Every object and array returned on both success and failure is newly allocated where state data is exposed and recursively frozen. The result shares no fact, correction, missing-field, or question-history collection reference with its source state.

TypeScript contracts mark every field as readonly. Runtime freezing provides the corresponding enforcement for JavaScript consumers.

## Deterministic Derived Fields

### Completion Progress

When required fields exist:

- `satisfiedRequiredFields` counts only supplied required identifiers with confirmed facts;
- `totalRequiredFields` is the supplied unique required-field count; and
- `percentage` is the truncated integer percentage, clamped from `0` through `100`.

When no required fields exist, progress is explicitly `not-applicable`, with zero counts and a `null` percentage. The projector does not guess that the intake is complete.

### Recommended Next Action

The projector returns exactly one allowlisted value:

- `review_escalation` for a recommended, required, customer-requested, or in-progress escalation;
- `intake_complete` for completion readiness, completed state, or handoff;
- `none` for abandonment;
- `begin_intake` for initialized state;
- `clarify_service` for clarification with no application-resolved service;
- `ask_required_field` when required fields remain; or
- `none` when no preceding state-derived rule applies.

This is descriptive projection policy only. It is not an executable transition identifier and conveys no execution authority.

### Status Flags

- `isEscalated` is true only for required, customer-requested, in-progress, or handed-off escalation status.
- `isComplete` is true only for the completed completion state.
- `canReleaseToCustomer` is always `false` in Sprint 5.2.

Conversation State has no customer-response authorization field. Its authorized escalation destination is a separate control and cannot be reinterpreted as release authority.

## Trust and Capability Boundary

The read model contains data only. It has:

- no mutation methods;
- no Transition Registry, Transition Validator, or State Executor reference;
- no model gateway or provider reference;
- no database, persistence, or storage reference;
- no HTTP, fetch, or external API capability;
- no email, SMS, telephony, scheduling, or CRM capability;
- no callback or command;
- no customer communication authorization; and
- no authority to escalate or complete a conversation.

It may report an already existing escalation or completion state, but it cannot create either.

## Verification

Run:

```powershell
npm.cmd run verify:conversation-read-model
```

The suite covers deterministic projection, source-state integrity, deep runtime immutability, reference isolation, initialized and intake states, identity and revision, facts, corrections, missing fields, question history, service resolution, escalation, completion, release denial, bounded progress, allowlisted actions, malformed and inconsistent input rejection, and absence of execution during projection.

## Current Limitations

- Projection is in-memory and is not integrated into the prototype UI.
- The application must resolve required fields and active service before projection.
- Service display names are not exposed because they do not exist in Conversation State.
- Customer release remains unconditionally unauthorized because state contains no explicit release authorization.
- There is no persistence, networking, execution journal, new transition, external integration, or production provider.

## Future Integration Boundary

A separately approved milestone may let an application coordinator resolve the active Business Profile context, call the projector with a validated state snapshot, and pass the resulting immutable value to a presentation layer. That integration must preserve the projector's no-mutation and no-authority boundary. It is not implemented here.
