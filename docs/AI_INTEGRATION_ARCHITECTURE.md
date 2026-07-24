# AI Integration Architecture

## Status

This document defines the conceptual AI boundary for Sprint 4, Milestone 4.1. It does not implement a Model Gateway, select a provider or model, define production prompts, or authorize networking.

Sprint 3 remains the certified implementation baseline. Its deterministic conversation prototype, fictional fixtures, in-memory state, mocked model behavior, and isolated `/prototype` interface remain unchanged.

## Purpose

AI may improve parts of a customer interaction that benefit from language understanding or natural expression:

- Natural-language interpretation
- Candidate entity and fact extraction
- Candidate intent classification
- Customer-facing response drafting
- Conversation summarization
- Clarification support
- Unsupported-request detection assistance

AI does not replace deterministic business rules. The application remains authoritative for scope, configuration, state, service resolution, intake requirements, stage transitions, escalation, completion, handoff eligibility, permissions, and customer-response release.

Every model result is untrusted input. It becomes useful only after deterministic validation and an explicit application decision.

## Core Principle

The model proposes. The application validates, decides, and acts.

A model cannot:

- Mutate conversation state
- Establish or confirm facts by itself
- Resolve a configured service authoritatively
- Select required intake fields or the next required question
- Determine final readiness, completion, or escalation
- Change a Business Profile, approved knowledge, tenant, or permission
- Send a customer message or invoke an external side effect
- Select arbitrary tools, providers, or models

## Architectural Layers

1. **Customer Experience**
   - Accepts customer input.
   - Displays only application-authorized responses and status.
   - Contains no business or model authority.
2. **Application Orchestration**
   - Validates the business, conversation, profile, task, and request identity.
   - Coordinates deterministic processing and any eligible model-assisted operation.
3. **Deterministic Conversation Engine**
   - Owns service resolution, intake requirements, question selection, corrections, readiness, escalation rules, completion, and handoff eligibility.
4. **Context Assembly**
   - Selects the minimum permitted business, knowledge, conversation, task, and instruction context.
   - Enforces scope, audience, version, sensitivity, and size boundaries.
5. **Model Gateway**
   - Accepts a provider-neutral request and application-approved execution policy.
   - Routes only to an approved adapter and returns a normalized result.
6. **Provider Adapter**
   - Translates one provider-neutral request into one approved provider format.
   - Normalizes provider responses, usage, finish reasons, and errors.
7. **Model Output Validation**
   - Parses and validates raw model output as an untrusted proposal.
   - Rejects unsupported authority, scope mismatches, invalid structure, unsafe text, and prohibited operations.
8. **Application Decision Layer**
   - Accepts, partially accepts, modifies, retries, rejects, falls back, requests clarification, or escalates.
9. **Conversation State Manager**
   - Applies only approved typed operations through existing validation and revision boundaries.
10. **Audit and Observability**
    - Records the request, policy, context provenance, result category, validation, application decision, applied operations, usage, and fallback path.

## Data Flow

```text
Customer input
  -> Customer Experience
  -> Application Orchestration
  -> Deterministic Conversation Engine
  -> Context Assembly
  -> Model Gateway
  -> Approved Provider Adapter
  -> Raw provider result
  -> Model Output Validation
  -> Application Decision Layer
  -> Conversation State Manager (approved typed operations only)
  -> Authorized customer response
  -> Customer Experience

Audit and Observability receives trace events from every application-owned boundary.
```

The model has no direct path to state, customer delivery, business configuration, knowledge activation, permissions, tools, or external systems.

## Authority Boundaries

| Concern | Authoritative owner | Model role |
| --- | --- | --- |
| Business identity | Business Resolver / Application Orchestration | None |
| Profile selection and version | Business Profile Service / Application Orchestration | None |
| Conversation state and revision | Conversation State Manager | May propose meaning; cannot mutate |
| Knowledge eligibility | Knowledge Service / Context Assembly | May use only supplied eligible context |
| Context eligibility | Context Assembly and application policy | None |
| Prompt construction | Prompt Composer under application control | None |
| Provider and model selection | Model Gateway policy approved by the application | None |
| Model execution | Approved Provider Adapter | Performs the bounded request only |
| Output validation | Model Output Validator | Output is the validation subject |
| Retry approval | Application Decision Layer and usage policy | May not request unbounded retries |
| Escalation activation | Deterministic Conversation Engine / Application Decision Layer | May recommend only |
| State mutation | Conversation State Manager | Prohibited |
| Customer response release | Application Decision Layer | May draft only |
| External side effects | Future authorized application services | Prohibited |

## Proposal Flow

Every model-assisted operation follows this sequence:

1. The application validates business and conversation scope.
2. The application identifies the current deterministic task.
3. Context Assembly selects and validates permitted context.
4. A future Prompt Composer creates provider-neutral model input.
5. The Model Gateway applies application-approved provider and model policy.
6. The approved Provider Adapter returns raw model output and metadata.
7. Model Output Validation parses and validates the proposal.
8. The Application Decision Layer evaluates the validated proposal against current deterministic state.
9. The application accepts, partially accepts, modifies, retries, rejects, uses fallback, requests clarification, or escalates.
10. The Conversation State Manager applies only approved typed operations.
11. The application releases only approved customer-facing content.
12. Audit and Observability records the decision path.

No model output may bypass a step or become authoritative because it is well-formed, confident, provider-validated, or streamed.

## Capability Categories

### Language Interpretation

- **Allowed use:** Propose the meaning of free-form customer language.
- **Required validation:** Compare the proposal with the customer message, current evidence, active task, and allowed intent categories.
- **Prohibited authority:** Cannot confirm meaning, choose a service, or advance state.
- **Failure behavior:** Ask a deterministic clarification question, preserve the original language, or escalate.

### Entity Extraction Proposal

- **Allowed use:** Propose candidate values explicitly present in permitted customer text.
- **Required validation:** Verify source provenance, field eligibility, value type, evidence class, and conversation scope.
- **Prohibited authority:** Cannot create facts, fill missing values, or infer sensitive data.
- **Failure behavior:** Ignore the candidate and continue deterministic intake or clarification.

### Intent Classification Proposal

- **Allowed use:** Recommend a platform-level intent or candidate intent set.
- **Required validation:** Check against deterministic intent rules, escalation signals, active profile paths, and customer evidence.
- **Prohibited authority:** Cannot select workflow authority or suppress escalation.
- **Failure behavior:** Keep intent unresolved, clarify, or escalate.

### Response-Draft Proposal

- **Allowed use:** Draft natural customer-facing text for an application-selected task.
- **Required validation:** Verify grounding, scope, tone, safety, audience, required limitations, and consistency with the application decision.
- **Prohibited authority:** Cannot send the message or introduce new facts, promises, actions, or decisions.
- **Failure behavior:** Use deterministic wording, modify the draft, retry when permitted, or stop safely.

### Summary Proposal

- **Allowed use:** Propose a concise summary of approved conversation context.
- **Required validation:** Compare every material claim with validated state and preserve corrections, unknowns, conflicts, and evidence classes.
- **Prohibited authority:** Cannot replace authoritative state or erase inconvenient context.
- **Failure behavior:** Build a deterministic summary or route to human review.

### Clarification Proposal

- **Allowed use:** Recommend customer-friendly phrasing for a deterministic clarification need.
- **Required validation:** Confirm that the question addresses the exact unresolved dependency and does not repeat confirmed information.
- **Prohibited authority:** Cannot invent a clarification need or change required-field selection.
- **Failure behavior:** Use the configured deterministic question or escalate after permitted attempts.

### Escalation Recommendation

- **Allowed use:** Surface language that may indicate a human-assistance condition.
- **Required validation:** Apply deterministic escalation rules, destination authorization, task scope, and current state.
- **Prohibited authority:** Cannot activate, clear, route, or complete escalation.
- **Failure behavior:** Deterministic safeguards remain active; ambiguous risk fails closed.

### Unsupported-Request Detection Assistance

- **Allowed use:** Recommend that customer language may not fit approved services or workflows.
- **Required validation:** Compare only with active configured services and approved paths.
- **Prohibited authority:** Cannot invent a service, declare business capability, or reject a customer conclusively.
- **Failure behavior:** Preserve the request, use deterministic unsupported handling, clarify, or escalate.

## Application Decisions

After validation, the application may:

- **Accept:** Use the complete validated proposal within its authorized scope.
- **Accept partially:** Use only validated parts and discard the rest.
- **Modify:** Replace wording or values with application-authorized content.
- **Request clarification:** Ask the customer for the missing deterministic distinction.
- **Retry:** Make a bounded, policy-approved new request without applying prior output.
- **Use deterministic fallback:** Continue without a provider.
- **Escalate:** Activate an application-owned human path.
- **Reject:** Apply no model-derived effect.

The decision and its reasons remain traceable.

## AI-Free Operation

The platform must remain useful when no provider is configured, permitted, available, affordable, or successful.

Without AI, the application must still be able to:

- Run deterministic Business-Profile-driven intake
- Resolve exact configured services
- Select configured required questions
- Preserve claims, confirmed facts, corrections, state, and revision
- Calculate missing fields and readiness
- Activate deterministic escalation
- Build a validated handoff
- Produce safe configured or deterministic responses
- Stop safely when interpretation is not possible

AI is an enhancement, not a prerequisite or single point of failure.

## Security and Permission Boundaries

- Model access never grants data access; Context Assembly grants only the context permitted for one task.
- Provider access never grants business authority; the Provider Adapter performs only the approved request.
- A model cannot add tools, capabilities, permissions, providers, or destinations.
- Prompt injection and instructions inside customer or reference text remain untrusted data.
- Cross-business identity, profile, conversation, knowledge, or destination mismatches block processing.
- Sensitive-data restrictions apply before provider execution and again during output validation.

## Streaming Boundary

Streaming is deferred. If introduced later:

- Partial output remains non-authoritative.
- Partial structured output and tool proposals cannot mutate state.
- Customer-visible partial text requires application-approved filtering and release policy.
- Cancellation, final validation, failure recovery, and audit continuity must remain provider-neutral.
- Only a validated final proposal may influence authoritative application decisions.

## Current Implementation Boundary

The current `MockModelGateway` is a deterministic local stand-in used by the certified Sprint 3 prototype. It performs no AI, prompt, API, or network work. The existing `ContextBuilder` and `OutputValidator` are deferred interfaces, not production implementations.

Milestones 4.1 through 4.3 change documentation only. Milestone 4.2 defines validated provider-neutral Context Packages; Milestone 4.3 defines application-selected task allowlists and provider-neutral Prompt Packages with explicit authority, permissions, prohibitions, precedence, output-contract references, versioning, and content boundaries. Model Gateway, Context Builder, Prompt Composer, registries, and output validation remain unimplemented. No provider, model, SDK, production prompt, parser, API, networking, persistence, or authentication has been selected or implemented.

## Related Documents

- [Model Gateway Architecture](MODEL_GATEWAY_ARCHITECTURE.md)
- [Model Lifecycle](MODEL_LIFECYCLE.md)
- [AI Failure and Recovery](AI_FAILURE_AND_RECOVERY.md)
- [AI Cost and Usage Boundaries](AI_COST_AND_USAGE_BOUNDARIES.md)
- [Sprint 4 Plan](SPRINT_4_PLAN.md)
- [Context Assembly](CONTEXT_ASSEMBLY.md)
- [Context Assembly Architecture](CONTEXT_ASSEMBLY_ARCHITECTURE.md)
- [Context Package Contract](CONTEXT_PACKAGE_CONTRACT.md)
- [Model Task Catalog](MODEL_TASK_CATALOG.md)
- [Prompt Architecture](PROMPT_ARCHITECTURE.md)
- [Prompt Composition Pipeline](PROMPT_COMPOSITION_PIPELINE.md)
- [Model Output Contract](MODEL_OUTPUT_CONTRACT.md)
