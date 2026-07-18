# Knowledge Conflicts and Uncertainty

## Purpose

Knowledge conflict and uncertainty handling prevents the AI receptionist from presenting disputed, stale, incomplete, or contradictory business information as fact. Conflicts must be surfaced and routed for accountable resolution rather than silently merged.

## Types of Conflict

### Two Active Sources Disagree

Two otherwise eligible sources make incompatible claims about the same topic, scope, audience, or effective time.

### Business Profile Conflicts With a Reference Document

Supporting material contradicts the active validated structured configuration.

### Temporary Notice Conflicts With Standard Hours

A time-bound notice changes normal operations, but its scope, dates, approval, or override relationship may be unclear.

### Customer Statement Conflicts With Approved Business Knowledge

The customer describes business policy or operations differently from current approved sources. The statement remains a customer claim and may indicate a real issue, but it does not rewrite business knowledge.

### Newer Source Conflicts With Older Source

Version or date suggests a change, but approval, activation, or supersession is incomplete or unclear.

### Internal Information Conflicts With Customer-Facing Policy

Operational instructions and approved customer-facing language imply different treatment or disclosure.

### Profile Configuration Is Incomplete

Required structured guidance, dependency, audience rule, or handoff path is missing.

### Effective Dates Overlap Incorrectly

Sources claim authority for the same period without a clear precedence or transition rule.

## Resolution Order

Conflict review follows the authority model in [Knowledge Architecture](KNOWLEDGE_ARCHITECTURE.md):

1. Platform safety, privacy, honesty, and reliability requirements
2. Active validated Business Profile
3. Approved current business policies and structured guidance
4. Approved current reference materials
5. Current conversation facts confirmed by the customer
6. Unconfirmed claims, inferences, assumptions, and unknowns

Before applying authority, the engine must determine whether sources address the same domain and context. Customer-confirmed facts govern the customer's situation; they do not override business policy. Business configuration governs business operations; it does not erase what a customer reported.

Platform requirements always win. Current validated structured business configuration generally takes precedence over lower-authority reference material.

An approved temporary notice may override normal operational information only during its valid effective period, within its approved scope, and through an explicit override relationship. Otherwise the difference is unresolved.

## Resolvable Differences

A difference may be resolved without human judgment only when approved metadata and rules make the outcome unambiguous, such as:

- One source is expired, superseded, suspended, rejected, or outside scope.
- One source is not approved for the current audience or channel.
- An approved time-bound notice explicitly overrides a standard rule during the current period.
- One source applies to a different active service, location, or conversation context.

The engine should retain traceability for why the other source was ineligible. It must not label a source irrelevant merely to avoid a genuine conflict.

## Unresolved Conflicts

When a conflict cannot be resolved safely, the engine must:

- Not choose a source silently.
- Not merge contradictory information.
- Not guess which source the business intended.
- Flag the conflicting claim and affected knowledge category.
- Explain the limitation appropriately without exposing restricted content.
- Escalate to the configured human destination.
- Preserve each source identifier, version, authority, effective context, and audience classification for review.
- Record any customer-facing answer already given and its source.
- Restrict dependent pricing, scheduling, policy, service, or commitment behavior until resolved.

An unresolved conflict is a valid reason for a partial handoff or escalation even when the rest of the inquiry is complete.

## Customer-Facing Uncertainty

The AI should remain calm, direct, and helpful. It may explain that it does not have enough approved information to answer accurately and that an appropriate team member should assist.

The explanation should:

- Acknowledge the customer's question.
- Avoid blaming the customer, business, or configuration.
- Avoid revealing internal or restricted details.
- Distinguish what is known from what needs review.
- Preserve the question and relevant context for handoff.
- Give only an approved next-step expectation.

This architecture defines behavior, not production wording.

## Outdated Information

Knowledge should be considered outdated or potentially outdated when:

- It has expired.
- It has been superseded.
- It is suspended or disputed.
- It has not been reviewed according to the business's expectations.
- Related active configuration changed materially.
- Its effective period or version cannot be established.
- The business disputes its accuracy.

Expired, superseded, or suspended material is ineligible. Potentially outdated material should not be presented confidently; it requires review or a newer approved source before customer use.

The absence of a replacement does not restore an old source to authority.

## Missing Knowledge

Knowledge is missing when no eligible source answers the material question within the required business, audience, channel, time, and scope.

Missing knowledge must remain missing. The engine may continue appropriate intake, state the limitation, preserve the unanswered question, and escalate constructively. It must not use general industry expectations, another business's content, customer speculation, or an inactive source as a substitute.

## Corrections

When a business corrects permanent knowledge:

- The new information must be submitted, reviewed, approved, and activated.
- The prior version must remain traceable and become inactive through the appropriate lifecycle state.
- New interactions should use the current approved version.
- Active interactions should use the applicable current approved version for new answers while retaining traceability to knowledge already used.
- Existing handoffs should preserve what information and version were used at the time.
- Material customer impact should be flagged for human review when appropriate.

A correction does not erase historical evidence or retroactively pretend the earlier source was never used.

## Customer Corrections

Customer corrections modify conversation state only. They may change customer-specific facts, intent, service resolution, intake, escalation, or completion for that interaction.

They do not change permanent business knowledge, policy, hours, services, pricing, or guidance unless the business separately submits, reviews, and approves a knowledge update. A customer report that business knowledge may be wrong should be preserved as a claim and routed for human review.

## Conflict Resolution Ownership

- The platform enforces authority, lifecycle, audience, isolation, and safe failure boundaries.
- The business resolves disputed operational meaning and approves corrected content.
- Human reviewers decide unsupported exceptions and ambiguous policy intent.
- The Conversation Engine preserves context and avoids further unsupported claims while resolution is pending.

## Handoff Context

A conflict or uncertainty handoff should include:

- Customer question and stated context
- What was confirmed in the conversation
- Knowledge category affected
- Source identifiers and versions involved
- Authority, audience, and effective-time context
- Nature of the disagreement or missing information
- Any answer already provided
- Customer impact or urgency
- Recommended human review path

Restricted source content should remain protected even when its metadata and conflict status are included for authorized review.
