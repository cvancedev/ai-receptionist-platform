# Proposal Decision and Application

## Purpose

Validation produces immutable decision input, not state changes. The Application Decision Engine compares that input with current authoritative state and policy and chooses one deterministic outcome.

## Decision Options

- Accept
- Accept partially
- Modify
- Reject
- Request clarification
- Use deterministic fallback
- Approve a bounded retry
- Escalate through deterministic policy
- Stop safely

Every decision records reasons, proposal and state revision, policy versions, and allowed next steps.

## Acceptance

Acceptance requires complete validation, current-state compatibility, application policy permission, required provenance, and a passing duplicate guard. Acceptance authorizes the application to use validated candidate material; it does not make raw provider output authoritative.

## Partial Acceptance

Field-level acceptance is allowed only when:

- the contract explicitly permits it;
- fields are independently valid;
- rejected fields cannot alter accepted meaning;
- no hidden dependency exists; and
- audit records identify accepted/rejected portions and reasons.

Partial acceptance is prohibited for scope or contract identity, state revision, permission boundaries, prohibited actions, essential grounding, and customer-release safety. Unknown/prohibited fields cannot be “partially ignored” into validity.

## Modification

The application may normalize harmless formatting, remove unsupported optional wording, choose one independently validated candidate, convert ambiguity into a deterministic clarification path, or replace a draft with deterministic wording.

Modification cannot invent evidence, authority, facts, services, policy, grounding, or state compatibility. Material modification produces application-owned output with traceability to the rejected or narrowed proposal.

## Typed Operations

Only the application constructs authoritative operations. Future examples may include:

- `RecordCustomerClaim`;
- `ConfirmFact` through deterministic logic;
- `ApplyCorrection` through deterministic logic;
- `RecordAskedQuestion`;
- `ActivateEscalation` through application policy; and
- `CompleteConversation` through application policy.

These names are conceptual, not TypeScript contracts. A model proposes candidate inputs and never emits an operation with authority.

## State Revision and Mutation Boundary

Before submission:

1. re-read or confirm current state revision;
2. ensure validation used that revision;
3. re-evaluate or reject stale proposals;
4. create a stable operation/deduplication identity;
5. submit through the Conversation State Manager's existing validation boundary; and
6. record atomic success or failure.

Validators and the decision engine do not mutate state as a side effect. Failed or duplicate application does not produce a success claim or customer release.

## Escalation, Completion, and Handoff

Recommendations are evidence only. Deterministic policy independently decides escalation, readiness, completion, destination, and handoff construction from authoritative state.

## Retry Relationship

A retry is an application decision, not a model request. A later result does not automatically replace an earlier accepted result; policy selects the one eligible attempt and duplicate guards prevent repeated effects.

## Audit

The decision record identifies proposal, accepted/rejected fields, modification, fallback, retry approval, typed operations constructed/applied, current revision, and response-release dependency.

## Prototype Status

Milestone 4.5 implements deterministic decision classification. Every decision still explicitly denies direct mutation and customer release. Milestone 5.1 adds a separate application-owned Transition Registry, Transition Validator, and State Executor for one validated in-memory `initialized -> intake` transition. No general Typed Operation Builder, fact/correction mutation, escalation activation, completion, handoff, response release, persistence, or networking is implemented.

## Related Documents

- [Output Repair, Retry, and Partial Acceptance](OUTPUT_REPAIR_RETRY_AND_PARTIAL_ACCEPTANCE.md)
- [Customer Response Release](CUSTOMER_RESPONSE_RELEASE.md)
- [Conversation State](CONVERSATION_STATE.md)
- [AI Integration Prototype Foundation](AI_INTEGRATION_PROTOTYPE_FOUNDATION.md)
- [State Execution Architecture](STATE_EXECUTION_ARCHITECTURE.md)
