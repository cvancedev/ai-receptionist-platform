# Immutable Execution Journal

## Purpose

Sprint 5.4 establishes a narrow, process-local audit boundary for controlled execution attempts. Milestone 6.3 adds an opt-in PostgreSQL implementation behind the same application-owned contract. The Execution Journal supports traceability, debugging, deterministic verification, and future observability foundations.

Durability does not make the journal an executor, event bus, replay engine, business-action queue, or source of Conversation State authority.

## Ownership and Flow

`AiFoundationPrototypeOrchestrator` owns one `InMemoryExecutionJournal` by default and may receive an explicitly injected asynchronous journal adapter. The journal observes the immutable result after the existing State Executor has completed:

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

The journal derives entries from the immutable Execution Result, not from raw caller input. A result must provide a canonical execution ID, request/trace/task identity, conversation and Business Profile scope, positive profile version, and valid expected revision. Runtime validation requires exact result and metadata shapes, valid identifier and revision types, consistent applied/rejected semantics, and matching scope for any embedded state snapshots.

Structurally trustworthy duplicate, stale, unknown-transition, scope, decision, proposal, task, type, and policy rejections are journaled. A malformed request without the required canonical audit metadata returns `UntrustedExecutionMetadata` and creates no entry. The journal does not manufacture identity or preserve raw malformed input to make logging possible.

## Append-Only and Read Semantics

Every journal implementation provides only:

- `append(immutableExecutionResult)`; and
- `snapshot(businessProfileConversationScope)`.

There is no update, delete, replacement, replay, retry, or dispatch operation. Sequence numbers begin at one and increase by one. The PostgreSQL adapter serializes sequence allocation inside a journal-local transaction and exact business/profile/conversation scope so committed entries retain contiguous deterministic ordering without cross-business sequence leakage or identity collisions. Entry IDs use:

```text
execution-journal-{sequence}-{canonical execution ID}
```

The execution timestamp and journal recording timestamp follow the existing `prototype-deterministic` convention. Identical controlled scenarios against fresh equivalent instances therefore produce equivalent journal snapshots.

Every entry, append result, nested metadata object, and returned snapshot is deeply frozen. Reads clone or reconstruct entry metadata into a new immutable collection, so callers never receive the journal's internal array or database-driver objects. Later appends cannot change an earlier snapshot.

Milestone 6.1 formalizes these operations as the technology-neutral `ExecutionJournalStore` contract and requires explicit Business Profile, profile-version, and conversation scope for snapshot retrieval. The in-memory journal remains the default implementation and preserves the certified append, trust, ordering, detachment, and authority behavior.

Milestone 6.3 extends that contract with explicit synchronous and asynchronous operation modes. The PostgreSQL adapter validates trusted results through the same application-owned mapper before insertion. Scoped snapshots order by sequence, validate the supported journal schema version and exact safe entry structure, and fail closed without partial history when a row is malformed or incompatible. Wrong valid scope returns an empty history without exposing whether another business has entries; malformed scope returns an explicit failure.

## Failure and Atomicity

Append failure is explicit:

- `UntrustedExecutionMetadata` means canonical safe audit metadata was unavailable;
- `UnknownExecutionOutcome` means the result code was not allowlisted; and
- `JournalAppendFailed` means the adapter or controlled boundary could not complete the append.

Durable snapshot failures are explicit as `InvalidJournalScope`, `InvalidStoredJournalEntry`, `IncompatibleStoredJournalEntry`, or `JournalReadFailed`.

A journal failure never changes a rejected execution into success. It also does not roll back a successful conversation transition. The in-memory Conversation State Manager and journal are separate process-local components with no transaction spanning them, so execution may succeed while journaling fails. `runWithExecution()` returns both the immutable Execution Result and append result so the limitation is never silently hidden.

The standalone PostgreSQL journal adapter uses a journal-local transaction only to allocate sequence and append one journal entry. It does not receive a Conversation Store or transaction handle and cannot coordinate Conversation State.

Milestone 6.4 adds a separate opt-in application-owned coordination contract and PostgreSQL implementation. For one already-approved applied Execution Result, that coordinator validates the existing bounded journal draft before persistence, rejects a durable duplicate execution identity in exact scope, and performs expected-revision state replacement plus journal append within one transaction. A state failure, journal failure, revision conflict, duplicate conflict, infrastructure failure, or commit failure cannot return partial success. This does not change the standalone adapter or the default in-memory journal behavior.

## Reset

Prototype session reset creates a fresh foundation, state manager, AI orchestrator, and default in-memory journal. The new in-memory journal starts empty with its next sequence at one. An explicitly injected PostgreSQL journal survives store recreation and is not wired into ordinary prototype reset.

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
npm.cmd run verify:postgresql-execution-journal
npm.cmd run verify:postgresql-transactional-execution
```

The focused suites cover successful and rejected entries, duplicate/stale/invalid-transition outcomes, deterministic identity/order, deep immutability, reference isolation, append-only history, trusted metadata failure, unknown outcomes, explicit persistence failures, migration ordering, scoped durable reload, corruption rejection, asynchronous injection, lack of authority, session reset, read-only `run()`, execution-enabled `runWithExecution()`, and the unchanged single-transition registry.

## Prohibited Capabilities and Limitations

Milestone 6.4 adds only opt-in atomic persistence coordination for an already-approved applied Execution Result. It adds no transition, execution authority, browser storage, cookies, external API, email, SMS, telephony, scheduling, CRM integration, customer communication, customer-release authorization, real provider, authentication change, replay, retry, background worker, event bus, or UI redesign.

The prototype journal remains process-local and non-durable by default. Milestone 6.5 uses the opt-in PostgreSQL journal only through an explicitly injected fictional integration. Verification recreates the journal adapter after commit and reloads the required entry independently from authoritative Conversation State. The entry is audit evidence only and is never replayed to reconstruct state or authorize continued progression. Production connection management, retention, broader operational recovery, and Sprint 6.6 behavior remain deferred.
