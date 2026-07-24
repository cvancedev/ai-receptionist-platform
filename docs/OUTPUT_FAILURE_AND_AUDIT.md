# Output Failure and Audit

## Failure Categories

- `ProviderResultIncomplete`
- `ProviderResultRefused`
- `UnknownOutputContract`
- `UnsupportedOutputContractVersion`
- `OutputContractMismatch`
- `RawOutputMalformed`
- `RequiredFieldMissing`
- `UnexpectedField`
- `InvalidEnumeration`
- `InvalidSourceReference`
- `InvalidProposalType`
- `ProposalTaskMismatch`
- `PermissionViolation`
- `ProhibitedOperation`
- `InvalidBusinessScope`
- `InvalidConversationScope`
- `ProfileVersionMismatch`
- `StateRevisionMismatch`
- `UnknownBusinessField`
- `UnknownService`
- `InactiveServiceReference`
- `HallucinatedKnowledge`
- `KnowledgeGroundingFailure`
- `ClaimFactAuthorityViolation`
- `CorrectionAuthorityViolation`
- `EscalationAuthorityViolation`
- `CompletionAuthorityViolation`
- `UnsafeCustomerText`
- `UnsupportedPromise`
- `DuplicateProposalProcessing`
- `DuplicateStateMutation`
- `DuplicateResponseRelease`
- `RepairNotAllowed`
- `RetryNotAllowed`
- `RetryExhausted`
- `ValidationCancelled`
- `UnknownOutputFailure`

## Fail-Closed Conditions

Output does not proceed when scope or contract cannot be proven; proposal type is unknown; required sources are missing; state is stale; profile or grounding compatibility fails; authority is prohibited; customer text is unsafe/unsupported; duplicate use is detected; or validation is ambiguous.

Partial or provider-classified output cannot downgrade a failure. Unknown failures stop safely.

## Audit Record

Conceptual fields include:

- request, trace, and provider-attempt identity;
- business/conversation scope, profile version, and state revision;
- task identifier/version;
- Context and Prompt Package identity;
- Output Contract identity/version;
- provider result category and safe raw-output hash/reference;
- parse, structural, semantic, scope, grounding, permission/prohibition, state, and duplicate results;
- final classification and application decision;
- accepted and rejected fields;
- repair, retry, fallback, and escalation paths;
- typed operations constructed and application result;
- response-release result;
- policy and validator versions; and
- timing and usage metadata.

The record distinguishes proposal, validation, decision, mutation, and release. Provider success and raw output are never authoritative evidence.

## Audit Restrictions

Audit records do not store secrets, credentials, hidden reasoning, prohibited sensitive content, cross-business data, or unnecessary duplicate customer content. Rejected dangerous content uses a safe hash, category, and bounded metadata when sufficient.

Audit storage must not become a replay path that bypasses current scope, revision, policy, validation, or duplicate guards.

## Reproducibility

Where practical, an authorized reviewer can explain:

- the expected contract and proposal type;
- validators and policy versions used;
- fields and layers that failed;
- why output was accepted, modified, rejected, repaired, retried, clarified, or escalated;
- the authoritative revision evaluated;
- typed operations constructed/applied;
- customer content approved/released; and
- duplicate guards evaluated.

Reproduction does not require retaining prohibited raw content.

## Duplicate and Idempotency Record

Every proposal has a stable request-linked identity. Processing state can distinguish parsed, validated, accepted, rejected, applied, and released. Future mutations and releases use purpose-specific idempotency keys where necessary.

Provider retry, network retry, duplicate callback, repeated application execution, or stale UI submission cannot repeat a mutation or message. A later attempt does not supersede an earlier accepted attempt without application policy.

## Current Boundary

Milestone 4.5 implements the typed failure catalog, validation-stage metadata, deterministic fixture classifications, and in-memory duplicate guards. It adds no audit store, repair/retry engine, Typed Operation Builder, release gate, monitoring integration, or persistence.

## Related Documents

- [Output Validation Pipeline](OUTPUT_VALIDATION_PIPELINE.md)
- [Output Repair, Retry, and Partial Acceptance](OUTPUT_REPAIR_RETRY_AND_PARTIAL_ACCEPTANCE.md)
- [Customer Response Release](CUSTOMER_RESPONSE_RELEASE.md)
- [AI Prototype Verification](AI_PROTOTYPE_VERIFICATION.md)
