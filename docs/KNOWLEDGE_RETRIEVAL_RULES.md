# Knowledge Retrieval Rules

## Purpose

Knowledge retrieval is the conceptual process by which the Conversation Engine selects approved information relevant to the current interaction. This document defines eligibility, authority, relevance, use, and traceability without specifying embeddings, vector databases, search algorithms, ranking formulas, code, or vendors.

## Retrieval Inputs

- **Business identifier:** The customer business whose knowledge is eligible.
- **Active profile version:** The exact validated Business Profile governing the conversation.
- **Customer intent:** The stated or resolved reason for contact.
- **Resolved configured service:** The active service or services that apply, when relevant.
- **Current conversation stage:** The engine stage and information need.
- **Customer question:** The topic and wording the customer wants addressed.
- **Channel:** The interaction channel and its approved limitations.
- **Audience permissions:** What the current recipient and channel may receive.
- **Effective date and time:** The temporal context for current, scheduled, or temporary information.
- **Knowledge authority:** The applicable layer and authority relationship.
- **Approval status:** Whether the source is approved and active.
- **Conversation evidence:** Confirmed facts, customer claims, corrections, unknowns, and conflicts that determine applicability.

## Eligibility Before Relevance

A source must first be eligible. It must:

- Belong to the active business.
- Be approved and active.
- Be effective and unexpired for the relevant time.
- Not be superseded, suspended, rejected, or archived.
- Be permitted for the current audience, purpose, and channel.
- Match the active profile and any required dependencies.
- Remain within platform safety, privacy, honesty, and reliability boundaries.

An ineligible source must not be considered merely because its content appears relevant.

## Retrieval Rules

The engine should:

- Retrieve knowledge only for the active business.
- Use only approved, active, current knowledge.
- Apply the most authoritative source that covers the specific claim and context.
- Prefer approved information specific to the resolved service when the question requires service context.
- Use general business information when no service-specific information is necessary.
- Respect audience and channel classifications.
- Avoid retrieving unnecessary, unrelated, or excessive information.
- Preserve source identifier and version traceability.
- Recognize when no approved answer exists.
- Surface conflicting eligible sources rather than selecting silently.
- Keep customer conversation evidence separate from permanent business sources.

The engine must not broaden a source's meaning beyond its explicit scope.

## Relevance

Conceptual relevance depends on:

- Customer intent
- Resolved configured service
- Question topic
- Conversation stage
- Current confirmed context
- Applicable business rules
- Location, time, channel, or audience only when an approved rule makes them relevant
- Whether the answer changes intake, escalation, handoff, or an approved next step

Relevance is contextual and qualitative. This architecture defines no numeric score or threshold.

A highly specific source is not automatically preferred if it is lower authority, expired, restricted, or outside scope. A general source should not displace an applicable approved service rule merely because it is easier to retrieve.

## Authority Application

Platform safeguards always govern. For business operational questions, the active validated Business Profile takes precedence over lower-authority reference material unless an approved, effective, time-bound rule explicitly defines an exception.

Current confirmed customer facts determine the customer's own circumstances but do not rewrite business policy. Customer claims may help identify relevance or prompt clarification; they cannot authorize a business answer.

When authority or applicability cannot be resolved safely, retrieval produces a conflict or no-knowledge outcome rather than a guessed answer.

## Response Use

Retrieved knowledge may be used to:

- Answer an approved customer question.
- Explain configured services and scope.
- Explain approved business processes or policies.
- Explain approved next steps.
- Determine required or conditional intake.
- Trigger a required disclaimer or escalation.
- Produce traceable handoff context.

Retrieved knowledge may not be used to:

- Make unsupported promises or guarantees.
- Override platform safety, privacy, honesty, or reliability rules.
- Guess a missing policy or exception.
- Expose internal, sensitive, or restricted content improperly.
- Answer beyond the source's approved scope, audience, channel, or effective period.
- Treat an inactive service or outdated rule as current.
- Replace human judgment where authority is missing.

## Audience Filtering

The engine should use the least-disclosive source content that answers the approved customer need. Internal operational knowledge may influence routing or handoff without appearing in the customer response.

If an internal source identifies an action but no customer-facing explanation is approved, the engine should provide only a safe general limitation and human path. It must not paraphrase restricted material into disclosure.

## Source Traceability

Every material business answer should conceptually retain:

- Business identifier
- Source identifier
- Source version
- Knowledge category
- Authority layer
- Approval and lifecycle state at use time
- Effective context
- Audience classification used
- The material claim the source supported

Traceability primarily supports:

- Auditing
- Troubleshooting
- Corrections
- Quality review
- Conflict investigation
- Future explainability

Traceability metadata is operational context and should not be exposed to customers unless approved and useful.

## Multiple Applicable Sources

When multiple eligible sources are consistent, the engine may use the minimum set needed to answer accurately while preserving traceability to each material claim.

When they overlap:

- Use the source with the most applicable authority and scope.
- Apply explicit effective-time rules.
- Avoid combining fragments into a broader claim no source approves.
- Preserve required disclaimers and limitations.
- Flag a conflict when the sources cannot be reconciled without interpretation or business judgment.

## No Knowledge Found

When no applicable approved knowledge exists, the engine should:

- State the limitation honestly without production-scripted language.
- Avoid speculation or implied certainty.
- Continue collecting useful inquiry information when appropriate.
- Escalate or hand off through the configured path.
- Preserve the unanswered question and attempted knowledge category in the summary.
- Avoid substituting another business's knowledge, an inactive source, or an industry assumption.

No knowledge found is a valid retrieval outcome.

## Retrieval Failure

If otherwise eligible knowledge cannot be evaluated reliably because approval, version, audience, effective period, or profile association is missing or conflicting, the engine should treat it as unavailable, restrict the affected response, and use the approved missing-knowledge or configuration-conflict path.
