# Model Task Catalog

## Purpose

The catalog defines the only conceptual model-assisted tasks the application may invoke during the MVP. A task narrows what a model may propose; it never grants authority to mutate state, release a response, choose context, or select a provider.

Execution requires an approved task identifier and version, compatible context profile and output contract, compatible provider policy, application-owned invocation, and an audit trace. Unknown, disabled, or incompatible tasks fail before provider execution.

Cost and latency classes are application policy labels—**low**, **standard**, or **extended**—not provider-specific limits.

## MVP-Allowlisted Tasks

### Language Interpretation

- **Identifier:** `language-interpretation`
- **Purpose:** Interpret free-form customer language into candidate structured meaning.
- **Application trigger:** Deterministic logic identifies language that requires interpretation.
- **Required context:** Current message, relevant active services and aliases, relevant facts, missing fields, and bounded recent history.
- **Permitted proposals:** Candidate intent, service reference, ambiguity, unsupported request, and customer objective.
- **Prohibited:** Authoritative service resolution, fact confirmation, stage change, escalation activation, or readiness decision.
- **Output contract:** Versioned interpretation-proposal contract.
- **Validation:** Scope, allowed categories, source evidence, active-service compatibility, uncertainty, and no state operations.
- **Fallback:** Deterministic interpretation, bounded clarification, escalation, or safe unsupported handling.
- **Class:** Standard cost; low-latency interactive.
- **Audit:** Task/version, source message, context package, proposal categories, validation, and fallback.
- **MVP status:** Allowed.

### Candidate Fact Extraction

- **Identifier:** `candidate-fact-extraction`
- **Purpose:** Propose structured values from customer language.
- **Application trigger:** An approved field-extraction opportunity exists for the current message.
- **Required context:** Current message, allowed field definitions, current confirmed values, and active correction context.
- **Permitted proposals:** Candidate field identity and value, source-message reference, and later-approved uncertainty classification.
- **Prohibited:** Confirmation, replacement of confirmed facts, correction application, normalization without policy, or mutation.
- **Output contract:** Versioned candidate-fact-proposal contract.
- **Validation:** Allowed field, source support, type/format, uncertainty, conflict, and prohibited-operation checks.
- **Fallback:** Deterministic parsing, clarification, retain as claim, or no proposal.
- **Class:** Low cost; low-latency interactive.
- **Audit:** Fields requested/proposed, safe source references, policy versions, validation, and fallback.
- **MVP status:** Allowed.

### Clarification Proposal

- **Identifier:** `clarification-proposal`
- **Purpose:** Draft one clarification for ambiguity already identified by the application.
- **Application trigger:** Deterministic state records an approved ambiguity and clarification need.
- **Required context:** Ambiguity, approved options, missing fields, asked-question history, and current stage.
- **Permitted proposals:** Customer-facing wording and options drawn only from approved context.
- **Prohibited:** Invented options, new questions, changed required fields, or deciding clarification is unnecessary.
- **Output contract:** Versioned clarification-draft contract.
- **Validation:** One bounded clarification, approved options only, stage compatibility, non-repetition, and safe wording.
- **Fallback:** Deterministic clarification question or escalation.
- **Class:** Low cost; low-latency interactive.
- **Audit:** Ambiguity ID, options, asked-question state, draft validation, and released fallback.
- **MVP status:** Allowed.

### Response Drafting

- **Identifier:** `response-drafting`
- **Purpose:** Draft customer-facing language for an application-approved action.
- **Application trigger:** The application has selected an action or deterministic question and permits assisted wording.
- **Required context:** Approved action/question, relevant facts, customer-visible knowledge, and response-style policy.
- **Permitted proposals:** Natural wording, tone-consistent phrasing, concise fact restatement, and approved question wording.
- **Prohibited:** New actions, services, policies, promises, state changes, or direct customer release.
- **Output contract:** Versioned customer-response-draft contract.
- **Validation:** Action equivalence, fact support, policy grounding, style, prohibited promises, audience, and safety.
- **Fallback:** Application-owned deterministic wording.
- **Class:** Standard cost; low-latency interactive.
- **Audit:** Approved action, grounding references, style version, validation, decision, and release record.
- **MVP status:** Allowed.

### Knowledge-Grounded Answer Drafting

- **Identifier:** `knowledge-grounded-answer-drafting`
- **Purpose:** Draft an answer using only approved knowledge excerpts.
- **Application trigger:** A customer question has relevant eligible business knowledge and an approved answer task.
- **Required context:** Customer question, business identity, relevant facts, and approved traceable excerpts.
- **Permitted proposals:** Grounded answer, later-supported citations, and acknowledgment of missing knowledge.
- **Prohibited:** External knowledge, model-memory gap filling, profile-rule redefinition, or unsupported certainty.
- **Output contract:** Versioned grounded-answer-draft contract.
- **Validation:** Every material claim grounded, citations valid when used, insufficiency exposed, and business rules preserved.
- **Fallback:** Honest missing-knowledge response, clarification, or human escalation.
- **Class:** Standard cost; low-latency interactive.
- **Audit:** Knowledge IDs/versions, grounding decisions, unsupported claims, validation, and fallback.
- **MVP status:** Allowed.

### Conversation Summary

- **Identifier:** `conversation-summary`
- **Purpose:** Produce an advisory summary of bounded eligible history.
- **Application trigger:** An approved handoff, reduction, or review workflow requests a summary.
- **Required context:** Bounded history, confirmed facts, claims, corrections, unresolved issues, and current state.
- **Permitted proposals:** Separate summaries of facts, claims, corrections, and pending needs.
- **Prohibited:** State replacement, contradiction removal, claim promotion, or silent chronology changes.
- **Output contract:** Versioned advisory-summary contract.
- **Validation:** Evidence-class separation, correction/current-value fidelity, chronology, omissions, and no authoritative operations.
- **Fallback:** Deterministic structured state summary or unsummarized bounded records.
- **Class:** Extended cost; non-blocking latency unless required for an active handoff.
- **Audit:** History range, source revisions, summary version, validation, and invalidation basis.
- **MVP status:** Allowed only for bounded advisory summaries.

### Escalation Recommendation

- **Identifier:** `escalation-recommendation`
- **Purpose:** Recommend whether escalation may be appropriate under application-defined policy.
- **Application trigger:** Policy permits advisory review of explicit escalation signals or repeated ambiguity.
- **Required context:** Escalation criteria and state, recent eligible history, failed attempts, and customer request.
- **Permitted proposals:** Recommendation, reason category, and customer-facing acknowledgment draft.
- **Prohibited:** Activating or clearing escalation, changing ownership, or triggering handoff.
- **Output contract:** Versioned escalation-recommendation contract.
- **Validation:** Allowed reason, evidence, policy compatibility, state consistency, and no activation operation.
- **Fallback:** Deterministic escalation rules or safe human escalation.
- **Class:** Standard cost; low-latency when customer-blocking.
- **Audit:** Criteria, evidence references, recommendation, deterministic decision, and resulting path.
- **MVP status:** Allowed as recommendation only.

### Unsupported Request Interpretation

- **Identifier:** `unsupported-request-interpretation`
- **Purpose:** Classify language that may be outside active services without changing the service catalog.
- **Application trigger:** Deterministic resolution cannot match an active service and policy permits advisory interpretation.
- **Required context:** Current message, active services/aliases, unsupported-handling policy, and relevant recent history.
- **Permitted proposals:** Candidate unsupported category, nearest approved active service, and clarification need.
- **Prohibited:** New services, inactive-service activation, authoritative remapping, or override of unsupported handling.
- **Output contract:** Versioned unsupported-request-proposal contract.
- **Validation:** Active-service membership, evidence, ambiguity, no invented capability, and policy compatibility.
- **Fallback:** Deterministic unsupported response, clarification, or escalation.
- **Class:** Low cost; low-latency interactive.
- **Audit:** Active-service version, candidates, unsupported decision, validation, and fallback.
- **MVP status:** Allowed.

## Deferred and Prohibited Tasks

The MVP allowlist excludes long-form business-content drafting, internal operational summarization, multi-conversation memory synthesis, tool selection, workflow planning, autonomous follow-up, scheduling decisions, CRM mutation, payment actions, and voice-agent response orchestration.

These tasks require separate business justification, authority and safety architecture, contracts, validation, and approval. A task identifier resembling a deferred task remains unknown or not allowed; the model cannot create it dynamically.

## Allowlist Validation

Before composition, the Task Registry verifies:

1. exact identifier and approved version;
2. MVP and business-policy allowlist status;
3. compatible context profile;
4. compatible output contract and version;
5. compatible provider policy, if a provider is later selected;
6. application-owned trigger and scope; and
7. trace identity.

Failure produces `UnknownTask`, `UnsupportedTaskVersion`, or `TaskNotAllowed` and stops before provider execution.

## Related Documents

- [Prompt Architecture](PROMPT_ARCHITECTURE.md)
- [Prompt Composition Pipeline](PROMPT_COMPOSITION_PIPELINE.md)
- [Prompt Failure and Audit](PROMPT_FAILURE_AND_AUDIT.md)
