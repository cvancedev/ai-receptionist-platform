# Model Gateway Architecture

## Status

This document defines a future provider-independent boundary. It is not an implementation contract, TypeScript interface, provider selection, model selection, API route, SDK integration, or networking plan.

The certified Sprint 3 `MockModelGateway` remains a deterministic local stand-in. A real Model Gateway is deferred until the architecture milestones are approved.

## Purpose

The Model Gateway isolates provider execution from application and domain logic. It gives the application one controlled boundary for model-assisted tasks without allowing provider-specific types, behavior, or authority to enter the deterministic core.

## Responsibilities

A future Model Gateway may:

- Accept a provider-neutral request
- Receive an application-approved task type
- Receive application-approved model settings and policy
- Select one adapter from an application-approved provider and model allowlist
- Enforce provider and model allowlists
- Apply timeout and cancellation policy
- Apply request, context, output, latency, and usage limits
- Dispatch the request through an approved Provider Adapter
- Return normalized raw results
- Return provider and model execution metadata
- Return normalized usage information
- Return explicit failure information
- Support policy-approved fallback selection
- Preserve trace and request identity
- Support future provider-neutral streaming without requiring it now

## Non-Responsibilities

The Model Gateway must not:

- Decide business logic
- Select the business, conversation, or Business Profile
- Assemble unrestricted context
- Determine knowledge or audience eligibility
- Confirm customer facts
- Resolve services authoritatively
- Select required intake fields or questions
- Mutate conversation or permanent state
- Activate or clear escalation
- Determine completion or handoff readiness
- Choose arbitrary providers or models
- Repair invalid conversation state
- Send customer messages
- Invoke business tools or irreversible actions
- Store permanent conversation history
- Hide, reinterpret, or silently absorb provider failures

## Provider-Neutral Request Contract

A future conceptual request should carry the minimum information needed to execute one approved task:

| Field | Purpose |
| --- | --- |
| `requestId` | Unique idempotency and trace reference for one model attempt |
| `businessId` | Validated tenant scope; never selected by the model or adapter |
| `conversationId` | Validated conversation scope |
| `profileVersion` | Exact active validated Business Profile version |
| `taskType` | Application-selected capability category |
| `contextPackage` | Application-approved, bounded, traceable context |
| `outputContractVersion` | Required proposal structure and validation version |
| `modelPolicy` | Approved provider/model allowlist and execution boundaries |
| `timeoutPolicy` | Maximum execution and cancellation behavior |
| `retryPolicy` | Application-approved retry eligibility, not an instruction to retry |
| `traceMetadata` | Correlation and component-version information |

These fields are conceptual. Milestone 4.1 does not create interfaces or serialization formats.

The request must not contain:

- Unrestricted tenant data
- Provider credentials in prompt or context content
- Arbitrary provider or model names supplied by customer or model text
- Unvalidated profile, knowledge, state, task, or destination data
- A permission to mutate state or perform side effects

## Model Policy

Application-owned policy constrains gateway execution. Future policy may identify:

- Approved providers
- Approved models
- Task compatibility
- Provider and model availability
- Cost ceiling
- Latency target
- Data-handling restrictions
- Regional restrictions
- Context and output limits
- Fallback eligibility
- Retry eligibility
- Streaming eligibility
- Logging and retention restrictions

Policy cannot be expanded by a provider response, model output, adapter, customer message, or retrieved document.

## Provider Selection

Provider selection is controlled by the application through approved policy. The gateway may evaluate only permitted candidates against policy inputs such as:

- Provider and model allowlists
- Task compatibility
- Current approved availability
- Cost ceiling
- Latency target
- Data-handling requirements
- Regional requirements
- Fallback eligibility

Provider selection does not grant business authority or change the output-validation contract.

No provider or model is selected in this milestone. OpenAI, Anthropic, Google Gemini, and all other providers remain unselected.

## Provider Adapter

Each Provider Adapter should:

- Translate the provider-neutral request into one approved provider format
- Invoke only its assigned approved provider
- Map approved model settings without inventing policy
- Normalize raw provider responses
- Normalize usage data
- Normalize finish reasons
- Normalize refusals and errors
- Preserve provider request identifiers when permitted
- Support cancellation where available
- Avoid application business logic

Each adapter must not:

- Select a different provider or model
- Add unrestricted context
- reinterpret application task authority
- Validate business state or decide customer outcomes
- Perform retries outside gateway policy
- call tools or external services not explicitly approved by the application
- mutate state or release customer messages

Provider SDK types, response events, error classes, and usage formats stop at the adapter boundary.

## Normalized Result Categories

### Success

The provider completed the request and returned raw output for validation. Success does not mean the output is valid, safe, accepted, or customer-ready.

### Refusal

The provider declined the request. The application decides whether to use deterministic fallback, clarify, retry under policy, or escalate.

### InvalidOutput

The provider response cannot satisfy the required transport or basic result shape. Semantic proposal validation remains a later application boundary.

### Timeout

The approved execution deadline elapsed.

### RateLimited

The provider rejected or deferred the request due to usage limits.

### ProviderUnavailable

The provider or required model is unavailable.

### AuthenticationFailure

Provider credentials or provider-side authorization failed. This is an operational failure, not a customer or conversation-state decision.

### PolicyBlocked

Application policy does not permit execution, provider selection, settings, context, region, cost, or fallback.

### Cancelled

The application or channel cancelled the operation. Partial output remains non-authoritative.

### UnknownFailure

The failure cannot be normalized safely. The gateway must preserve available diagnostics without guessing.

## Result Metadata

A normalized conceptual result may preserve:

- Request and trace identifiers
- Result category
- Provider and model identifiers selected by approved policy
- Provider request identifier when permitted
- Start and completion times
- Latency
- Normalized input and output usage
- Cached usage where supported
- Finish reason
- Retry attempt identity
- Cancellation status
- Provider error category and safe diagnostic metadata

Provider metadata supports application decisions and audit. It does not authorize output.

## Gateway and Output Validation

The gateway validates execution policy and normalizes transport results. It does not perform the complete business, conversation, safety, or proposal validation required before use.

After a gateway `Success`:

1. Raw output enters Model Output Validation.
2. The proposal is parsed against the application-selected output contract.
3. Scope, task, evidence, authority, safety, grounding, and state-operation rules are enforced.
4. The Application Decision Layer chooses the outcome.

Gateway success followed by output rejection is an expected, traceable outcome.

## Timeouts and Cancellation

- Timeout limits are application-owned and task-specific.
- Cancellation should propagate through the gateway and adapter where supported.
- Cancellation does not imply provider-side erasure or successful interruption unless confirmed.
- A timeout or cancellation cannot apply partial state changes.
- The application preserves the customer message and current authoritative state.
- The fallback path remains deterministic and safe.

## Retries and Fallback

The gateway executes only retries or provider fallback attempts explicitly approved by application policy.

Retries must be:

- Bounded
- Traceable as separate attempts under one logical operation
- Cost-aware
- Task-specific
- Safe from duplicate state mutation
- Disabled for policy, scope, authentication, and other non-retryable failures

The gateway cannot decide that an expensive model, new provider, larger context, or indefinite retry is justified.

## Streaming

Streaming is deferred.

Future streaming must:

- Present a provider-neutral stream abstraction
- Preserve cancellation and timeout behavior
- Normalize only permitted event categories
- Prevent partial structured output from mutating state
- Prevent partial tool or action proposals from becoming authoritative
- Apply customer-visible filtering and release policy
- Preserve final output validation
- Record a terminal normalized result
- Fail without corrupting conversation state

Partial output is not a successful proposal. Only the final validated application decision may influence state or customer-visible outcomes.

## Failure Transparency

The gateway returns explicit normalized failures. It must not:

- Convert failure into fabricated success
- Hide a provider outage
- return stale output as a new result
- silently cross a policy boundary
- choose another tenant, conversation, provider, or model
- discard usage or attempt metadata required for cost and reliability review

Customer-facing failure language remains an application responsibility and must not expose secrets or internal diagnostics.

## Context Package Boundary

The gateway may receive only a validated, immutable, provider-neutral context package released by application-owned Context Assembly for one approved task. The package binds business, conversation, profile, and state revisions; preserves authority labels and provenance; and satisfies an application budget before dispatch.

The gateway cannot retrieve more data, select sources, broaden scope, repair missing context, reinterpret customer or knowledge instructions as policy, or use provider memory as context. An invalid or stale package fails before provider execution.

## Prompt Package Boundary

The gateway accepts only a validated provider-neutral Prompt Package for an application-selected allowlisted task. The package carries fixed scope, task/version, authority layers, permissions, prohibitions, output-contract reference, labeled data, budget, provenance, and validation metadata.

The gateway and adapter cannot choose a task, rewrite instructions, weaken prohibitions, add context, change precedence, substitute a contract, or promote customer/knowledge content into policy. If a provider format cannot preserve the package semantics, execution is ineligible.

## Provider Result Boundary

The gateway normalizes transport, completion, refusal, truncation, usage, and provider metadata without interpreting business meaning. A normalized success only makes raw output available to the application-owned validation pipeline.

Adapters cannot parse proposals into authority, select repair/retry, apply state, or release text. Provider-specific structured-output success and safety labels do not replace contract, semantic, scope, grounding, state, or customer-release validation.

## Deferred Decisions

- Provider and model selection
- Provider SDKs
- Credential management
- Runtime and deployment location
- Request serialization
- Streaming protocol
- Exact timeout values
- Exact retry counts
- Usage storage
- Cost accounting and billing
- Observability vendor

## Related Documents

- [AI Integration Architecture](AI_INTEGRATION_ARCHITECTURE.md)
- [Model Lifecycle](MODEL_LIFECYCLE.md)
- [AI Failure and Recovery](AI_FAILURE_AND_RECOVERY.md)
- [AI Cost and Usage Boundaries](AI_COST_AND_USAGE_BOUNDARIES.md)
- [Context Package Contract](CONTEXT_PACKAGE_CONTRACT.md)
- [Prompt Architecture](PROMPT_ARCHITECTURE.md)
- [Prompt Failure and Audit](PROMPT_FAILURE_AND_AUDIT.md)
- [Model Output Validation Architecture](MODEL_OUTPUT_VALIDATION_ARCHITECTURE.md)
- [Output Failure and Audit](OUTPUT_FAILURE_AND_AUDIT.md)
- [API Boundaries](API_BOUNDARIES.md)
