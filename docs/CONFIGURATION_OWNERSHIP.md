# Configuration Ownership

## Purpose

Clear ownership prevents customer-specific operations from leaking into the platform core and prevents business configuration from weakening universal safeguards. Ownership describes who supplies information, who approves it, and who is accountable for keeping it safe and accurate.

## Platform-Owned

The platform owns rules that must remain consistent across every business and industry:

- Core conversation behavior
- Listening, clarification, confirmation, summarization, and handoff standards
- Safety rules and universal escalation safeguards
- Honesty requirements and limits on unsupported claims
- Privacy and data-minimization protections
- Accessibility and respectful-treatment standards
- Reliability and failure-handling rules
- Business Profile lifecycle and validation boundaries
- Enforcement that only active, validated configuration may guide a conversation
- The rule that human judgment is required for unsupported commitments and exceptions

Platform-owned rules define the minimum acceptable behavior. A business may adopt stricter protections but may not weaken or disable them.

## Business-Owned

The customer business owns operational information and customer-defined configuration:

- Business identity and public description
- Services and service availability
- Business and holiday hours
- After-hours and emergency availability information
- Service-area rules
- Supported contact methods and channels
- Policies and approved FAQs
- Service, scheduling, pricing, and payment guidance
- Required business disclaimers
- Tone, greeting, and closing preferences
- Intake requirements and field explanations
- Customer-defined workflows and completion rules
- Business-specific escalation conditions
- Handoff destinations, routing preferences, and approved response expectations

The business decides what it offers and what information it authorizes the AI to communicate. Configuration remains subject to platform validation and safeguards.

## Shared Responsibility

Some outcomes depend on both sound platform boundaries and accurate business participation:

### Approved Escalation Behavior

The platform defines universal triggers and safe handoff behavior. The business supplies monitored destinations, operational routing, and any additional escalation conditions.

### Customer-Data Handling

The platform defines privacy, security, and data-minimization boundaries. The business identifies necessary intake information, uses it for legitimate purposes, and avoids requesting irrelevant or excessive data.

### Knowledge Review

The platform prevents unsupported answers and exposes missing or conflicting guidance. The business approves source content, limits the AI's authority, and keeps facts current.

### Profile Accuracy

The platform validates structure, dependencies, and known conflicts. The business confirms that operational statements accurately reflect real services, hours, policies, availability, and destinations.

### Configuration Testing

The platform provides consistent validation and testing standards. The business reviews representative scenarios and confirms that answers, intake, escalations, and handoffs match its operations.

## Conflict Resolution

Platform safety, privacy, honesty, and reliability rules always override business configuration. No customer business may configure the AI to:

- Invent or conceal information
- Make unsupported guarantees or commitments
- Misrepresent services, availability, pricing, credentials, or response times
- Suppress a required safety or human escalation
- Pressure, deceive, discriminate against, or manipulate a customer
- Collect information without a legitimate intake or handoff purpose
- Treat an industry label as authority for an unconfigured answer or workflow

The AI must reject or escalate unsafe, contradictory, deceptive, or incomplete instructions. It should preserve the inquiry and explain the need for human assistance when safe to do so; it must not silently choose whichever instruction is most convenient.

When two business-owned rules conflict, the affected capability or profile must not activate until an authorized business representative resolves the conflict. When a business rule conflicts with a platform rule, the platform rule governs and the configuration issue must be surfaced.

## Accountability

### Business Accountability

The business is responsible for:

- Supplying truthful, lawful, and current operational information
- Reviewing services, hours, policies, knowledge, and handoff destinations
- Approving any customer-facing commitment or expectation
- Correcting stale or inaccurate configuration promptly
- Ensuring designated people and channels can receive configured handoffs
- Participating in validation and representative conversation testing

### Platform Accountability

The platform is responsible for:

- Keeping the AI Core industry-agnostic
- Enforcing validation before activation
- Applying platform safeguards consistently
- Preventing unsupported claims when configuration is absent or insufficient
- Making blocking errors, warnings, conflicts, and configuration status visible
- Restricting or suspending use when a profile cannot operate safely
- Preserving human control over unsupported commitments and exceptions

## Change Ownership

The business initiates and approves changes to business-owned information. The platform determines the validation required before those changes may become active. Meaningful changes must not bypass review simply because an older profile version was already active.

Platform-owned rules may evolve to improve safety, privacy, reliability, or customer experience. Such changes apply across profiles and must not be copied into each business's configuration as if they were customer preferences.

## Operating Principle

Businesses retain control over how they operate. The platform retains control over the minimum standards required for the AI to represent them safely, honestly, and reliably.
