# Context Priority and Limits

## Purpose

Context priority determines what must be preserved, included when relevant, or excluded by default for a future model call. It keeps context focused without choosing a model, token limit, counting method, or provider.

Context reduction is a safety and quality process, not merely compression. It must preserve information that could change customer treatment, escalation, completion, or handoff.

## Priority Levels

### Always Include

- Platform safety and honesty rules
- Essential behavior, privacy, evidence, and tenant-isolation rules
- Business identity and active profile version
- Active configured service and applicable intake requirements
- Current conversation stage
- Confirmed customer facts needed for the current task
- Customer corrections and current replacement values
- Current escalation state and unresolved risks
- Latest customer message
- Current application-selected task
- Output contract and validation requirements
- Provenance necessary to verify the package

“Always” means required for applicable model calls. If a call does not need a service, the state should explicitly preserve that no service resolution is applicable rather than adding unrelated service configuration.

### Include When Relevant

- Approved policy details
- Service-specific approved knowledge
- Pricing, scheduling, or payment guidance
- Effective temporary notices
- Required disclaimers
- Prior unresolved questions
- Relevant recent message history
- Customer claims or ambiguity needed for clarification
- Handoff destination and summary requirements
- Source excerpts and versions supporting the current answer

Relevance is determined by the current intent, service, stage, task, audience, channel, and confirmed context.

### Exclude by Default

- Unrelated services and workflows
- Expired, superseded, suspended, rejected, archived, or unapproved knowledge
- Restricted internal material not permitted for the current purpose
- Resolved conversation details no longer needed for safety, traceability, or handoff
- Repeated messages and duplicated facts
- Unrelated historical conversations
- Entire source documents when a small approved section is sufficient
- Superseded customer values except when correction provenance matters
- Assumptions presented as context facts
- Another business's data under all circumstances

Excluded content must not be replaced with guesses.

## Context Reduction

Conceptual reduction methods include:

- Structured conversation state instead of replaying every message
- A versioned conversation summary
- Removal of redundant exchanges
- Consolidation of semantically duplicate information without losing evidence status
- Retrieval of only relevant approved knowledge
- Selection of the smallest source excerpt that supports the claim
- Preservation of corrections and current values
- Preservation of unresolved questions, contradictions, and risks
- Preservation of escalation reasons and destinations
- Preservation of source and version references for material answers

Reduction must not transform an unconfirmed claim into a confirmed fact or omit a limitation attached to knowledge.

## Conversation Summaries

A structured summary should distinguish:

- Confirmed facts
- Customer claims requiring confirmation
- Corrected and superseded values
- Resolved intent and service
- Required intake progress
- Unknown, declined, or missing information
- Contradictions and unresolved questions
- Escalation and safety status
- Approved next step and handoff needs
- Material knowledge sources already used

The summary is application-managed context. A model-generated summary must be validated before it replaces or supplements structured state.

## Long Conversations

Long conversations should use:

- Structured conversation summaries
- Limited recent-message windows
- Confirmed-fact storage in conversation state
- Correction history
- Open-question tracking
- Questions-asked and skipped tracking
- Escalation tracking
- Completion progress
- Knowledge source and version traceability

Recent history provides conversational continuity; structured state provides durable meaning. Neither should silently overwrite the other when they disagree.

The system must not discard information that could materially change the handoff, customer outcome, safety response, business scope, or interpretation of a correction.

## Context Overflow

When available context cannot safely contain everything, preserve in this order:

1. Platform safety, honesty, privacy, and isolation rules
2. Business identity and active profile binding
3. Current active service or explicit non-service status
4. Confirmed customer facts required for the current task
5. Corrections and superseded-value warnings
6. Unresolved safety, escalation, conflict, and uncertainty information
7. Current task and output requirements
8. Latest customer message
9. Relevant approved knowledge and its limitations
10. Minimum recent history needed for coherence

Lower-priority history should be summarized or omitted. Relevant knowledge should be narrowed to the supporting portion. The platform must not remove authority boundaries, audience restrictions, disclaimers, source traceability, or evidence labels merely to fit more content.

If safe compression is impossible, the application must not make an under-contextualized model call. It should pause, use a narrower safe task, or escalate.

## Resolved Information

Resolved details may leave immediate model context only when:

- Their current value remains preserved in structured state if needed later.
- They do not affect a current condition, escalation, correction, or handoff.
- Their source and use remain traceable when they supported a material answer.
- Removing them does not cause the model to repeat a question.

“Resolved” does not mean erased.

## Context Limits Guardrails

- No numeric context or token limit is defined in this milestone.
- Context size must never determine authority.
- Customer input cannot displace required platform rules.
- Unrelated knowledge cannot displace current customer facts or risks.
- Compression cannot hide conflict or create false certainty.
- Another business's information is never an overflow fallback.
- A model must not decide what safety-critical context to discard without application validation.
