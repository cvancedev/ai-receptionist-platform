# Model Proposal Catalog

## Common Envelope

Every MVP proposal carries application-bound request, business, conversation, profile, state, task, Context Package, Prompt Package, Output Contract, proposal, and source-reference identities. The model cannot redefine these scope fields.

Common audit records include the proposal identity/type, task and contract versions, safe raw-output reference, validation results, application decision, fallback, and effects. Permitted decisions are accept, contract-supported partial accept, modify narrowly, reject, clarify, deterministic fallback, bounded retry, escalation, or safe stop as specified below.

## Intent Interpretation Proposal

- **Identifier/task/purpose:** `intent-interpretation-proposal`; language interpretation; candidate meaning.
- **Required:** candidate intent, ambiguity and unsupported indicators, source-message reference, common scope.
- **Optional:** candidate active-service reference and customer objective.
- **Sources:** current eligible message; relevant service/profile references when used.
- **Contract:** versioned interpretation-proposal contract.
- **Validation:** allowed intent, current-conversation source, active service, explicit uncertainty, scope/state/task compatibility.
- **Prohibited:** authoritative service resolution, transition, readiness, escalation activation, operations.
- **Decisions/fallback:** accept candidate, narrow/clarify/reject; deterministic resolution, clarification, unsupported handling, or escalation.
- **Audit:** candidates, evidence, ambiguity, accepted interpretation, and deterministic follow-up.

## Candidate Fact Proposal

- **Identifier/task/purpose:** `candidate-fact-proposal`; candidate fact extraction; candidate structured value.
- **Required:** field ID, candidate value, source-message reference, common scope.
- **Optional:** bounded normalization note and later-approved uncertainty class.
- **Sources:** current eligible customer message and field/profile reference.
- **Contract:** versioned candidate-fact-proposal contract.
- **Validation:** field exists/is eligible, value shape, source support, correction/conflict status, no overwrite.
- **Prohibited:** confirmation status, state mutation, correction application, readiness, authoritative normalization.
- **Decisions/fallback:** accept independent candidate, clarify, retain claim, reject; deterministic parsing or no proposal.
- **Audit:** field/value safe reference, evidence, existing value, decision, and later deterministic operation if any.

## Clarification Text Proposal

- **Identifier/task/purpose:** `clarification-text-proposal`; clarification proposal; wording for approved ambiguity.
- **Required:** one bounded draft, reason category, approved ambiguity reference, common scope.
- **Optional:** approved option references.
- **Sources:** deterministic ambiguity, approved options, asked-question state.
- **Contract:** versioned clarification-draft contract.
- **Validation:** clarification was requested, only approved options/question, non-repetition, safe customer text.
- **Prohibited:** new services, fields, policy, questions, escalation activation, operations.
- **Decisions/fallback:** accept/shorten/replace/reject; deterministic clarification or escalation.
- **Audit:** ambiguity/options, draft validation, final wording identity, release result.

## Customer Response Draft Proposal

- **Identifier/task/purpose:** `customer-response-draft-proposal`; response drafting; wording for an approved action.
- **Required:** customer-facing text, approved action or deterministic-question reference, common scope.
- **Optional:** grounding references already in context.
- **Sources:** approved action, facts, eligible customer-visible knowledge, style policy.
- **Contract:** versioned customer-response-draft contract.
- **Validation:** action equivalence, facts, promises, audience, safety, state, knowledge, release checks.
- **Prohibited:** new action, service, policy, unsupported promise, state mutation, direct delivery.
- **Decisions/fallback:** accept/shorten/narrow/replace/reject; deterministic wording.
- **Audit:** approved action, grounding, accepted content identity, modification, release/duplicate result.

## Knowledge-Grounded Answer Proposal

- **Identifier/task/purpose:** `knowledge-grounded-answer-proposal`; knowledge answer drafting; grounded answer.
- **Required:** answer draft, knowledge source IDs/versions or insufficiency indicator, common scope.
- **Optional:** uncertainty/limitation note and later-approved customer citations.
- **Sources:** only eligible excerpts in the bound Context Package.
- **Contract:** versioned grounded-answer contract.
- **Validation:** claim-level grounding, business/source eligibility, profile consistency, insufficiency honesty, safe text.
- **Prohibited:** external knowledge, unsupported facts/certainty, profile-rule redefinition, invented sources.
- **Decisions/fallback:** accept/narrow/replace/reject; missing-knowledge response, clarification, or human path.
- **Audit:** source provenance, grounded/ungrounded claims, decision, final release.

## Conversation Summary Proposal

- **Identifier/task/purpose:** `conversation-summary-proposal`; conversation summary; advisory bounded summary.
- **Required:** separate fact, claim, correction, and pending-issue summaries; source-range references; common scope.
- **Optional:** unresolved contradiction summary.
- **Sources:** bounded eligible history and authoritative state snapshot.
- **Contract:** versioned advisory-summary contract.
- **Validation:** evidence classes, corrections/current values, chronology, contradictions, source range, state compatibility.
- **Prohibited:** state replacement, confirmation, chronology alteration, contradiction removal, authoritative handoff.
- **Decisions/fallback:** accept advisory sections only when independent, modify/reject; deterministic state summary/original records.
- **Audit:** history range/revisions, omissions/conflicts, advisory status, invalidation basis.

## Escalation Recommendation Proposal

- **Identifier/task/purpose:** `escalation-recommendation-proposal`; escalation recommendation; advisory recommendation.
- **Required:** recommendation, reason category, supporting eligible references, common scope.
- **Optional:** customer acknowledgment draft.
- **Sources:** included escalation policy/state and eligible conversation evidence.
- **Contract:** versioned escalation-recommendation contract.
- **Validation:** policy/evidence, current escalation state, reason, text safety, no activation.
- **Prohibited:** activation/clearing, assignment, handoff creation, ownership change.
- **Decisions/fallback:** accept recommendation as evidence, reject, clarify; deterministic escalation policy.
- **Audit:** criteria/evidence, recommendation, application escalation decision, acknowledgment release.

## Unsupported Request Interpretation Proposal

- **Identifier/task/purpose:** `unsupported-request-interpretation-proposal`; unsupported interpretation; advisory classification.
- **Required:** candidate unsupported category, source-message reference, common scope.
- **Optional:** nearest active-service reference and clarification recommendation.
- **Sources:** current message, active services/aliases, unsupported policy.
- **Contract:** versioned unsupported-request-proposal contract.
- **Validation:** active candidate, current source, no capability invention, advisory status, profile compatibility.
- **Prohibited:** service creation, inactive activation, authoritative resolution, unsupported-policy override.
- **Decisions/fallback:** accept candidate, clarify/reject; deterministic unsupported response or escalation.
- **Audit:** active profile/service version, candidates, deterministic resolution, fallback.

## Invalid or Unknown Proposal

Any unknown type, mixed uncontracted type, generic operation, or task mismatch is rejected before application use. The platform never dynamically expands the allowlist because a model emitted a novel field or proposal.

## Related Documents

- [Model Task Catalog](MODEL_TASK_CATALOG.md)
- [Output Contract Architecture](OUTPUT_CONTRACT_ARCHITECTURE.md)
- [Output Validation Pipeline](OUTPUT_VALIDATION_PIPELINE.md)
