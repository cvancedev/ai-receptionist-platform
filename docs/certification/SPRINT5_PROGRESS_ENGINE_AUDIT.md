# Sprint 5 Progress Engine Audit

## Scope

This audit evaluates `src/conversation-progress/`, its application-owned input construction, and the dedicated mapping into the Conversation Read Model.

## Input Trust Boundary

`DeterministicConversationProgressEngine.evaluate()` accepts `unknown` and requires an exact top-level shape containing only:

- conversation and Business Profile identity/version;
- state revision and stage;
- application-resolved service status and identity;
- application-resolved required, satisfied, missing, and correction-reopened field identifiers;
- escalation and completion state;
- explicit completion eligibility; and
- versioned progress policy.

Raw AI output, prompts, provider results, arbitrary customer input, state managers, executors, journals, and callbacks are rejected as extra or malformed input.

## Validation Results

| Requirement | Evidence | Result |
| --- | --- | --- |
| Narrow trusted context | Exact-key validation and discriminated service context | PASS |
| Malformed input fails closed | Unknown stage and extra model-output field return `MalformedProgressInput` | PASS |
| Contradictory input fails closed | Required-field partition, duplicate, overlap, reopened subset, service, completion, and stage consistency checks | PASS |
| Decision allowlist is exact | Contract contains exactly six values | PASS |
| Evaluation precedence is explicit | Ordered evaluator and architecture document define the same nine steps | PASS |
| Required fields are application-authoritative | Prototype integration derives them from the active Business Profile and intake resolver | PASS |
| Optional facts do not satisfy requirements | Only identifiers in the required partition may appear as satisfied | PASS |
| Corrections reopen requirements | Reopened fields must also be required and missing | PASS |
| Ambiguous service clarifies | `ambiguous` and `unresolved` return `clarify_service` after higher-priority rules | PASS |
| Unsupported service follows policy | Version 1 allows only `review_escalation` or `none` | PASS |
| Escalation precedence is deterministic | Reviewable escalation is evaluated before completion and routine intake | PASS |
| Completion is application-defined | Explicit eligibility, resolved service, empty missing/reopened sets, and consistent state are required | PASS |
| Completion does not release | Every decision has `customerReleaseAuthorized: false` | PASS |
| Engine cannot mutate or execute | No manager, registry, validator, executor, journal, callback, or operation is accepted or imported | PASS |
| Dedicated mapping is used | Projector calls `mapProgressDecisionToReadModelAction`; unknown values map to `null` and fail projection | PASS |
| No competing next-action authority remains | Production search finds recommendation derivation only through the Progress Engine and mapping | PASS |

## Decision Vocabulary

The complete allowlist is:

1. `begin_intake`
2. `ask_required_field`
3. `clarify_service`
4. `review_escalation`
5. `intake_complete`
6. `none`

No arbitrary action string or transition identifier is produced.

## Evaluation Precedence

1. Validate the full input.
2. Review active escalation.
3. Recognize valid completion eligibility.
4. Stop for abandonment.
5. Begin initialized intake.
6. Apply unsupported-service policy.
7. Clarify unresolved or ambiguous service.
8. Ask missing or correction-reopened required fields.
9. Return no applicable intent.

## Authority Boundary

A Progress Decision is not an Application Decision, State Execution Request, transition identifier, typed state operation, customer message, or release authorization. The engine never calls the Transition Registry, Transition Validator, State Executor, Conversation State Manager, or Execution Journal.

The Read Model uses the same string vocabulary through an explicit mapping, but its action remains presentation data. No Progress Decision is currently mapped to execution.

## Remaining Limitations

- Context resolution remains application-owned and must be correct before evaluation.
- Unsupported-service policy has one process-local version.
- The engine produces intent only; most decisions have no executable transition.
- Exactly one AI-controlled transition exists.
- No durable policy store, real provider, customer release, or external action exists.

## Conclusion

All Progress Engine requirements pass. The engine is deterministic, fail closed, deeply immutable, application-authoritative for workflow intent, and incapable of state mutation, transition execution, journal writing, or customer release.
