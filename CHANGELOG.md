# Changelog

All notable changes to this project will be documented in this file. The format is inspired by [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Unreleased

### Sprint 7.1 - Configuration Contracts and Lifecycle Architecture

- Added technology-neutral Business Profile and knowledge revision repository contracts with exact scope, expected revision, authorization and audit context, immutable snapshot requirements, and explicit outcomes.
- Separated draft-structure, activation-eligibility, and conversation-use validation boundaries while preserving existing Business Profile and knowledge validators.
- Documented configuration architecture, lifecycle, authorization, persistence, and Sprint 7 verification gates.
- Added focused contract verification for allowlisted vocabulary, fail-closed scope, immutable detached results, narrow capabilities, validation authority, tenant isolation, and industry-agnostic behavior.
- Confirmed the complete certified regression matrix, including all five PostgreSQL persistence suites, passes against a disposable localhost-only PostgreSQL 18 cluster.
- Added no repository implementation, migration, schema change, dependency, database operation, UI, API, authentication, provider, customer release, external action, or Milestone 7.2 work.

### Sprint 7.0 - Business Configuration Planning

- Defined the Sprint 7 objective, milestone sequence, repository and authority boundaries, verification strategy, risks, non-goals, success criteria, and documentation prerequisites.
- Kept Business Configuration as Phase 5 after certified durable persistence and before the End-to-End MVP, while refining it into independently authorized Milestones 7.0 through 7.7.
- Preserved every certified Sprint 6 authority, persistence, prototype, isolation, transaction, recovery, audit, and capability boundary.
- Added documentation only; no Sprint 7.1 implementation, dependency, migration, schema change, database work, production authentication, provider, public administration, external action, commit, tag, or push was added.

### Sprint 6 - Certification

- Certified Milestones 6.0 through 6.6 architecture, persistence contracts, durable state and journal integrity, atomic execution, restart recovery, tenant isolation, failure semantics, migrations, regressions, and strict capability boundaries.
- Corrected migration-history validation so unknown, newer, out-of-order, missing-predecessor, or renamed recorded migrations fail before migration SQL executes.
- Added real-PostgreSQL evidence that incompatible migration history is rejected without destructive repair or schema mutation.
- Confirmed the ordinary prototype remains synchronous and in memory, PostgreSQL remains opt-in infrastructure, Conversation State remains authoritative, and the journal remains non-replayable audit evidence.
- Preserved the documented temporary Next-owned PostCSS and Sharp risk disposition and added no migration, dependency, product capability, release tag, or Sprint 7 implementation.

### Sprint 6.6 - Persistence Recovery and Failure Semantics

- Added focused real-PostgreSQL verification for database unavailability, duplicate conversation and execution, stale revision, malformed and incompatible stored state, missing and negative scope, and unsupported schema state.
- Proved standalone journal failure is explicit and transactional journal or deferred commit failure rolls back state and required audit together.
- Recreated application and persistence objects after successful commit and rollback to prove committed state, revision, audit, deterministic progress, and durable duplicate evidence survive while failed candidates do not.
- Confirmed recovery reads Conversation State directly, treats the journal only as audit evidence, and performs no fallback, repair, profile switching, replay, retry, customer release, or external action.
- Added no production source change, dependency, migration, schema, transition, default PostgreSQL wiring, or Sprint 6.7 implementation.

### Sprint 6.5 - Restart-Safe Prototype Integration

- Added an explicitly opt-in, technology-neutral persistence-backed fictional prototype integration.
- Delegated durable initialization to the existing Conversation State Manager and rejected duplicate initialization without resetting state.
- Reloaded exact scoped, decoded state and journal history before deterministic progression and controlled execution.
- Recreated application and PostgreSQL persistence objects after atomic commit and proved complete revision-one state and required audit history survive.
- Continued the existing Progress Engine from recovered revision one and returned progress-only `clarify_service` because no second state-changing transition is registered.
- Added fail-closed missing-state and business/profile/conversation-isolation verification with no fresh in-memory fallback or journal replay.
- Corrected unresolved-service projection context to include only Business-Profile-configured missing fields while preserving unknown-field rejection.
- Added no migration, dependency, UI integration, retry, replay, real provider, customer release, external action, or Sprint 6.6 implementation.

### Sprint 6.4 - Transactional Execution and Concurrency

- Added a technology-neutral application coordination contract for atomically persisting one already-approved state-changing Execution Result.
- Added an opt-in PostgreSQL coordinator that uses one transaction for exact expected-revision state replacement and the required bounded journal append.
- Added durable scoped execution-identity conflict detection without changing standalone Conversation Store or Execution Journal behavior.
- Added explicit invalid-input, missing-state, revision-conflict, journal-rejection, duplicate, infrastructure, and commit-failure outcomes without leaking PostgreSQL types.
- Added real-PostgreSQL verification proving atomic commit, restart visibility, state and journal rollback, deferred commit rollback, stale-writer rejection, durable duplicate protection, tenant isolation, and unchanged prototype defaults.
- Added no migration, production connection, retry, replay, execution authority, customer release, external action, or Sprint 6.5 implementation.

### Sprint 6.3 - Durable Execution Journal

- Added a PostgreSQL Execution Journal adapter and versioned migration for bounded, append-only audit entries.
- Centralized the existing application-owned trusted-result mapping so in-memory and PostgreSQL journals preserve identical validation, outcome, and safe-metadata rules.
- Added deterministic journal-local sequence allocation, exact business/profile/conversation-scoped retrieval, detached immutable snapshots, and fail-closed stored-entry decoding.
- Extended the technology-neutral journal contract for synchronous and asynchronous adapters while retaining the in-memory journal as the default.
- Added isolated real-PostgreSQL verification for migrations, append and duplicate outcomes, ordering, restart durability, scope isolation, corruption handling, persistence failures, and prohibited authority.
- Added no state-and-journal transaction coordinator, durable execution authority, replay, retry, customer release, external action, or Sprint 6.4 implementation.

### Dependency Security Maintenance

- Upgraded Next.js from `16.2.10` to `16.2.12` to resolve the advisories affecting the framework package itself.
- Recorded temporary accepted risks for Next.js-nested PostCSS `8.4.31` and optional Sharp `0.34.5`, including their patched floors and production entry criteria.
- Added no dependency override, new dependency, or application behavior.

### Sprint 6.2 - Durable Conversation State

- Added a direct PostgreSQL Conversation Store adapter and the minimum versioned Conversation State migration.
- Preserved complete state documents with business/profile/conversation scope, explicit format and revision envelopes, application-owned decoding, and fail-closed validation.
- Added duplicate, missing, wrong-scope, malformed, incompatible, and infrastructure outcomes without leaking PostgreSQL types into application or domain contracts.
- Implemented atomic expected-revision replacement so stale and invalid-increment writes fail without mutating durable state.
- Added isolated real-PostgreSQL verification for migration, complete nested round trips, detached reads, store and manager recreation, scope isolation, optimistic concurrency, and corrupted records.
- Kept the Conversation State Manager synchronous and in-memory by default; PostgreSQL is opt-in and asynchronous.
- Added no durable Execution Journal, state-and-journal transaction coordinator, production database connection, customer release, external action, or Sprint 6.3 implementation.

### Sprint 6.1 - Persistence Contracts and Repository Boundaries

- Added application-owned, technology-neutral Conversation Store and Execution Journal Store contracts without database-specific types.
- Refactored the Conversation State Manager and existing in-memory stores to depend on those contracts while preserving deterministic prototype defaults.
- Added explicit duplicate, scope, revision-conflict, invalid-increment, invalid-record, incompatible-record, and persistence failure outcomes.
- Required revision-aware replacement to match the stored expected revision and advance exactly once without moving transition legality into storage.
- Added focused contract, isolation, immutability, conflict, failure, and prohibited-capability verification.
- Added no durable persistence, PostgreSQL adapter, dependency, migration, schema, connection, transaction coordinator, replay, retry, customer release, or external action.

### Sprint 5 - Certification

- Audited Sprint 5.1 through Sprint 5.5 architecture, state integrity, determinism, Progress Engine, Execution Journal, prototype integration, regression, and prohibited-capability boundaries.
- Hardened the existing Execution Journal trust boundary to reject malformed forged result metadata, including invalid scope versions, identifiers, revisions, success semantics, and embedded state scope.
- Added focused negative journal assertions without adding a transition, mutation path, persistence, networking, customer communication, external action, or product feature.
- Confirmed every Sprint 3, Sprint 4, and Sprint 5 verification suite, lint, strict TypeScript, production build, Markdown link, capability scan, and diff-integrity check passes.
- Certified Sprint 5 complete and ready for separately authorized `v0.6.0` release publication.
- Did not create a release tag, push changes, or begin Sprint 6.

### Sprint 5.5 - Deterministic Conversation Progress Engine

- Added typed immutable Progress Engine input, policy, decision, result, and failure contracts.
- Added deterministic fail-closed evaluation for initialized intake, required fields, service clarification, escalation review, completion eligibility, and explicit no-action states.
- Centralized workflow-intent derivation in the Progress Engine and explicitly mapped its six-value allowlist to the read-model presentation vocabulary.
- Preserved application-owned required-field/service context, correction reopening, transition validation, execution, journaling, state authority, and customer-release denial.
- Added focused progress verification and retained every Sprint 3, Sprint 4, and Sprint 5.1–5.4 regression boundary.
- Added no transition, persistence, networking, external action, real provider, customer communication, authentication change, or UI redesign.

### Sprint 5 Planning - Milestones 5.5 and 5.6

- Formally defined Sprint 5.5 as the planned Deterministic Conversation Progress Engine.
- Formally defined Sprint 5.6 as the planned evidence-based Sprint 5 Certification milestone.
- Documented the complete Sprint 5 goal, authority boundaries, planned verification, completion criteria, and potential separately authorized `v0.6.0` release boundary.
- Added no runtime functionality, production source, tests, dependencies, or release tag.

### Sprint 5.4 - Immutable Execution Journal

- Added a deterministic, append-only, process-local journal for safe controlled-execution audit metadata.
- Added allowlisted applied, rejected, duplicate, stale, invalid-transition, invalid-request, and policy-rejected outcomes derived from existing executor reasons.
- Integrated journal append after immutable Execution Result creation and before the post-execution state snapshot without granting execution or state authority.
- Added deeply frozen read snapshots, fail-closed untrusted/unknown-result handling, explicit append-failure reporting, and fresh-journal session reset semantics.
- Preserved the read-only `run()` path, the one-transition registry, UI-safe read-model integration, customer-release denial, and all prohibited external boundaries.
- Added focused execution-journal verification.

### Sprint 5.3 - Prototype Read Model Integration

- Connected the existing deterministic mock AI `runWithExecution()` path to the prototype session's shared in-memory Conversation State Manager.
- Added a deeply immutable UI-safe integration result containing the Conversation Read Model and copied decision/execution summaries without raw state snapshots.
- Updated the existing prototype panels to consume read-model identity, stage, service ID, facts, corrections, missing fields, questions, status, progress, next action, and release denial.
- Preserved rejected, duplicate, unknown, and stale execution state through safe projection; malformed or mismatched projections fail closed without raw fallback.
- Preserved reset, deterministic intake behavior, the read-only `run()` path, the single transition registry, and all prohibited external boundaries.
- Added focused prototype read-model integration verification.

### Sprint 5.2 - Immutable Conversation Read Model

- Added a deeply readonly Conversation Read Model contract for stable presentation data.
- Added a deterministic, fail-closed projector over validated state snapshots and application-resolved required-field and service context.
- Added copied and recursively frozen identity, facts, corrections, missing fields, question history, status, progress, next-action, and projection metadata.
- Kept customer-response release unauthorized and added no mutation, execution, persistence, networking, integration, or UI behavior.
- Added focused verification for determinism, immutability, reference isolation, projection accuracy, bounded derived values, malformed inputs, and no execution.

### Sprint 5.1 - Controlled Conversation Execution

- Added one immutable, explicit `initialized -> intake` AI transition definition.
- Added fail-closed execution-request, task, proposal, decision, scope, revision, policy, transition, and duplicate validation.
- Added a deterministic State Executor that delegates one typed in-memory stage update to the existing Conversation State Manager.
- Added immutable Execution Results with previous/new state, transition identity, deterministic timestamp, and execution metadata.
- Added a separate integrated execution path while preserving the certified Sprint 4 read-only path and all existing prototype behavior.
- Added focused state-execution verification without persistence, networking, customer communication, UI changes, or later Sprint 5 work.

### Sprint 4 - Certification

- Provider independence, immutable packages/results, untrusted-output handling, fail-closed validation, deterministic mock processing, duplicate safety, and read-only decisions audited.
- Focused verification added for all allowlisted task/contract pairs, parser limits, invalid schemas, injection-like context containment, and layer-by-layer determinism.
- Prohibited mutation, persistence, networking, communication, scheduling, provider-call, and business-action boundaries verified.
- Sprint 3 regressions, AI foundation verification, lint, TypeScript, production build, Markdown links, and diff checks pass.
- Sprint 4 certified complete without authorizing Sprint 5 implementation or expanding system authority.

### Sprint 4 - AI Integration Prototype Foundation

- Isolated provider-neutral `src/ai` contracts, registries, package builders, gateway, mock adapter, normalization, parsing, validation, duplicate guards, decisions, fixtures, and orchestration added.
- Eight MVP tasks and eight proposal/Output Contract combinations enforced through immutable registries.
- Deterministic fictional mock scenarios cover valid, malformed, unknown, cross-scope, stale, grounding, authority, refusal, incomplete, failed, and cancelled results.
- Dedicated `verify:ai-foundation` command added without dependencies.
- Prototype orchestration stops before authoritative mutation, escalation/completion effects, response release, networking, or persistence.
- At the Milestone 4.5 checkpoint, Sprint 4.5 was complete and Sprint 4.6 had not yet begun.
- Existing public routes, UI, deterministic intake, Sprint 3 verification, and package dependencies remain unchanged.

### Sprint 4 - Model Output and Proposal Validation Architecture

- Complete provider-neutral boundary from raw provider result through application decision, typed-operation construction, and customer release documented.
- Eight MVP proposal types and narrow versioned Output Contract categories defined.
- Thirty-step structural, scope, permission, authority, semantic, state, profile, grounding, safety, and duplicate validation pipeline added.
- Contract-supported partial acceptance, deterministic repair, bounded retry, non-retryable failures, and exhaustion paths documented.
- Customer response release, grounding, stale-state, duplicate mutation, and duplicate message safeguards defined.
- Thirty-seven output failure categories plus audit and reproducibility requirements documented.
- Sprint 4.1 through 4.4 completion recorded as the foundation for the AI Integration Prototype.
- Certified Sprint 3 behavior, application code, configuration, routes, and dependencies remain unchanged.

### Sprint 4 - Prompt and Task Architecture

- MVP model-task allowlist, permissions, prohibitions, fallbacks, and deferred tasks documented.
- Provider-neutral prompt layers and deterministic 18-step composition pipeline defined.
- Stable instruction precedence and conflict-resolution rules established.
- Customer, knowledge, history, quoted, and advisory content boundaries documented.
- Prompt injection, exfiltration, hidden-instruction, and fail-closed safeguards defined.
- Prompt versioning, review, rollback, experimentation, failure, audit, and reproducibility architecture added.
- Sprint 4.1 through 4.3 completion recorded as the foundation for Model Output and Proposal Validation Architecture.
- Certified Sprint 3 behavior, application code, configuration, routes, and dependencies remain unchanged.

### Sprint 4 - Context Assembly Architecture

- Provider-neutral Context Assembly pipeline and component responsibilities documented.
- Context source authority, eligibility, scope, freshness, failure, and audit catalog added.
- Strict business, conversation, and profile-version filtering rules defined.
- Deterministic ordering, conflict resolution, budgeting, reduction, and safe failure rules defined.
- Conceptual context package, provenance, validation, recovery, and audit contracts added.
- Task-specific context profiles defined for seven future model-assisted operations.
- Sprint 4.1 and 4.2 completion recorded as the foundation for Prompt and Task Architecture.
- Certified Sprint 3 behavior, application code, configuration, and dependencies remain unchanged.

### Added

- Initial Next.js project created.
- TypeScript, Tailwind CSS, ESLint, App Router, and Turbopack configured.
- Git repository initialized.
- Baseline lint, TypeScript, production build, and development-server validation completed.
- Centralized brand configuration added.
- Initial visual design foundation established.
- Reusable header, footer, logo, container, and button components added.
- Responsive and accessible homepage shell created.
- Architectural decision log added.
- Early-access information and email contact experience added.
- Plain-language privacy notice added.
- Development-stage website terms added.
- Native robots and sitemap metadata routes added.
- Branded application icon added.
- Sprint 1 certification document added.
- Living customer-discovery record added.
- Universal intake architecture added.
- High-level receptionist conversation architecture added.
- Concise MVP definition and success criteria added.
- AI personality and conduct standards added.
- Customer-centered conversation principles added.
- Human escalation rules and handoff standards added.
- Adaptive question strategy added.
- Customer experience standards and review criteria added.
- Customer-configured Business Profile architecture introduced.
- Conceptual Business Profile schema added.
- Business Profile activation rules and lifecycle states added.
- Configuration ownership and conflict-resolution responsibilities documented.
- Fictional multi-industry Business Profile examples added.
- Industry-agnostic Conversation Engine architecture added.
- Evidence-aware conversation state and lifecycle model added.
- Intent and active-service resolution rules added.
- Adaptive question-selection and repetition-prevention rules added.
- Completion, escalation, incomplete, and abandonment rules added.
- Customer correction precedence and dependent-state reevaluation requirements added.
- Platform, Business Profile, approved-reference, and conversation knowledge layers added.
- Structured, document, temporary, and audience-classified knowledge source types added.
- Knowledge creation, review, approval, activation, versioning, expiration, suspension, and retirement lifecycle added.
- Approved-and-active knowledge eligibility requirements added.
- Business-scoped retrieval and audience-disclosure boundaries added.
- Knowledge authority hierarchy and time-bound override rules added.
- Conflict, uncertainty, outdated-information, and missing-knowledge handling added.
- Source and version traceability requirements added for material business answers.
- Modular, versioned, model-independent prompt architecture added.
- Application-controlled context assembly and validation sequence added.
- Context prioritization, reduction, long-conversation, and overflow rules added.
- Prompt-injection and untrusted-content security boundaries added.
- Cross-business tenant-isolation requirements added for model context.
- Application-validated model output contract added.
- Prompt, context, adversarial, and regression testing strategy added.
- Model-recommendation and platform-authorization boundaries documented.
- High-level implementation architecture and layer responsibilities added.
- Conceptual system component boundaries added.
- Platform, business, conversation, model-proposal, application-decision, and derived-data ownership documented.
- Conceptual API and security boundaries added.
- Vertical-slice development sequence added.
- MVP unit, integration, end-to-end, security, reliability, accessibility, and acceptance test plan added.
- Sprint 3 local Conversation Prototype plan added.
- Major technology decisions deferred to their documented point of need.
- Sprint 3 prototype domain contracts and shared state constants added.
- Fictional Business Profile, approved knowledge, and initialized conversation fixtures added.
- Conversation, orchestration, context, output-validation, and handoff interfaces scaffolded.
- Deterministic placeholder validation and a mocked local Model Gateway added.
- Isolated in-memory prototype foundation wiring added without changing the public website.
- Deterministic conversation initialization and valid stage-transition rules added.
- Customer claims, application-confirmed facts, and traceable correction history added.
- Missing-field and asked-question history tracking added with duplicate prevention.
- Structured escalation and completion state handling added.
- Business-scoped in-memory prototype store and immutable state snapshots added.
- Conversation-state validation, ownership checks, and cross-scope rejection added.
- Executable fictional prototype verification added without a testing dependency.
- Active-profile-only deterministic service resolution added for identifiers, names, and approved aliases.
- Profile-driven required and optional intake-field loading added.
- Deterministic next-question selection, repetition prevention, and correction-aware clarification added.
- Derived intake readiness and validated stage coordination added.
- Unsupported-service preservation and configured escalation handling added.
- Minimal deterministic Conversation Engine and prototype orchestrator implemented.
- Validated, traceable Handoff Builder implemented using confirmed state only.
- Prototype verification expanded with successful, correction, unsupported, ambiguous, isolation, and determinism scenarios.
- Isolated fictional prototype chat route added without changing validation-site pages.
- Deterministic customer and assistant message display added with sequence-based traceability.
- Read-only stage, service, readiness, escalation, completion, revision, and profile status added.
- Confirmed facts, customer claims, missing fields, and correction summaries added as separate panels.
- Validated handoff summary display and in-memory prototype reset added.
- Prototype session verification added for UI state projection, correction reopening, handoff gating, unsupported services, and reset.
- Active structural validation added for fictional knowledge records and mocked model proposals.
- Sprint 3 certification suite added for successful, corrected, unsupported, ambiguous, escalated, abandoned, isolated, invalid, and repeatability scenarios.
- Sprint 3 prototype certification record added.
- Provider-independent AI integration architecture added.
- Model Gateway and Provider Adapter boundaries documented without selecting a provider or model.
- One-operation model lifecycle and application decision boundary documented.
- AI failure, recovery, bounded retry, and fail-closed behavior documented.
- AI cost, usage, context, output, and latency boundaries documented.
- Sprint 4 architecture and prototype-foundation plan added.
- AI-free deterministic fallback and no-partial-state-authority requirements documented.

### Changed

- Application metadata now reads from the brand configuration.
- Default Next.js starter screen replaced.
- Foundation certified.
- Sprint 0 completed.
- Version tagged as `v0.0.1`.
- Homepage messaging refined for small service businesses.
- Problem, intended workflow, trust, and early-access sections added.
- Static product preview improved.
- Header, footer, and homepage navigation updated for the early-access and supporting legal pages.
- Root and page-specific SEO, Open Graph, Twitter, and robots metadata established.
- Customer-facing messaging clarified around unavailable live call handling and production functionality.
- Final accessibility, responsive, messaging, navigation, performance, and deployment review completed.
- Open Graph image and domain-dependent metadata deferred until a production website URL is configured.
- Sprint 1 customer-validation website certified complete.
- Sprint 1 customer-validation release tagged as `v0.1.0` after review.
- Platform architecture generalized around an industry-agnostic AI Core.
- Customer discovery clarified by separating platform principles, industry-specific observations, future research, and open questions.
- Project rules updated to keep industry-specific workflows, terminology, services, and policies in the Business Profile.
- Sprint 3 Conversation Prototype certified complete without production infrastructure.
- Sprint 4 begins with documentation architecture while the certified deterministic Sprint 3 prototype remains unchanged.
- Roadmap sequencing updated so provider-independent AI architecture precedes any real model integration.

### Removed

- Obsolete `config/.gitkeep` and `docs/.gitkeep` placeholders removed.
- Unused Next.js starter assets removed.
- Industry-specific assumptions and the initial service taxonomy removed from platform documentation.
