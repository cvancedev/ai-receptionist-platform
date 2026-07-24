# Sprint 4 - Provider-Independent AI Integration Architecture

## Sprint Goal

Define and validate how model-assisted capabilities can improve language interpretation and customer-facing expression without replacing deterministic application authority.

Sprint 4 begins with architecture. It does not begin with a provider, SDK, model call, API, production prompt, persistence, authentication, or customer-facing AI feature.

## Baseline

Sprint 3 is complete and certified at commit `b659bec941a06553a7a8ac9d501f92b248199e6f`.

The baseline provides:

- Fictional active Business Profile and knowledge fixtures
- In-memory business-scoped conversation state
- Deterministic service resolution and intake
- Immutable validated state updates
- Deterministic question selection and readiness
- Escalation, completion, abandonment, and handoff boundaries
- Mocked local Model Gateway behavior
- Isolated `/prototype` interface
- Sprint 3 regression and certification verification

Sprint 4 must preserve this deterministic baseline.

## Milestone 4.1: AI Integration Architecture

**Status:** Complete

### Deliverables

- AI integration boundary and authority model
- Provider-independent Model Gateway architecture
- Provider Adapter boundary
- Model-assisted operation lifecycle
- Failure and recovery architecture
- Retry boundaries
- Cost, usage, and latency boundaries
- AI-free deterministic fallback
- Sprint 4 sequence and non-goals
- Durable architecture decisions

### Completion Standard

- Required architecture documents exist and agree.
- Existing implementation documentation reflects Sprint 3 certification and Sprint 4 architecture status.
- No provider or model is selected.
- No application code or dependencies change.
- Existing validation and prototype verification pass.

## Milestone 4.2: Context Assembly Architecture

**Status:** Complete

### Intended Scope

- Context source categories
- Source eligibility
- Authority and ordering
- Tenant and conversation isolation
- Audience and channel filtering
- Sensitive-data handling
- Context budgeting
- Structured summaries
- Correction preservation
- Overflow and safe-stop behavior
- Context package provenance and versioning

### Non-Goals

- No Context Builder implementation
- No provider integration
- No production token counting
- No database or retrieval implementation

Milestone 4.2 establishes provider-neutral, task-specific packages; strict business, conversation, and profile-version isolation; explicit authority labels; deterministic filtering, ordering, budgeting, validation, provenance, and failure behavior. It adds documentation only.

## Milestone 4.3: Prompt and Task Architecture

**Status:** Complete

### Intended Scope

- Provider-neutral task types
- Prompt layers and ownership
- Instruction precedence
- Provider-neutral message composition
- Untrusted-data separation
- Injection resistance
- Prompt and task versioning
- Task-specific output requirements

### Non-Goals

- No production prompts
- No provider-specific message formats
- No model tuning or provider selection

Milestone 4.3 establishes the MVP task allowlist, provider-neutral Prompt Package layers, deterministic composition and precedence, content/injection boundaries, policy versioning, and fail-closed audit behavior. It adds documentation only and no production prompt text.

## Milestone 4.4: Model Output and Proposal Validation Architecture

**Status:** Deferred

### Intended Scope

- Output contract categories
- Proposal types
- Parsing boundaries
- Structural and semantic validation
- Evidence and provenance checks
- Rejection and partial acceptance
- Controlled repair
- Retry eligibility
- Deterministic application decisions
- Customer-response release validation

### Non-Goals

- No provider output parser
- No production retry code
- No direct state mutation from proposals

## Milestone 4.5: AI Integration Prototype Foundation

**Status:** Deferred until architecture approval

### Potential Scope

- Provider-neutral domain contracts
- Mocked Gateway implementation aligned with approved architecture
- Context package types
- Model proposal validator
- Deterministic application-decision prototype
- Failure and fallback verification

### Guardrails

- No production provider unless explicitly approved in a later decision.
- No provider SDK types in application or domain contracts.
- No customer-visible production AI capability.
- No persistence, authentication, or real customer data.

## Milestone 4.6: Sprint 4 Certification

**Status:** Deferred

### Certification Areas

- Provider independence
- Deterministic application authority
- Tenant and conversation isolation
- Context eligibility
- Output validation and rejection
- Failure and recovery safety
- AI-free deterministic fallback
- Cost and retry boundaries
- Prototype regression
- Documentation consistency

The milestone count may be refined only through an explicit roadmap and decision update. Refinement does not authorize implementation beyond the approved current milestone.

## Sprint-Wide Architecture Invariants

- The application remains authoritative.
- Model output remains an untrusted proposal.
- The model cannot mutate state.
- Only active validated Business Profile configuration may guide business behavior.
- Only eligible approved knowledge may support business claims.
- Provider and model selection remain application-controlled.
- Provider-specific behavior remains behind adapters.
- Partial or streamed output has no state authority.
- AI-free deterministic operation remains available.
- Failures preserve state and stop safely.
- Cross-business data use is prohibited.

## Sprint-Wide Non-Goals

- Real AI provider or model
- Provider SDK
- Model API call
- API route or networking
- Production Context Builder
- Production Prompt Composer
- Production prompt text
- Production output parser
- Streaming
- Retry implementation
- Database or persistence
- Authentication or authorization
- Queue or background processing
- Monitoring vendor
- Billing or usage metering
- Admin UI
- Voice, SMS, or email
- CRM, scheduling, payment, or other integration
- Real business or customer data
- New prototype UI feature

## Validation Strategy

Every Sprint 4 milestone must:

- Preserve certified Sprint 3 behavior.
- Keep public routes and homepage unchanged unless separately authorized.
- Keep `/prototype` unchanged unless a later prototype milestone explicitly authorizes a change.
- Run lint, TypeScript, production build, and prototype verification.
- Check project-local Markdown links.
- Confirm dependency and application-code scope.
- Record deferred decisions without implying implementation.

## Exit Criteria

Sprint 4 is complete only when its final certification confirms:

- Provider-neutral architecture is coherent.
- Deterministic authority cannot be bypassed.
- Model proposals cannot mutate state directly.
- Failure and fallback paths preserve conversation integrity.
- Context and output boundaries preserve tenant isolation.
- Retry and usage policies are application-owned and bounded.
- A later implementation milestone has clear, testable contracts without a premature production-provider commitment.

## Related Documents

- [AI Integration Architecture](AI_INTEGRATION_ARCHITECTURE.md)
- [Context Assembly Architecture](CONTEXT_ASSEMBLY_ARCHITECTURE.md)
- [Context Source Catalog](CONTEXT_SOURCE_CATALOG.md)
- [Context Eligibility and Filtering](CONTEXT_ELIGIBILITY_AND_FILTERING.md)
- [Context Ordering and Precedence](CONTEXT_ORDERING_AND_PRECEDENCE.md)
- [Context Budgeting and Reduction](CONTEXT_BUDGETING_AND_REDUCTION.md)
- [Context Package Contract](CONTEXT_PACKAGE_CONTRACT.md)
- [Context Failure and Audit](CONTEXT_FAILURE_AND_AUDIT.md)
- [Model Task Catalog](MODEL_TASK_CATALOG.md)
- [Prompt Architecture](PROMPT_ARCHITECTURE.md)
- [Prompt Composition Pipeline](PROMPT_COMPOSITION_PIPELINE.md)
- [Instruction Precedence](INSTRUCTION_PRECEDENCE.md)
- [Prompt Injection and Content Boundaries](PROMPT_INJECTION_AND_CONTENT_BOUNDARIES.md)
- [Prompt Versioning and Change Control](PROMPT_VERSIONING_AND_CHANGE_CONTROL.md)
- [Prompt Failure and Audit](PROMPT_FAILURE_AND_AUDIT.md)
- [Model Gateway Architecture](MODEL_GATEWAY_ARCHITECTURE.md)
- [Model Lifecycle](MODEL_LIFECYCLE.md)
- [AI Failure and Recovery](AI_FAILURE_AND_RECOVERY.md)
- [AI Cost and Usage Boundaries](AI_COST_AND_USAGE_BOUNDARIES.md)
- [Sprint 3 Certification](SPRINT_3_CERTIFICATION.md)

Milestones 4.4 through 4.6 remain deferred. Sprint 4.4 has not started.
