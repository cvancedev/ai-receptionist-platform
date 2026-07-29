# Prototype Read Model Integration

## Purpose

Sprint 5.3 connects the controlled in-memory execution path and immutable Conversation Read Model to the existing fictional prototype interface. The session remains the application boundary: it owns state, execution orchestration, projection context, projection timing, and UI-safe delivery.

The UI receives data, not authority. It cannot access the Conversation State Manager, State Executor, transition requests, raw state snapshots, provider adapters, callbacks, or customer-release controls.

## Integrated Flow

```text
fictional user input
  -> Prototype Chat Session
  -> deterministic AI foundation
  -> validated Application Decision
  -> runWithExecution()
  -> existing State Executor
  -> shared in-memory Conversation State Manager
  -> current immutable state snapshot
  -> application-owned projection context
  -> Deterministic Conversation Progress Engine
  -> Conversation Read Model Projector
  -> UI-safe integration result
  -> prototype components
```

The existing `run()` path remains read-only. The session uses `runWithExecution()` for the single approved AI-controlled `initialized -> intake` transition. Subsequent fictional intake behavior continues through the existing deterministic Conversation Engine and its validated typed state operations.

No transition was added or changed.

## Session Ownership

`PrototypeChatSession` owns:

- the in-memory prototype foundation and Conversation State Manager;
- the existing deterministic Conversation Orchestrator;
- the AI Foundation Orchestrator configured with that same manager;
- whether controlled execution has been attempted;
- the latest internal controlled-execution snapshot;
- projection-context construction through the integration component;
- read-model projection;
- fictional messages, pending field, handoff, and deterministic errors; and
- reset.

The controlled snapshot remains private to the session. The session never places its raw `conversationState`, previous state, new state, manager, or executor into `PrototypeChatView`.

## UI-Safe Integration Result

`PrototypeReadModelIntegrationResult` is deeply frozen and has two outcomes.

Success contains:

- `status: "success"`;
- `mode: "read-only" | "controlled-execution"`;
- a copied safe Application Decision summary, when attempted;
- a copied safe Execution Result summary, when attempted;
- the immutable Conversation Read Model; and
- an empty error list.

Projection failure contains:

- `status: "projection-failure"`;
- the same safe mode and summaries when available;
- `readModel: null`; and
- deterministic projection errors.

Execution summaries contain status, reason, transition identifier, deterministic timestamp, and expected/applied revisions. They omit previous and new state snapshots and all execution machinery.

## Projection Timing and Context

Before processing the first non-empty fictional message, the session:

1. runs the existing deterministic mock AI foundation;
2. obtains an application decision;
3. calls only `runWithExecution()`;
4. obtains the shared manager's current snapshot; and
5. projects that snapshot before further intake behavior.

Every returned view then projects the latest current snapshot, so later deterministic facts, corrections, missing fields, questions, escalation, completion, and revisions remain current.

Projection context is application-owned:

- `requested-service` is always required;
- when an active service is resolved, its global and service-specific required intake fields are resolved through the existing intake-field architecture; and
- only the active service identifier is supplied to the projector.
- Sprint 5.5 also supplies deterministic service status, correction-reopened required fields, readiness-derived completion eligibility, and the immutable progress policy.

No service display name is added to the read model.

The Progress Engine returns workflow intent only. It cannot mutate state, execute a transition, append to the journal, or communicate with customers. Its decision is mapped to the existing UI-safe recommended action; no Progress Engine capability reaches the UI.

## UI Trust Boundary

The existing layout and components remain in place. They now consume:

- read-model identity, stage, revision, resolved service ID, escalation, completion, progress, next action, and release status;
- copied facts, corrections, missing required fields, and asked questions;
- safe decision and execution summaries;
- the existing validated handoff summary; and
- deterministic session errors.

The former raw customer-claim panel is replaced by the read model's asked-question history. Normal prototype rendering has no raw-state dependency.

## Failure Handling

- Rejected execution performs no mutation and still projects the current valid state.
- Duplicate execution preserves the already-current read model.
- Unknown transition and stale revision rejection preserve the current read model.
- Projection-context mismatch and malformed projection input return `projection-failure`.
- Projection failure exposes no raw state fallback and disables further UI input.
- Failure text is deterministic and contains no secrets or external data.
- No rejected or failed path invokes an external action.

## Reset

Reset creates a fresh foundation, manager, deterministic orchestrator, AI orchestrator, and integration boundary. It clears messages, pending input, handoff, errors, decision/execution summaries, and the execution-attempt flag.

The returned view contains a read-only initialized read model at revision zero.

## Verification

Run:

```powershell
npm.cmd run verify:prototype-read-model-integration
```

The focused suite proves initialized and executed projection, revision updates, immutable UI results, raw-state and capability isolation, rejected/duplicate/unknown/stale execution preservation, fail-closed projection errors, reset, deterministic equivalence, read-only `run()`, execution-enabled `runWithExecution()`, release denial, and the unchanged one-transition registry.

## Prohibited Capabilities

Sprint 5.3 adds no persistence, database, local storage, network call, HTTP client, external API, real provider, email, SMS, telephony, scheduling, CRM integration, authentication change, customer communication, business action, or customer-release authorization. Sprint 5.4 adds a separate process-local [Execution Journal](EXECUTION_JOURNAL.md); it is not exposed through the UI-safe integration result.

## Current Limitations

- All state remains process-local and in memory.
- The AI path remains a deterministic fictional mock.
- Exactly one AI-controlled transition exists.
- The UI is a developer prototype, not a production customer experience.
- The read model exposes a service identifier, not a display name.
- Customer release remains unauthorized.
- Execution journal history remains private to trusted internal code and verification.
