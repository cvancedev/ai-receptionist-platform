# Deterministic Conversation Progress Engine

## Purpose

Sprint 5.5 adds an application-authoritative, deterministic evaluator that derives the next permitted workflow intent from trusted application data.

The Progress Engine answers:

> What should the deterministic application attempt next?

It does not decide how state should be mutated and cannot execute its decision.

## Authority Boundary

The Progress Engine:

- receives an explicit immutable input contract;
- validates that input and policy fail closed;
- evaluates one documented precedence order; and
- returns one deeply immutable allowlisted Progress Decision.

It has no Conversation State Manager, Transition Registry, Transition Validator, State Executor, Execution Journal, provider, callback, persistence, networking, external-action, or customer-release capability.

Conversation State remains authoritative for state. The Transition Registry, Transition Validator, State Executor, and Conversation State Manager remain authoritative for mutation. AI output remains advisory and is not accepted by the Progress Engine contract.

## Trusted Input Contract

`ConversationProgressInput` contains only:

- conversation and Business Profile identity;
- Business Profile version;
- source state revision and conversation stage;
- application-resolved service status and service identity;
- application-defined required-field identifiers;
- satisfied, missing, and correction-reopened required-field identifiers;
- escalation state;
- completion state and explicit application completion eligibility; and
- versioned application progress policy.

The engine receives no raw Conversation State object, state manager, model output, prompt, provider result, arbitrary customer input, executor, or callback.

Required-field collections form an exact partition: every application-defined required field must be either satisfied or missing, never both. Reopened fields must remain in the missing set. Identifiers must be non-empty and unique.

Optional facts cannot appear in the satisfied-required set and therefore cannot satisfy completion.

## Service-Resolution Context

The allowlisted service statuses are:

- `unresolved`;
- `ambiguous`;
- `resolved`; and
- `unsupported`.

`resolved` requires a non-empty application-resolved service identifier. Every other status requires a `null` identifier.

The engine does not resolve service text, inspect service display names, or promote ambiguous/unsupported input. Existing application service-resolution code remains responsible for producing this context.

Unsupported service behavior is explicit policy. Policy version 1 allows only:

- `review_escalation`; or
- `none`.

Unknown policy versions or values fail closed.

## Progress Decision Contract

Every successful result contains:

- one allowlisted `decision`;
- one deterministic `reason`;
- `stateMutationAuthorized: false`;
- `transitionExecutionAuthorized: false`;
- `customerReleaseAuthorized: false`; and
- deterministic metadata containing policy version, source revision, and evaluation mode.

The allowlisted decisions are:

| Decision | Meaning |
| --- | --- |
| `begin_intake` | A validated initialized conversation is eligible to attempt the existing controlled intake transition. |
| `ask_required_field` | A resolved intake has one or more missing or correction-reopened application-required fields. |
| `clarify_service` | Service context is unresolved or ambiguous after intake has begun. |
| `review_escalation` | Existing escalation state or explicit unsupported-service policy requires review. |
| `intake_complete` | Application completion eligibility is explicitly true and all consistency rules pass. |
| `none` | A valid state has no currently permitted workflow intent. |

`intake_complete` does not mark state complete, release content, communicate with a customer, or invoke a handoff.

## Evaluation Precedence

Evaluation is explicit and stable:

1. Validate the complete input and fail closed on malformed or contradictory data.
2. Return `review_escalation` for recommended, required, customer-requested, or in-progress escalation.
3. Return `intake_complete` for valid explicit completion eligibility.
4. Return `none` for a valid abandoned conversation.
5. Return `begin_intake` for initialized state.
6. Apply explicit unsupported-service policy.
7. Return `clarify_service` for unresolved or ambiguous service context.
8. Return `ask_required_field` for missing or correction-reopened required fields.
9. Return `none` when no prior rule applies.

The engine uses no object-key ordering, random value, wall-clock time, model content, mutable hidden state, or external input.

## Fail-Closed Validation

Failures use bounded allowlisted codes:

- `MalformedProgressInput`;
- `InvalidProgressPolicy`;
- `ContradictoryRequiredFields`;
- `InvalidServiceResolution`; and
- `InvalidCompletionEligibility`.

Examples that fail include:

- unknown stages, escalation states, or completion states;
- missing or extra top-level contract fields;
- duplicate, empty, overlapping, incomplete, or out-of-scope required-field identifiers;
- a reopened field that is not required and missing;
- a resolved service without an application-resolved identifier;
- a non-resolved service with an identifier;
- completion eligibility while requirements remain missing or reopened;
- completion eligibility without a resolved service;
- completion eligibility during blocking escalation;
- completion state/stage contradictions; and
- unknown policy versions or values.

The engine does not repair contradictory input or return `none` for invalid input.

## Required Fields and Corrections

Required-field identity comes from application-owned Business Profile resolution. The engine neither reads the profile nor invents requirements.

The application supplies only required-field satisfaction. Optional confirmed facts remain outside that set. If a correction reopens a required field, the application places its identifier in both the missing and reopened collections, and the engine returns `ask_required_field` after higher-priority rules.

## Escalation and Completion

Reviewable escalation takes precedence over completion and routine intake.

The engine describes review intent only. It does not activate escalation, select a destination, communicate with a human, or execute an external action.

Completion requires explicit `completionEligible: true`, resolved service context, no missing/reopened requirements, and no blocking escalation. Completion-ready Conversation State values cannot be supplied with false eligibility.

## Conversation Read Model Relationship

Before Sprint 5.5, the Conversation Read Model projector contained private workflow-intent rules. The projector now:

1. validates the state and application-owned projection context;
2. builds the narrow Progress Engine input;
3. evaluates progress;
4. fails projection if progress validation fails;
5. maps the Progress Decision explicitly to the presentation action vocabulary; and
6. returns the deeply immutable read model.

The read-model action contract uses the same six string values but remains a presentation type. `progress-decision-mapping.ts` is the explicit boundary between application workflow intent and descriptive projection. Unknown mapping values fail closed.

The projector remains read-only and receives no mutation capability.

## Prototype Integration

`PrototypeReadModelIntegration` supplies:

- Business-Profile-derived required fields;
- deterministic service status;
- resolved service identity;
- correction-reopened required fields;
- readiness-derived completion eligibility; and
- the immutable default progress policy.

It does not expose Progress Engine input, policy, or authority to the UI. Existing prototype components continue to consume only the UI-safe read model and safe decision/execution summaries.

## Controlled Execution Relationship

A Progress Decision is not a transition identifier or execution request.

The Progress Engine never calls the Transition Validator, State Executor, Conversation State Manager, or Execution Journal. Any future application mapping from a decision to execution must still construct a canonical request and pass every existing scope, revision, proposal, decision, policy, transition, and duplicate check.

Sprint 5.5 adds no transition. The registry still contains only:

```text
initialized -> intake
```

## Determinism and Immutability

Identical valid input produces equivalent output. Result metadata contains no wall-clock value.

Successful and failed results are deeply frozen. Results contain no reference to input arrays or internal mutable collection. Evaluation does not mutate caller input or authoritative state.

## Verification

Run:

```powershell
npm.cmd run verify:conversation-progress
```

The focused suite covers all six decisions, explicit precedence, supported service states and policy, required/optional/reopened fields, completion and escalation consistency, malformed/contradictory input, deterministic equality, deep immutability, AI-output exclusion, authority denial, read-model mapping, the unchanged transition registry, and existing journal behavior.

## Prohibited Capabilities

Sprint 5.5 adds no persistence, database, filesystem or browser storage, cookies, networking, HTTP client, real provider, email, SMS, telephony, scheduling, CRM integration, external business API, customer communication, customer-release authorization, background worker, retry, replay, arbitrary model action, state mutation, transition execution, authentication change, or UI redesign.

## Current Limitations

- The engine is process-local and evaluates only supplied in-memory data.
- Application code remains responsible for resolving service, required fields, reopened corrections, and completion eligibility.
- Unsupported-service behavior has one narrow versioned policy setting.
- Exactly one controlled transition exists.
- Decisions do not execute themselves.
- The AI path remains deterministic and fictional.
- Customer release remains unauthorized.
