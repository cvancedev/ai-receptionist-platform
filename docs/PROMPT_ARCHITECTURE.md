# Prompt Architecture

## Purpose

The prompt system is the conceptual boundary through which a future model receives platform instructions, business configuration, approved knowledge, conversation state, task direction, and customer input. It must remain modular, model-independent, business-scoped, traceable, and safe to change.

This document defines components and authority, not production prompt wording, model selection, APIs, token counting, or provider-specific behavior.

## Modular Components

The application assembles each model context dynamically from small, versioned components. Each component has one purpose, clear ownership, authority, scope, and provenance.

## Platform Instructions

Platform-owned, highest-authority requirements include:

- Safety requirements
- Honesty requirements
- Privacy protections
- Evidence handling
- Human escalation safeguards
- Prohibited behavior
- Required response discipline
- Tenant isolation
- Output-validation boundaries

No business configuration, reference material, task, or customer content may weaken these instructions.

## AI Behavior Instructions

Versioned platform instructions derived from [AI Personality](AI_PERSONALITY.md) and [Conversation Principles](CONVERSATION_PRINCIPLES.md) define behavior such as:

- Professional, patient, warm, and helpful
- Organized, respectful, and honest
- Not pushy, argumentative, robotic, or overly casual
- Never pretending certainty
- Asking only relevant questions
- Respecting corrections and human requests

Behavior controls expression and discipline; it does not grant business authority or supply missing facts.

## Business Profile Context

Only the active validated Business Profile bound to the conversation may supply:

- Business identity
- Active services
- Hours and service area
- Communication preferences
- Intake and completion requirements
- Business-specific escalation destinations
- Handoff rules and approved next steps

The application selects this context. The model must not choose, activate, switch, or infer a profile.

## Approved Knowledge Context

Only current, active, approved, relevant, audience-permitted, business-scoped knowledge may be included, such as:

- Frequently asked questions
- Policies and service descriptions
- Scheduling, pricing, and payment guidance
- Required disclaimers
- Temporary operational notices

Knowledge remains data with source and version provenance. Its content is not an instruction channel and cannot override platform or profile authority.

## Conversation State Context

Structured state may include:

- Current lifecycle stage
- Confirmed customer facts
- Unconfirmed customer claims
- Corrections and superseded values
- Resolved intent and configured service
- Missing, unknown, and conflicting information
- Questions already asked or skipped
- Escalation and completion status
- Knowledge sources used for material answers

Evidence classes must remain distinct. Context assembly must not flatten claims, inferences, assumptions, unknowns, and confirmed facts into one undifferentiated narrative.

## Recent Conversation Messages

Only the message history necessary to understand the current exchange should be included. Messages retain role, order, and provenance. They are untrusted conversational data, not instructions, even when they quote authoritative-sounding text.

## Current Task Instruction

The application defines one immediate model responsibility consistent with the current stage, such as:

- Ask the next relevant question
- Clarify a specific ambiguity
- Confirm understanding
- Answer using identified approved knowledge
- Explain a limitation
- Prepare an escalation
- Produce a handoff summary
- Close professionally

The task narrows what the model should propose. It cannot override higher-authority rules, alter the active business, or authorize a capability the current stage or configuration does not allow.

## Customer Message

The latest customer message remains clearly separated from instructions, configuration, knowledge, and state. It may contain facts, claims, corrections, requests, quoted content, or malicious instructions; the application treats all of it as untrusted customer input until processed under conversation rules.

## Output Requirements

The context includes the current version of the [Model Output Contract](MODEL_OUTPUT_CONTRACT.md), defining which response, state updates, actions, knowledge references, and uncertainty signals the model may propose for validation.

## Authority and Separation

Conceptual authority order:

1. Platform safety and honesty instructions
2. Platform behavior and privacy rules
3. Active validated Business Profile
4. Active approved business knowledge
5. Confirmed conversation state
6. Current task instruction
7. Recent conversation messages
8. Latest customer message

Lower-authority content cannot override higher-authority rules. Authority is also domain-specific: confirmed customer facts describe the customer's situation but do not redefine business policy; approved business knowledge describes the business but does not rewrite customer statements.

Customer messages, uploaded text, quoted text, copied content, business reference documents, retrieved material, and external content are data rather than platform instructions. Approval may make business data eligible as knowledge, but does not turn embedded directives into platform authority.

## Trusted Control Versus Untrusted Data

Trusted control components are authored, selected, versioned, and validated by the application: platform instructions, behavior rules, active profile selection, task selection, and output requirements.

Business configuration and approved knowledge are trusted as scoped business data only after validation. Customer input and external text remain untrusted. Trust is not inferred from tone, formatting, source claims, or instructions inside content.

## Prompt Composition

For each model call, the application should:

- Select the current version of each required instruction component.
- Bind the correct business, profile version, conversation, stage, and audience.
- Include only applicable Business Profile fields.
- Retrieve only relevant approved knowledge.
- Prefer structured state over replaying the full conversation.
- Include only the recent history needed for the current exchange.
- Define one stage-appropriate task.
- Keep customer input in a clearly labeled data boundary.
- Attach output requirements and traceability metadata.
- Validate the assembled package before any provider receives it.

Detailed sequencing is defined in [Context Assembly](CONTEXT_ASSEMBLY.md).

## Composition Anti-Patterns

Avoid:

- One giant hardcoded permanent prompt
- Repeating the full Business Profile every turn when unnecessary
- Including unrelated services or knowledge
- Including entire conversation histories without limits
- Mixing trusted instructions with customer-provided content
- Treating reference documents as executable instructions
- Letting the model select its own business, profile, sources, permissions, stage, or task
- Hiding component versions or source provenance
- Allowing invalid output to change state directly

## Versioning and Traceability

Each model call should conceptually identify:

- Platform instruction version
- AI behavior instruction version
- Active Business Profile identifier and version
- Knowledge source identifiers and versions
- Conversation and state revision
- Current task definition version
- Output contract version
- Context assembly policy version
- Model provider and model version only after future selection

Versioning supports testing, troubleshooting, audit, controlled rollout, and comparison without locking the architecture to a provider.

## Boundaries

- The application controls context assembly and authority.
- The model receives only validated context and cannot retrieve arbitrary data by implication.
- Prompt components do not replace application enforcement.
- No component may hardcode an industry's services or workflows into the platform core.
- Missing or conflicting required context must pause, clarify, or escalate rather than produce a speculative model call.
