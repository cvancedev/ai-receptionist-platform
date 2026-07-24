# Prompt Failure and Audit

## Failure Categories

- `UnknownTask`
- `UnsupportedTaskVersion`
- `TaskNotAllowed`
- `ContextPackageMismatch`
- `OutputContractMismatch`
- `MissingAuthorityInstructions`
- `MissingTaskInstructions`
- `InvalidPermissionPolicy`
- `InvalidProhibitionPolicy`
- `InstructionConflict`
- `ProfileVersionMismatch`
- `StateRevisionMismatch`
- `PromptOverBudget`
- `SensitiveContentBoundaryFailure`
- `InjectionBoundaryFailure`
- `InvalidPromptContract`
- `PromptCompositionCancelled`
- `UnknownPromptFailure`

Failures identify the stage, compatible safe metadata, policy versions, and whether approved recovery is possible. Unknown errors are not converted into partial success.

## Fail-Closed Conditions

Provider execution is prevented when:

- the task is unknown, disabled, or unapproved at its version;
- the output contract is missing or incompatible;
- authority or task instructions are missing;
- instruction precedence is ambiguous;
- business or conversation scope cannot be proven;
- profile or state revision is incompatible;
- the Context Package is invalid, stale, or mismatched;
- required prompt content exceeds budget;
- sensitive content cannot be handled safely;
- customer or knowledge data is not clearly separated from instructions; or
- the Prompt Package contract is invalid.

Cancellation before release also stops execution. A provider adapter cannot repair a failed Prompt Package.

## Recovery

The application may:

- recompose from a fresh validated Context Package;
- select a compatible approved task version;
- remove optional examples;
- reduce optional history or advisory content;
- use a smaller approved task profile;
- use deterministic fallback;
- request clarification;
- escalate under deterministic policy; or
- stop safely.

Recovery never removes authority instructions, weakens prohibitions, changes business or conversation scope, invents an output contract, permits an unknown task, treats data as policy, or silently changes the task objective.

Each retry is a new composition with its own package identity, validation result, and audit trace.

## Audit Record

Conceptual fields include:

- request identity;
- business and conversation scope;
- profile version and state revision;
- task identifier and version;
- Context Package identity;
- application and prompt policy versions;
- output-contract version;
- response-style version;
- composer version;
- included instruction layers and context sections;
- reductions and delimiters applied;
- budget and validation results;
- failure category and recovery path;
- trace identifier; and
- composition duration.

The audit separates application task selection, context validation, composition, provider release, model result, output validation, and application decision.

## Audit Restrictions

Audit records do not require:

- provider credentials or secrets;
- hidden model reasoning;
- prohibited sensitive content;
- full raw prompt content when safe metadata, version references, and hashes are sufficient;
- excluded cross-business data; or
- customer content duplicated beyond approved retention.

Audit storage must not become a shadow prompt, context, or sensitive-data repository.

## Reproducibility

Where practical, an authorized reviewer can explain:

- which task and policy versions were used;
- which Context Package and output contract were required;
- which instruction and data layers were included;
- which reductions occurred;
- which validations passed or failed;
- why provider release was allowed or prevented; and
- which fallback or recovery path followed.

Reproducibility does not promise identical bytes across provider adapters and does not require retaining prohibited content.

## Task Failure Examples

- Interpretation with an unapproved task version uses deterministic handling.
- Extraction with mismatched field context stops before execution.
- Clarification without approved options uses the deterministic question.
- Drafting without an approved action cannot ask the model to invent one.
- Knowledge answering without sufficient approved excerpts returns a safe insufficiency path.
- Summary with a stale Context Package is rebuilt or omitted.
- Escalation recommendation with mismatched state cannot activate or clear escalation.

## Current Boundary

No failure class, Prompt Package validator, audit store, retry engine, provider call, monitoring vendor, or recovery implementation is added in Milestone 4.3.

## Related Documents

- [Prompt Architecture](PROMPT_ARCHITECTURE.md)
- [Prompt Injection and Content Boundaries](PROMPT_INJECTION_AND_CONTENT_BOUNDARIES.md)
- [AI Failure and Recovery](AI_FAILURE_AND_RECOVERY.md)
