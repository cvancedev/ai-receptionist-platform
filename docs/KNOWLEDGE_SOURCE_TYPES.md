# Knowledge Source Types

## Purpose

Knowledge sources are the conceptual origins of business information that may be reviewed for future use by the AI receptionist. This document defines source classes, audience restrictions, and metadata without implementing uploads, integrations, parsing, storage, or schemas.

Providing a source does not make it approved or active. Every source remains business-scoped and must pass the applicable lifecycle and validation rules.

## Structured Sources

Structured sources express explicit business facts, rules, and boundaries:

- Business Profile fields
- Service definitions and availability
- Business and holiday hours
- Service-area rules
- Policies
- Frequently asked question entries
- Escalation and handoff rules
- Scheduling rules
- Pricing guidance
- Payment guidance
- Required disclaimers

Structured sources are preferred for operational decisions because their scope, status, and dependencies can be reviewed clearly. Structure does not guarantee truth; ownership, approval, currency, and consistency are still required.

## Approved Documents

Businesses may eventually supply reviewed documents such as:

- Service guides
- Policy documents
- Customer instructions
- Internal operating procedures
- Training documents
- Approved scripts or response guidance

A document is not customer-facing merely because the business supplied it. Approval must identify which parts the AI may use, for which audience, during which contexts, and with what limitations. Internal operating or training material may inform handoff or escalation without being suitable for disclosure.

This source class does not imply a file-upload feature, document parser, integration, or retrieval technology.

## Temporary Notices

Temporary notices communicate approved time-limited changes such as:

- Holiday closures
- Weather-related delays
- Temporary service restrictions
- Staffing limitations
- Short-term promotions
- Emergency announcements

Every temporary notice must have:

- A clear effective start
- A clear expiration or explicit review point
- Applicable services, locations, channels, or audiences
- An accountable owner and approval status
- Its relationship to standard operating information
- A safe fallback or escalation path after expiration or when applicability is unclear

Temporary information may override normal operational guidance only during its approved effective period and scope. It must not remain active by default after expiration.

## Internal Versus Customer-Facing Knowledge

### Public

Approved for unrestricted customer-facing use through supported channels, subject to relevance and source scope.

### Customer-Facing

Approved for customers in specified services, stages, channels, or circumstances. It may have required wording, disclaimers, or limitations.

### Internal Operational

Approved to guide routing, escalation, handoff, or staff context but not for direct disclosure to customers unless a separately approved customer-facing explanation exists.

### Sensitive Internal

Operational information requiring additional protection because disclosure could create privacy, security, personnel, commercial, or safety risk. It must not be surfaced in customer responses.

### Restricted

Information limited to specifically authorized people or purposes. The AI may not retrieve or reveal it for a customer conversation unless future policy explicitly establishes a permitted use that also satisfies platform safeguards.

The most restrictive applicable classification governs. Audience approval is contextual: a source approved for staff use is not automatically approved for a customer, and approval for one channel or purpose does not authorize every other use.

## Source Metadata

Each knowledge source should conceptually include:

- **Source identifier:** Stable reference used for traceability.
- **Business identifier:** The one customer business that owns the source.
- **Title:** Clear human-readable name.
- **Source type:** Structured source, approved document, temporary notice, or another future reviewed class.
- **Knowledge category:** Business identity, service, policy, scheduling, pricing, payment, escalation, or other business-defined domain.
- **Audience classification:** Public, customer-facing, internal operational, sensitive internal, or restricted.
- **Owner:** Accountable business role or authorized person responsible for accuracy.
- **Approval status:** Current lifecycle approval state.
- **Effective date:** When the source becomes eligible for use.
- **Expiration date:** When eligibility ends, when applicable.
- **Last reviewed date:** Most recent accountable accuracy review.
- **Version:** Identifies the approved revision.
- **Superseded status:** Whether a newer approved source has replaced it.
- **Notes:** Review context, limitations, dependencies, or required follow-up.

Additional conceptual metadata may include applicable services, locations, channels, required disclaimers, or related profile version when necessary to determine scope safely.

This list defines information requirements, not an implementation schema.

## Source Eligibility

A source is eligible for retrieval only when:

- Its business identifier matches the active conversation.
- Its lifecycle state is active.
- Its approval and ownership are current.
- Its effective period includes the conversation time.
- It has not expired, been superseded, suspended, rejected, or archived.
- Its audience classification permits the intended use.
- Its scope matches the intent, service, question, stage, and channel.
- It does not conflict with higher-authority requirements.

Eligibility does not guarantee relevance, and relevance does not override eligibility.

## Source Boundaries

- One business's source must never be available to another business's conversation.
- Unverified notes, drafts, customer statements, and staff recollections are not approved business knowledge.
- Customer conversation content remains conversation state unless separately submitted, reviewed, and approved through the business knowledge lifecycle.
- A source must not authorize claims beyond its approved content and context.
- Missing metadata must not be filled with assumptions when it affects safety, audience, authority, or time validity.
