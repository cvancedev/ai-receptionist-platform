# AI Integration Prototype Foundation

## Purpose

Sprint 4, Milestone 4.5 implements the smallest provider-neutral, deterministic prototype proving that the approved AI architecture can be represented safely in TypeScript.

The implementation stops at an immutable application decision. It never mutates conversation state, releases customer text, calls a real provider, accesses the network, loads credentials, or persists data.

## Flow

```text
Application-selected task
  -> Task Registry
  -> Context Package Builder
  -> Prompt Package Composer
  -> provider-neutral Model Gateway
  -> deterministic MockModelProviderAdapter
  -> Provider Result Normalizer
  -> bounded inert JSON parser
  -> layered Proposal Validator
  -> Duplicate Processing Guard
  -> deterministic Application Decision Engine
  -> immutable result snapshot
```

## Module Structure

```text
src/ai/
  contracts/   identity, catalogs, packages, provider/validation/decision results
  registries/  tasks, output contracts, policy versions
  context/     deterministic Context Package Builder
  prompts/     deterministic provider-neutral Prompt Package Composer
  gateway/     Model Gateway and adapter interfaces
  providers/   deterministic mock adapter and fixture scenarios
  output/      result normalization and bounded inert parsing
  validation/  contract/scope/semantic/authority checks and duplicate guards
  decisions/   deterministic decision classification
  prototype/   fictional fixtures and read-only orchestration
  shared/      deep immutability helper
```

Dedicated verification lives at `src/verification/ai-foundation.verify.ts`.

Sprint 4 certification evidence is recorded in [Sprint 4 Certification](certification/SPRINT4_CERTIFICATION.md).

## Implemented Boundaries

- Eight allowlisted task identifiers and task definitions.
- Eight allowlisted proposal identifiers and registry-backed Output Contracts.
- Fifty-one typed failure categories covering tasks, packages, provider results, scope, structure, semantics, authority, duplicates, and recovery.
- Narrow immutable Context and Prompt Packages with policy, budget, provenance, and validation metadata.
- Provider-neutral gateway request/result types and adapter interface.
- A mock adapter with explicit deterministic success and failure scenarios.
- Provider-result normalization without proposal interpretation.
- Bounded `JSON.parse` of one inert plain object; arrays, trailing prose, malformed data, excessive depth, and dangerous keys fail.
- Explicit structural, scope/revision, semantic/grounding, and authority validation.
- In-memory proposal, state-operation-attempt, and response-release-attempt duplicate guards.
- Deterministic application decisions with no mutation/release authority.

## Context Package Builder

The builder consumes only fictional in-memory fixtures and an application-resolved task. It validates business, conversation, profile, state, and task identity; keeps facts, claims, corrections, knowledge, history, and current input separate; records provenance; applies a basic size budget; clones inputs; freezes output; and fails closed.

It performs no retrieval, AI summarization, task selection, mutation, networking, or persistence.

## Prompt Package Composer

The composer combines a valid Context Package, task definition, compatible Output Contract, and versioned policy references. It emits structured provider-neutral references such as `application-authority-policy/v1`; it contains no production instruction prose or provider message format.

## Gateway and Mock Adapter

The gateway validates prompt/task/contract compatibility and delegates to an adapter abstraction. The mock adapter is selected explicitly by the verification harness, uses no environment variables, and returns only deterministic fixture results.

No provider SDK, real model, endpoint, retry network behavior, or provider-selection policy is implemented.

## Validation and Decision

Validation checks contract fields and types, allowlists, scope, profile/state revisions, source references, active services, known fields, knowledge grounding, unsupported promises, authority claims, and prohibited extra fields.

An accepted proposal remains a candidate. The decision engine never constructs or applies authoritative operations and never releases customer text. Escalation remains a recommendation.

Sprint 5.1 preserves this decision boundary and adds a separate application-controlled execution layer for one explicit validated in-memory stage transition. See [State Execution Architecture](STATE_EXECUTION_ARCHITECTURE.md).

Sprint 5.3 allows the Prototype Chat Session to supply its existing in-memory manager to the AI Foundation Orchestrator for the controlled path. `run()` remains read-only. The session projects post-execution state through the Conversation Read Model and exposes no raw state or execution authority to UI components. See [Prototype Read Model Integration](PROTOTYPE_READ_MODEL_INTEGRATION.md).

## Non-Goals

Not implemented:

- real providers, models, SDKs, credentials, or network calls;
- production prompts, schemas, output validators, or prompt experiments;
- model-assisted repair, streaming, tools, function calling, RAG, search, or memory;
- databases, persistence, authentication, authorization, billing, queues, or jobs;
- SMS, email, voice, CRM, scheduling, payments, or customer delivery;
- state, Business Profile, escalation, completion, or handoff mutation from model output; and
- new routes, UI, or real customer/business data.

## Related Documents

- [AI Prototype Contracts](AI_PROTOTYPE_CONTRACTS.md)
- [AI Prototype Verification](AI_PROTOTYPE_VERIFICATION.md)
- [Model Output Validation Architecture](MODEL_OUTPUT_VALIDATION_ARCHITECTURE.md)
