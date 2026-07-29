# Immutable Execution Journal

## Purpose

Sprint 5.4 adds a narrow, process-local audit boundary for controlled execution attempts. The Execution Journal supports traceability, debugging, deterministic verification, and future observability foundations.

It is not an executor, event bus, replay engine, persistence layer, business-action queue, or source of conversation-state authority.

## Ownership and Flow

`AiFoundationPrototypeOrchestrator` owns one `InMemoryExecutionJournal`. The journal observes the immutable result after the existing State Executor has completed:

```text
approved Application Decision
  -> existing Transition Validator and duplicate guard
  -> deterministic State Executor
  -> immutable Execution Result
  -> Execution Journal append
  -> current Conversation State snapshot
  -> Conversation Read Model projection
  -> UI-safe integration result
```

The journal receives no State Executor, Conversation State Manager, Transition Registry, provider, callback, or customer-release capability. It cannot authorize or apply a transition.

The certified `run()` path remains read-only and creates no journal entry. `runWithExecution()` remains the only controlled AI mutation path and reports its journal-append result explicitly.

## Entry Contract

Each deeply immutable entry contains only safe audit metadata established by the controlled path:

- deterministic journal entry ID and sequence;
- canonical execution, request, trace, proposal, task, and transition identities where available;
- conversation and Business Profile identity/version;
- expected, previous, and resulting state revisions;
- allowlisted outcome and existing executor reason;
- the executor's deterministic timestamp and copied failure codes; and
- journal schema, source, and deterministic recording metadata.

Entries do not contain Conversation State snapshots, model output, prompts, arbitrary customer input, execution callbacks, or mutable internal references. Executor detail strings are intentionally excluded because they are not required for the safe audit contract and could become an accidental sensitive-data channel.

## Outcomes

The allowlisted journal outcomes are:

| Journal outcome | Observable executor result |
| --- | --- |
| `applied` | `TransitionApplied` |
| `duplicate` | `DuplicateExecution` |
| `stale` | `CurrentStateMismatch` with a trustworthy revision mismatch |
| `invalid_transition` | `UnknownTransition`, or a current-state mismatch without a revision mismatch |
| `invalid_request` | `MalformedExecutionRequest` when trustworthy audit identity exists |
| `policy_rejected` | rejected decision/proposal/task/type/scope/policy validation |
| `rejected` | state application failure after validation |

Unknown executor outcomes fail closed and are not appended.

## Trusted Data Boundary

The journal derives entries from the immutable Execution Result, not from raw caller input. A result must provide a canonical execution ID, request/trace/task identity, conversation and Business Profile scope, profile version, and expected revision.

Structurally trustworthy duplicate, stale, unknown-transition, scope, decision, proposal, task, type, and policy rejections are journaled. A malformed request without the required canonical audit metadata returns `UntrustedExecutionMetadata` and creates no entry. The journal does not manufacture identity or preserve raw malformed input to make logging possible.

## Append-Only and Read Semantics

The in-memory journal provides only:

- `append(immutableExecutionResult)`; and
- `snapshot()`.

There is no update, delete, replacement, replay, retry, or dispatch operation. Sequence numbers begin at one and increase by one. Entry IDs use:

```text
execution-journal-{sequence}-{canonical execution ID}
```

The execution timestamp and journal recording timestamp follow the existing `prototype-deterministic` convention. Identical controlled scenarios against fresh equivalent instances therefore produce equivalent journal snapshots.

Every entry, append result, nested metadata object, and returned snapshot is deeply frozen. Reads clone entry metadata into a new immutable collection, so callers never receive the journal's internal array or internal entry references. Later appends cannot change an earlier snapshot.

## Failure and Atomicity

Append failure is explicit:

- `UntrustedExecutionMetadata` means canonical safe audit metadata was unavailable;
- `UnknownExecutionOutcome` means the result code was not allowlisted; and
- `JournalAppendFailed` means the journal threw unexpectedly at the controlled boundary.

A journal failure never changes a rejected execution into success. It also does not roll back a successful conversation transition. The in-memory Conversation State Manager and journal are separate process-local components with no transaction spanning them, so execution may succeed while journaling fails. `runWithExecution()` returns both the immutable Execution Result and append result so the limitation is never silently hidden.

Sprint 5.4 deliberately adds no persistence or transaction mechanism.

## Reset

Prototype session reset creates a fresh foundation, state manager, AI orchestrator, and journal. The new journal starts empty with its next sequence at one.

Previously returned snapshots remain frozen detached values. They cannot mutate the fresh journal or new session state, and no journal data survives reset.

## Relationship to Other Boundaries

- **State Executor:** remains the only component that converts a validated transition into a typed state-manager operation. The journal observes its result afterward.
- **Conversation State:** remains authoritative. Journal entries contain only identity and revision metadata, not state snapshots.
- **Conversation Read Model:** remains the presentation boundary. It does not read the journal, and the customer-facing prototype receives no journal capability or history.
- **Duplicate guard:** remains the execution replay-prevention boundary. The journal records duplicate outcomes but does not prevent or authorize execution.
- **Conversation Progress Engine:** derives a mutation-free workflow intent before any separately authorized execution mapping. It cannot append to or read authority from the journal.

## Verification

Run:

```powershell
npm.cmd run verify:execution-journal
```

The focused suite covers successful and rejected entries, duplicate/stale/invalid-transition outcomes, deterministic identity/order, deep immutability, reference isolation, append-only history, trusted metadata failure, unknown outcomes, explicit append failure, lack of authority, session reset, read-only `run()`, execution-enabled `runWithExecution()`, and the unchanged single-transition registry.

## Prohibited Capabilities and Limitations

Sprint 5.4 adds no transition, persistence, database, filesystem storage, browser storage, cookies, networking, external API, email, SMS, telephony, scheduling, CRM integration, customer communication, customer-release authorization, real provider, authentication change, replay, retry, background worker, event bus, or UI redesign.

The journal is process-local and non-durable. It is not a complete production audit system, does not survive reset or restart, and cannot provide atomic persistence with conversation execution.
