# Prompt Versioning and Change Control

## Versioned Artifacts

The following conceptual artifacts have independent approved versions:

- task definitions;
- application-authority instruction policy;
- task-instruction policy;
- permission policy;
- prohibition policy;
- output-contract references;
- response-style policy;
- prompt-composition policy;
- injection-handling policy;
- Prompt Package contract; and
- composer behavior.

Business Profile and Context Package versions remain external authoritative inputs and are referenced rather than copied into prompt policy.

## Operation Identity

Each model-assisted operation records:

- `taskIdentifier`;
- `taskVersion`;
- `applicationPolicyVersion`;
- `promptPolicyVersion`;
- `outputContractVersion`;
- `responseStylePolicyVersion`;
- `contextContractVersion`; and
- `composerVersion`.

The Prompt Package also binds business, conversation, profile, state revision, Context Package identity, and trace ID.

## Change Categories

- **Editorial:** wording, labels, or documentation intended not to alter behavior.
- **Behavioral:** objectives, examples, selection, ordering, or expression likely to affect proposals.
- **Contract:** output structure, allowed proposal types, missing-value behavior, or compatibility.
- **Safety:** authority, permissions, prohibitions, injection handling, sensitive data, or fail-closed behavior.
- **Business policy:** profile-owned rules or their projection; not arbitrary prompt prose.
- **Provider translation:** adapter serialization without authority or semantic change.

Editorial changes are reviewed and tested; they are not assumed behavior-neutral merely because intent is unchanged.

## Review Requirements

Every change is reviewed proportionately for:

- authority drift;
- permission expansion;
- prohibition weakening;
- output-contract and Context Package compatibility;
- business and conversation isolation;
- profile/state revision behavior;
- injection resistance and sensitive-data handling;
- cost and latency impact; and
- regression risk across approved task scenarios.

Safety, contract, and behavioral changes require explicit approval and a new compatible version. Provider translation changes must demonstrate semantic preservation.

## Approval and Activation

A version moves conceptually through draft, review, approved, active, suspended, and retired states. Only approved and policy-allowed versions may compose requests.

Activation is controlled by application configuration, not model output. Incompatible task, prompt, context, style, or output-contract versions fail before execution.

## Rollback

The architecture supports:

- reverting to a prior approved prompt policy;
- pinning an approved task version;
- invalidating incompatible versions;
- comparing results across versions; and
- preserving historical audit records.

Rollback cannot revive a version suspended for an unresolved safety issue or bypass current business/scope policy. In-flight proposals remain bound to their original versions and state revision.

## Experimentation

Future experiments:

- use pre-approved variants;
- remain business-scoped;
- preserve authority, safety, and isolation;
- preserve compatible output contracts;
- are explicitly assigned and auditable;
- respect cost and latency limits; and
- never roll out silently.

Experiments cannot expand task permissions, weaken prohibitions, use real customer data without later-approved controls, or substitute provider experimentation for application policy. No experimentation infrastructure is implemented here.

## No Runtime Self-Modification

A model cannot rewrite authority instructions, modify task definitions, create or approve variants, promote a successful response into policy, select a new version, or change activation state.

Model output and performance observations may inform a separately reviewed human change, but are never self-executing policy.

## Audit and Reproducibility

Change records identify artifact, previous/new versions, category, rationale, reviewer/approval state, compatibility assessment, test evidence, activation/rollback status, and date. Runtime audit references the exact active versions rather than storing secrets or unnecessary full prompt text.

## Current Boundary

No registry, approval workflow, experimentation system, prompt store, deployment control, or rollback mechanism is implemented.

## Related Documents

- [Prompt Composition Pipeline](PROMPT_COMPOSITION_PIPELINE.md)
- [Prompt Failure and Audit](PROMPT_FAILURE_AND_AUDIT.md)
- [Prompt Testing Strategy](PROMPT_TESTING_STRATEGY.md)
