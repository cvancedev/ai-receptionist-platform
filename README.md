# AI Receptionist Platform

> **Temporary project name:** “AI Receptionist Platform” is a working name, not permanent branding. Company identity and branding will remain centralized and configurable as the product develops.

This project is intended to help small businesses never miss another customer by providing a dependable AI receptionist that can answer customers and capture opportunities.

## Project Status

Sprint 0 established the foundation at `v0.0.1`, and Sprint 1 certified the customer-validation website at `v0.1.0`. Sprint 2 is complete and defines customer discovery, intake, AI behavior, Business Profile, Conversation Engine, Knowledge, Prompt and Context, and implementation architecture. Sprint 3 now includes a local, fictional, in-memory deterministic intake prototype. The AI Core remains industry-agnostic; no production AI, persistence, integrations, or customer UI have been implemented.

The website explains the intended product direction, shows a clearly fictional inquiry preview, and uses email links for early-access and support contact. It does not include a contact form or store customer data in the application.

Version 1 is intentionally small and focused. It will not be developed as an all-in-one business platform.

## Technology Stack

- Next.js with the App Router and Turbopack
- React
- TypeScript
- Tailwind CSS
- ESLint
- npm

## Local Development

Requirements:

- Node.js
- npm

Install dependencies and start the local development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in a browser.

No environment variables are currently required.

## Available Routes

- `/` — Customer-validation homepage
- `/early-access` — Early-access information and email contact
- `/privacy` — Current plain-language privacy notice
- `/terms` — Current development-stage website terms
- `/robots.txt` — Search-engine crawling rules
- `/sitemap.xml` — Public route sitemap

## Production Build

Build and run the production application locally:

```bash
npm run build
npm run start
```

The application uses the standard Next.js production commands and requires no secrets for the current static website.

## Deployment Readiness

The customer-validation website has passed production-build, production-server, metadata, navigation, accessibility, and responsive checks. Before public deployment, replace the temporary brand, `example.com` email addresses, and `https://example.com` website URL in [`config/branding.ts`](config/branding.ts).

Canonical URLs, domain-dependent metadata, sitemap discovery in `robots.txt`, and an Open Graph image remain deferred until a real deployment domain is configured.

## Current Limitations

- The AI receptionist product is under development and does not provide live call handling.
- Contact is email-based; there are no forms, accounts, storage, payments, analytics, scheduling, or dashboards.
- The current brand and contact information are placeholders.
- `npm audit` reports two moderate upstream findings involving the PostCSS version bundled by Next.js; the suggested automated fix is an incompatible Next.js downgrade.

## Validation

Run all required quality checks before completing a milestone:

```bash
npm run lint
npx tsc --noEmit
npm run build
npm run verify:prototype
```

## Documentation

- [Project vision](VISION.md)
- [Project rules](PROJECT_RULES.md)
- [Product roadmap](ROADMAP.md)
- [Changelog](CHANGELOG.md)
- [Architectural decisions](DECISIONS.md)
- [Sprint 1 certification](SPRINT_1_CERTIFICATION.md)
- [Customer discovery](docs/CUSTOMER_DISCOVERY.md)
- [Universal intake](docs/UNIVERSAL_INTAKE.md)
- [Conversation flow](docs/CONVERSATION_FLOW.md)
- [Conversation Engine](docs/CONVERSATION_ENGINE.md)
- [Conversation state](docs/CONVERSATION_STATE.md)
- [Intent and service resolution](docs/INTENT_AND_SERVICE_RESOLUTION.md)
- [Adaptive question logic](docs/ADAPTIVE_QUESTION_LOGIC.md)
- [Conversation completion](docs/CONVERSATION_COMPLETION.md)
- [Knowledge Architecture](docs/KNOWLEDGE_ARCHITECTURE.md)
- [Knowledge source types](docs/KNOWLEDGE_SOURCE_TYPES.md)
- [Knowledge lifecycle](docs/KNOWLEDGE_LIFECYCLE.md)
- [Knowledge retrieval rules](docs/KNOWLEDGE_RETRIEVAL_RULES.md)
- [Knowledge conflicts and uncertainty](docs/KNOWLEDGE_CONFLICTS_AND_UNCERTAINTY.md)
- [Prompt Architecture](docs/PROMPT_ARCHITECTURE.md)
- [Context assembly](docs/CONTEXT_ASSEMBLY.md)
- [Context priority and limits](docs/CONTEXT_PRIORITY_AND_LIMITS.md)
- [Prompt security](docs/PROMPT_SECURITY.md)
- [Model output contract](docs/MODEL_OUTPUT_CONTRACT.md)
- [Prompt testing strategy](docs/PROMPT_TESTING_STRATEGY.md)
- [Implementation architecture](docs/IMPLEMENTATION_ARCHITECTURE.md)
- [System components](docs/SYSTEM_COMPONENTS.md)
- [Data and state ownership](docs/DATA_AND_STATE_OWNERSHIP.md)
- [API boundaries](docs/API_BOUNDARIES.md)
- [Implementation sequence](docs/IMPLEMENTATION_SEQUENCE.md)
- [MVP test plan](docs/MVP_TEST_PLAN.md)
- [Sprint 3 plan](docs/SPRINT_3_PLAN.md)
- [Business Profile](docs/BUSINESS_PROFILE.md)
- [Business Profile schema](docs/BUSINESS_PROFILE_SCHEMA.md)
- [Business Profile validation](docs/BUSINESS_PROFILE_VALIDATION.md)
- [Business Profile examples](docs/BUSINESS_PROFILE_EXAMPLES.md)
- [Configuration ownership](docs/CONFIGURATION_OWNERSHIP.md)
- [MVP requirements](docs/MVP_REQUIREMENTS.md)
- [AI personality](docs/AI_PERSONALITY.md)
- [Conversation principles](docs/CONVERSATION_PRINCIPLES.md)
- [Escalation rules](docs/ESCALATION_RULES.md)
- [Question strategy](docs/QUESTION_STRATEGY.md)
- [Customer experience standards](docs/CUSTOMER_EXPERIENCE.md)

## Branding Configuration

Branding is centralized in [`config/branding.ts`](config/branding.ts). The current names and contact details are temporary. Future rebranding should begin by updating that file instead of scattering brand values throughout the application.

## Design Foundation

Semantic design tokens live in [`app/globals.css`](app/globals.css), while shared layout and UI components live under [`components`](components). Branding remains centralized in [`config/branding.ts`](config/branding.ts). The completed Sprint 1 website applies that foundation to customer messaging and early validation without representing the product as operational.

## Current Milestone

Sprint 3, Milestone 3.3 is complete. Active Business Profile configuration exclusively defines services, required fields, optional fields, aliases, and approved questions. Service resolution, question selection, readiness, corrections, stage coordination, unsupported-service handling, and validated handoff construction are deterministic and application-owned. Unsupported services are never silently mapped. The public website remains unchanged. The next planned work is Milestone 3.4: Prototype Chat Interface; it has not begun.
