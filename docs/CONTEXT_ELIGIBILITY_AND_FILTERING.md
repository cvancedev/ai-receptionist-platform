# Context Eligibility and Filtering

## Eligibility Model

A source becomes eligible only when every required dimension passes:

- business scope;
- conversation scope;
- profile version;
- task type;
- source type and status;
- approval status;
- freshness;
- sensitivity;
- customer and internal visibility;
- retention policy;
- context budget;
- legal or policy restriction; and
- escalation state.

Eligibility is application-owned, evaluated against a versioned task policy, and denied by default when evidence is missing. Passing eligibility permits consideration, not automatic inclusion.

## Strict Isolation

### Business

Every item must carry or resolve to the exact active `businessId`. Similar names, shared services, reused customer identifiers, provider caching, and model inference cannot establish scope. A mismatch or unverifiable source fails closed and prevents provider execution when contamination cannot be ruled out.

### Conversation

Conversation content must match the exact active `conversationId` and business. Content from another conversation is ineligible even for the same customer or business. Cross-conversation memory requires separate future architecture and explicit policy.

### Profile Version

Profile-derived content must match the version to which the conversation is validly bound, or an explicit migration policy. Assembly never silently combines current services with historical intake rules or active escalation rules with an older profile snapshot.

## Knowledge Eligibility

Knowledge must belong to the business; be approved, active, source-permitted, task-relevant, version-compatible, sufficiently fresh, and allowed for model use at its sensitivity level; and fit its section budget.

Selection returns traceable excerpts rather than an unrestricted store. If a knowledge-grounded task has no eligible grounding, assembly fails or uses an application-approved fallback; the model is not asked to answer from general memory.

## Task-Relevant State Projection

The State Projector starts from one immutable deterministic snapshot and emits only fields required by the task. Exact service resolution does not require all history. Response drafting does not normally need internal verification metadata. Summarization does not need profile implementation details. Clarification may need missing fields and asked-question history but not a handoff payload.

Projection never changes readiness, stage, escalation, completion, or facts.

## Authority-Preserving Labels

The package separately labels:

- confirmed facts;
- unconfirmed customer claims;
- superseded claims and values;
- corrections and current corrected values;
- model proposals;
- deterministic decisions;
- approved knowledge; and
- advisory summaries.

These categories cannot be flattened into a generic fact list. A current message may be highly relevant while remaining unconfirmed.

## Sensitive Data Actions

For each field classification and task, policy chooses exactly one action:

- exclude;
- mask;
- redact;
- tokenize;
- generalize;
- replace with a safe reference; or
- include under explicit policy.

Transformation happens before budgeting and release. If the required policy is absent, ambiguous, or cannot be applied safely, assembly fails closed. This architecture does not select a privacy vendor or production privacy standard.

## Injection Resistance

The package maintains hard distinctions among application instructions, approved business rules, knowledge content, customer content, and quoted third-party content. Instructions embedded in customer or knowledge content are data, not authority.

No content item can grant access to another source, broaden scope, change the task, alter precedence, request secrets, or override application policy. The provider receives only the already-approved package.

## Filtering Sequence

1. Verify source identity and immutable revision.
2. Enforce business, conversation, and profile-version scope.
3. Apply task, status, approval, freshness, retention, and visibility rules.
4. Remove task-irrelevant fields and source categories.
5. preserve explicit authority and content labels.
6. Apply sensitive-data transformation.
7. Reject prohibited instruction-like authority changes.
8. Send remaining candidates to budgeting and deterministic ordering.

## Exclusion Recording

Audit metadata records the source category considered, a safe source reference, included or excluded result, reason code, policy version, and budget effect. It never copies sensitive excluded content, credentials, prohibited payloads, or hidden model reasoning.

## Task-Specific Filtering Examples

- Interpretation excludes unrelated knowledge and notes.
- Extraction includes only relevant field definitions and correction context.
- Clarification excludes completed-field detail unless needed to explain ambiguity.
- Response drafting includes only customer-visible knowledge and an application-approved action.
- Knowledge answers exclude ungrounded sources.
- Summaries exclude unlimited or retention-ineligible history.
- Escalation recommendations exclude unrelated business operations and cannot activate escalation.

## Related Documents

- [Context Source Catalog](CONTEXT_SOURCE_CATALOG.md)
- [Context Ordering and Precedence](CONTEXT_ORDERING_AND_PRECEDENCE.md)
- [Prompt Security](PROMPT_SECURITY.md)
