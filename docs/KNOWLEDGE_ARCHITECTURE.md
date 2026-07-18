# Knowledge Architecture

## Purpose

The knowledge system provides approved, business-owned information that allows the AI receptionist to answer questions and guide conversations without inventing information. It defines how knowledge is scoped, authorized, classified, and applied while keeping the platform core industry-agnostic.

This architecture is conceptual. It does not select a database, file system, embedding model, vector store, search algorithm, API, integration, or prompt format.

## Core Model

Knowledge is usable in a customer conversation only when it is:

- Scoped to the active business
- Approved by an accountable owner
- Active for the applicable date and context
- Permitted for the current audience and channel
- Consistent with higher-authority rules
- Relevant to the customer's intent, resolved service, question, or conversation stage
- Traceable to its source and version

Missing, disputed, expired, superseded, suspended, restricted, or conflicting information cannot be presented as certain. The engine must acknowledge the limit and clarify or escalate constructively.

## Knowledge Domains

The architecture supports business-defined knowledge in domains such as:

- Business identity
- Services
- Hours and temporary operating changes
- Service areas
- Policies
- Frequently asked questions
- Scheduling guidance
- Pricing guidance
- Payment guidance
- Contact information
- Escalation procedures
- Required disclaimers
- Customer communication standards
- Temporary operational notices

These are organizational categories, not hardcoded industry content. Each business supplies its own facts, terms, policies, and boundaries through approved sources.

## Knowledge Layers

### Platform Knowledge

Platform-owned requirements apply across every business:

- Safety rules
- Honesty rules
- Privacy and data-minimization protections
- Core behavior and customer-experience standards
- Universal escalation safeguards
- Reliability and failure-handling rules

Platform knowledge defines non-negotiable boundaries. Business content may strengthen these protections but cannot weaken or replace them.

### Business Profile Knowledge

The active validated Business Profile contains structured operational configuration:

- Active services and approved descriptions
- Business and holiday hours
- Service area
- Supported contact methods and channels
- Intake and completion rules
- Business-specific escalation conditions
- Handoff destinations and approved next steps

This layer is the primary source for current structured business operation. Only the profile version bound to the conversation may guide that interaction.

### Business-Approved Reference Knowledge

The business may approve supporting information such as:

- Frequently asked questions
- Policy explanations
- Detailed service guides
- Pricing guidance
- Scheduling instructions
- Payment instructions
- Customer instructions
- Temporary operational notices

Approval must identify audience, effective period, scope, and owner. Reference knowledge may explain structured configuration but cannot silently contradict or expand it.

### Conversation Knowledge

The current interaction contains customer-specific evidence:

- Customer answers and claims
- Customer corrections
- Confirmed intent and service context
- Open questions and unknowns
- Prior statements and contradictions
- Knowledge already used during the conversation

Conversation knowledge is governed by [Conversation State](CONVERSATION_STATE.md). It is not automatically promoted into permanent business knowledge. A customer correction changes the conversation record only unless the business separately reviews and approves a business-knowledge change.

## Authority Order

When sources address the same business rule or claim, authority is evaluated in this order:

1. Platform safety, privacy, honesty, and reliability requirements
2. Active validated Business Profile
3. Approved current business policies and structured guidance
4. Approved current reference materials
5. Current conversation facts confirmed by the customer
6. Unconfirmed customer claims, inferences, assumptions, and unknowns

Lower-authority information cannot override higher-authority information within the same domain. Unconfirmed claims, inferences, assumptions, and unknowns cannot support a business answer or commitment.

### Domain Applicability

Authority order does not allow unrelated information to override customer facts. The Business Profile governs business operations; a customer-confirmed correction governs that customer's contact details, intent, and circumstances. A customer statement cannot redefine business policy, and a business policy cannot rewrite what the customer said about their own request.

### Approved Time-Bound Exceptions

An approved temporary notice may override standard operational information only when its scope, effective time, expiration, and authority explicitly permit that exception. This is a governed time-specific rule, not a silent lower-authority override.

## Knowledge Selection

The Conversation Engine should request only knowledge relevant to the active business, current profile version, customer intent, resolved service, question, stage, channel, audience permission, and effective time.

Selection must preserve source identity and recognize when:

- No approved answer exists
- A source is outside its effective period
- The audience cannot receive the information
- Multiple sources conflict
- A source does not authorize the requested conclusion
- Human judgment is required

Detailed selection behavior is defined in [Knowledge Retrieval Rules](KNOWLEDGE_RETRIEVAL_RULES.md).

## Knowledge Use

Approved knowledge may help the engine:

- Answer a customer question within source scope
- Explain an active configured service
- Explain an approved business process or policy
- Explain an approved next step
- Determine applicable intake requirements
- Trigger an escalation or required disclaimer
- Add accurate context to a handoff

Knowledge does not grant authority to make unsupported promises, interpret exceptions, negotiate, expose restricted content, or replace human judgment.

## Source and Version Traceability

Every material business answer should remain attributable to the business, source identifier, version, approval state, and effective context used at the time. Conversation state should preserve which source supported an answer without exposing internal metadata to the customer unnecessarily.

Traceability supports:

- Auditing
- Troubleshooting
- Corrections
- Quality review
- Conflict investigation
- Future explainability

Historical traceability does not make an expired or superseded source eligible for current use.

## Boundaries

The knowledge system must not:

- Invent missing information.
- Use inactive, suspended, expired, superseded, rejected, archived, or unapproved knowledge.
- Treat old information as current without validation.
- Merge or choose between conflicting sources silently.
- Treat customer claims as business policy.
- Promote conversation content into permanent knowledge automatically.
- Use one business's knowledge for another business.
- Expose private internal or restricted knowledge unless explicitly approved for the current audience and channel.
- Use a source beyond its approved scope.
- Allow business knowledge to override platform safeguards.

## Ownership

The business owns the accuracy, approval, audience classification, and maintenance of its operational knowledge. The platform owns the enforcement of business isolation, lifecycle eligibility, authority, audience restrictions, traceability, and universal safeguards.

Knowledge ownership responsibilities remain governed by [Configuration Ownership](CONFIGURATION_OWNERSHIP.md).

## Related Architecture

- [Knowledge Source Types](KNOWLEDGE_SOURCE_TYPES.md) defines acceptable conceptual source classes and metadata.
- [Knowledge Lifecycle](KNOWLEDGE_LIFECYCLE.md) defines creation through retirement.
- [Knowledge Conflicts and Uncertainty](KNOWLEDGE_CONFLICTS_AND_UNCERTAINTY.md) defines unsafe or unresolved information handling.
- [Business Profile](BUSINESS_PROFILE.md) defines structured business configuration.
- [Conversation Engine](CONVERSATION_ENGINE.md) defines how approved knowledge participates in an interaction.
