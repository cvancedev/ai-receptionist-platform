# Prompt Testing Strategy

## Purpose

Prompt and context testing verifies that future model-independent components preserve platform authority, business isolation, approved knowledge, evidence handling, customer experience, and safe handoffs before production use.

This milestone defines a testing architecture only. It does not create test code, production prompts, model evaluations, vendors, or numeric acceptance thresholds.

## Test Categories

- Normal intake conversations
- Ambiguous requests
- Unsupported configured services
- Multiple-service requests
- Customer corrections
- Repeated or volunteered information
- Missing Business Profile fields
- Conflicting knowledge
- Expired, superseded, or suspended knowledge
- Missing approved knowledge
- Prompt injection attempts
- Requests for restricted information
- Upset or frustrated customers
- Human handoff requests
- Long conversations and reduced context
- Partial or abandoned conversations
- Emergency or safety-sensitive messages
- Incorrect or malformed model output
- Cross-business isolation attempts
- Audience and channel permission mismatches
- Context package identity or version conflicts

Test coverage should include both successful paths and constructive failures.

## Expected Properties

Tests should verify:

- No industry assumptions enter platform behavior.
- No unsupported promises or business claims are produced.
- Confirmed questions are not repeated without a valid reason.
- Only the active validated Business Profile is used.
- Knowledge authority, lifecycle, audience, and scope are respected.
- Customer corrections replace prior incorrect information.
- Conversation evidence classes remain distinct.
- Unknown and conflicting information remain visible.
- Human requests and safety conditions escalate correctly.
- Completion, incomplete, escalation, and abandonment rules are applied correctly.
- Material answers retain source and version traceability.
- Tenant isolation remains intact.
- Restricted content is not exposed.
- AI personality remains professional, warm, concise, and honest.
- The customer receives a clear next step or constructive handoff.
- Model proposals do not bypass platform validation.

## Golden Scenarios

Future golden scenarios are approved reference cases with expected architecture-level outcomes:

- Conversation stage before and after the turn
- Context components allowed and excluded
- Selected current task
- Next question or allowed answer category
- Eligible knowledge and source versions
- Expected evidence and state updates
- Expected escalation or completion outcome
- Expected handoff content
- Prohibited responses, actions, disclosures, and state changes

Golden scenarios should use clearly fictional business configuration and customer data. They should specify outcomes and properties rather than freeze one stylistic sentence as the only correct response.

Full production conversations are deferred.

## Adversarial Testing

Adversarial cases should include attempts to:

- Inject instructions through customer text or reference content
- Request hidden instructions or context
- Expose another business's data
- Change the model's role or authority
- Disable safety, privacy, or escalation safeguards
- Force pricing, scheduling, refund, discount, or outcome promises
- Bypass human review
- Reveal restricted internal knowledge
- Invent approval, profile activation, or audience permission
- Promote customer claims into business policy
- Convert inferences into confirmed facts
- Use expired or superseded knowledge
- Manipulate the current task or output contract
- Trigger unsupported tools or side effects

Expected behavior is safe refusal of the conflicting instruction, continued adherence to higher-authority rules, protected data, traceable handling, and escalation when appropriate.

## Context Reduction Testing

Long-conversation tests should compare full and reduced context to verify preservation of:

- Confirmed facts
- Corrections and current values
- Unresolved questions and contradictions
- Safety and escalation status
- Current service and stage
- Questions already asked
- Completion progress
- Knowledge source traceability
- Customer concerns needed for handoff

Reduction must not cause repeated questions, lost corrections, changed authority, hidden uncertainty, or cross-conversation leakage.

## Output Contract Testing

Tests should present outputs that are valid, incomplete, contradictory, unsafe, out of stage, cross-business, unsupported, or incorrectly sourced. Validation should accept only allowed proposals and produce the expected rejection, controlled repair, retry, or escalation outcome.

Special attention should cover model attempts to:

- Mark assumptions as confirmed
- Change permanent knowledge
- Activate a Business Profile
- Select a different tenant
- Choose an unauthorized handoff destination
- Omit a required escalation
- Declare completion with unresolved blockers

## Regression Testing

Prompt components, assembly policies, priority rules, output contracts, and model/provider changes should be evaluated against the same approved scenario set.

A change must not silently weaken:

- Safety
- Honesty
- Privacy
- Business isolation
- Knowledge grounding and audience restrictions
- Customer correction precedence
- Evidence handling
- Escalation
- Completion requirements
- Source traceability
- AI personality and customer experience

Regression results should remain attributable to component versions and the future model configuration tested.

## Change Review

Changes should identify:

- Component or policy version changed
- Intended customer or business benefit
- Scenarios affected
- New risks or permissions
- Regression results
- Required human approval
- Rollback or suspension criteria for future implementation

A context or prompt change should not enter production merely because average responses appear improved; required safety and architecture properties must still pass.

## Human Review

Human review remains necessary for:

- New prompt component versions
- Major context assembly or reduction changes
- New safety-sensitive behavior
- New business configuration capabilities
- New output actions or authority boundaries
- Production failures and security events
- Repeated low-confidence or invalid-output outcomes
- Material regression disagreements
- Model or provider changes after future evaluation

Reviewers should assess both technical conformance and customer experience, including whether the customer would feel listened to and receive an honest next step.

## Testing Boundaries

- No test may use one business's real private data as another business's fixture.
- Passing tests does not grant the model application authority.
- Golden scenarios do not become production prompt text.
- One provider's behavior must not become an undocumented platform assumption.
- Numeric quality thresholds and production release gates are deferred to implementation planning.
