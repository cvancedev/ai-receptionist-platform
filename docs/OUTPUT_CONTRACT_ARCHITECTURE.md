# Output Contract Architecture

## Purpose

An application-owned, provider-neutral Output Contract specifies:

- one allowed proposal type;
- required and optional structure;
- null, missing, unknown, uncertain, and unsupported behavior;
- scope and source-reference fields;
- enumerations, length/count, and nesting limits;
- unsupported-action and refusal behavior;
- version compatibility; and
- validation expectations.

It is not provider schema syntax, arbitrary JSON, a tool-call definition, or authority for a model to act.

## Contract Identity

Every request binds before provider execution to:

- `outputContractIdentifier`;
- `outputContractVersion`;
- compatible task identifier/version;
- compatible Context Contract version;
- compatible Prompt Policy version; and
- compatible validator version.

The Prompt Package carries these bindings. A provider response cannot select, replace, widen, or downgrade the contract.

## Contract Categories

Narrow conceptual contracts exist for:

- interpretation proposals;
- candidate fact proposals;
- clarification drafts;
- customer-response drafts;
- knowledge-grounded answers;
- conversation summaries;
- escalation recommendations; and
- unsupported-request interpretations.

Unknown proposal types and generic action containers are rejected.

## Contract Rules

Contracts are explicit, versioned, narrow, scope-preserving, and task-compatible. They:

- require source references where evidence is necessary;
- distinguish missing from null, unknown, uncertain, and unsupported;
- reject unsupported operations and authority claims;
- constrain strings, arrays, nesting, and enumerations;
- define whether independent field-level acceptance is allowed;
- avoid generic unbounded JSON blobs and arbitrary tool-call structures; and
- keep provider response-schema types outside application architecture.

Contract validity is necessary but not sufficient; semantic, authority, scope, state, grounding, safety, and duplicate validation still apply.

## Additional Fields

The default is fail-closed:

- unknown action-like or authority-like fields are rejected;
- harmless extras may be ignored only under an explicit version compatibility policy;
- provider diagnostics may be preserved outside the proposal for safe operational review; and
- extra content is never treated as application instructions or permission.

Trailing prose is rejected when the contract permits only one bounded object.

## Refusal and Incomplete Results

Contracts define how an explicit refusal, missing value, unsupported request, and incomplete output are represented. Provider refusal metadata is normalized separately and cannot be disguised as a valid empty proposal.

Truncation or ambiguous multi-object output fails unless that exact shape is contractually supported.

## Contract Evolution

- **Backward-compatible change:** optional semantics only when old validators and consumers remain safe.
- **Breaking change:** new required fields, meaning, authority, proposal category, or validation behavior requires a new version.
- **Deprecation:** prevents new selection after an approved transition while preserving historical evaluation.
- **Version pinning:** keeps a task/prompt/validator combination on an approved compatible contract.
- **Rollout:** uses explicit compatibility review and regression evidence.
- **Rollback:** returns to a prior approved compatible version; it cannot revive a safety-suspended contract.
- **Audit continuity:** historical records retain the exact contract and validator versions.

No schema registry, code generator, JSON Schema, Zod schema, or rollout system is implemented.

## Validation Compatibility

The Output Contract Registry must reject combinations where task permissions, Context/Prompt Package versions, or validator behavior disagree. A provider adapter may express an equivalent response format but cannot change contract semantics.

## Related Documents

- [Model Proposal Catalog](MODEL_PROPOSAL_CATALOG.md)
- [Prompt Architecture](PROMPT_ARCHITECTURE.md)
- [Output Validation Pipeline](OUTPUT_VALIDATION_PIPELINE.md)
- [Model Output Contract](MODEL_OUTPUT_CONTRACT.md)
