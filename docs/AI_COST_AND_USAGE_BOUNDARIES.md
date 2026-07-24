# AI Cost and Usage Boundaries

## Purpose

This document defines conceptual application controls for future AI cost, usage, and latency. It does not select a provider, model, billing system, metering service, storage design, numeric quota, or production price.

AI use must be intentional. A model request is justified only when it adds customer or business value beyond deterministic logic.

## Request Eligibility

Before spending model capacity, the application should ask:

- Is the task approved for AI assistance?
- Can deterministic logic already produce the correct outcome?
- Is permitted context available?
- Is the expected value proportionate to cost, latency, and risk?
- Is the operation within business, conversation, turn, and task limits?
- Is a deterministic fallback available?
- Is the request blocked by escalation, policy, privacy, or sensitive-data rules?

If AI adds no material value, the application should not make the request.

## Tasks That May Not Need AI

Deterministic logic should remain authoritative for:

- Exact configured service identifier, name, or alias lookup
- Required intake-field selection
- Approved question selection
- Missing-field calculation
- Stage transition validation
- Readiness calculation
- Escalation activation
- Handoff eligibility
- Conversation-state mutation
- Business, profile, knowledge, audience, and destination scope validation

These tasks should not incur model cost merely to reproduce an application-owned decision.

## Tasks That May Benefit From AI

Model assistance may add value for:

- Interpreting free-form customer language
- Extracting candidate facts from customer wording
- Proposing intent classifications
- Drafting natural customer responses
- Summarizing a long conversation
- Identifying ambiguity
- Proposing a concise clarification
- Assisting unsupported-request detection

Each result remains an untrusted proposal and requires deterministic validation.

## Usage Limits

Future application-owned policy may include:

- Per-business request limits
- Per-conversation request limits
- Per-turn request limits
- Per-task request limits
- Context-size limits
- Output-size limits
- Daily or monthly budget limits
- Provider-specific ceilings
- Model-specific ceilings
- Retry limits
- Provider fallback limits
- Concurrent request limits
- Streaming eligibility limits
- Sensitive-task restrictions

The exact values are deferred. Limits should be configurable, reviewable, and fail closed.

## Cost Authority

The provider, model, and adapter must not decide:

- Whether a request is worth making
- Whether AI is permitted
- Which expensive model to use
- Whether to expand context
- Whether to increase output size
- Whether to retry indefinitely
- Whether to cross a business limit
- Whether to select an unapproved fallback provider

The application owns cost policy and provider/model eligibility.

## Context and Output Budgeting

Context and output budgets should be task-specific.

Context Assembly should:

- Include only task-relevant eligible context.
- Preserve safety, identity, profile, correction, state, escalation, and output-contract boundaries.
- Avoid entire profiles, documents, or histories when a smaller approved subset is sufficient.
- Use structured state and approved summaries where safe.
- Stop instead of discarding authority-critical context.

Output policy should:

- Limit output to the proposal fields required by the task.
- Avoid paying for unrelated analysis or content.
- Preserve enough room for required limitations and uncertainty.
- Reject provider or model attempts to expand the task.

## Latency Classes

### Interactive

The customer is waiting for the next conversational response.

- Requires a clear timeout.
- Uses a deterministic fallback when the deadline is exceeded.
- Must not hold authoritative state open for an unbounded duration.

### Background-Capable

The operation could complete after the immediate customer response, if a future approved workflow supports it.

- Examples may include non-urgent internal summary refinement.
- Background execution is not implemented in this milestone.

### Non-Blocking Deferred

The operation is not required for the current turn or handoff decision.

- It should not delay customer service.
- Deferred work must not rewrite historical authoritative state silently.
- No deferred execution is implemented in this milestone.

### Escalation-Safe Fallback

The task must have a safe deterministic or human path when model latency is unacceptable.

- Escalation and customer-message preservation take precedence over waiting indefinitely.

## Retry Cost Boundaries

Every retry consumes additional cost and latency.

Retry policy should consider:

- Failure category
- Task importance
- Whether context or state changed
- Prior attempts in the turn and conversation
- Remaining cost and latency budget
- Provider fallback eligibility
- Likelihood that another attempt can change the outcome safely

Retries stop when policy is exhausted. They cannot be justified solely by an invalid output's request to try again.

## Provider Fallback Cost Boundaries

A fallback provider or model may be used only when:

- It is approved for the task.
- Data-handling and regional restrictions permit it.
- Remaining cost and latency budgets permit it.
- The same output contract and application validation apply.
- Fallback attempts remain within bounded policy.

Provider fallback is not implemented or selected in this milestone.

## Usage Recording

Future usage records should preserve:

- Provider
- Model
- Input size
- Output size
- Cached usage where supported
- Latency
- Retry count and attempt identity
- Result category
- Task type
- Business scope
- Conversation scope
- Profile version
- Output contract version
- Application decision
- Fallback or cancellation path

Usage records must avoid storing unrestricted prompts, customer data, or secrets merely for cost reporting.

## Usage and Audit Separation

Usage metadata answers how much model capacity an operation consumed. Audit metadata answers why the application allowed, rejected, retried, or applied an outcome.

The two may share trace identifiers, but cost data must not become authoritative conversation state.

## Budget Exhaustion

When a limit is reached:

- Do not make the model request.
- Do not silently exceed the limit.
- Continue deterministic intake where possible.
- Preserve customer input and state.
- Use approved configured questions and responses.
- Escalate when interpretation cannot proceed safely without assistance.
- Record a policy-blocked result without exposing internal budget details unnecessarily.

## Privacy and Cost

Cheaper execution does not justify weaker privacy or tenant isolation.

- A lower-cost provider is ineligible if data-handling policy does not permit it.
- Context must not be broadened to improve caching.
- Cross-business data must never be combined for cost efficiency.
- Sensitive data must not enter usage logs unless specifically required and protected by future policy.

## Operational Review

Future reviews should examine:

- Requests that deterministic logic could have handled
- Repeated invalid output
- Retry and fallback frequency
- High-cost task categories
- High-latency customer turns
- Provider failure patterns
- Context growth
- Business limits reached
- Whether AI measurably improved interpretation, response quality, or staff handoff value

Cost optimization must not weaken validation, customer experience, or deterministic authority.

## Deferred Decisions

- Numeric limits and quotas
- Provider and model prices
- Billing plans
- Cost allocation
- Usage storage
- Metering infrastructure
- Budget notification workflows
- Background execution
- Caching policy
- Customer-facing usage controls

Milestone 4.2 establishes application-owned task and section budget classes, deterministic reduction order, essential-authority preservation, bounded history strategies, and safe failure when required context cannot fit. It chooses no numeric or provider-specific limits and implements no budgeting or metering code.

## Related Documents

- [AI Integration Architecture](AI_INTEGRATION_ARCHITECTURE.md)
- [Model Gateway Architecture](MODEL_GATEWAY_ARCHITECTURE.md)
- [Model Lifecycle](MODEL_LIFECYCLE.md)
- [AI Failure and Recovery](AI_FAILURE_AND_RECOVERY.md)
- [Context Priority and Limits](CONTEXT_PRIORITY_AND_LIMITS.md)
- [Context Budgeting and Reduction](CONTEXT_BUDGETING_AND_REDUCTION.md)
