# AI Receptionist Platform

> **Temporary project name:** “AI Receptionist Platform” is a working name, not permanent branding. Company identity and branding will remain centralized and configurable as the product develops.

This project is intended to help small businesses never miss another customer by providing a dependable AI receptionist that can answer customers and capture opportunities.

## Project Status

The project is in Sprint 0: Foundation. Milestone 0.4 establishes the initial visual design foundation and a limited homepage shell. Product features have not been implemented.

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

## Branding Configuration

Branding is centralized in [`config/branding.ts`](config/branding.ts). The current names and contact details are temporary. Future rebranding should begin by updating that file instead of scattering brand values throughout the application.

## Design Foundation

Semantic design tokens live in [`app/globals.css`](app/globals.css), while shared layout and UI components live under [`components`](components). Branding remains centralized in [`config/branding.ts`](config/branding.ts). The current homepage establishes a reusable visual foundation; it is not the completed marketing website.

## Current Milestone

Sprint 0, Milestone 0.4: Establish the design foundation.
