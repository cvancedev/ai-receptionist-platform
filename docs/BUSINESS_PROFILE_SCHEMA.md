# Business Profile Schema

## Purpose

This document defines the conceptual structure of a Business Profile. It describes information and relationships, not a TypeScript type, JSON Schema, database model, form, API, or production prompt.

The schema supports one industry-agnostic AI Core. Every customer business supplies its own operational configuration, and no industry label may silently create services, fields, policies, or workflows.

## Field Classes

| Class | Meaning | Activation effect |
| --- | --- | --- |
| Required platform field | Information every profile needs for safe, reliable operation | Missing or invalid information blocks activation |
| Optional business field | Useful business context that is not necessary for safe operation | May be omitted; no answer may be inferred from its absence |
| Conditional field | Required because another option, service, or workflow is enabled | Blocks the affected capability or profile when its condition applies |
| Business-defined field | Customer-authored service, terminology, knowledge, question, or rule | Valid only within platform safeguards and after validation |

Required does not mean the AI must ask a customer for the field. It means the business must configure that profile information before activation.

## Identity

- **Business name — Required platform field:** Approved public name used in conversations and handoffs.
- **Public description — Required platform field:** Concise, customer-safe description of the business.
- **Industry label — Optional business field:** Descriptive label for organization and context only; it cannot activate industry logic.
- **Logo reference — Optional business field:** Reference to the business's approved visual identity.
- **Website — Optional business field:** Approved public website address.
- **Primary contact information — Required platform field:** At least one verified business contact destination.
- **Time zone — Required platform field:** Reference for hours, dates, response expectations, and scheduling language.

## Operations

- **Business hours — Conditional field:** Regular operating or customer-contact hours when the business represents itself as open on a schedule.
- **Holiday hours — Optional business field:** Exceptions to regular hours; unknown holiday availability must not be assumed.
- **After-hours behavior — Required platform field:** Approved handling when an inquiry arrives outside configured hours, including the case where hours are not used.
- **Service area — Business-defined field:** Locations, boundaries, remote-service rules, or other coverage criteria.
- **Emergency availability — Required platform field:** Explicitly states whether an emergency service path exists. If enabled, its handling rules and destination become conditional requirements.
- **Supported customer channels — Required platform field:** Channels through which the business accepts customer interactions and any channel-specific limits.

Operations must distinguish the business's operating availability from the AI receptionist's ability to receive an inquiry.

## Services

Each service is business-defined. The platform supplies only the structure and validation rules.

- **Service name — Required for each service:** Approved customer-facing name.
- **Public description — Required for each active service:** Clear explanation of what the business says the service covers.
- **Availability status — Required for each service:** Indicates whether the service is active, temporarily unavailable, or inactive.
- **Intake requirements — Required for each active service:** Information necessary to prepare a useful handoff.
- **Optional follow-up questions — Optional business field:** Additional questions that may be asked only when relevant.
- **Human escalation conditions — Required for each active service:** Conditions that require staff review or exceed approved guidance.
- **Approved next steps — Required for each active service:** What the AI may truthfully explain after intake without promising an unsupported outcome.

A service may reuse universal intake fields or define additional fields. It must not weaken platform safety rules, require unnecessary personal information, or force an uncertain customer into an inaccurate category.

## Communication

- **Approved greeting — Required platform field:** Customer-facing introduction consistent with disclosure and platform honesty requirements.
- **Approved closing — Required platform field:** Customer-facing closing that states an accurate next step.
- **Tone preferences — Optional business field:** Business voice preferences within platform standards for professionalism and respect.
- **Preferred contact methods — Required platform field:** Approved methods for customer follow-up and their order of preference.
- **Response expectations — Conditional field:** Approved time-window language when the business wants the AI to communicate a follow-up expectation.
- **Language preferences — Optional business field:** Languages the business has approved for customer interaction and human follow-up.

Tone cannot authorize pressure, deception, discrimination, impersonation, or unsupported certainty.

## Knowledge

Knowledge entries are business-defined and must identify approved content, applicable context, and escalation boundaries.

- **Approved FAQs — Optional business field:** Approved answers to common questions.
- **Policies — Conditional field:** Required when the AI is expected to explain or apply a business policy.
- **Service descriptions — Required for active services:** Approved descriptions linked to configured services.
- **Scheduling guidance — Conditional field:** Required before the AI may discuss scheduling options or availability beyond collecting preferences.
- **Pricing guidance — Conditional field:** Required before the AI may provide any price, range, fee, discount, or estimate language.
- **Payment guidance — Conditional field:** Required before the AI may explain accepted methods, deposits, due dates, refunds, or payment processes.
- **Required disclaimers — Conditional field:** Business-approved notices that must accompany specified topics or workflows.

Silence is not approval. If guidance is absent, unclear, expired, or contradictory, the AI must state the limit and escalate rather than infer an answer.

## Intake Configuration

- **Required universal fields — Required platform field:** The subset of universal intake categories the business requires for a usable handoff.
- **Optional fields — Optional business field:** Information that may improve the handoff but may be declined without pressure.
- **Service-specific fields — Business-defined field:** Additional information tied to a configured service rather than an industry assumption.
- **Conditional fields — Business-defined field:** Information requested only when an explicit condition is met.
- **Field explanation — Required for unexpected or sensitive fields:** Plain-language reason the information helps the business respond.
- **Completion rules — Required platform field:** The minimum information and confirmation needed to mark an inquiry complete or eligible for partial handoff.

Every intake field should have a clear purpose, applicability rule, and requirement level. The AI should use volunteered information and avoid duplicate questions.

## Escalation Configuration

- **Human-request rules — Required platform field:** A customer request for a person must have an approved handoff path.
- **Urgent situations — Required platform field:** Business handling that supplements universal emergency and safety safeguards.
- **Complaints — Required platform field:** Approved destination and handling expectations.
- **Pricing exceptions — Conditional field:** Required when pricing guidance exists or exceptions may be discussed.
- **Scheduling exceptions — Conditional field:** Required when scheduling guidance exists or exceptions may occur.
- **Safety concerns — Required platform field:** Business destination for concerns covered by universal safety escalation.
- **Missing knowledge — Required platform field:** Behavior when approved knowledge does not answer the customer.
- **Conflicting configuration — Required platform field:** Safe behavior when profile instructions disagree; conflict must be surfaced for review.

Business rules may cause earlier escalation but cannot suppress universal safeguards or force the AI to continue with low confidence.

## Handoff Configuration

- **Destination team or person — Required platform field:** Verified recipient for routine and escalated handoffs. Different destinations may be business-defined by workflow.
- **Preferred delivery channel — Required platform field:** Approved route for delivering the handoff.
- **Required summary fields — Required platform field:** Minimum context staff need to continue without making the customer start over.
- **Priority indicators — Optional business field:** Business-defined signals that help staff triage without making an unsupported promise to the customer.
- **Expected follow-up window — Conditional field:** Approved window only when the business can maintain it; otherwise the AI communicates no specific timing.

Every active service and escalation path must resolve to a valid handoff destination.

## Cross-Domain Relationships

- Active services depend on an intake path, approved next step, and handoff destination.
- Pricing, payment, scheduling, emergency, and response-time capabilities depend on explicit approved guidance.
- Service area and hours affect eligibility or context only according to business-defined rules.
- Communication language must remain consistent with operational availability and handoff expectations.
- Conflicts across domains block activation when they could change a customer answer, commitment, escalation, or handoff.

## Schema Guardrails

- The platform must not create default services from an industry label.
- Business-defined configuration cannot override platform safety, privacy, honesty, or reliability rules.
- Unknown information must remain unknown.
- Optional information cannot become mandatory merely because a customer begins a conversation.
- Human judgment remains required for unsupported commitments, exceptions, and ambiguous situations.
