# Model Output Validation Architecture

## Purpose

Model Output Validation is the complete application-owned boundary between raw provider output and any authoritative use. Raw output is untrusted and may become only:

- rejected, repairable, or retryable;
- a clarification, deterministic fallback, escalation, safe-stop, or cancellation path;
- a validated proposal;
- application-constructed typed operations; or
- separately approved customer-facing text.

Raw output never skips directly to state mutation, handoff construction, escalation, completion, or customer release.

## Validation Layers

1. Provider Result Normalization
2. Transport and Completion Validation
3. Contract Selection Validation
4. Raw Parsing
5. Structural Validation
6. Scope Validation
7. Proposal-Type Validation
8. Permission Validation
9. Prohibition Validation
10. Semantic Validation
11. State Compatibility Validation
12. Business Profile Validation
13. Knowledge-Grounding Validation
14. Customer-Text Safety Validation
15. Duplicate and Idempotency Validation
16. Application Decision
17. Typed Operation Construction
18. Customer Response Release Approval
19. Audit Recording

Provider success means only that a result is available. The provider and model do not select contracts, validate authority, approve repairs/retries, make application decisions, construct authoritative operations, or release text.

## Conceptual Components

- **Provider Result Normalizer:** converts provider-specific completion, refusal, truncation, error, and metadata into provider-neutral categories.
- **Output Contract Registry:** resolves the application-selected contract and compatible versions.
- **Raw Output Parser:** performs bounded, inert, contract-aware parsing without executing content.
- **Structural Validator:** checks fields, types, limits, enumerations, nesting, references, and contract version.
- **Scope Validator:** proves request, business, conversation, profile, state, Context Package, and Prompt Package identity.
- **Proposal Validator:** accepts only the task-compatible allowlisted proposal type.
- **Permission Validator:** verifies every proposed field is permitted for the selected task.
- **Prohibition Validator:** rejects forbidden operations, authority, fields, and disclosures.
- **Semantic Validator:** checks meaning, evidence, uncertainty, contradictions, and action equivalence.
- **State Compatibility Validator:** compares the proposal with the current authoritative revision and lifecycle.
- **Business Profile Validator:** verifies fields, services, rules, destinations, and profile version.
- **Knowledge Grounding Validator:** proves material claims against included approved knowledge provenance.
- **Customer Response Validator:** checks safety, audience, promises, facts, internal disclosure, and release suitability.
- **Duplicate Operation Guard:** detects repeated proposal processing, mutation, and response release.
- **Application Decision Engine:** deterministically classifies accepted, modified, rejected, fallback, retry, or escalation paths.
- **Typed Operation Builder:** constructs only application-approved operations from validated candidate inputs.
- **Response Release Gate:** independently approves customer-visible content and its release identity.
- **Proposal Audit Recorder:** records safe inputs, versions, validation, decision, effects, and release outcomes.

These components are conceptual and are not implemented.

## Inputs

- `requestId` and `traceId`;
- `businessId` and `conversationId`;
- `profileVersion` and `stateRevision`;
- `taskIdentifier` and `taskVersion`;
- `contextPackageId` and `promptPackageId`;
- `outputContractIdentifier` and `outputContractVersion`;
- normalized provider result and provider metadata;
- application policy and validator versions;
- current authoritative state snapshot;
- approved Business Profile; and
- approved knowledge provenance.

All validation uses explicit identifiers. Provider-returned identity cannot replace application-bound identity.

## Outcomes

- `Accepted`
- `PartiallyAccepted`
- `Rejected`
- `RepairRequired`
- `RetryApproved`
- `ClarificationRequired`
- `DeterministicFallback`
- `EscalationRecommended`
- `SafeStop`
- `Cancelled`

Every outcome includes reason codes, evaluated revision, contract and validator versions, accepted/rejected portions where applicable, and next-path metadata. `EscalationRecommended` is not escalation activation.

## Immutability and Authority

Validation operates against read-only request, context, prompt, provider-result, profile, knowledge, and state snapshots. Validators have no mutation or delivery side effects.

After a deterministic application decision, the application may construct typed operations. The Conversation State Manager rechecks scope and current revision before atomic application. Customer text passes a separate release gate and cannot claim an operation succeeded until application confirms it.

## Task Validation Profiles

- **Language interpretation:** allowed candidates, active service, explicit ambiguity, current source message.
- **Fact extraction:** eligible field/value shape/source; existing facts are not overwritten.
- **Clarification:** application-requested ambiguity and approved options only.
- **Response drafting:** exact approved action, deterministic facts, no internal metadata or promises.
- **Knowledge answer:** every material business claim grounded in eligible included knowledge.
- **Summary:** facts/claims/corrections/contradictions and chronology remain distinct.
- **Escalation recommendation:** policy-grounded recommendation only; current escalation state preserved.
- **Unsupported interpretation:** active candidates only; unsupported status remains advisory.

## Current Boundary

Milestone 4.5 implements a focused prototype normalizer, bounded inert parser, explicit contract/scope/semantic/authority validator, duplicate proposal guard, and deterministic decision classifier. It does not implement production schemas/validators, Typed Operation Builder, release gate, repair/retry execution, real provider/model, API, networking, persistence, or authentication.

## Related Documents

- [Model Proposal Catalog](MODEL_PROPOSAL_CATALOG.md)
- [Output Contract Architecture](OUTPUT_CONTRACT_ARCHITECTURE.md)
- [Output Validation Pipeline](OUTPUT_VALIDATION_PIPELINE.md)
- [Proposal Decision and Application](PROPOSAL_DECISION_AND_APPLICATION.md)
- [Customer Response Release](CUSTOMER_RESPONSE_RELEASE.md)
- [Output Failure and Audit](OUTPUT_FAILURE_AND_AUDIT.md)
- [AI Integration Prototype Foundation](AI_INTEGRATION_PROTOTYPE_FOUNDATION.md)
