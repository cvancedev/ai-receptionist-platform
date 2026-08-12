# Knowledge Lifecycle

## Purpose

The knowledge lifecycle defines how business information is created, reviewed, approved, activated, changed, suspended, and retired. Only business-scoped knowledge that is both approved and active may guide customer-facing responses.

These states and controls are conceptual. This milestone does not define storage, interfaces, automation, permissions implementation, or workflow software.

## Lifecycle States

### Draft

Knowledge has been submitted or is being prepared. It may be edited but cannot guide customer conversations.

### Under Review

An authorized reviewer is evaluating accuracy, completeness, ownership, audience, effective period, consistency, and platform compliance. It remains ineligible for customer use.

### Approved

The content has passed review but is not yet active, such as when its effective date is in the future or activation is pending. Approval alone does not permit retrieval.

### Active

The approved source is within its effective period, permitted for its audience and scope, and eligible for retrieval. Active does not guarantee relevance to every conversation.

### Expired

The approved effective period ended. The source remains traceable but cannot guide current responses unless it is reviewed and approved through a new eligible version.

### Superseded

A newer approved source replaced the content. The prior version remains traceable for historical conversations but is inactive.

### Suspended

Use is disabled immediately because accuracy, safety, ownership, policy, audience, or consistency is in question. Review is required before reactivation.

### Archived

The source is retained for audit or historical understanding but is not eligible for activation or retrieval in current customer conversations.

### Rejected

Review determined the source is inaccurate, unsuitable, unauthorized, unsafe, duplicative, or otherwise unacceptable. It cannot become active without a new or materially revised submission and review.

## Creation

Knowledge may be submitted by a business owner or another person the business has authorized for the relevant domain. Future implementation must define permissions, but every submission requires accountable business ownership.

Creation should establish:

- The owning business
- The accountable content owner
- Source type and knowledge category
- Intended audience classification
- Applicable services, locations, channels, or contexts
- Effective and expiration dates when time-sensitive
- The proposed content and its limitations
- Related Business Profile rules or dependencies
- Expected review responsibility

Unowned or ambiguously scoped knowledge cannot proceed to active use.

## Review and Approval

Knowledge must be approved before use in customer conversations. Review should verify:

- **Accuracy:** The information reflects current business operations.
- **Completeness:** Material limitations, conditions, and exceptions are visible.
- **Audience suitability:** Disclosure is appropriate for the intended customer, staff, purpose, and channel.
- **Profile consistency:** The content agrees with the active validated Business Profile or identifies a governed future change.
- **Platform compliance:** The content does not weaken safety, honesty, privacy, accessibility, or reliability safeguards.
- **Ownership:** An accountable business owner is identified.
- **Effective period:** Time boundaries are explicit when the information can change or expire.
- **Authority:** The source does not claim permission beyond the reviewer or business's authority.
- **Traceability:** The source and version can be identified later.

Approval should also identify required disclaimers, escalation boundaries, and whether a customer-facing explanation differs from internal guidance.

## Activation

Only knowledge that is approved, active, business-matched, current, audience-permitted, and consistent with higher-authority rules may guide a customer response.

Activation requires:

- Approval is still valid.
- The effective start has arrived.
- The source has not expired, been superseded, suspended, rejected, or archived.
- Required profile dependencies are active.
- No unresolved blocking conflict exists.

Future architecture may activate approved time-bound knowledge according to its dates. It must not keep expired material active by default.

## Updates

Meaningful updates must create a new version or auditable revision. Important operational knowledge must not be silently overwritten.

Meaningful changes include:

- A different customer-facing answer or limitation
- Changed service, hours, area, policy, price, payment, scheduling, or contact guidance
- Changed audience classification
- Changed effective period
- Changed disclaimer, escalation boundary, or handoff behavior
- Corrected information that materially affected prior use

The active version remains authoritative until the replacement passes review and reaches its approved effective time, unless the old source is suspended for safety or accuracy.

## Expiration

Temporary and time-sensitive knowledge should expire according to explicit boundaries in future implementation. Expiration makes a source ineligible; it must not revert to a guessed value or silently continue.

If expiration leaves no approved answer, the engine should state the limitation, preserve the question, and use the appropriate handoff path. A standard source may resume only when an approved rule explicitly defines that relationship.

## Supersession

A new approved source may supersede an older source when it covers the same scope and clearly identifies the replacement relationship.

The older version:

- Becomes inactive at the governed transition point.
- Remains traceable for conversations that used it.
- Must not be retrieved as current knowledge.
- Must not be deleted merely to hide historical use.

Supersession does not resolve unrelated conflicts automatically.

## Suspension

Knowledge may be suspended immediately when:

- Its accuracy is disputed.
- A safety or privacy concern appears.
- A policy changes unexpectedly.
- The business requests immediate removal.
- Conflicting instructions are discovered.
- Ownership or audience approval becomes uncertain.
- Continued use could mislead customers or create unsupported commitments.

Suspension takes precedence over a future expiration or supersession plan. Active conversations should stop using the source once suspension applies and escalate affected unanswered matters. Historical handoffs preserve what was used at the time.

## Archival

Archived knowledge remains available for audit, troubleshooting, corrections, and historical understanding. It cannot guide active conversations or serve as a fallback when current knowledge is missing.

## Rejection

Rejected content must retain the review outcome and reason needed to prevent accidental activation. Rejection does not make a claim false in every context, but it confirms that the submitted source is not authorized for platform use.

## Review Cadence

Businesses should periodically review:

- Hours and holiday exceptions
- Active services and service-area rules
- Pricing and payment guidance
- Scheduling guidance
- Policies and frequently asked questions
- Contact details
- Escalation and handoff destinations
- Temporary notices
- Required disclaimers
- Audience classifications

The appropriate cadence depends on the business and volatility of the information. The platform should support accountable review expectations without prescribing one universal interval.

## Corrections and Prior Use

When a business corrects knowledge:

- The correction must be reviewed and approved.
- The prior version remains traceable.
- New conversations use the current active version.
- Existing conversation and handoff records preserve which version supported earlier answers.
- Material customer impact is flagged for human review when appropriate.

A customer correction changes only that conversation's state. It does not edit or activate permanent business knowledge.

## Lifecycle Guardrails

- Draft, under-review, approved-but-not-active, expired, superseded, suspended, archived, and rejected knowledge cannot guide customer responses.
- No source may cross business boundaries.
- Lifecycle changes do not override audience restrictions or platform safeguards.
- Missing current knowledge remains missing.
- Historical traceability must not become current authority.

## Milestone 7.3 Implementation Boundary

Milestone 7.4 requires every selected Knowledge Record revision to carry
`approved` lifecycle evidence, pass existing structural and effective-date
validation, and belong to the exact activating profile scope. The atomic
activation record associates those immutable versions with an `active`
configuration without overwriting their documents. Retrieval eligibility and
workflow integration are implemented only in the opt-in Milestone 7.5
fictional conversation path: the application loads the exact activation-bound
versions, enforces business/profile scope, customer audience, effective date,
structure, and conflicts, and fails without fixture fallback. Milestone 7.6
verifies missing, malformed, incompatible, wrong-scope, unbound, ineligible,
duplicate, stale, restart, and persistence-failure behavior against real
PostgreSQL. The lifecycle remediation completes application-owned knowledge
review, approval, activation-bound active state, suspension, and exact
inspection. Sprint 7 certification confirms these boundaries; Sprint 8 has not
started. See [Sprint 7 Certification](certification/SPRINT7_CERTIFICATION.md).
