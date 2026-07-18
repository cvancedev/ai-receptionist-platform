# Business Profile Validation

## Purpose

Validation determines whether a Business Profile is coherent, safe, and complete enough to configure customer conversations. A profile must be validated before activation. Passing validation confirms configuration readiness; it does not guarantee business outcomes or remove the need for human judgment.

## Required Before Activation

Every profile must have:

- An approved business name and public description
- A valid time zone
- At least one verified business contact destination
- At least one supported customer channel
- At least one active service with a public description and complete intake path
- Business hours or explicit approved behavior for handling time-independent operations
- Approved after-hours behavior
- A clear statement of emergency availability, including “not offered” when applicable
- An escalation destination for human requests, complaints, safety concerns, and missing knowledge
- Human handoff rules, delivery channel, and required summary fields
- Approved greeting and closing language
- Completion rules for full and permitted partial intake

Conditional capabilities add their own requirements. For example, pricing responses require approved pricing guidance, scheduling responses require scheduling rules, and an emergency service path requires an appropriate destination and handling instructions.

## Validation States

### Draft

The business is creating or editing the profile. It is not eligible for review or customer use.

### Incomplete

Validation found one or more missing required fields, unresolved dependencies, or blocking errors. The profile cannot become active.

### Ready for Review

Automated or structured checks have found no known blocking omissions, and the profile is ready for authorized business review. It is not yet active.

### Active

The profile has passed validation and required review. It is the approved configuration available for customer conversations.

### Suspended

Customer use is temporarily disabled because of a safety, accuracy, operational, or administrative concern. Suspension does not erase configuration and requires review before reactivation.

### Archived

The profile is retained as historical configuration but is no longer eligible for activation or customer use. Reuse requires creating or restoring a reviewable version through a future approved process.

## Lifecycle Rules

- Only a validated, approved profile may enter **Active**.
- **Draft**, **Incomplete**, **Ready for Review**, **Suspended**, and **Archived** profiles must not configure live customer conversations.
- An active profile may be suspended immediately when continued use could mislead customers, lose handoffs, violate safeguards, or use unreliable information.
- A suspended profile must pass the applicable validation and review steps before reactivation.
- Archived configuration is read-only historical context and must never be selected as the active profile.
- State labels describe conceptual behavior; this milestone does not define storage or workflow implementation.

## Validation Rules

### Identity and Operations

- Public identity must be present, internally consistent, and suitable for customer use.
- Time zone must be explicit wherever hours, dates, or response expectations are used.
- Operating hours and after-hours behavior must not conflict.
- Service-area guidance must not claim coverage that the profile does not approve.
- Emergency availability must be explicit; the platform must never infer it from a service or industry label.

### Services and Intake

- At least one service must be active.
- No active service may lack a public description, intake path, escalation conditions, approved next step, or handoff destination.
- Required, optional, and conditional intake fields must be distinguishable.
- Every conditional field must have an understandable activation condition.
- Unexpected or sensitive fields must include a customer-facing explanation.
- Completion rules must allow unknown information to remain unknown and define when a partial handoff is acceptable.
- A service must not require irrelevant or disproportionate customer information.

### Knowledge and Commitments

- No pricing response may be enabled without approved pricing guidance and escalation limits.
- No scheduling promise may be allowed without explicit business rules.
- No payment guidance may be used without approved payment information.
- Required disclaimers must be connected to every applicable answer or workflow.
- Expired, unsupported, or unapproved information must not be treated as knowledge.
- Unknown information must never be guessed.

### Escalation and Handoff

- Missing escalation destinations block activation.
- Every enabled escalation condition must resolve to an approved destination.
- Human requests must have a direct, non-coercive handoff path.
- Safety and urgent-situation rules must not weaken universal platform safeguards.
- Required handoff summary fields must be compatible with the intake path.
- A stated follow-up window must be explicitly approved and operationally supportable.

### Consistency and Authority

- Conflicting policies, hours, service availability, knowledge, or next steps block activation when they could change customer treatment.
- Business configuration must not override platform safety, privacy, honesty, or reliability rules.
- Deceptive, unsafe, discriminatory, coercive, or unsupported instructions block activation.
- Industry labels must not introduce unconfigured services, terms, fields, or workflows.

## Warnings Versus Blocking Errors

### Warnings

Warnings identify a quality or completeness concern that does not prevent safe operation. A profile may activate with acknowledged warnings when all blocking requirements pass.

Examples include:

- No optional logo or website
- No holiday-hours exceptions when after-hours behavior remains safe and explicit
- No optional tone preference, causing the platform's professional default behavior to apply
- No optional FAQ content, provided missing-knowledge escalation is configured
- A broad service-area description that is not used to make eligibility promises

Warnings must never authorize inference. Omitted optional information remains unknown.

### Blocking Errors

Blocking errors make safe or reliable operation impossible and prevent activation.

Examples include:

- Missing identity, time zone, active service, contact destination, or handoff route
- An active service without an intake path or approved next step
- Pricing, scheduling, payment, or response-time claims without approved guidance
- Conflicting policies or availability rules
- Missing safety, complaint, human-request, or missing-knowledge escalation destinations
- Configuration that attempts to override platform safeguards
- A required disclaimer or customer-facing explanation missing from an enabled workflow

When uncertain whether an issue could cause a false claim, unsafe response, or failed handoff, validation should treat it as blocking until reviewed.

## Review Standard

Before activation, an authorized business representative should confirm that:

- Operational information is current and accurate.
- Services and public descriptions reflect what the business actually offers.
- Intake questions are necessary and proportionate.
- Knowledge and commitments are approved for customer use.
- Escalation and handoff destinations are monitored and correct.
- Test conversations produce accurate answers, safe escalations, and useful summaries.

The platform is responsible for enforcing validation boundaries. The business is responsible for approving and maintaining its operational content.

## Change Validation

Meaningful changes must be validated before replacing an active profile. These include changes to:

- Active services or service availability
- Required or conditional intake fields
- Hours, after-hours behavior, emergency availability, or service area rules
- Pricing, payment, scheduling, policies, disclaimers, or response expectations
- Escalation conditions or destinations
- Handoff routing or required summary content
- Customer-facing identity, greeting, or closing when the change affects disclosure or commitments

Low-risk editorial corrections may follow a lighter review only when they cannot change meaning, eligibility, authority, customer expectations, escalation, or handoff behavior. The active validated version remains in use until the changed version passes its required review.

## Failure Behavior

If an active profile becomes unavailable, invalid, or internally inconsistent, the platform must not silently fall back to industry assumptions or an unapproved draft. It should restrict the AI's authority, preserve the inquiry when safe, communicate only confirmed information, and route the issue through an approved human path.
