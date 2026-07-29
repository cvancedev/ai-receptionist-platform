# Changelog

All notable changes to this project will be documented in this file. The format is inspired by [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Unreleased

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
