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
