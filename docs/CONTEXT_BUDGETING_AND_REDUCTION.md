# Context Budgeting and Reduction

## Budget Ownership

The application, not a provider, owns:

- maximum total context size;
- per-section budgets;
- history and knowledge budgets;
- output reservation;
- retry reduction policy;
- task-specific budget classes; and
- business-level usage limits.

Provider limits are adapter constraints checked after application policy. They cannot broaden eligibility, weaken isolation, or decide which authoritative data is disposable. This architecture selects no provider-specific token limit.

## Deterministic Reduction

When eligible content exceeds its budget, reduction proceeds predictably:

1. remove exact and semantic duplicates according to application rules;
2. remove irrelevant optional metadata;
3. reduce old conversation history;
4. replace eligible history with a current approved summary;
5. reduce low-priority knowledge excerpts;
6. remove optional advisory content;
7. verify identity, task, authority rules, confirmed facts, active corrections, and required state remain intact; and
8. fail safely if required context still cannot fit.

Every reduction records its rule, affected source reference or count, size effect, and policy version. Silent truncation is prohibited.

## Essential Context

Task policy marks sections required or optional. Depending on the task, essential context includes:

- business and conversation identity;
- profile version and state revision;
- task type and objective;
- relevant application constraints;
- output-contract reference;
- required confirmed facts and active corrections;
- required service and intake rules; and
- the minimum state needed to evaluate the proposal later.

Essential content cannot be discarded merely to make a provider call succeed. Authority labels and provenance are part of correctness, not overhead.

## Conversation History

A task selects one bounded strategy:

- a recent-turn window;
- relevant-turn selection under deterministic criteria;
- deterministic event extraction;
- an approved, source-traceable summary; or
- a hybrid of summary plus recent turns.

Interpretation may use recent relevant turns; extraction usually centers on the current message; clarification may retain asked questions; drafting needs only context supporting the approved action; summarization gets a bounded larger window; escalation gets relevant attempts and requests. No task receives unlimited history by default.

History reduction preserves message order, source labels, corrections, and the relationship to the current task. It does not promote assistant text or summaries to application state.

## Knowledge Reduction

Knowledge ranking uses application-defined relevance, authority, freshness, business approval, source traceability, task applicability, version compatibility, and sensitivity. Selection favors the smallest excerpts sufficient for grounding.

If removing knowledge would make a knowledge-grounded answer ungrounded, the task fails or follows an approved deterministic fallback. It does not answer from provider memory.

## Summary Use

A reusable model-generated summary is advisory, source-traceable, versioned, scope-bound, and explicitly approved by policy. It identifies the history range and source revisions it covers and is invalidated when relevant messages, facts, corrections, profile bindings, or policy versions change.

A summary cannot overwrite facts, erase correction history, become the sole evidence for an authoritative decision, or replace required originals. Stale, incompatible, or unverifiable summaries are excluded.

## Budget Failure

If essential context exceeds the permitted budget:

- do not truncate authority constraints or confirmed facts;
- do not invoke a provider with an incomplete or malformed package;
- do not weaken scope, sensitivity, or validation policy;
- attempt only policy-approved optional reduction; then
- use deterministic fallback, ask for clarification, escalate, or stop safely.

Retrying with reduced context is allowed only when the new package is independently assembled, validated, and audited under an approved reduction profile.

## Budget Metadata

The released package records budget class, size estimate, section allocation, output reservation, reductions, summaries used, required-context preservation, and final pass/fail result. Estimates remain provider-neutral; adapters may add provider feasibility metadata outside the authoritative package policy.

## Related Documents

- [Context Ordering and Precedence](CONTEXT_ORDERING_AND_PRECEDENCE.md)
- [Context Package Contract](CONTEXT_PACKAGE_CONTRACT.md)
- [AI Cost and Usage Boundaries](AI_COST_AND_USAGE_BOUNDARIES.md)
