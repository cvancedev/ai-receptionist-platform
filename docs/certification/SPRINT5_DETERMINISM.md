# Sprint 5 Determinism Audit

## Definition

For Sprint 5 certification, determinism means that fresh process-local components starting from equivalent trusted inputs and equivalent internal sequence state produce JSON-equivalent platform-controlled outputs and resulting state.

For stateful guards and journals, the same initial state and operation sequence are required. Object reference identity and runtime instance identity are not compared. No material result metadata is excluded: the prototype uses the fixed string `prototype-deterministic` instead of wall-clock timestamps.

This definition applies only to the deterministic fictional mock and deterministic application processing. It does not claim that a future real model provider, transport, clock, distributed store, or external service will be deterministic.

## Evidence Matrix

| Boundary | Equivalent inputs | Equivalent outputs | Verification evidence | Result |
| --- | --- | --- | --- | --- |
| Application decision | Same validated proposal and Output Contract | Immutable Application Decision | `verify:ai-foundation` layer-by-layer comparison | PASS |
| Transition validation | Same request, registry, current state, and fresh duplicate guard | Same approval or failure classification | State-execution negative and fresh execution scenarios | PASS |
| Execution Result | Same approved request and fresh equivalent manager/executor | Same previous/new snapshots, reason, metadata, and fixed timestamp | `verify:state-execution` | PASS |
| Resulting state | Same initialized scope and transition | Same stage, revision, identity, and unrelated data | `verify:state-execution` | PASS |
| Journal entry | Same Execution Result and fresh journal sequence | Same entry ID, sequence, outcome, scope, revisions, and timestamps | `verify:execution-journal` | PASS |
| Read Model | Same state snapshot and projection context | Same deeply immutable projection | `verify:conversation-read-model` | PASS |
| Progress Decision | Same validated progress input and policy | Same decision, reason, and deterministic metadata | `verify:conversation-progress` | PASS |
| UI-safe integration | Fresh equivalent sessions and same fictional input | Same decision/execution summaries and Read Model | `verify:prototype-read-model-integration` | PASS |
| End-to-end mock foundation | Same task, packages, mock scenario, and policy | Same normalized, parsed, validated, decided snapshot | `verify:ai-foundation` | PASS |

## Deterministic Ordering

- Transition definitions use an immutable static registry.
- Required-field collections are application-resolved and validated as exact sets represented by deterministic arrays.
- Read-model facts and corrections are ordered by sequence and field.
- Journal sequence begins at one and increments by one.
- Journal identity is `execution-journal-{sequence}-{executionId}`.
- Mock provider output, usage, duration, and timestamps are fixed fixtures.
- Progress evaluation follows one documented precedence list.

## Stateful Boundaries

Duplicate guards and journals are intentionally stateful. Determinism is asserted across fresh instances receiving the same ordered calls. Reusing one instance changes the expected result: a second execution becomes a duplicate and a second journal append receives sequence two. That behavior is deterministic for the same prior state.

## Limitations

- JSON equivalence is suitable for the current plain-data contracts but is not a general canonical serialization standard.
- Process restart loses duplicate and journal state.
- No concurrent or distributed scheduling is present.
- Real model sampling, provider latency, wall-clock time, random identifiers, transport retries, and external state are absent and not certified.

## Conclusion

Identical trusted inputs and equivalent initial component state produce equivalent application decisions, transition results, stored state, journal entries, Read Models, Progress Decisions, and UI-safe integration results throughout the current mock-only Sprint 5 architecture.
