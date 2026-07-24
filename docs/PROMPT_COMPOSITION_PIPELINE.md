# Prompt Composition Pipeline

## Purpose

Prompt Composition converts one approved task and one validated Context Package into a bounded, provider-neutral prompt package. It does not select a task, retrieve data, define business truth, call a provider, or validate model output.

## Pipeline

1. The application selects an approved task.
2. The Task Registry validates task identifier and version.
3. The Context Package is validated.
4. Output-contract compatibility is validated.
5. Application authority instructions are selected.
6. Task instructions are selected.
7. Permissions and prohibitions are selected.
8. The Business Profile policy projection is included.
9. The deterministic state projection is included.
10. Approved knowledge is included.
11. Eligible conversation data is included.
12. Current customer input is marked as data.
13. Instruction boundaries and data delimiters are applied.
14. Prompt budget is checked.
15. Prompt version metadata is attached.
16. Prompt Package validation runs.
17. The provider-neutral request is released to the Model Gateway.
18. Audit metadata records composition decisions.

The model and provider do not participate in these steps. Failure at any step prevents release.

## Conceptual Components

- **Task Registry:** owns approved identifiers, versions, allowlist status, context profiles, and output-contract compatibility.
- **Prompt Policy Registry:** owns composition, budget, injection, and change-control policies.
- **Authority Instruction Registry:** supplies approved application-authority policy by version.
- **Task Instruction Registry:** supplies task objective, completion conditions, and task-specific constraints.
- **Output Contract Registry:** resolves compatible contract references and allowed proposal categories.
- **Response Style Policy:** supplies approved expression rules without changing action, facts, or authority.
- **Prompt Composer:** assembles already-approved layers in deterministic order.
- **Prompt Budgeter:** enforces application-owned total and section limits.
- **Prompt Package Validator:** checks scope, completeness, compatibility, boundaries, precedence, versions, and budget.
- **Prompt Audit Recorder:** records safe composition metadata, reductions, validation, and failure.

These responsibilities are architecture only and are not implemented.

## Inputs

- `requestId`
- `businessId`
- `conversationId`
- `profileVersion`
- `stateRevision`
- `taskIdentifier`
- `taskVersion`
- validated `contextPackage`
- `outputContractIdentifier`
- `outputContractVersion`
- `applicationPolicyVersion`
- `promptPolicyVersion`
- `responseStylePolicyVersion`
- trace metadata

All identities must agree with the Context Package and current operation. References do not permit the composer to retrieve arbitrary data.

## Output

The provider-neutral Prompt Package contains:

- identity and scope;
- approved task;
- authority instructions;
- permissions and prohibitions;
- output-contract reference;
- Business Profile policy projection;
- labeled Context Package sections;
- separately typed customer input;
- version metadata;
- budget metadata;
- provenance; and
- validation result.

It contains no provider SDK object, provider role type, credential, secret, endpoint, or transport configuration.

## Determinism

Composition is reproducible where practical from task version, Context Package identity, application and prompt policy versions, output-contract version, response-style version, and composer version. Audit metadata explains ordering and reductions.

Future adapters may serialize the package differently, so byte-for-byte equality across providers is not promised. Translation cannot alter authority, scope, task, permissions, or data classification.

## Prompt Budget

Budgeting preserves:

- application-authority instructions;
- approved task definition;
- business and conversation scope;
- permissions and prohibitions;
- output-contract reference;
- required deterministic state and active corrections; and
- required approved knowledge for grounded tasks.

Optional examples, duplicate material, old history, and advisory summaries are reduced first under deterministic policy. If mandatory layers do not fit, composition fails; it never removes safeguards to reach a provider limit.

## Task-Specific Profiles

- **Language interpretation:** active service definitions and current input; candidate meaning only.
- **Candidate fact extraction:** approved fields, source references, and absent-versus-uncertain handling.
- **Clarification proposal:** one approved ambiguity and approved options.
- **Response drafting:** one application-approved action plus style policy.
- **Knowledge-grounded answer:** included excerpts only; insufficiency must remain visible.
- **Conversation summary:** bounded history with separate facts, claims, corrections, and unresolved issues.
- **Escalation recommendation:** included criteria and current state; recommendation only.

## Current Boundary

Milestone 4.5 implements an immutable prototype Task Registry and deterministic Prompt Package Composer/validation boundary. It emits provider-neutral references and package metadata, not production prompt prose or provider messages. No production registry, prompt store, prompt experiment, or provider request is implemented.

Milestone 4.4 defines that the bound Output Contract and package identities become immutable inputs to downstream validation. Composition never validates or authorizes model output.

## Related Documents

- [Prompt Architecture](PROMPT_ARCHITECTURE.md)
- [Instruction Precedence](INSTRUCTION_PRECEDENCE.md)
- [Prompt Versioning and Change Control](PROMPT_VERSIONING_AND_CHANGE_CONTROL.md)
- [Output Contract Architecture](OUTPUT_CONTRACT_ARCHITECTURE.md)
- [Output Validation Pipeline](OUTPUT_VALIDATION_PIPELINE.md)
- [AI Integration Prototype Foundation](AI_INTEGRATION_PROTOTYPE_FOUNDATION.md)
