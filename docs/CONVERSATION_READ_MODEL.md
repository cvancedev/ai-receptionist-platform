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

Sprint 5.3 integrates the projector through the Prototype Chat Session after controlled execution and before UI delivery. The projector itself remains pure and unchanged: integration code owns the state snapshot, context construction, and safe result mapping. See [Prototype Read Model Integration](PROTOTYPE_READ_MODEL_INTEGRATION.md).

Sprint 5.5 removes workflow-intent derivation from the projector. The projector now supplies trusted application context to the [Deterministic Conversation Progress Engine](CONVERSATION_PROGRESS_ENGINE.md) and explicitly maps its allowlisted Progress Decision to the descriptive read-model action. Projection remains read-only.

## Inputs

`ConversationReadModelProjector.project()` accepts `unknown` inputs and validates them before projection:

1. a structurally valid `ConversationState` snapshot that also passes the existing Conversation State validator; and
2. an application-owned projection context containing:
   - the exact required-field identifiers applicable to the current intake;
   - an already resolved active service identifier, or `null`;
   - application-resolved service status;
   - correction-reopened required-field identifiers;
   - explicit application completion eligibility; and
   - immutable versioned Progress Engine policy.

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

The Progress Engine returns one application-owned workflow intent, and the projector maps it to exactly one descriptive allowlisted value:

- `review_escalation` for a recommended, required, customer-requested, or in-progress escalation;
- `intake_complete` for completion readiness, completed state, or handoff;
- `none` for abandonment;
- `begin_intake` for initialized state;
- `clarify_service` for clarification with no application-resolved service;
- `ask_required_field` when required fields remain; or
- `none` when no preceding state-derived rule applies.

The read-model value remains descriptive presentation data. The underlying Progress Decision is also mutation-free; neither value is an executable transition identifier or conveys execution authority.

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

The suite covers deterministic projection, source-state integrity, deep runtime immutability, reference isolation, initialized and intake states, identity and revision, facts, corrections, missing fields, question history, service resolution, escalation, completion, release denial, bounded progress, mapped allowlisted actions, malformed and inconsistent input rejection, and absence of execution during projection. Focused Progress Engine behavior is covered by `verify:conversation-progress`.

## Current Limitations

- Projection and its prototype integration remain in memory.
- The application must resolve required fields and active service before projection.
- Service display names are not exposed because they do not exist in Conversation State.
- Customer release remains unconditionally unauthorized because state contains no explicit release authorization.
- There is no persistence, networking, new transition, external integration, or production provider. The separate Sprint 5.4 [Execution Journal](EXECUTION_JOURNAL.md) does not change or feed the read model.
- Application integration must supply valid service status, required/reopened fields, completion eligibility, and progress policy.

## Integration Boundary

The Sprint 5.3 prototype session resolves the active Business Profile context, calls the projector with a validated state snapshot, and passes only a UI-safe integration result to presentation components. Raw state and execution machinery remain private. Production integration, persistence, real providers, and customer communication are not implemented.
