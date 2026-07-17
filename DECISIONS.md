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
