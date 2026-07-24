# Output Repair, Retry, and Partial Acceptance

## Recovery Categories

- deterministic local repair;
- model-assisted repair;
- full retry;
- reduced-context retry;
- alternate approved-provider retry;
- clarification fallback;
- deterministic fallback; and
- safe stop.

The application selects the path. Recovery never turns invalid output into authority or bypasses full validation.

## Deterministic Local Repair

Allowed only under explicit contract policy for non-authoritative transformations such as whitespace/case normalization, harmless formatting, known serialization-wrapper removal, or a bounded field-name alias.

It must not repair missing scope/revision/source references, unknown proposal types, unsupported operations, hallucinated services/knowledge, authority claims, ambiguous values, unsafe customer text, or semantic contradictions.

The original safe hash/reference, repair rule/version, before/after classification, and validation result remain auditable.

## Model-Assisted Repair

Deferred unless a later milestone explicitly approves it. If allowed later, it is a separate allowlisted task with a bounded repair contract, receives safe validation errors without broader context, preserves original scope/task/contract, undergoes the complete pipeline, and counts against retry/cost limits.

A model never approves or recursively repairs its own output.

## Retry Approval

Application policy evaluates failure category, task, cost and latency classes, attempt count, provider status, current Context/Prompt Package compatibility, customer experience, and whether any mutation/release occurred.

Every retry:

- uses the same logical request or linked attempt identity;
- preserves trace continuity and task scope;
- uses current validated context/state;
- records attempt number/reason;
- remains bounded and cost-aware; and
- cannot duplicate state or customer messages.

A reduced-context retry uses a newly validated package and cannot remove essential authority, grounding, or safety. An alternate provider must already be approved and preserve the same provider-neutral contract.

## Non-Retryable Failures

- cross-business or cross-conversation data;
- scope mismatch;
- unknown task or proposal;
- unsupported action or policy violation;
- secret exposure;
- persistent contract mismatch;
- duplicate mutation/release attempt;
- stale state requiring fresh evaluation;
- explicit cancellation; and
- any recovery that would weaken safeguards.

## Partial Acceptance

Field-level acceptance requires explicit contract support, independent validity, no semantic dependency, preserved essential grounding, and itemized audit.

Scope, contract, revision, permissions/prohibitions, action-like unknown fields, customer-release safety, and required grounding are never partially accepted. If one invalid field changes the meaning of another, the whole dependent group is rejected.

## Exhaustion

After the bounded attempt limit, the application uses deterministic fallback, requests clarification, escalates through policy, or stops safely. Retries are never indefinite and exhaustion never authorizes degraded validation.

## Duplicate Boundaries

A later retry result does not automatically supersede an accepted result. Proposal, operation, and release guards determine the one eligible attempt and reject repeated effects.

## Prototype Status

Milestone 4.5 represents repairable/retryable/partial outcomes and verifies deterministic classification. It does not execute repairs or retries. Partial acceptance is exercised only through a contract marked `independent_fields`; authority/scope failures remain non-partial.

## Related Documents

- [Proposal Decision and Application](PROPOSAL_DECISION_AND_APPLICATION.md)
- [AI Failure and Recovery](AI_FAILURE_AND_RECOVERY.md)
- [AI Cost and Usage Boundaries](AI_COST_AND_USAGE_BOUNDARIES.md)
- [AI Prototype Verification](AI_PROTOTYPE_VERIFICATION.md)
