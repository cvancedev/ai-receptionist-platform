# Business Profile

## Purpose

The Business Profile is the authoritative, customer-owned configuration that tells the AI receptionist how a specific small service business operates. Every business supplies and maintains its own profile. The AI Core remains industry-agnostic and provides universal conversation behavior without embedding an industry's services, terminology, policies, intake requirements, workflows, or knowledge.

Before interacting with a customer, the AI must use an active, validated Business Profile. It may rely only on information approved in that profile and on platform-owned safeguards. Missing, inactive, contradictory, or unsupported configuration must lead to clarification or human escalation, never an invented answer or commitment.

## Architectural Boundary

The platform core owns universal capabilities:

- Listening and understanding
- Relevant questioning
- Confirmation and correction
- Summarization
- Honest next-step guidance
- Universal safety and escalation safeguards
- Reliability, privacy, and honesty requirements

The Business Profile owns business-specific context:

- Identity and public information
- Operating rules and availability
- Services and customer-defined workflows
- Communication preferences and approved language
- Knowledge, policies, and guidance
- Intake requirements
- Business-specific escalation rules
- Human handoff destinations and expectations

Industry labels may provide descriptive context, but they must never activate assumed services, questions, policies, or workflows.

## Configuration Classification

Every profile element belongs to one of four conceptual classes:

- **Required platform field:** Information every business must supply before activation because the platform cannot operate safely or complete a human handoff without it.
- **Optional business field:** Information a business may supply to improve relevance but may omit without making the profile unsafe.
- **Conditional field:** Information required only when another configuration choice enables a capability or creates a dependency.
- **Business-defined field:** Customer-authored content or rules whose names, values, and applicability differ by business.

The platform defines these classes and their safety boundaries. The business controls the operational content within them.

## Profile Domains

### Identity

Defines the approved public identity of the business, including its name, description, industry label, logo reference, website, primary contact information, and time zone.

### Operations

Defines when and where the business operates, including regular hours, holiday hours, after-hours behavior, service area, emergency availability, and supported customer channels.

### Services

Defines each customer-created service and its public description, availability, intake requirements, optional follow-up questions, escalation conditions, and approved next steps. The platform must not provide a hardcoded industry taxonomy.

### Communication

Defines approved greetings and closings, tone preferences, preferred contact methods, response expectations, and language preferences. Business expression may vary, but it cannot override platform standards for honesty, respect, accessibility, or non-coercive behavior.

### Knowledge

Defines approved frequently asked questions, policies, service descriptions, scheduling guidance, pricing guidance, payment guidance, and required disclaimers. The presence of a topic does not grant unlimited authority: each item must make clear what the AI may explain and when a person must assist.

### Intake Configuration

Defines the information needed for a useful inquiry, including required universal fields, optional fields, service-specific fields, conditional fields, customer-facing explanations, and completion rules. Intake remains conversational and proportionate; configuration must not turn it into unnecessary data collection.

### Escalation Configuration

Defines business-specific handling for human requests, urgent situations, complaints, pricing or scheduling exceptions, safety concerns, missing knowledge, and conflicting configuration. These rules supplement and may strengthen platform safeguards, but may never weaken them.

### Handoff Configuration

Defines where a completed or escalated inquiry goes, how it is delivered, which summary fields are required, which priority indicators apply, and what approved follow-up window may be communicated.

The detailed conceptual structure is defined in [Business Profile Schema](BUSINESS_PROFILE_SCHEMA.md).

## Activation Standard

A Business Profile must be validated before it can become active. At minimum, the business must provide a usable identity, time zone, contact destination, an active service with an intake path, operating or after-hours behavior, escalation destination, and human handoff rules.

Activation is blocked when configuration could cause the AI to guess, misrepresent availability, make an unsupported commitment, lose a handoff, or follow contradictory instructions. Non-blocking warnings may identify quality improvements that do not compromise safe operation.

Meaningful changes to active configuration must be revalidated before they are used in customer conversations. Lifecycle states and validation rules are defined in [Business Profile Validation](BUSINESS_PROFILE_VALIDATION.md).

## Authority and Conflict Resolution

Platform safety, privacy, honesty, and reliability rules always take precedence over business configuration. The AI must reject or escalate instructions that are unsafe, deceptive, contradictory, incomplete, or outside the business's approved authority.

The business retains control over accurate operational information and decides which services, policies, knowledge, and workflows it approves. The platform is responsible for enforcing boundaries and preventing unsupported claims. Ownership is defined in [Configuration Ownership](CONFIGURATION_OWNERSHIP.md).

## Use During a Conversation

An active profile provides the relevant context for each interaction. The AI should:

1. Use the approved identity and communication style.
2. Understand the request before selecting a configured service or workflow.
3. Ask only required or contextually relevant questions.
4. Answer only from approved knowledge.
5. Follow configured completion, escalation, and handoff rules.
6. Preserve uncertainty and missing information in the summary.
7. Leave unsupported commitments and exceptions to human judgment.

The same sequence applies to every small service business. Only the profile content changes. Fictional illustrations are provided in [Business Profile Examples](BUSINESS_PROFILE_EXAMPLES.md); they are examples, not defaults.

## Maintenance and Accountability

The customer business is responsible for reviewing and updating its profile as operations change. Stale hours, services, policies, contact destinations, or guidance must not remain silently authoritative.

The platform must make configuration status and validation issues visible, prevent invalid profiles from activating, and ensure conversations use only the approved active version. Future implementation planning will determine storage, editing, versioning, and deployment mechanisms; this milestone defines behavior and responsibility only.
