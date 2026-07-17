# AI Receptionist Platform

> **Temporary project name:** “AI Receptionist Platform” is a working name, not permanent branding. Company identity and branding will remain centralized and configurable as the product develops.

This project is intended to help small businesses never miss another customer by providing a dependable AI receptionist that can answer customers and capture opportunities.

## Project Status

Sprint 0 is complete, and the project foundation is certified as `v0.0.1`. Sprint 1 is complete and certifies the customer-validation website as technically ready for deployment once the placeholder brand, contact addresses, and website URL are replaced. Functional product features have not been implemented.

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
```

## Documentation

- [Project vision](VISION.md)
- [Project rules](PROJECT_RULES.md)
- [Product roadmap](ROADMAP.md)
- [Changelog](CHANGELOG.md)
- [Architectural decisions](DECISIONS.md)
- [Sprint 1 certification](SPRINT_1_CERTIFICATION.md)

## Branding Configuration

Branding is centralized in [`config/branding.ts`](config/branding.ts). The current names and contact details are temporary. Future rebranding should begin by updating that file instead of scattering brand values throughout the application.

## Design Foundation

Semantic design tokens live in [`app/globals.css`](app/globals.css), while shared layout and UI components live under [`components`](components). Branding remains centralized in [`config/branding.ts`](config/branding.ts). The completed Sprint 1 website applies that foundation to customer messaging and early validation without representing the product as operational.

## Current Milestone

Sprint 1: Customer-validation website complete. The next planned milestone is Sprint 2, Milestone 2.1: Customer discovery framework and validated MVP requirements.
