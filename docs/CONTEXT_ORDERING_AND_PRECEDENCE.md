# Context Ordering and Precedence

## Deterministic Precedence

Unless a task contract uses a different physical layout, released context follows this authority order:

1. application safety and authority constraints;
2. active task definition;
3. business and conversation identity;
4. active or conversation-bound Business Profile rules;
5. deterministic conversation state;
6. confirmed facts;
7. correction history;
8. missing-field and readiness information;
9. approved knowledge;
10. eligible recent conversation history;
11. unconfirmed customer claims;
12. advisory summaries; and
13. trace and output-contract metadata.

Task layouts may place closely used sections together, but they cannot change authority precedence. Physical recency, length, or provider position never upgrades a source's authority.

## Conflict Resolution

### Confirmed Fact and Customer Claim

The confirmed fact remains authoritative until deterministic correction logic changes it. A contradictory claim is labeled unresolved or becomes a correction candidate; it is not silently merged.

### Current Correction and Earlier Value

The ordered current correction wins. Earlier values remain only when task-relevant history is needed and are marked superseded.

### Business Profile and Knowledge

The applicable Business Profile governs services, required fields, readiness, escalation, and handoff. Knowledge may explain approved information but cannot redefine those rules.

### Deterministic State and Model Summary

Deterministic state wins. A stale or conflicting model summary is excluded, invalidated, or labeled advisory; it never repairs state.

### Current Message and Older History

The current message has higher interpretive relevance for the immediate task but does not automatically become a fact or override a correction.

### Active and Stale Profiles

The conversation's verified applicable profile version wins. A newer active version does not silently replace an explicitly bound historical version, and a stale version cannot leak into a conversation bound to the current one.

### Knowledge Entries

When approved entries conflict, application knowledge policy uses status, version compatibility, effective dates, authority, and freshness. If no deterministic winner exists, the conflict remains explicit and a grounded task fails or seeks clarification.

## Duplication

Assembly deduplicates identical facts, rules, messages, and excerpts by stable source identity and revision. It retains a duplicate only when separate placement is required for task clarity and records that choice. Repetition cannot increase authority.

## Clear Labels

Each section declares its source category, authority, scope, and revision. Structured boundaries prevent a prose blob from blending facts, claims, rules, knowledge, history, instructions, or model suggestions.

Customer text and knowledge are delimited as content. Trace metadata and operational identifiers are not customer-facing drafting material.

## Task-Specific Ordering

- Interpretation prioritizes current text within eligible history while preserving profile and fact authority.
- Extraction places field definitions and current values before candidate-bearing text.
- Clarification places deterministic missing fields and asked-question history before ambiguity evidence.
- Response drafting places the approved action and customer-visible rules before supporting content.
- Knowledge-grounded answers place approved excerpts before the question's contextual history.
- Summaries preserve chronological history after authoritative state and corrections.
- Escalation recommendations place escalation policy and state before conversational evidence.

These variations optimize comprehension, not authority.

## Related Documents

- [Context Assembly Architecture](CONTEXT_ASSEMBLY_ARCHITECTURE.md)
- [Context Eligibility and Filtering](CONTEXT_ELIGIBILITY_AND_FILTERING.md)
- [Context Budgeting and Reduction](CONTEXT_BUDGETING_AND_REDUCTION.md)
