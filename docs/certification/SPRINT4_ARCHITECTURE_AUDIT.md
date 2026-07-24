# Sprint 4 Architecture Audit

## Scope

This audit certifies the provider-independent AI prototype foundation implemented through Sprint 4.5. It evaluates the path from application-selected task through an immutable, read-only application decision. It does not certify a production model provider, production prompt, state application, persistence, networking, or customer communication.

The implementation baseline reviewed is commit `44291df32dca79bec1e0a9c14427da6da8dbb1a3` on `main`.

## Files Reviewed

- `src/ai/contracts/`: task, proposal, package, provider-result, validation-result, and decision contracts
- `src/ai/registries/`: task, output-contract, and policy-version registries
- `src/ai/context/context-package-builder.ts`
- `src/ai/prompts/prompt-package-composer.ts`
- `src/ai/gateway/model-gateway.ts`
- `src/ai/providers/mock-model-provider-adapter.ts`
- `src/ai/output/provider-result-normalizer.ts`
- `src/ai/output/raw-output-parser.ts`
- `src/ai/validation/proposal-validator.ts`
- `src/ai/validation/duplicate-processing-guard.ts`
- `src/ai/decisions/application-decision-engine.ts`
- `src/ai/prototype/ai-foundation-orchestrator.ts`
- `src/verification/ai-foundation.verify.ts`
- Sprint 4 architecture documents linked from [Sprint 4 Plan](../SPRINT_4_PLAN.md)

## Requirements and Evidence

| Requirement | Implementation evidence | Verification evidence | Result |
| --- | --- | --- | --- |
| AI output is untrusted | `ProviderAdapterResult.rawOutput` is `unknown`; completed output must pass `BoundedRawOutputParser` and `PrototypeProposalValidator` before a decision | Malformed, oversized, deeply nested, unknown-type, invalid-schema, scope, semantic, and authority cases fail closed | PASS |
| AI output cannot mutate conversation state | The AI orchestrator imports no state manager or conversation store; result contracts hard-code `stateMutationAuthorized: false` and `stateMutationOccurred: false` | Authoritative fixture equality is checked before and after execution; mutation attempts produce authority failures | PASS |
| AI output cannot execute business actions | No action executor or integration port exists in `src/ai`; unexpected action fields are rejected | `toolCall`, `externalAction`, release, escalation activation, completion, and mutation attempts are rejected | PASS |
| Proposals pass through parsing and validation | The orchestrator parses completed raw output, validates the parsed object, then runs duplicate and decision classification | Success and failure scenarios exercise the ordered path | PASS |
| Unsupported task IDs fail closed | `TaskRegistry.resolve` returns `UnknownTask`; the gateway resolves the task before adapter execution | Unknown task and unsupported version assertions pass | PASS |
| Unsupported proposal types fail closed | Proposal type must pass `isModelProposalIdentifier` and match task and contract | Unknown proposal type produces `UnknownProposalType` and is not accepted | PASS |
| Providers are replaceable behind the gateway | `ModelProviderAdapter` is an interface injected into `PrototypeModelGateway`; provider result contracts contain no SDK types | Mock adapters are instantiated behind the same gateway boundary; dependency scan finds no provider SDK | PASS |
| Context Packages are immutable | Builder clones mutable input structures and returns `deepFreeze(contextPackage)` | Root and nested state/history objects are frozen; source facts are not referenced directly | PASS |
| Prompt Packages are immutable | Composer creates provider-neutral references and returns `deepFreeze(promptPackage)` | Root and nested contract references are frozen | PASS |
| Normalized results are immutable | Normalizer clones nested usage/error data and deep-freezes the result | Root and nested usage metadata are frozen | PASS |
| Duplicate proposals are safe | `DuplicateProcessingGuard` records stable proposal IDs before the decision; a repeat becomes `DuplicateProposalProcessing` | First registration succeeds; repeated registration is rejected; duplicate orchestrator execution is not accepted | PASS |
| Malformed output cannot bypass validation | Parser accepts only one bounded plain JSON object, rejects dangerous keys and excessive depth, and returns an inert frozen value | Empty, malformed, trailing, array, dangerous-key, oversized, and excessive-depth cases fail | PASS |
| Read-only decisions have no side effects | `ApplicationDecisionEngine.decide` only constructs and freezes a value; authorization flags are always false | Repeated decisions are identical and both authorization flags remain false | PASS |

## Remaining Risks

- Certification covers the deterministic mock adapter, not a real model or provider transport.
- The in-memory duplicate guard is process-local and is not durable across restarts.
- Parser limits apply after a provider result has been received; transport-level byte and timeout enforcement remains future work.
- No production audit store or runtime side-effect monitor exists.
- Future code could introduce a side-effect dependency unless equivalent boundary checks remain part of certification.

## Conclusion

All Sprint 4 architecture requirements reviewed above pass for the current isolated prototype foundation. The architecture stops at an immutable application decision and provides no implementation path from model output to mutation, persistence, customer release, networking, or business action execution.
