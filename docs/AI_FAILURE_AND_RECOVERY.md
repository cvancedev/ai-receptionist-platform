# AI Failure and Recovery

## Purpose

This document defines how future model-assisted operations fail safely and recover without surrendering deterministic application control.

Failure is an expected operating condition. It must not corrupt state, cross business boundaries, invent facts, duplicate messages, hide escalation, or make AI a single point of failure.

## Failure Principles

- Fail before provider execution when eligibility or scope is invalid.
- Treat provider success and valid application output as separate outcomes.
- Preserve authoritative conversation state on every failure.
- Prefer deterministic fallback over unsafe guessing.
- Keep retries bounded, traceable, task-specific, and cost-aware.
- Never use failure as permission to weaken validation.
- Stop safely when a reliable recovery path is unavailable.

## Input Failures

Input failures occur before provider execution.

### Invalid Business Scope

- **Examples:** Missing business identity, mismatched tenant, ambiguous ownership.
- **Behavior:** Block the operation, record the scope failure, and do not retrieve profile, knowledge, or conversation data.
- **Recovery:** Resolve scope through application-owned identity logic or stop safely.

### Invalid Conversation Scope

- **Examples:** Conversation does not belong to the business, unknown conversation, mismatched revision.
- **Behavior:** Block the operation and preserve current state.
- **Recovery:** Reload current authorized state or reject the turn.

### Invalid Profile Version

- **Examples:** Profile is inactive, suspended, missing, or differs from the conversation-bound version.
- **Behavior:** Block normal model use.
- **Recovery:** Use the approved configuration-failure path; never substitute a draft or another profile.

### Unsupported Task

- **Examples:** Task is not approved for AI assistance or exceeds current stage authority.
- **Behavior:** Do not dispatch.
- **Recovery:** Use deterministic logic, an approved narrower task, or escalation.

### Missing Context

- **Examples:** Required current state, task definition, profile data, or trace identity is unavailable.
- **Behavior:** Fail request preparation.
- **Recovery:** Load the missing authorized input, use deterministic fallback, or stop safely.

### Oversized Context

- **Examples:** Context exceeds application-owned size or token budget.
- **Behavior:** Do not silently remove required authority, correction, safety, or isolation context.
- **Recovery:** Apply approved reduction, use a narrower task, use deterministic fallback, or escalate.

### Ineligible Knowledge

- **Examples:** Expired, superseded, suspended, cross-business, audience-restricted, or conflicting knowledge.
- **Behavior:** Exclude it and produce a missing-knowledge or conflict outcome.
- **Recovery:** Use another eligible approved source, state the limitation, or escalate.

### Sensitive-Data Restriction

- **Examples:** The task does not justify sending sensitive content or provider policy disallows it.
- **Behavior:** Block or redact only through approved application policy.
- **Recovery:** Use a narrower safe task, deterministic handling, or human review.

## Provider Failures

### Timeout

The approved execution deadline elapsed.

- Preserve state.
- Cancel where supported.
- Discard partial output as authoritative input.
- Consider a bounded retry, approved fallback provider, deterministic fallback, or escalation.

### Rate Limit

The provider rejected or delayed the request due to usage limits.

- Do not retry indefinitely.
- Respect application cost and retry policy.
- Use an approved fallback only when eligible.

### Provider Unavailable

The provider or approved model is unavailable.

- Record the normalized failure.
- Use another approved eligible provider only through policy.
- Preserve AI-free operation.

### Authentication Failure

Provider credentials or provider-side authorization failed.

- Treat as non-retryable until configuration changes.
- Do not expose credentials or internal details to the customer.
- Do not try arbitrary providers.

### Malformed Provider Response

The adapter cannot normalize the transport response.

- Categorize explicitly.
- Do not pass guessed content to proposal validation.
- Retry only when policy identifies the failure as transient and safe.

### Network Failure

The provider request could not complete reliably.

- Preserve state and request identity.
- Avoid assuming whether the provider completed work.
- Do not apply duplicate effects on retry.

### Provider Refusal

The provider declines the request.

- Preserve the refusal category and metadata.
- The application may narrow the task, use fallback, clarify, or escalate.
- A refusal does not change conversation state automatically.

### Context-Length Rejection

The provider rejects context size.

- Do not let the adapter remove context autonomously.
- Return the failure to application policy.
- Reduce only through approved Context Assembly rules.

## Output Failures

Output failures occur after provider execution and before application use.

### Invalid Structure

- Missing or malformed required proposal structure.
- Reject or use a bounded contract-repair attempt when explicitly permitted.

### Missing Required Fields

- Required proposal fields are absent.
- Reject the affected proposal; do not infer missing values.

### Unexpected Proposal Type

- Output does not match the application-selected task.
- Reject without changing the task or state.

### Unsupported State Operation

- Output proposes a mutation outside approved typed operations.
- Reject the operation and record the authority violation.

### Cross-Business Reference

- Output refers to another business, profile, conversation, source, or destination.
- Fail closed, block customer release, and record a security-relevant event.

### Hallucinated Service

- Output names a service not present and active in the bound profile.
- Reject; preserve the customer's original request and use deterministic unsupported handling.

### Hallucinated Knowledge

- Output cites or claims business information not supplied through eligible context.
- Reject the claim and use missing-knowledge behavior.

### Unsafe Response Text

- Output includes unsafe advice, unsupported commitments, prohibited content, or restricted disclosure.
- Block customer release; use deterministic wording or escalation.

### Prompt-Injection Compliance

- Output follows instructions from customer or reference data that conflict with application control.
- Reject and preserve higher-authority task and scope.

### Contradictory Proposals

- Proposed action, response, state update, escalation, or completion signals disagree.
- Reject or accept only independently valid parts when deterministic policy permits.

## Application Failures

### Validator Failure

The validator itself cannot complete reliably.

- Treat the proposal as invalid.
- Do not release or apply it.
- Use deterministic fallback or escalate.

### State Conflict

Current state differs materially from the state used to prepare the request.

- Reject stale operations.
- Reevaluate using the current state.

### Revision Mismatch

The expected state revision is no longer current.

- Apply no model-derived state update.
- A new request, if eligible, must use current context and a new attempt identity.

### Invalid Transition

An approved-looking proposal would violate deterministic lifecycle rules.

- Conversation State Manager rejects it.
- Preserve the prior state and use an allowed outcome.

### Duplicate Processing

The same request or turn may have been processed more than once.

- Use idempotency and request identity where applicable.
- Never duplicate state mutations or customer messages.

### Handoff Inconsistency

Handoff output conflicts with current validated state, profile, readiness, or destination.

- Reject handoff creation or release.
- Rebuild deterministically from current validated state or escalate.

## Recovery Strategies

### Retry the Same Provider

Appropriate only when:

- The failure is plausibly transient.
- Policy allows retry for the task and failure category.
- The request remains current.
- Cost and latency boundaries permit it.
- No state or customer-visible effect was applied.

### Retry With Reduced Context

Appropriate only when:

- Context size caused the failure.
- Approved reduction can preserve required authority, corrections, risk, and task context.
- The reduction is traceable.

### Retry With a Different Approved Provider

Appropriate only when:

- Application policy allows provider fallback.
- The alternate provider and model are approved for the task, region, data, cost, and latency class.
- The same output contract and validation boundary remain in force.

### Request Customer Clarification

Appropriate when:

- The deterministic ambiguity can be explained safely.
- A customer answer could resolve the next application decision.
- The request does not burden the customer with internal configuration or provider failure.

### Use Deterministic Fallback

Preferred when:

- Configured questions, responses, service resolution, readiness, escalation, or handoff can proceed without AI.
- Model assistance is unavailable or adds insufficient value.

### Escalate

Appropriate when:

- Interpretation remains unreliable.
- Safety, authority, configuration, or knowledge requires a person.
- Retry would be unsafe, expensive, duplicative, or unlikely to help.

### Stop Safely

Required when:

- Scope, permission, safety, or state integrity cannot be established.
- No approved fallback or escalation path is available.
- Continuing could mislead the customer or corrupt state.

## Retry Rules

Retries must be:

- Bounded
- Idempotent where possible
- Traceable as distinct attempts
- Task-specific
- Failure-category-specific
- Cost-aware
- Latency-aware
- Disabled for non-retryable failures
- Unable to duplicate state mutation or customer messages

The exact retry counts are deferred production decisions. No provider, adapter, or model may choose unlimited retries.

Retries are normally disabled for:

- Invalid tenant or conversation scope
- Invalid or inactive profile
- Policy blocked
- Sensitive-data restriction
- Authentication failure until configuration changes
- Unsupported task
- Repeated invalid or unsafe output
- Prompt-injection compliance
- Cross-business reference
- Stale revision without a new request

## Fail-Closed Guarantees

Failure must never cause:

- Silent state mutation
- Invented facts, services, policies, or knowledge
- Cross-business data use
- Unauthorized customer responses
- Duplicate customer messages
- Automatic completion
- Unauthorized escalation activation or clearing
- Loss of customer corrections
- Promotion of partial output to authority
- Unbounded cost or latency

## Customer Experience During Failure

Customer-facing handling should:

- Preserve the customer's submitted message.
- Avoid exposing provider, credential, or internal diagnostic details.
- Avoid blaming the customer for platform failure.
- Continue with a configured deterministic question or response when possible.
- Explain a limitation honestly when necessary.
- Offer the approved human path when automation cannot proceed safely.

## Current Boundary

Milestone 4.2 further defines fail-closed context failures: provider execution is blocked for unproven scope, incompatible profile versions, missing authoritative state, unsafe sensitive data, ambiguous authority, required context over budget, or invalid package contracts. Recovery may rebuild or reduce only through application-owned policy and never weakens isolation.

Milestone 4.3 adds fail-closed prompt failures for unknown tasks, incompatible task/context/output versions, missing authority layers, instruction conflicts, unsafe content boundaries, and essential prompt content over budget. Recovery may recompose only with approved versions and may never remove authority or weaken prohibitions.

Milestone 4.4 adds raw-output, contract, proposal, scope, authority, semantic, state, profile, grounding, safety, duplicate, repair, retry, and release failures. Recovery remains application-selected and fully revalidated; non-retryable contamination, authority, stale-state, and duplicate failures stop safely.

No Context Builder, Prompt Composer, parser, validator, operation builder, release gate, retry code, provider fallback, networking, queue, persistence, monitoring vendor, or recovery implementation is added in Milestones 4.1 through 4.4.

## Related Documents

- [AI Integration Architecture](AI_INTEGRATION_ARCHITECTURE.md)
- [Model Gateway Architecture](MODEL_GATEWAY_ARCHITECTURE.md)
- [Model Lifecycle](MODEL_LIFECYCLE.md)
- [AI Cost and Usage Boundaries](AI_COST_AND_USAGE_BOUNDARIES.md)
- [Context Failure and Audit](CONTEXT_FAILURE_AND_AUDIT.md)
- [Prompt Failure and Audit](PROMPT_FAILURE_AND_AUDIT.md)
- [Output Repair, Retry, and Partial Acceptance](OUTPUT_REPAIR_RETRY_AND_PARTIAL_ACCEPTANCE.md)
- [Output Failure and Audit](OUTPUT_FAILURE_AND_AUDIT.md)
