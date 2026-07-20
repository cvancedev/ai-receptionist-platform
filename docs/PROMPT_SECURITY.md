# Prompt Security

## Purpose

Prompt security protects instruction integrity, tenant isolation, business knowledge, customer information, and application authority. Security must be enforced by the application and platform policy rather than depending on a model to ignore malicious content reliably.

This document defines conceptual controls, not a provider integration, security implementation, or production prompt.

## Untrusted Content

Treat the following as untrusted data:

- Customer messages
- Uploaded documents
- Website text
- Email content
- SMS content
- Business reference documents
- Quoted or copied instructions
- Third-party integration content
- Tool results not explicitly trusted by platform policy
- Retrieved text, even when the source is approved business knowledge

Untrusted content may supply facts or approved source material after validation, but text inside it never becomes a platform instruction merely because it says to perform an action. Content, authority, and provenance remain separate.

## Prompt Injection

Prompt injection includes attempts to:

- Ignore or replace prior instructions
- Reveal hidden instructions or context
- Reveal another business's data
- Change the AI's role or authority
- Disable safety, privacy, or honesty rules
- Treat customer text as system configuration
- Expose restricted internal knowledge
- Invent authorization or approval
- Access unsupported tools, records, or capabilities
- Bypass human review or output validation

The platform should:

- Keep untrusted content inside explicit data boundaries.
- Ignore instructions that conflict with higher-authority rules.
- Continue applying the current validated platform, business, and conversation controls.
- Avoid revealing hidden instructions, internal metadata, or restricted configuration.
- Avoid confirming whether another business's information exists.
- Restrict or escalate suspicious, sensitive, or unsupported requests when appropriate.
- Record the security-relevant event for authorized future review when applicable.
- Validate model output before it affects state or workflow.

The model's apparent compliance is not the security boundary. Application-side scoping and validation remain required.

## Tenant Isolation

- One business's profile cannot enter another business's context.
- One business's knowledge cannot be retrieved for another business.
- Conversation state and message history remain business- and conversation-scoped.
- Handoff and escalation destinations must belong to the active business.
- Traceability records must include the business identity and profile version.
- Context from unrelated historical conversations must not be included.
- Missing, ambiguous, or conflicting business identity must block the model call.
- A customer request cannot switch tenant context or grant cross-business access.

Business identity must be validated before profile, knowledge, state, history, task, or destination selection.

## Sensitive Information

Conceptual protections apply to:

- Customer contact and identifying information
- Internal business notes
- Restricted policies and operating procedures
- Authentication information and secrets
- Financial and payment information
- Health, legal, safety, or other sensitive information
- Employee-only instructions and destinations

Only the minimum information necessary for the current allowed task should enter model context. Audience, channel, purpose, and business scope must permit inclusion.

Sensitive data must not be included merely because it appears in prior history or an approved internal source. Restricted knowledge may guide an application-controlled route without being exposed to the model or customer when the task does not require its content.

Authentication secrets, credentials, access tokens, and similar security material should not be prompt context.

## Instruction Boundaries

Business configuration may customize approved operational behavior, including services, terminology, intake, customer-facing knowledge, escalation conditions, and handoff rules.

Business configuration may not override:

- Platform safety
- Platform honesty
- Privacy protections
- Legal and prohibited-behavior boundaries
- Human escalation safeguards
- Tenant isolation
- Evidence handling
- Audience restrictions
- Prohibited claims
- Output validation and application authority

Approved reference content remains data. It cannot define its own authority, audience, lifecycle, or executable instructions.

## Data and Instruction Separation

The context package should clearly identify:

- Platform-controlled instructions
- Validated business configuration
- Approved knowledge data
- Structured conversation state
- Message history
- Current customer input
- Current application-selected task
- Output requirements

Delimiters or formatting alone are not a sufficient security mechanism. The application must preserve source type and validate what each section is allowed to influence.

## Tool and Capability Boundaries

A future model must not gain a tool, data source, side effect, or business action merely by requesting it in output. The application decides which capabilities exist and whether a proposed action is authorized for the current business, stage, user, and workflow.

Unsupported tool requests should be rejected or translated into a safe limitation. Security-sensitive actions require controls outside the prompt architecture.

## Output Security Validation

Before use, model output should be checked for:

- Cross-business or restricted data exposure
- Hidden instruction or configuration disclosure
- Unsupported authority or capability claims
- Unapproved pricing, scheduling, policy, or outcome commitments
- Unsafe or prohibited content
- Evidence misclassification
- Missing escalation
- State changes outside the current conversation
- Actions not allowed for the current task

Invalid output must not silently reach the customer or mutate application state.

## Security Failure Behavior

When prompt integrity or tenant scope cannot be established:

- Block the affected model call or output.
- Preserve safe conversation context.
- Avoid disclosing the reason in a way that exposes defenses or sensitive data.
- Provide a safe limitation or human path when customer communication is appropriate.
- Record sufficient authorized traceability for investigation.

Security uncertainty is not permission to proceed with reduced safeguards.
