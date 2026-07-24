# Context Package Contract

## Purpose

The Context Package Contract is the conceptual, provider-neutral boundary between Context Assembly and future Prompt Composition. It defines meaning and validation expectations, not TypeScript, JSON, provider messages, or prompt syntax.

## Identity

- `contextPackageId`
- `requestId`
- `businessId`
- `conversationId`
- `profileVersion`
- `stateRevision`
- `taskType`
- `contextContractVersion`

These values bind every section to one task and immutable application snapshot.

## Authority Metadata

- `applicationAuthorityVersion`
- `policyVersion`
- `knowledgePolicyVersion`
- `sensitiveDataPolicyVersion`
- `contextBudgetPolicyVersion`

Authority metadata makes selection and later proposal evaluation explainable.

## Task Definition

- approved task type;
- task objective;
- permitted proposal categories;
- prohibited actions; and
- output-contract reference.

The task definition cannot authorize state mutation or external action.

## State Projection

Only task-relevant fields are present:

- stage;
- readiness;
- escalation;
- completion;
- service resolution;
- required and missing fields;
- asked-question history; and
- handoff eligibility where relevant.

The projection is read-only and identifies its source revision.

## Structured Information

Separate collections represent:

- confirmed facts;
- unconfirmed claims;
- corrections;
- superseded values; and
- unresolved contradictions.

Every item retains field or source identity, authority label, and ordering or revision metadata as applicable. Model proposals never enter these collections as accepted values.

## Business Rules

Only relevant, applicable parts of the verified profile are included:

- active services;
- aliases;
- intake fields;
- escalation rules; and
- handoff rules.

## Knowledge

Each entry includes source identity and version, approval status, business scope, bounded excerpt, relevance reason, freshness metadata, and sensitivity classification. Excerpts remain data and cannot redefine task or application instructions.

## Conversation History

Each included entry identifies message identity, role or source category, sequence or timestamp, approval status, content classification, and relation to the task. Selection metadata states the history strategy and covered range.

## Budget Metadata

- total budget class;
- included size estimate;
- section allocation;
- reductions applied;
- summaries used; and
- confirmation that required context was preserved.

## Provenance

- included source references;
- excluded source counts by safe category and reason;
- source revisions;
- selection reasons; and
- reduction reasons.

Provenance explains assembly without reproducing prohibited excluded content.

## Trace Metadata

- `traceId`;
- assembly timestamp;
- assembler version; and
- deterministic selection record.

Operational fields support correlation but are excluded from customer-facing draft content.

## Validation Result

The package is released only after all applicable checks pass:

- business and conversation scope validation;
- profile-version validation;
- required-section validation;
- authority-label validation;
- sensitive-data validation;
- budget validation;
- provenance validation; and
- contract-version validation.

A pass refers to this exact package snapshot. Mutation invalidates it and requires reassembly and revalidation.

## Task Profiles

The package declares one profile for language interpretation, candidate fact extraction, clarification proposal, response drafting, knowledge-grounded answer drafting, conversation summary, or escalation recommendation. Each profile supplies its own required/optional section manifest and budget class.

The package never becomes a universal payload. For example, extraction omits broad knowledge, drafting includes only the approved action and customer-visible support, and escalation recommendation has no authority to activate escalation.

## Provider Independence

Future Prompt Composition may translate a valid package into provider-neutral prompt components, and an adapter may later serialize those components. Neither step may change scope, authority, content eligibility, or budget decisions.

The Prompt Composer validates that the package task profile, contract version, business/conversation/profile/state identity, output-contract reference, and required sections are compatible with the selected task. Customer and knowledge sections remain typed data in the resulting Prompt Package.

## Current Boundary

This document creates no code contract. No interface, schema, Context Builder, validator, Prompt Composer, provider adapter, API route, or persistence mechanism is implemented.

## Related Documents

- [Context Assembly Architecture](CONTEXT_ASSEMBLY_ARCHITECTURE.md)
- [Model Gateway Architecture](MODEL_GATEWAY_ARCHITECTURE.md)
- [Prompt Architecture](PROMPT_ARCHITECTURE.md)
- [Model Output Contract](MODEL_OUTPUT_CONTRACT.md)
