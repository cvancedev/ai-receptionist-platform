# Model Lifecycle

## Purpose

This document defines the lifecycle of one future model-assisted operation. The lifecycle is application-controlled, provider-independent, validation-bound, permission-bound, traceable, and failure-tolerant.

A model operation is not a conversation turn and does not own conversation state. Completing a provider request is only one intermediate event.

## Lifecycle Overview

```text
Eligibility
  -> Request Preparation
  -> Gateway Execution
  -> Output Validation
  -> Application Decision
  -> Approved State Application
  -> Approved Response Release
  -> Audit
  -> Completion
```

Any phase may stop safely. No failure grants permission to skip a later phase.

## 1. Eligibility

Before a model request, the application must establish:

- The business scope is valid.
- The conversation scope is valid and belongs to the business.
- The active Business Profile identifier and version match the conversation.
- The deterministic task type is approved for model assistance.
- Business, platform, and conversation policy permit AI use.
- AI use is not blocked by escalation, safety, privacy, cost, or operational policy.
- Context sources are eligible for the task and audience.
- Sensitive-data minimization and handling rules have been applied.
- A deterministic fallback or safe stop path exists.
- The operation has a traceable request identity.

Eligibility failure stops before provider execution. The application continues deterministically, requests clarification, escalates, or stops safely.

Eligibility is evaluated for each operation. A prior successful model call does not authorize another call.

## 2. Request Preparation

The application:

- Selects the deterministic task.
- Selects the provider-neutral task definition and version.
- Assembles only eligible context.
- Preserves business, profile, conversation, and state revision identity.
- Applies context-size or token-budget policy.
- Separates trusted control from untrusted customer and reference data.
- Applies sensitive-data restrictions.
- Selects the output contract and version.
- Selects timeout, retry, fallback, and model policy.
- Creates request and trace identifiers.
- Validates the complete request package before dispatch.

Request preparation cannot:

- Infer missing authority
- Expand tenant scope
- include unrelated or restricted data
- allow customer text to select a provider, model, task, tool, or permission
- treat a prompt as the enforcement boundary

## 3. Gateway Execution

The Model Gateway:

- Verifies the request against application-owned execution policy.
- Selects only an approved provider adapter and model through policy.
- Applies timeout and cancellation controls.
- Dispatches the provider-neutral request through the adapter.
- Captures the raw result.
- Captures normalized usage and execution metadata.
- Returns a normalized result category.

The gateway does not validate business meaning or authorize customer use. A provider `Success` means only that raw output is available for validation.

## 4. Validation

Raw model output is untrusted.

The validation boundary:

- Parses the output.
- Checks the selected output schema or contract version.
- Confirms business scope.
- Confirms conversation scope and state revision.
- Confirms the proposal type matches the approved task.
- Rejects unsupported actions and authority.
- Treats prompt-injection instructions as data.
- Prohibits direct or implied state mutation.
- Checks evidence classes and source provenance.
- Checks service, knowledge, profile, audience, and destination eligibility.
- Rejects hallucinated services, facts, sources, permissions, or capabilities.
- Checks customer-visible text for safety, honesty, restricted disclosure, and unsupported commitments.
- Preserves required escalation, uncertainty, disclaimers, and corrections.

Structural validity does not imply semantic acceptance. Provider safety classification does not replace application validation.

## 5. Application Decision

Using current authoritative state and validation results, the application may:

- **Accept:** Approve the complete proposal.
- **Accept partially:** Approve only individually valid parts.
- **Modify:** Replace or constrain proposal content.
- **Request clarification:** Ask the customer for a deterministic distinction.
- **Retry:** Issue a bounded new attempt under approved policy.
- **Use deterministic fallback:** Continue without model output.
- **Escalate:** Activate the approved human path.
- **Reject:** Apply no model-derived effect.

The application decision records its outcome and reasons. The model does not vote on, confirm, or override the decision.

## 6. State Application

Only application-approved typed operations may enter the Conversation State Manager.

State application must:

- Validate business, conversation, profile version, and current revision.
- Use existing transition and mutation rules.
- Preserve evidence classes and correction history.
- Apply operations atomically or fail without partial mutation.
- Prevent duplicate processing where idempotency applies.
- Recalculate deterministic dependencies after accepted changes.
- Reject operations that became stale while the model request was running.

Model text, raw structured output, partial output, provider metadata, and adapter events never mutate state directly.

## 7. Response Release

Only application-approved customer-facing content may be displayed or sent.

Before release, the application confirms:

- The text matches the final application decision and current state.
- No stale or rejected proposal content remains.
- Material business claims are supported by eligible context.
- Corrections, unknowns, and limitations are accurate.
- No restricted internal content is disclosed.
- No unsupported promise, tool result, or side effect is implied.
- Required escalation or fallback wording is preserved.
- The destination and channel are application-authorized.

Response release and state application must remain consistent. A message must not claim that an operation occurred when the operation failed.

## 8. Audit

The operation should conceptually record:

- Request identity and trace identity
- Business, conversation, profile, and state revision
- Task type and task-definition version
- Context source identifiers and versions
- Context and output-contract versions
- Provider policy and selected provider/model metadata
- Normalized gateway result category
- Validation result and reasons
- Application decision
- State operations proposed, approved, rejected, and applied
- Customer response release outcome
- Usage and latency metadata
- Retry, fallback, cancellation, or failure path

Audit records support accountability and debugging. They do not turn rejected output into authoritative state.

## 9. Completion

Three completion events remain distinct:

### Model Request Completed

The provider attempt reached a terminal gateway result. Output may still be invalid or unusable.

### Application Decision Completed

The application decided how to handle the result. State application or response release may still fail.

### Conversation Turn Completed

All approved state operations and customer-facing output for the turn reached a consistent terminal result, or the turn stopped safely with a fallback or escalation.

None of these events means the overall conversation is complete. Conversation readiness and completion remain deterministic Conversation Engine decisions.

## Concurrent Change and Stale Results

If authoritative state changes while a model request is in flight:

- The result must be compared with the current revision.
- Stale proposals must not be applied automatically.
- The application may reject, reevaluate, or issue a new eligible request.
- A retry must use current context and receive a new attempt identity.
- The customer must not receive wording that contradicts the current state.

## Cancellation

Cancellation may occur before dispatch, during execution, during streaming, or before application use.

- Cancellation preserves authoritative state.
- Partial output remains untrusted and non-authoritative.
- The application records the cancelled stage and any provider confirmation.
- The customer receives deterministic fallback or safe status when appropriate.
- Cancellation does not silently clear escalation or completion blockers.

## Lifecycle Invariants

- Every operation is business- and conversation-scoped.
- Every operation has one application-selected task.
- Every provider execution uses application-owned policy.
- Every raw result is untrusted.
- Every state mutation is application-owned and validated.
- Every customer-visible response is application-authorized.
- Every retry is a new traceable attempt.
- Every failure has a deterministic fallback or safe stop.
- No partial output has authoritative state power.

## Current Boundary

Milestone 4.5 exercises this lifecycle from approved task through immutable application decision using fictional fixtures and a deterministic mock adapter. Milestone 5.1 appends one application-controlled, registry-backed, validated in-memory `initialized -> intake` transition and immutable Execution Result. Milestone 5.4 observes that result through a bounded process-local [Execution Journal](EXECUTION_JOURNAL.md). Milestone 5.5 derives the next application workflow intent through the mutation-free [Deterministic Conversation Progress Engine](CONVERSATION_PROGRESS_ENGINE.md). The model and application decision still cannot mutate state directly. No general state-operation builder, response release, repair/retry execution, real provider call, production prompt/schema, durable audit store, networking, or persistence is implemented. See [State Execution Architecture](STATE_EXECUTION_ARCHITECTURE.md).

## Related Documents

- [AI Integration Architecture](AI_INTEGRATION_ARCHITECTURE.md)
- [Model Gateway Architecture](MODEL_GATEWAY_ARCHITECTURE.md)
- [AI Failure and Recovery](AI_FAILURE_AND_RECOVERY.md)
- [Context Assembly Architecture](CONTEXT_ASSEMBLY_ARCHITECTURE.md)
- [Context Failure and Audit](CONTEXT_FAILURE_AND_AUDIT.md)
- [Model Task Catalog](MODEL_TASK_CATALOG.md)
- [Prompt Composition Pipeline](PROMPT_COMPOSITION_PIPELINE.md)
- [Model Output Validation Architecture](MODEL_OUTPUT_VALIDATION_ARCHITECTURE.md)
- [Proposal Decision and Application](PROPOSAL_DECISION_AND_APPLICATION.md)
- [Customer Response Release](CUSTOMER_RESPONSE_RELEASE.md)
- [AI Prototype Verification](AI_PROTOTYPE_VERIFICATION.md)
- [Conversation State](CONVERSATION_STATE.md)
- [Model Output Contract](MODEL_OUTPUT_CONTRACT.md)
- [State Execution Architecture](STATE_EXECUTION_ARCHITECTURE.md)
- [Immutable Execution Journal](EXECUTION_JOURNAL.md)
- [Deterministic Conversation Progress Engine](CONVERSATION_PROGRESS_ENGINE.md)
