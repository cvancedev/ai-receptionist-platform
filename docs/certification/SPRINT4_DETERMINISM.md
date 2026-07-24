# Sprint 4 Determinism Audit

## Definition

For this certification, determinism means that two fresh executions using semantically identical approved inputs and the deterministic mock adapter produce JSON-equivalent outputs at every platform-controlled stage. Stateful duplicate handling is compared using two fresh guards receiving the same operation sequence.

This definition does not claim that a future real model provider will be deterministic.

## Test Setup

`src/verification/ai-foundation.verify.ts` constructs two independent fictional fixtures with the same identifiers, task, profile version, state revision, context, policy versions, and mock scenario. It compares each stage with JSON equivalence and separately verifies frozen results and authority invariants.

## Inputs and Outputs Compared

| Stage | Inputs compared | Outputs compared | Evidence | Result |
| --- | --- | --- | --- | --- |
| Task selection | Same allowlisted task ID/version | Resolved task definition | `verifyLayerByLayerDeterminism` | PASS |
| Context assembly | Equivalent fixture, task, and policy values | Context Package | Same function | PASS |
| Prompt composition | Equivalent task, Context Package, contract, and policy values | Prompt Package | Same function | PASS |
| Mock provider | Equivalent gateway request and scenario | Provider adapter result | Same function | PASS |
| Normalization | Equivalent provider results | Normalized result | Same function | PASS |
| Parsing | Equivalent raw output | Frozen parsed object | Same function | PASS |
| Validation | Equivalent proposal, task, contract, context, prompt ID, and profile | Layered validation result | Same function | PASS |
| Duplicate guard | Fresh guards receiving the same first and repeated proposal IDs | Registration results and snapshots | Same function | PASS |
| Application decision | Equivalent validation and contract | Frozen read-only decision | Same function | PASS |
| End-to-end snapshot | Fresh orchestrators with the same scenario | AI foundation snapshot | `verifyDeterminismAndInvariants` | PASS |

## Additional Invariants

- Deterministic fixture timestamps use the constant `prototype-deterministic`.
- The mock adapter uses fixed usage, duration, finish reason, and fixture output for each scenario.
- Context and Prompt Packages are deep-frozen.
- Normalized results, parsed proposals, validation results, decisions, and final snapshots are frozen where designed.
- The authoritative conversation fixture is unchanged after repeated execution.

## Limitations

- The certification covers only the deterministic mock path and deterministic application processing.
- Wall-clock time, random identifiers, real provider sampling, transport retries, and provider-side behavior are absent.
- The duplicate guard is intentionally stateful; determinism is defined over the same initial guard state and input sequence.
- JSON equivalence is sufficient for the current plain-data contracts but is not a general canonicalization standard.

## Conclusion

The current deterministic mock pipeline produces identical results for identical approved inputs at every certified stage. No determinism claim is made for a future real model provider.
