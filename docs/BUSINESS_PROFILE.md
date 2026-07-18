# Business Profile

## Purpose

The Business Profile is the customer-owned configuration that teaches the AI receptionist how a specific small service business operates. Every business supplies and maintains its own profile. Industry knowledge is configuration, not platform-core behavior.

Before interacting with a customer, the AI reads the applicable Business Profile. It uses that profile to understand the business's identity, configured services, approved knowledge, communication preferences, and customer-defined workflows. When the profile is incomplete or unclear, the AI acknowledges the limit and follows the configured escalation path rather than inventing an answer.

## Architectural Boundary

The platform core provides universal conversation behavior: listening, clarification, intake, confirmation, summarization, next-step guidance, and escalation. The Business Profile provides the business-specific context that makes those behaviors relevant.

Workflows, terminology, services, policies, frequently asked questions, and business rules must remain in the Business Profile. They must not be embedded as defaults in the AI Core.

## Business Identity

Each business configures:

- **Business Name:** The approved name used in customer conversations.
- **Logo:** The business-owned visual identity used where the product experience supports it.
- **Industry:** A descriptive classification for context, not a source of assumed rules.
- **Description:** A concise, approved explanation of what the business does and whom it serves.

## Business Operations

Each business configures:

- **Business Hours:** Normal operating and customer-contact hours.
- **Service Area:** The locations or geographic boundaries the business serves.
- **Time Zone:** The reference time zone for hours, dates, and scheduling language.
- **Emergency Availability:** Whether emergency or after-hours service exists and the approved handling path.

The platform must not infer availability, coverage, or response times from industry labels.

## Services

Each business configures:

- **Services Offered:** The services the business currently provides.
- **Service Categories:** The business's preferred way to organize and describe those services.
- **Optional Service-Specific Intake Fields:** Additional questions or information requirements that apply only to a configured service or customer-defined workflow.

Service names and intake requirements come from the business. The AI should preserve an inquiry when a customer is unsure which configured service fits and escalate classification when human judgment is needed.

## Communication

Each business configures:

- **Phone:** Approved customer-facing and handoff phone details.
- **Email:** Approved customer-facing and handoff email details.
- **Preferred Contact Methods:** The channels the business uses and the rules for selecting among them.

The AI must use only configured contact details and must not invent a recipient, department, or response time.

## Knowledge

Each business configures:

- **Frequently Asked Questions:** Approved answers to common customer questions.
- **Policies:** Customer-facing business policies and any boundaries on how they may be explained.
- **Scheduling Rules:** Approved availability language, scheduling constraints, and human-review requirements.
- **Pricing Guidance (Optional):** Approved pricing information and clear limits beyond which a human must assist.
- **Escalation Rules:** Business-specific situations, contacts, priorities, and handoff expectations that supplement the platform's universal safety and judgment guardrails.

The AI may explain only knowledge present in the profile and within its approved boundaries. Missing or conflicting knowledge triggers clarification or escalation, never invention.

## Brand Personality

Each business configures:

- **Tone:** The approved voice within the platform's professional, respectful, and honest behavioral standards.
- **Greeting Style:** How the business welcomes customers and identifies the receptionist.
- **Closing Style:** How the business thanks customers and explains an approved next step.

Business personality may shape expression, but it cannot override platform safeguards against pressure, deception, disrespect, unsupported promises, or replacement of human judgment.

## Ownership and Maintenance

The customer business owns the accuracy of its profile and supplies changes as its services, policies, or operations evolve. Future implementation planning must define how profiles are reviewed, versioned, validated, and made available to the AI before conversations begin.

The platform must make profile gaps visible. A missing configuration should reduce the AI's authority and lead to a safe handoff; it should never cause the platform core to substitute an industry assumption.
