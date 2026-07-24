# State Execution Architecture

## Purpose

Sprint 5.1 adds the smallest application-controlled boundary that can apply one validated, deterministic in-memory conversation-stage transition after the Sprint 4 AI pipeline reaches an accepted application decision.

The model, provider adapter, raw output, parsed proposal, validation result, and application decision cannot mutate state directly. The application-owned Transition Validator must independently authorize one explicit registered transition before the State Executor can submit a typed update to the existing Conversation State Manager.

## Controlled Flow

```text
Application-selected task
  -> immutable Context Package
  -> immutable Prompt Package
  -> provider-neutral Model Gateway
  -> deterministic mock adapter
  -> normalized provider result
  -> bounded inert parser
  -> layered proposal validation
  -> duplicate proposal guard
  -> accepted application decision
  -> Transition Registry
  -> Transition Validator
  -> state-execution duplicate guard
  -> deterministic State Executor
  -> Conversation State Manager
  -> immutable Execution Result
```

The certified Sprint 4 `AiFoundationPrototypeOrchestrator.run()` path remains read-only. Sprint 5.1 adds `runWithExecution()` to exercise the appended controlled-execution boundary without weakening the existing verification contract.

## State Executor

`DeterministicStateExecutor` contains execution mechanics only. It:

1. accepts an `unknown` execution input;
2. delegates all approval, transition, scope, revision, policy, and duplicate checks to the Transition Validator;
3. rejects invalid input without calling the state manager;
4. converts a successfully validated transition definition into the existing typed `transition-stage` update;
5. delegates mutation to `ConversationStateManager`; and
6. returns a deeply frozen Execution Result.

It does not select a task, interpret model content, decide business policy, invent a transition, communicate with customers, or perform persistence or networking.

## Transition Registry

Transitions are immutable, versioned, and explicit. Sprint 5.1 registers exactly one:

| Identifier | Version | Current state | Next state | Required task | Required proposal | Required decision |
| --- | --- | --- | --- | --- | --- | --- |
| `begin_intake_after_language_interpretation` | 1 | `initialized` | `intake` | `language_interpretation` | `intent_interpretation` | `accepted` |

Its required conditions are:

- approved application decision;
- validated proposal;
- matching business, conversation, profile, and state revision;
- matching task, proposal, output contract, and transition policy; and
- unique execution identity.

No implicit fallback transition exists. Unknown identifiers and versions fail closed.

## Transition Validator

Validation occurs before state mutation:

1. Require the exact State Execution Request shape.
2. Resolve the transition from the registry.
3. Resolve an allowlisted task and version.
4. Require an allowlisted proposal type.
5. Require `validation.status === "valid"` with no failures.
6. Require an accepted, structurally valid Application Decision matching the validation result.
7. Require the decision's direct mutation and customer-release authorization flags to remain `false`.
8. Verify task, proposal, output-contract, and transition compatibility.
9. Read the exact business/profile/conversation scope.
10. Match proposal identity to the approved package identity.
11. Reject an already processed execution ID.
12. Match current stage and state revision.
13. Verify the registered stage transition is legal.
14. Register the execution identity before returning approval.

Raw model output, parsed proposals, unknown tasks, unknown proposal types, malformed decisions, unknown transitions, scope mismatches, stale state, invalid transitions, and duplicates cannot reach state application.

## Application Authority

Sprint 4 decisions continue to expose `stateMutationAuthorized: false`. This is deliberate: model-facing validation and decision classification do not directly authorize mutation.

Sprint 5.1 authorization is a separate application-owned result of the Transition Registry and Transition Validator. Only that validated result reaches the State Executor. The existing Conversation State Manager then revalidates scope, current state, stage legality, and the candidate state before replacing the in-memory snapshot.

## Execution Result

Every execution attempt returns:

- `success`;
- a typed `reason`;
- immutable previous and new state snapshots, or `null` when malformed input has no trustworthy scope;
- transition identifier;
- deterministic execution timestamp; and
- immutable metadata containing execution, request, trace, task, proposal, expected/applied revision, failures, and details.

Rejected executions return the same previous and new state whenever a trustworthy current state is available. No rejected request mutates the store.

## Determinism and Duplicate Safety

The prototype timestamp is the constant `prototype-deterministic`. Identical approved requests against fresh identical in-memory managers produce equivalent execution results and stored state.

Execution IDs are derived canonically from the validated proposal identity and registered in the existing in-memory duplicate guard. A caller cannot assign a different execution ID to replay the same decision. Repeating an applied execution returns `DuplicateExecution` and preserves the already-applied state. This protection is process-local and is not durable.

## Verification

Run:

```powershell
npm.cmd run verify:state-execution
```

The focused suite proves legal execution, illegal and unknown transition rejection, duplicate rejection, malformed/raw/unvalidated input rejection, unknown task/proposal rejection, immutable results, deterministic execution, state integrity, and no mutation on rejection.

## Scope Boundary

Sprint 5.1 implements only an in-memory `initialized -> intake` stage transition in the isolated fictional AI prototype.

It adds no persistence, database, network call, HTTP client, external API, email, SMS, telephony, scheduling, CRM integration, customer communication, background work, authentication change, UI redesign, or real model provider.

Sprint 5.2 adds the separate read-only [Conversation Read Model](CONVERSATION_READ_MODEL.md). That projector may describe an already executed state snapshot, but it is not part of execution and receives no executor or state-manager capability.
