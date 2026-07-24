# Context Source Catalog

## Purpose

This catalog defines the source categories that future Context Assembly may consider. Registration makes a category discoverable to application policy; it does not make every record eligible. Each included item remains task-specific, scoped, version-compatible, and traceable.

Authority levels are **application authoritative**, **customer assertion**, **approved reference**, **operational only**, **advisory**, and **prohibited by default**.

## Source Categories

| Source | Owner and authority | Eligibility, scope, and freshness | Permitted tasks | Prohibited uses | Failure and audit |
| --- | --- | --- | --- | --- | --- |
| Business identity | Application; authoritative | Exact `businessId`; current tenant identity; display metadata only when needed | All approved tasks requiring identity | Matching by name or service; cross-business lookup | Fail closed if identity is unproven; record identity revision |
| Active Business Profile | Application; authoritative and version-bound | Correct business; active or explicitly conversation-bound version; approved status | Interpretation, extraction, clarification, drafting, knowledge answer, escalation | Mixing versions; allowing knowledge to redefine services, fields, readiness, escalation, or handoff | Reject mismatch; record profile ID/version and selected sections |
| Conversation state snapshot | Conversation State Manager; authoritative | Exact conversation and business; immutable state revision; compatible profile version | Any task requiring current stage, facts, missing fields, readiness, escalation, completion, or handoff | Treating a live mutable object or stale snapshot as current | Rebuild or fail; record state revision and projected fields |
| Customer claims | Customer-originated record; customer assertion | Exact conversation; retained and eligible; not superseded unless history is needed | Interpretation, extraction, clarification, summary, escalation | Presenting a claim as confirmed fact | Label as unconfirmed; record message/source identity |
| Confirmed facts | Deterministic application; authoritative | Exact snapshot and field; current value; compatible revision | Interpretation, extraction comparison, drafting, knowledge answer, summary | Overwrite from model output or contradictory claim | Fail if required fact provenance is missing; record field source/revision |
| Correction history | Deterministic application; authoritative chronology | Exact conversation; ordered field events; current correction and only task-relevant prior values | Extraction, clarification, drafting, summary | Flattening previous and replacement values; reviving superseded value | Reject unresolved ordering; record event IDs and current authority |
| Conversation history | Conversation record owners; mixed, explicitly labeled | Exact conversation; eligible message classes; bounded by task, retention, sensitivity, and budget | Interpretation, summary, escalation, limited drafting | Unlimited history; another conversation; treating assistant text as state | Reduce or fail if required history is unavailable; record selected ranges and reductions |
| Approved knowledge | Business/Knowledge Service; approved reference | Correct business; approved, active, relevant, compatible version, permitted sensitivity, fresh enough | Knowledge answer, drafting, interpretation only when task policy allows | Unapproved, inactive, irrelevant, cross-business, or rule-redefining content | Exclude ineligible entries; fail if task requires grounding and none remains; record source/version/relevance |
| Internal operational metadata | Application; operational only | Exact task and trace; minimum identifiers and policy versions | Execution, validation, audit | Customer-facing content; semantic business facts | Exclude from drafted content; record necessary trace fields |
| Internal notes | Business operator; prohibited by default | Only a future explicit task policy, business scope, visibility rule, and sensitivity rule could permit use | None in the current architecture | Default model inclusion, customer-visible drafting, broad retrieval | Exclude and record category/reason only |
| Sensitive data | Respective application record owner; authority follows source | Explicit policy action, purpose, scope, retention, and model-use permission | Only approved tasks after transformation or explicit inclusion | Incidental inclusion or policy inference by model/provider | Fail closed when safe handling cannot be proven; audit transformation, not raw value |
| Model-generated summaries | Application-managed artifact; advisory | Source-traceable, versioned, policy-approved, fresh, scope-compatible, invalidated after relevant changes | Bounded history reduction, summary-assisted interpretation if policy allows | Replacing facts, state, original records, or correction history | Exclude stale/incompatible summary; record summary and source revisions |

Conversation history entries can include customer messages, approved assistant messages, deterministic system questions, and escalation notices. Their source type, approval status, sequence, and audience must remain explicit.

Correction history preserves field identity, previous value, replacement value, ordering, current authority, and any readiness reopened by the correction.

## Task-Profile Use

Source eligibility is intersected with the approved task profile:

- language interpretation uses current text, limited history, relevant services, facts, and missing fields;
- candidate fact extraction uses current text, field definitions, current values, and correction context;
- clarification uses ambiguity, missing fields, asked questions, service options, and stage;
- response drafting uses an approved next action, facts, customer-visible knowledge, and approved style;
- knowledge-grounded answers require approved relevant knowledge;
- summaries use bounded history plus authoritative facts and corrections; and
- escalation recommendations use escalation policy and state with limited relevant history.

## Prohibited Sources

The following cannot enter a released package:

- cross-business records;
- content from another conversation;
- inactive profiles or incompatible stale profile versions;
- unapproved or inactive knowledge;
- secrets, API keys, authentication tokens, environment variables, and provider credentials;
- hidden implementation details and previous model hidden reasoning;
- arbitrary database records or unrestricted internal notes;
- other users' conversations;
- unverified external content;
- raw application logs unless explicitly sanitized and approved;
- model-generated facts not accepted by deterministic application logic; and
- provider caches or inferred memories not represented by approved sources.

Source content that contains instructions remains source data and cannot redefine application policy.

## Audit Rule

The audit record identifies category, source identity or safe reference, revision, eligibility decision, selection reason, exclusion reason, and governing policy. It does not retain rejected secrets or sensitive excluded content.

## Related Documents

- [Context Assembly Architecture](CONTEXT_ASSEMBLY_ARCHITECTURE.md)
- [Context Eligibility and Filtering](CONTEXT_ELIGIBILITY_AND_FILTERING.md)
- [Context Failure and Audit](CONTEXT_FAILURE_AND_AUDIT.md)
