# Architectural Decisions

This log records the major architectural and product decisions made during Sprint 0.

## Framework

Next.js was selected for its mature React foundation, App Router, server-rendering capabilities, routing conventions, and production build tooling. It provides a dependable path from the public website to future application areas without requiring separate frontend projects.

## Language

TypeScript was selected to make contracts explicit, catch errors before runtime, and support safe refactoring as the product grows. Strict type checking favors clarity and maintainability for a small engineering team.

## Styling

Tailwind CSS was selected for consistent, responsive styling without adding a runtime styling system. A small semantic token layer in `app/globals.css` keeps the visual language coherent while avoiding a large theme engine.

## Branding

Branding is centralized in `config/branding.ts` because the current identity is temporary. Names, contact details, product language, and metadata can be updated from one typed source instead of being scattered through the application.

## Product Strategy

Version 1 intentionally stays small so the team can solve one valuable customer problem reliably. Features will be added only when they support validated customer needs and can be maintained with confidence.

## Development Process

The project is built milestone-by-milestone so each change has a clear purpose, a controlled scope, and a stable validation point. A milestone must pass lint, TypeScript, and production-build checks before the next one begins.

## Architecture

Reusable UI and layout components separate repeated presentation concerns from page content. Configuration, shared types, service integrations, and business logic remain separate only when those layers are needed, preventing both duplication and premature architecture.

## Public Website Delivery

The marketing website uses native Next.js metadata and metadata routes instead of third-party SEO packages. Early-access contact remains email-based until data-handling requirements are defined. Analytics is deferred until the company has a real measurement plan and has reviewed the related privacy implications.

## Platform-First Architecture

The product shifted from industry-focused documentation to a universal platform architecture after the initial discovery work revealed a durable boundary: receptionist behavior is broadly reusable, while services, terminology, policies, knowledge, intake fields, and workflows differ by business. The AI Core therefore remains industry-agnostic, and each customer supplies those differences through a Business Profile.

This decision improves:

- **Scalability:** New service-business categories can be supported through configuration instead of core rewrites.
- **Maintainability:** Universal behavior and customer-specific rules have a clear ownership boundary.
- **Simpler onboarding:** Each business describes how it operates in one coherent profile.
- **Cleaner AI architecture:** Conversation behavior is separated from the context that grounds a particular interaction.
- **Future multi-industry expansion:** The platform can learn from new markets without treating one industry's practices as defaults.

## Validated Configuration Activation

Only an active, validated Business Profile may configure customer conversations. Draft, incomplete, review-pending, suspended, or archived profiles cannot become silent fallbacks, and meaningful changes require revalidation before replacing the active configuration.

This boundary prevents missing, stale, or contradictory business information from becoming an AI claim or failed handoff. Platform safety, privacy, honesty, and reliability rules always override business configuration; unsupported commitments and exceptions remain subject to human judgment.

## Evidence-Aware Conversation State

The Conversation Engine keeps confirmed facts, customer claims, inferences, assumptions, and unknowns conceptually distinct. Only customer confirmation or approved active-profile context can establish confirmed conversation information; assumptions and inferences may never silently become facts.

Customer corrections supersede prior incorrect values and require dependent intent, service, intake, escalation, and completion decisions to be reevaluated. This preserves customer trust, prevents repeated questions, and produces handoffs that expose uncertainty instead of hiding it.

## Approved Knowledge Only

Customer-facing responses may use only active, approved, business-scoped knowledge permitted for the current audience and context, together with current confirmed conversation facts. Material business answers remain traceable to the source and version used.

Missing, disputed, expired, superseded, suspended, restricted, or conflicting information must never be presented as certain. Platform safety and honesty requirements override all business knowledge, and uncertain or unsupported matters remain subject to human review.

## Platform-Controlled Context

The application assembles and validates all model context. A model does not choose its own authority, Business Profile, knowledge sources, audience permissions, conversation state, stage, or task. Context components remain modular, versioned, business-scoped, and traceable.

## Model Recommends, Platform Decides

The model may propose customer responses, state updates, actions, and escalation. The application validates and authorizes those proposals before they affect customer communication, conversation state, business configuration, knowledge, or workflow.

## Untrusted Content Is Data

Customer messages, uploaded documents, retrieved reference content, quoted instructions, and external text are treated as data rather than trusted instructions. Approval may make content eligible as scoped knowledge, but embedded text cannot override platform rules, change tenant scope, or grant authority.

## Deterministic Core Before AI Dependence

Core conversation state, validation, corrections, question history, completion, and escalation rules should be deterministic wherever practical before relying on model behavior. Models may assist with language and interpretation but cannot replace application enforcement.

## Vertical-Slice Implementation

Implementation proceeds through small end-to-end slices that produce a testable customer and handoff outcome. Infrastructure layers are introduced only when the next slice requires them.

## Prototype Before Production Infrastructure

The first implementation uses fictional data, in-memory state, and mocked model behavior. Databases, authentication, production providers, and real customer data follow only after the conversation workflow is validated.

## Technology Selection at Point of Need

Major vendors and infrastructure are selected when an implementation phase has proven requirements and evaluation criteria. Architecture milestones do not choose providers speculatively.

## Validated Immutable State Updates

Conversation state changes are applied through typed, validated, application-owned operations that produce new state snapshots. Models, customer messages, and external content cannot directly mutate conversation state.

## Business-Profile-Driven Intake

Service resolution, required fields, optional fields, aliases, and approved intake questions come from the active validated Business Profile. The platform core does not hardcode industry-specific intake logic.

## Deterministic Intake Authority

The application determines service resolution, question selection, readiness, stage transitions, and handoff eligibility. A model may assist with language or interpretation later, but it cannot control these decisions.

## Unsupported Means Unsupported

When a requested service is not configured and active for the current business, the platform does not map it to another service or invent capability. It returns an unsupported, clarification, escalation, or approved closure outcome.

## AI Is Advisory, Application Is Authoritative

A model may propose interpretations, response text, classifications, summaries, clarification, escalation, and candidate actions. The application validates each proposal and decides whether to accept, modify, retry, reject, fall back, or escalate.

A model cannot mutate state, confirm facts, resolve services authoritatively, determine required intake, activate escalation, mark completion, release customer messages, or trigger irreversible actions.

## Provider Independence

Application and domain logic depend on provider-neutral concepts rather than provider SDK types. Provider-specific request, response, event, usage, finish-reason, and error behavior belongs behind a Provider Adapter.

Provider and model selection remain application-controlled and deferred until requirements and evaluation criteria justify a decision.

## AI-Free Deterministic Fallback

Core intake, exact configured-service resolution, required-field selection, question selection, state management, escalation, readiness, completion, and handoff behavior remain available without an AI provider.

Provider absence, policy denial, timeout, refusal, invalid output, or budget exhaustion cannot make AI a single point of failure.

## Validated Output Before Use

Raw model output is untrusted. No model-generated response, structured value, recommendation, or action may influence state or reach a customer until it passes application-owned structural, scope, evidence, safety, grounding, and authority validation.

Provider success is not application acceptance.

## Bounded AI Usage

AI eligibility, provider and model allowlists, context size, output size, latency, retries, fallback, and spending remain constrained by application-owned policy.

Providers, adapters, and models cannot expand those limits or authorize indefinite retry.

## No Partial-State Authority

Streaming and partial output have no authority over conversation state, escalation, completion, handoff, tools, or external actions. Only a final validated proposal considered by the Application Decision Layer may lead to approved typed state operations or customer-visible content.

## Task-Specific Context Only

The platform assembles context for one approved task rather than sending a universal conversation payload. Each task has explicit required, optional, and prohibited source categories.

## Context Eligibility Is Application-Owned

The application determines source eligibility, selection, filtering, ordering, budgeting, and release. A model or provider cannot request arbitrary additional business data or choose its own context sources.

## Explicit Context Authority Labels

Confirmed facts, customer claims, corrections, deterministic decisions, knowledge, rules, history, model proposals, and summaries remain distinguishable. Relevance or recency does not upgrade authority.

## Strict Context Isolation

Context Assembly fails closed when business, conversation, or applicable profile-version scope cannot be verified. Similar identifiers, provider caches, and model inference cannot establish scope.

## Context Budgets Preserve Authority

Reduction may remove duplicate, optional, old, or low-priority content, but cannot silently remove essential identity, scope, authoritative state, active corrections, application constraints, or required provenance.

## Model Summaries Are Advisory

Model-generated summaries do not replace deterministic state or original records. Reuse requires application policy, source traceability, version compatibility, and invalidation when relevant source data changes.

## Context Provenance Is Required

Every released context package records enough source revisions, selection and exclusion reasons, reduction steps, policy versions, and validation metadata to explain its assembly without retaining prohibited content.

## Injection Content Remains Data

Customer messages, knowledge documents, and quoted content cannot redefine application authority, task definition, source eligibility, or context policy. Instructions inside those sources remain untrusted data.

## Deterministic Model Task Selection

Only the application may select an approved model-assisted task and version. A model cannot choose, expand, rewrite, or create its own task.

## Provider-Neutral Prompt Composition

Prompt Composition uses provider-neutral application contracts. Provider-specific messages, instruction formats, response options, and metadata belong behind adapters and cannot reinterpret policy.

## Explicit Instruction Precedence

Application authority, task constraints, permissions and prohibitions, output contracts, Business Profile policy, deterministic state, knowledge, history, and customer content remain distinctly ordered.

## Customer and Knowledge Content Remain Prompt Data

Customer messages, knowledge excerpts, history, quoted content, and advisory summaries cannot become application instructions regardless of formatting or imperative language.

## Prompts Do Not Own Business Logic

Services, required fields, readiness, escalation, completion, handoff, business identity, and state remain application-owned. Prompt prose is not their source of truth.

## Versioned Prompt Policy

Task definitions, authority and task instructions, permissions, prohibitions, output-contract references, response-style policy, composition policy, and composer behavior are versioned and auditable.

## No Runtime Prompt Self-Modification

Models cannot rewrite, create, approve, activate, or promote prompt policy, task definitions, variants, or versions.

## Prompt Failure Prevents Provider Execution

Unknown or unapproved tasks, incompatible contracts, ambiguous precedence, unsafe content boundaries, invalid scope, and essential prompt budget failures stop before any provider request.

## Raw Model Output Has No Authority

Provider responses remain untrusted until application-owned parsing, layered validation, and deterministic decision logic complete. Provider success is not application acceptance.

## Output Contracts Are Application-Owned

The application selects and versions one narrow, task-compatible, provider-neutral Output Contract before execution. A model or adapter cannot widen, replace, or downgrade it.

## Proposal Types Are Allowlisted

Only approved task-compatible proposal types are eligible. Unknown, mixed, or unapproved proposal types fail closed rather than dynamically expanding capability.

## Output Validation Is Layered

Structural validity is insufficient. Scope, permissions, prohibitions, semantics, state and profile compatibility, knowledge grounding, customer safety, and duplicate effects must also pass.

## State Operations Are Constructed by the Application

A model supplies candidate inputs only. The application constructs typed authoritative operations after validation and rechecks the current state revision before submission.

## Customer Responses Require Release Approval

A valid draft is not automatically releasable. Customer-visible text passes a separate application-owned release gate against current state, grounding, safety, actual effects, and duplicate identity.

## Output Repair and Retry Are Bounded

Repair and retry are application-selected, task-specific, cost-aware, traceable, fully revalidated, and unable to duplicate mutations or messages.

## Stale Proposals Cannot Mutate Current State

A proposal validated against an older state revision is rejected or re-evaluated from a fresh snapshot before any operation or response release.

## Partial Acceptance Requires Contract Support

Field-level acceptance is allowed only when the contract explicitly permits independent validation and rejected fields cannot alter accepted meaning.

## Duplicate Effects Fail Closed

Stable proposal, mutation, and release identities prevent repeated processing from causing duplicate authoritative effects or customer messages.
