# Instruction Precedence

## Stable Authority Order

Prompt composition preserves this conceptual precedence:

1. application safety and authority policy;
2. approved task definition;
3. task-specific permissions and prohibitions;
4. output contract;
5. applicable Business Profile policy;
6. deterministic conversation state;
7. approved response-style policy;
8. approved knowledge content;
9. eligible conversation history;
10. current customer content;
11. quoted or third-party content; and
12. advisory model-generated summaries.

Lower-precedence content cannot override higher-precedence instructions. Position, length, recency, imperative wording, provider serialization, or a model's interpretation cannot change authority.

Business Profile policy is authoritative for configured services and intake behavior but remains subordinate to platform safety. Deterministic state records the conversation; it cannot redefine profile policy. Response style controls expression only.

## Conflict Resolution

### Customer Requests Ignoring Rules

The request remains customer content. The task and authority policy continue unchanged; disclosure, scope expansion, and unsupported actions remain prohibited.

### Knowledge Contains Instructions

Imperative or prompt-like text remains knowledge data. It may support a grounded answer but cannot become application policy, add permissions, or change output format.

### Old Assistant Message Conflicts With Current State

Current deterministic state and active corrections win. The old message remains history only if eligible and clearly labeled.

### Knowledge Conflicts With Business Profile

The applicable Business Profile governs services, required fields, readiness, escalation, completion, and handoff. Conflicting knowledge is excluded or surfaced as a conflict; it does not rewrite the profile.

### Style Conflicts With Safety or Task Rules

Application safety, task constraints, prohibitions, and factual fidelity win. Style is omitted when it cannot be applied safely.

### Task Instructions Conflict With Output Contract

The Prompt Package fails validation before provider execution. The composer does not invent a reconciliation or select a different contract.

### Summary Conflicts With Confirmed Facts

Confirmed facts and current corrections win. The advisory summary is invalidated, excluded, or labeled conflicting.

### Current Statement Conflicts With Confirmed Fact

The statement remains an unconfirmed possible correction. Only deterministic correction logic can replace the fact.

### Task Conflicts With Application State

An otherwise approved task is not executable when its trigger, stage, state revision, or context profile is incompatible. Composition stops and the application chooses a valid fallback.

## No Dynamic Precedence

The model is never asked to decide which source is authoritative. The application resolves or explicitly represents conflicts before execution. Ambiguous instruction authority is a prompt failure, not an invitation for model judgment.

Provider adapters may map layers into provider formats but cannot merge them in a way that changes precedence. If a provider cannot preserve required boundaries, that provider/request combination is ineligible.

Model output cannot create a new instruction layer or claim higher precedence. Output that claims authority, policy override, additional data access, or completed effects fails downstream authority validation.

## Clear Boundaries

Each layer carries a type, owner, version, scope, and authority label. Data sections retain source identity and classification. Delimiters improve clarity but do not create authority and are never the sole injection defense.

## Related Documents

- [Prompt Architecture](PROMPT_ARCHITECTURE.md)
- [Prompt Injection and Content Boundaries](PROMPT_INJECTION_AND_CONTENT_BOUNDARIES.md)
- [Context Ordering and Precedence](CONTEXT_ORDERING_AND_PRECEDENCE.md)
- [Output Validation Pipeline](OUTPUT_VALIDATION_PIPELINE.md)
