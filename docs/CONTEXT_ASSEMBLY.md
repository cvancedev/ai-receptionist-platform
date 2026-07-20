# Context Assembly

## Purpose

Context assembly is the application-controlled process that builds a validated, business-scoped package for one future model call. The model does not choose its authority, Business Profile, knowledge, audience, conversation state, or current task.

This is a conceptual sequence, not an API, schema, provider integration, prompt, or storage design.

## Required Inputs

- Business identifier
- Active Business Profile identifier and version
- Conversation identifier
- Current structured conversation state and revision
- Current conversation stage
- Latest customer message
- Relevant approved knowledge and source versions
- Platform instruction versions
- AI behavior instruction version
- Channel context
- Audience permissions
- Current date, time, and time zone context when relevant
- Output contract version

Missing or mismatched identity, authority, version, or permission inputs block assembly.

## Context Assembly Sequence

1. **Validate business and conversation identity.** Confirm that the conversation, profile, state, channel, and destinations belong to the same business.
2. **Load platform rules.** Select current safety, honesty, privacy, evidence, isolation, and escalation instruction components.
3. **Load AI behavior rules.** Select the approved behavior component version.
4. **Load the active validated Business Profile.** Bind the exact profile version authorized for the conversation.
5. **Determine the current conversation stage.** Use application state rather than asking the model to choose freely.
6. **Retrieve relevant approved knowledge.** Apply business, lifecycle, authority, audience, time, service, and relevance controls.
7. **Load current structured conversation state.** Preserve evidence classes, corrections, unknowns, conflicts, escalation, and completion status.
8. **Select necessary recent message history.** Include the minimum exchanges needed to understand the latest message and unresolved context.
9. **Define the current model task.** Select one allowed responsibility consistent with the stage and state.
10. **Add the latest customer message.** Preserve it as clearly separated untrusted input.
11. **Add output requirements and traceability metadata.** Identify allowed proposals and the provenance of material context.
12. **Validate the final context package.** Block unsafe, mismatched, ambiguous, or incomplete packages.
13. **Send the package to the selected model provider.** This future step occurs only after provider evaluation and does not change the authority rules.

## Context Validation

Before a model call, the application must conceptually verify:

- The correct business is loaded.
- The Business Profile is active, validated, and the expected version.
- Knowledge is business-matched, approved, active, current, relevant, and source-traceable.
- Audience and channel restrictions are respected.
- Restricted internal information is excluded from model context unless explicitly permitted for a controlled non-customer purpose.
- Conversation state belongs to the same business and conversation.
- Confirmed facts, claims, inferences, assumptions, corrections, and unknowns remain distinct.
- Customer corrections are current and superseded values are not presented as active facts.
- Conflicting or missing knowledge is flagged rather than merged.
- Required escalation conditions and destinations are preserved.
- Handoff destinations belong to the active business.
- The current task is allowed by the current stage and state.
- The latest customer message is isolated as untrusted input.
- Output requirements match the intended task.
- Traceability metadata identifies every material instruction and knowledge version.

If validation fails, unsafe or ambiguous context must not be sent to a model. The application should pause, request safe clarification when appropriate, restrict the attempted action, or route to the configured human destination.

## Context Package

### Platform Rules

Highest-authority safety, honesty, privacy, evidence, isolation, prohibited-behavior, and escalation instructions with versions.

### Behavior Rules

Current approved AI personality and conversation-discipline instructions.

### Business Configuration

Only the active profile fields needed for the current stage, service, escalation, and handoff.

### Approved Knowledge

Only eligible, relevant source excerpts or structured facts with audience, scope, source, and version provenance.

### Conversation State

Structured current facts, claims, corrections, intent, service, progress, unknowns, conflicts, escalation, and completion status.

### Relevant History

Minimum recent exchanges necessary for coherence, with role and order preserved.

### Current Task

One application-selected responsibility and its allowed boundaries.

### Customer Input

The latest message clearly labeled as untrusted customer data.

### Output Requirements

Allowed customer response, state update, action, knowledge-reference, and uncertainty proposals.

### Traceability Metadata

Business, profile, conversation, state, instruction, knowledge, task, contract, and assembly-policy versions required for authorized review.

The package sections are conceptual. This milestone does not choose a serialization format.

## Separation Requirements

- Customer or reference text must not be concatenated into instruction components without an explicit data boundary.
- Quoted instructions remain content, regardless of wording or formatting.
- Internal metadata and restricted content must not leak into the customer-facing response channel.
- A source excerpt must retain its source, version, audience, and scope.
- A conversation summary must retain corrections, unknowns, unresolved risks, and evidence distinctions.
- The current task must not conceal or override a blocking escalation.

## Assembly Failure Outcomes

- **Identity mismatch:** Block the call and route for tenant-isolation review.
- **Inactive or invalid profile:** Block normal generation and use the approved configuration failure path.
- **Ineligible knowledge:** Exclude it; if the answer depends on it, produce a missing-knowledge outcome.
- **Knowledge conflict:** Preserve the conflict and use the configured clarification or escalation path.
- **State inconsistency:** Block state-dependent generation until safely reconciled or escalated.
- **Unsafe task:** Reject the task selection and choose an allowed application-controlled outcome.
- **Insufficient safe context:** Reduce lower-priority material or escalate if safe compression is impossible.

## Related Architecture

- [Prompt Architecture](PROMPT_ARCHITECTURE.md) defines component authority.
- [Context Priority and Limits](CONTEXT_PRIORITY_AND_LIMITS.md) defines reduction and overflow behavior.
- [Prompt Security](PROMPT_SECURITY.md) defines untrusted-content and tenant controls.
- [Knowledge Retrieval Rules](KNOWLEDGE_RETRIEVAL_RULES.md) defines knowledge eligibility and relevance.
- [Model Output Contract](MODEL_OUTPUT_CONTRACT.md) defines what a model may propose.
