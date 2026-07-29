# Sprint 5 Architecture Audit

## Scope

This audit covers Sprint 5.1 through Sprint 5.5 as one controlled, deterministic, process-local conversation architecture. It evaluates controlled execution, immutable projection, prototype integration, execution journaling, and deterministic progress decisions.

The implementation baseline reviewed is commit `ddcd1c837f61a6dd18b37e0f53512958529cabca` on `main`. Historical Sprint 4 certification remains unchanged.

This audit does not certify production readiness, persistence, networking, real providers, customer communication, customer-release authority, scheduling, CRM integration, replay, retry execution, or external business actions.

## Files Reviewed

- `src/ai/execution/`
- `src/ai/execution-journal/`
- `src/ai/prototype/ai-foundation-orchestrator.ts`
- `src/conversation/`
- `src/conversation-read-model/`
- `src/conversation-progress/`
- `src/prototype-ui/`
- `src/verification/`
- `src/ai/contracts/`, `src/ai/context/`, `src/ai/prompts/`, `src/ai/gateway/`, `src/ai/providers/`, `src/ai/output/`, `src/ai/validation/`, and `src/ai/decisions/`
- Sprint 5 architecture documents linked from [Sprint 5 Plan](../SPRINT_5_PLAN.md)
- Sprint 4 certification documents in this directory

## Authority Model

```text
trusted application context
  -> Progress Engine
  -> immutable Progress Decision
  -> explicit read-model mapping
  -> immutable Read Model
  -> presentation only

approved Application Decision
  -> Transition Registry
  -> Transition Validator
  -> State Executor
  -> Conversation State Manager
  -> immutable Execution Result
  -> append-only Execution Journal
```

Responsibilities remain separated:

| Component | Owns | Does not own |
| --- | --- | --- |
| Conversation State Manager | Current state, scoped validated updates, revision increments | AI interpretation, projection, journal policy |
| Transition Registry | Explicit executable transition definitions | Transition selection from model content |
| Transition Validator | Execution approval, scope, revision, policy, legality, duplicate checks | State mutation |
| State Executor | Applying an approved typed transition through the manager | Business rules, task selection, customer release |
| Progress Engine | Deterministic next-workflow intent from trusted application context | Mutation, execution, journaling, customer communication |
| Read Model Projector | Validated immutable projection | State or execution authority |
| Execution Journal | Safe append-only execution-result metadata | State, replay, retry, validation, or execution authority |
| Prototype UI | Presentation of immutable UI-safe data | Raw state, managers, executors, callbacks, transition requests |

## Requirements and Evidence

| Requirement | Implementation evidence | Verification evidence | Result |
| --- | --- | --- | --- |
| AI remains advisory | AI decisions retain literal false mutation and release flags | `verify:ai-foundation`, `verify:state-execution` | PASS |
| Controlled mutation has one explicit path | `runWithExecution()` constructs the canonical request; executor delegates only after validation | Legal, malformed, stale, scope, policy, illegal, and duplicate cases | PASS |
| Transition set is explicit and immutable | `StateTransitionRegistry` deep-freezes one definition | Registry count, identity, stage pair, conditions, and unknown lookup assertions | PASS |
| Unknown or malformed execution fails closed | Validator accepts `unknown`, checks exact request and nested control shapes, then resolves allowlists | Raw output, unvalidated proposal, malformed decision, unknown task/proposal/transition assertions | PASS |
| Rejected execution does not mutate | Executor returns rejected immutable results without calling the manager after failed validation | State equivalence before and after every rejection category | PASS |
| State identity and revision remain authoritative | Validator snapshots exact scope and matches current stage/revision; manager revalidates scope and candidate state | Deterministic execution and scope-preservation assertions | PASS |
| Read Model is projection only | Projector receives a snapshot and trusted context, returns copied deep-frozen data | Determinism, source integrity, nested reference isolation, malformed input, callback non-invocation | PASS |
| Progress Engine is the sole next-intent evaluator | Projector calls `DeterministicConversationProgressEngine` and maps through `progress-decision-mapping.ts` | Exact six-value equality, exhaustive mapping, unknown mapping rejection | PASS |
| Prototype UI receives data, not authority | UI contract contains the Read Model and copied summaries only | Raw state, manager, executor, callback, and transition capability absence assertions | PASS |
| Journal is audit only | Journal exposes only append and snapshot and stores bounded metadata | Authority absence, append-only snapshots, reset, unknown outcome, and no-mutation assertions | PASS |
| Immutable contracts are enforced at runtime | Registry, results, decisions, packages, projections, journal entries, and snapshots are recursively frozen | Focused deep-freeze and mutation-rejection assertions | PASS |
| Deterministic boundaries are explicit | Prototype timestamps and fixtures are fixed; evaluators use no clock, randomness, network, or hidden mutable policy | Fresh-instance equivalence at every certified layer | PASS |
| Fail-closed boundaries reject contradictions | Execution, projection, progress, parsing, validation, and journal inputs are validated before authority or storage | Every focused negative suite passes | PASS |
| Customer release remains unauthorized | Foundation decision, Progress Decision, and Read Model flags remain false | AI, progress, read-model, and integration assertions | PASS |

## Certification Correction

The audit identified that the journal's runtime metadata guard accepted several malformed forged Execution Results, including a zero Business Profile version, blank canonical identifiers, an invalid proposal identifier type, inconsistent success metadata, and mismatched embedded state scope.

The guard was narrowed to require exact result and metadata shapes, positive profile version, non-empty identifiers, valid revisions, consistent applied/rejected semantics, and matching embedded state scope. Focused negative assertions now prove these inputs return `UntrustedExecutionMetadata` and append nothing.

This correction closes an existing fail-closed contract. It adds no transition, mutation path, external capability, or product behavior.

## Immutable and Fail-Closed Boundaries

- Context and Prompt Packages remain copied and deeply frozen.
- Provider output remains `unknown` until bounded inert parsing.
- Proposal, decision, execution request, projection context, progress input, and journal metadata each cross a separate validation boundary.
- Unknown tasks, proposals, transitions, decisions, outcomes, mappings, stages, policies, and contradictory context do not receive authority.
- Rejected execution preserves state.
- Projection and Progress Engine failures produce immutable failure values.
- Journal rejection produces no entry and cannot affect the underlying execution result.

## Residual Risks

- All state, duplicate guards, and journal entries are process-local and non-durable.
- Execution and journal append are non-transactional.
- In-process TypeScript contracts do not provide cryptographic provenance; trusted application construction and runtime validation remain the enforcement model.
- The existing deterministic Conversation Engine has broader application-owned mutation operations than the one-transition AI execution registry. Those predate Sprint 5 and remain separately validated.
- A successfully validated execution identity is registered before state application; a later state-application failure is not retryable in that executor instance.
- No production authorization, durable idempotency, concurrency control, or external side-effect boundary is certified.

## Conclusion

All Sprint 5 architectural requirements pass after the focused journal trust-boundary correction. Mutation, projection, progress evaluation, audit, and presentation remain separated. No reviewed path allows AI output, Progress Decisions, Read Models, journal entries, or UI data to bypass the application-owned execution boundary.
