# AI Receptionist Platform

> **Temporary project name:** “AI Receptionist Platform” is a working name, not permanent branding. Company identity and branding will remain centralized and configurable as the product develops.

This project is intended to help small businesses never miss another customer by providing a dependable AI receptionist that can answer customers and capture opportunities.

## Project Status

Sprint 0 established the foundation at `v0.0.1`, and Sprint 1 certified the customer-validation website at `v0.1.0`. Sprint 2 defined customer discovery and platform architecture. Sprint 3 is certified complete with a local, fictional, in-memory deterministic intake prototype and isolated developer chat interface. Sprint 4 is certified complete with provider-neutral architecture and its smallest typed, deterministic, mock-only foundation. Sprint 5.1 adds one explicit application-controlled in-memory transition after an accepted, validated decision. Sprint 5.2 adds a deeply immutable, fail-closed Conversation Read Model. Sprint 5.3 integrates that model into the existing prototype session and UI without exposing raw state or execution machinery. Sprint 5.4 adds a safe append-only in-memory Execution Journal after controlled execution. Sprint 5.5 adds a Deterministic Conversation Progress Engine as the single application-owned source of workflow intent. Sprint 5 certification remains planned for Milestone 5.6. AI remains advisory and cannot mutate state directly or release customer content. No real AI provider, model, SDK, networking, persistence, authentication, external integration, or production customer experience has been implemented.

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
- `/prototype` — Fictional developer interface for the deterministic local intake flow
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
npm run verify:ai-foundation
npm run verify:state-execution
npm run verify:conversation-read-model
npm run verify:prototype-read-model-integration
npm run verify:execution-journal
npm run verify:conversation-progress
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
- [Conversation Read Model](docs/CONVERSATION_READ_MODEL.md)
- [Prototype Read Model Integration](docs/PROTOTYPE_READ_MODEL_INTEGRATION.md)
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
- [Model task catalog](docs/MODEL_TASK_CATALOG.md)
- [Prompt composition pipeline](docs/PROMPT_COMPOSITION_PIPELINE.md)
- [Instruction precedence](docs/INSTRUCTION_PRECEDENCE.md)
- [Prompt injection and content boundaries](docs/PROMPT_INJECTION_AND_CONTENT_BOUNDARIES.md)
- [Prompt versioning and change control](docs/PROMPT_VERSIONING_AND_CHANGE_CONTROL.md)
- [Prompt failure and audit](docs/PROMPT_FAILURE_AND_AUDIT.md)
- [Context assembly](docs/CONTEXT_ASSEMBLY.md)
- [Context priority and limits](docs/CONTEXT_PRIORITY_AND_LIMITS.md)
- [Context Assembly architecture](docs/CONTEXT_ASSEMBLY_ARCHITECTURE.md)
- [Context source catalog](docs/CONTEXT_SOURCE_CATALOG.md)
- [Context eligibility and filtering](docs/CONTEXT_ELIGIBILITY_AND_FILTERING.md)
- [Context ordering and precedence](docs/CONTEXT_ORDERING_AND_PRECEDENCE.md)
- [Context budgeting and reduction](docs/CONTEXT_BUDGETING_AND_REDUCTION.md)
- [Context package contract](docs/CONTEXT_PACKAGE_CONTRACT.md)
- [Context failure and audit](docs/CONTEXT_FAILURE_AND_AUDIT.md)
- [Prompt security](docs/PROMPT_SECURITY.md)
- [Model output contract](docs/MODEL_OUTPUT_CONTRACT.md)
- [Model output validation architecture](docs/MODEL_OUTPUT_VALIDATION_ARCHITECTURE.md)
- [Model proposal catalog](docs/MODEL_PROPOSAL_CATALOG.md)
- [Output contract architecture](docs/OUTPUT_CONTRACT_ARCHITECTURE.md)
- [Output validation pipeline](docs/OUTPUT_VALIDATION_PIPELINE.md)
- [Proposal decision and application](docs/PROPOSAL_DECISION_AND_APPLICATION.md)
- [Output repair, retry, and partial acceptance](docs/OUTPUT_REPAIR_RETRY_AND_PARTIAL_ACCEPTANCE.md)
- [Customer response release](docs/CUSTOMER_RESPONSE_RELEASE.md)
- [Output failure and audit](docs/OUTPUT_FAILURE_AND_AUDIT.md)
- [AI integration prototype foundation](docs/AI_INTEGRATION_PROTOTYPE_FOUNDATION.md)
- [AI prototype contracts](docs/AI_PROTOTYPE_CONTRACTS.md)
- [AI prototype verification](docs/AI_PROTOTYPE_VERIFICATION.md)
- [Prompt testing strategy](docs/PROMPT_TESTING_STRATEGY.md)
- [AI integration architecture](docs/AI_INTEGRATION_ARCHITECTURE.md)
- [Model Gateway architecture](docs/MODEL_GATEWAY_ARCHITECTURE.md)
- [Model lifecycle](docs/MODEL_LIFECYCLE.md)
- [AI failure and recovery](docs/AI_FAILURE_AND_RECOVERY.md)
- [AI cost and usage boundaries](docs/AI_COST_AND_USAGE_BOUNDARIES.md)
- [Sprint 4 plan](docs/SPRINT_4_PLAN.md)
- [Sprint 5 plan](docs/SPRINT_5_PLAN.md)
- [Sprint 4 certification](docs/certification/SPRINT4_CERTIFICATION.md)
- [Sprint 4 architecture audit](docs/certification/SPRINT4_ARCHITECTURE_AUDIT.md)
- [Sprint 4 security audit](docs/certification/SPRINT4_SECURITY_AUDIT.md)
- [Sprint 4 determinism audit](docs/certification/SPRINT4_DETERMINISM.md)
- [Sprint 4 boundary audit](docs/certification/SPRINT4_BOUNDARIES.md)
- [State execution architecture](docs/STATE_EXECUTION_ARCHITECTURE.md)
- [Immutable Execution Journal](docs/EXECUTION_JOURNAL.md)
- [Deterministic Conversation Progress Engine](docs/CONVERSATION_PROGRESS_ENGINE.md)
- [Implementation architecture](docs/IMPLEMENTATION_ARCHITECTURE.md)
- [System components](docs/SYSTEM_COMPONENTS.md)
- [Data and state ownership](docs/DATA_AND_STATE_OWNERSHIP.md)
- [API boundaries](docs/API_BOUNDARIES.md)
- [Implementation sequence](docs/IMPLEMENTATION_SEQUENCE.md)
- [MVP test plan](docs/MVP_TEST_PLAN.md)
- [Sprint 3 plan](docs/SPRINT_3_PLAN.md)
- [Sprint 3 certification](docs/SPRINT_3_CERTIFICATION.md)
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

Sprint 3 and Sprint 4 are certified complete. Sprint 5.1 implements a deterministic Transition Registry, Transition Validator, State Executor, immutable Execution Result, and one controlled `initialized -> intake` mutation. Sprint 5.2 implements the immutable Conversation Read Model and deterministic projector. Sprint 5.3 gives the prototype session shared ownership of controlled execution and projection, then supplies the existing `/prototype` components with only the read model and safe summaries. Sprint 5.4 records trusted execution results in a deeply immutable, deterministic, process-local journal that has no execution or state authority. Sprint 5.5 implements the deterministic Progress Engine and explicit mapping to read-model actions without adding mutation or execution authority. Sprint 5.6 evidence-based certification is planned and has not started. Raw or unvalidated output still has no authority, and customer release remains false. No real provider, model, SDK, production prompt/schema, API, networking, persistence, authentication, external action, or customer delivery exists.
