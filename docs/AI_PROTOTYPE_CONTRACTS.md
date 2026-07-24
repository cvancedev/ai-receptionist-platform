# AI Prototype Contracts

## Identity

`AiOperationIdentity` binds request, trace, business, conversation, profile version, state revision, task identifier, and task version. `AiPackageIdentity` adds Context Package, Prompt Package, Output Contract, and contract-version identity.

Plain narrow aliases match existing project conventions; no branded-type framework is introduced.

## Task and Proposal Allowlists

The eight task identifiers are:

- `language_interpretation`
- `candidate_fact_extraction`
- `clarification_proposal`
- `response_drafting`
- `knowledge_grounded_answer`
- `conversation_summary`
- `escalation_recommendation`
- `unsupported_request_interpretation`

The compatible proposal identifiers are:

- `intent_interpretation`
- `candidate_fact`
- `clarification_text`
- `customer_response_draft`
- `knowledge_grounded_answer`
- `conversation_summary`
- `escalation_recommendation`
- `unsupported_request_interpretation`

Runtime type guards and immutable registries reject unknown identifiers and unsupported versions.

## Task Definitions

Each approved version records compatible proposal/contract, required Context sections, allowed/prohibited behavior, retry classification, cost class, and latency class. Definitions contain no prompt prose.

## Context and Prompt Packages

The Context Package includes explicit scope/revision identity; business projection; deterministic state; separately typed facts, claims, corrections, knowledge, history, and current input; policy versions; provenance; budget; and validation metadata.

The Prompt Package contains scope identity and references to the task, authority/permission/prohibition policies, Output Contract, Context Package sections, style policy, composer/prompt versions, budget, provenance, and validation. It contains no provider message structure.

## Output Contracts

Each proposal has one versioned registry-backed contract defining required, optional, and allowed fields; expected field types; source/scope fields; size limits; reject-extra policy; and partial-acceptance policy.

Contracts are explicit TypeScript data plus validation functions—not JSON Schema, Zod, provider schema objects, or arbitrary tool calls.

## Provider Results

The provider-neutral union covers `completed`, `refused`, `incomplete`, `failed`, and `cancelled`, with request/trace/adapter/attempt identity, inert raw output, usage, finish/error, and duration metadata.

## Validation and Decisions

Validation statuses are `valid`, `invalid`, `repairable`, `retryable`, and `cancelled`. Results contain typed failures, warnings, accepted/rejected fields, per-stage results, validator version, trace, and an immutable proposal reference.

Application decisions are:

- `accepted`
- `partially_accepted`
- `rejected`
- `repair_required`
- `retry_approved`
- `clarification_required`
- `deterministic_fallback`
- `escalation_recommended`
- `safe_stop`
- `cancelled`

Every decision has reasons and explicitly sets mutation and customer-release authorization to `false`.

## Failure Catalog

The typed catalog includes all required task/contract, Context/Prompt, provider, scope/revision, structural/semantic, authority, duplicate, and recovery failures. The prototype exercises the safety-critical subset; future milestones may exercise additional defined categories without changing their meaning silently.

## Registry and Policy Versions

Task and Output Contract registries are read-only through list/resolve methods. Policy constants identify application authority, prompt, Context Contract, response style, validator, and composer versions.

## Related Documents

- [AI Integration Prototype Foundation](AI_INTEGRATION_PROTOTYPE_FOUNDATION.md)
- [Model Task Catalog](MODEL_TASK_CATALOG.md)
- [Model Proposal Catalog](MODEL_PROPOSAL_CATALOG.md)
- [Output Contract Architecture](OUTPUT_CONTRACT_ARCHITECTURE.md)
