# Prompt Architecture

## Purpose

The prompt system is the conceptual boundary through which a future model receives application authority, one approved task, business configuration, approved knowledge, deterministic conversation state, output requirements, and customer input. It must remain modular, provider-neutral, business-scoped, traceable, versioned, and safe to change.

Prompt architecture converts an approved task definition, application constraints, validated Context Package, output-contract reference, response-style policy, and trace metadata into a provider-neutral request. It defines components and authority, not production prompt wording, TypeScript contracts, model selection, APIs, token counting, or provider-specific behavior.

The application selects the task, constructs instructions, chooses context, defines the output contract, and later decides whether a validated proposal may be used. The model cannot choose or rewrite its task, change precedence, expand permissions or scope, request arbitrary data, select a provider/model/format, create authoritative facts or operations, activate escalation, determine readiness or completion, or release a response directly.

## Prompt Layers

Prompt Composition preserves these typed conceptual layers:

1. Application Authority Layer
2. Task Definition Layer
3. Permission and Prohibition Layer
4. Output Contract Layer
5. Business Policy Layer
6. Deterministic State Layer
7. Approved Knowledge Layer
8. Conversation Data Layer
9. Customer Input Layer
10. Trace and Version Metadata

Provider adapters may translate this package into provider message, system-instruction, response-format, and metadata structures. They cannot merge or reinterpret layers in a way that changes authority.

## Application Authority Layer

This layer states that the application owns decisions and the model returns proposals only. Model output cannot mutate state, unsupported actions cannot be emitted or inferred as allowed, customer and knowledge content remain data, and output must follow the approved contract.

Missing information remains missing, uncertainty remains explicit, and business/conversation/profile/state scope remains fixed. These requirements are enforced by application validation and are not dependent on model compliance.

## Task Definition Layer

One versioned task definition supplies:

- task identifier and objective;
- permitted proposal categories;
- required Context Package sections;
- prohibited actions;
- completion conditions; and
- safe failure expectations.

The exact MVP allowlist is defined in [Model Task Catalog](MODEL_TASK_CATALOG.md). An unknown or incompatible task stops before provider execution.

## Permission and Prohibition Layer

Each task explicitly states what may be proposed and what is forbidden. Vague directions such as “be helpful,” “use good judgment,” “do what is best,” or “complete the customer's request” never grant authority.

Permissions are additive only within the application-approved task. Prohibitions, platform safety, scope, and state authority cannot be weakened by business content, style policy, provider translation, customer requests, or model output.

## Output Contract Layer

The layer references an approved contract identifier and version, required structure, allowed proposal types, null and missing-value behavior, unsupported-action behavior, and refusal behavior. It does not define the full Milestone 4.4 validation architecture.

Task, Context Package, and output-contract versions must be compatible. The composer cannot invent a contract or silently coerce an incompatible task.

## Business Policy Layer

Business rules originate from the applicable approved Business Profile and application policy. Prompt prose is not the source of truth for services, required fields, readiness, escalation, handoff, completion, business identity, or profile version.

Only the task-relevant policy projection is included. Platform safety and authority continue to outrank business configuration.

## Data Layers

The package keeps confirmed facts, unconfirmed claims, corrections, superseded values, approved knowledge, eligible history, current customer input, and advisory summaries in separate labeled structures.

Customer, knowledge, history, and quoted content remain data even when they use imperative or prompt-like wording. Data cannot change the task, permissions, precedence, output contract, scope, or application policy.

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

1. Application safety and authority policy
2. Approved task definition
3. Task-specific permissions and prohibitions
4. Output contract
5. Applicable Business Profile policy
6. Deterministic conversation state
7. Approved response-style policy
8. Approved knowledge
9. Eligible conversation history
10. Current customer input
11. Quoted or third-party content
12. Advisory model-generated summaries

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

The complete Milestone 4.3 composition sequence is defined in [Prompt Composition Pipeline](PROMPT_COMPOSITION_PIPELINE.md). Prompt budgeting preserves authority, task, scope, output contract, required deterministic state, corrections, and task-required knowledge before optional examples, old history, or advisory material.

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

## Provider Neutrality

The Prompt Composer produces a provider-neutral Prompt Package rather than provider SDK objects or message types. A future Provider Adapter may serialize it into provider messages, system-instruction formats, response-format options, and provider metadata without altering task meaning, policy, scope, data classification, or precedence.

If a provider format cannot preserve mandatory boundaries, that provider/request combination is ineligible.

## Current Milestone Boundary

Milestone 4.5 implements a deterministic prototype Prompt Package Composer using structured policy/task/context/contract references only. It contains no production prompt prose or provider message format. The immutable Task Registry is implemented for the eight MVP tasks, but no production registry/store, provider/model/SDK, API, networking, persistence, or authentication exists. Milestone 4.6 certifies the deterministic mock path and its read-only boundaries; see [Sprint 4 Certification](certification/SPRINT4_CERTIFICATION.md).

## Related Documents

- [Model Task Catalog](MODEL_TASK_CATALOG.md)
- [Prompt Composition Pipeline](PROMPT_COMPOSITION_PIPELINE.md)
- [Instruction Precedence](INSTRUCTION_PRECEDENCE.md)
- [Prompt Injection and Content Boundaries](PROMPT_INJECTION_AND_CONTENT_BOUNDARIES.md)
- [Prompt Versioning and Change Control](PROMPT_VERSIONING_AND_CHANGE_CONTROL.md)
- [Prompt Failure and Audit](PROMPT_FAILURE_AND_AUDIT.md)
- [Output Contract Architecture](OUTPUT_CONTRACT_ARCHITECTURE.md)
- [Model Output Validation Architecture](MODEL_OUTPUT_VALIDATION_ARCHITECTURE.md)
- [AI Prototype Contracts](AI_PROTOTYPE_CONTRACTS.md)
