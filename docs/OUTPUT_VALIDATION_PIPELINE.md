# Output Validation Pipeline

## Sequence

1. Receive normalized provider result.
2. Verify request identity.
3. Verify task identity.
4. Verify Context Package identity.
5. Verify Prompt Package identity.
6. Verify Output Contract identity.
7. Verify business scope.
8. Verify conversation scope.
9. Verify profile version.
10. Verify state revision.
11. Confirm the provider result is complete enough for parsing.
12. Parse raw output.
13. Reject malformed structure.
14. Validate required fields.
15. Validate allowed fields.
16. Validate enumerations.
17. Validate source references.
18. Validate proposal type.
19. Validate task compatibility.
20. Validate permissions.
21. Reject prohibited operations.
22. Validate semantic consistency.
23. Validate Business Profile compatibility.
24. Validate deterministic state compatibility.
25. Validate knowledge grounding.
26. Validate customer-facing text.
27. Check duplicate-processing guard.
28. Classify the result.
29. Produce application-decision input.
30. Record audit metadata.

Provider HTTP success, text generation, schema-mode success, or provider safety classification does not constitute application success.

## Raw Parsing

Parsing is bounded, contract-aware, inert, and resource-limited. It:

- accepts only the expected encoding and one supported shape;
- rejects ambiguous multi-object output unless explicitly contracted;
- rejects forbidden trailing instruction or commentary text;
- rejects malformed encoding and excessive depth/size;
- never executes code, evaluates expressions, follows links, or invokes tools;
- never interprets markup as authority; and
- never silently repairs action-like, scope, source, or authority fields.

Raw content remains safely referenced or hashed for audit rather than trusted.

## Structural Validation

Checks include required-field presence, exact type, allowed-field policy, length/count/nesting constraints, enumerations, source-reference shape, scope identity, contract identifier/version, and conditional field relationships.

Structurally valid output continues through all later layers.

## Semantic Validation

The application verifies:

- candidate fields exist and are eligible under the applicable profile;
- candidate services are active and eligible;
- source messages belong to this conversation;
- knowledge sources belong to this business and were included;
- customer text makes no unsupported promise;
- summaries do not promote claims, erase corrections, or rewrite chronology;
- correction candidates do not overwrite confirmed state;
- escalation recommendations do not activate escalation;
- unsupported interpretations do not add services; and
- drafts correspond exactly to the application-approved action.

Contradictions remain explicit. A near match does not create missing authority.

## Scope and State Compatibility

Application-bound request, task, Context Package, Prompt Package, contract, business, conversation, profile, and state identities must agree. Model-supplied replacements are rejected.

Validation compares with the current authoritative state revision. If state changed while the request was in flight, the proposal is rejected or re-evaluated from a new snapshot; it cannot mutate the current state automatically.

## Authority Validation

Reject output that claims it:

- mutated state or confirmed facts;
- completed the conversation;
- activated or cleared escalation;
- sent a message or created a handoff;
- updated a Business Profile;
- accessed additional data;
- selected a retry; or
- overrode application policy.

Such claims are invalid content, not evidence that an action occurred.

## Knowledge Grounding

Material business claims map to approved knowledge source IDs/versions present in the validated Context Package. Hallucinated, cross-business, inactive, missing, or semantically unrelated references fail.

When knowledge is insufficient, the proposal must preserve that limitation. Provider or model memory cannot fill the gap.

## Duplicate Guard

Stable request/proposal identity and operation/release keys allow the application to determine whether content was parsed, validated, decided, applied, or released. A retry is linked but does not acquire authority over a prior accepted result.

## Task Profiles

The eight MVP task profiles use the validation expectations in [Model Proposal Catalog](MODEL_PROPOSAL_CATALOG.md). Unknown task/proposal pairs fail before decision input is produced.

## Related Documents

- [Model Output Validation Architecture](MODEL_OUTPUT_VALIDATION_ARCHITECTURE.md)
- [Proposal Decision and Application](PROPOSAL_DECISION_AND_APPLICATION.md)
- [Output Failure and Audit](OUTPUT_FAILURE_AND_AUDIT.md)
