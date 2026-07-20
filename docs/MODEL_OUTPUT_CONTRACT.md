# Model Output Contract

## Purpose

The output contract defines what a future model may propose and what the application must validate before any proposal reaches a customer, changes conversation state, or affects a business workflow.

This document defines conceptual content and authority. It does not choose JSON, XML, function calling, a provider format, or an implementation schema.

## Customer-Facing Response

The model may propose a response intended for the customer. It must be:

- Professional
- Natural
- Concise
- Helpful
- Honest
- Appropriate to the current conversation stage
- Grounded in the validated context package
- Free of unsupported claims
- Clear about limitations and next steps
- Consistent with customer corrections and evidence status
- Free of restricted internal information

A proposed response is not authorized for delivery until application validation passes.

## State Updates

The model may propose structured updates such as:

- New customer claim
- Confirmed fact
- Correction and superseded value
- Resolved intent
- Resolved active service
- Answered intake field
- Conditional field triggered or no longer applicable
- Missing or declined information
- Contradiction
- Unknown information
- Escalation need and reason
- Completion readiness
- Knowledge source used for a material answer

The application, not the model alone, validates and applies state changes. It checks provenance, evidence class, current revision, business scope, stage, dependencies, and correction precedence.

The model may not promote an inference or assumption to a confirmed fact merely by labeling it confirmed.

## Requested Action

Conceptual actions may include:

- Ask a question
- Provide an approved answer
- Clarify ambiguity
- Confirm understanding
- Escalate
- Summarize
- Close
- Wait for a human
- Request missing configuration or knowledge review

The application determines whether the action is allowed for the current stage, business, profile, state, audience, channel, and escalation status.

## Knowledge References

Material business answers should propose internal references to the source identifiers and versions that support each claim. References should remain consistent with the knowledge supplied in the context package.

Customer-facing messages do not need to display internal source metadata unless a future reviewed product capability explicitly supports it. The model must not fabricate citations or refer to sources it did not receive.

## Confidence and Uncertainty

The output should distinguish conceptual statuses:

- **Known:** Supported by eligible approved business context within scope.
- **Confirmed:** Explicitly established in current conversation state or approved active configuration.
- **Probable:** A supported interpretation that still needs confirmation.
- **Ambiguous:** Multiple reasonable interpretations remain.
- **Unsupported:** No approved capability, service, or knowledge supports the proposed conclusion.
- **Conflicting:** Applicable evidence or sources disagree materially.
- **Unknown:** Information is missing, declined, unavailable, or not understood.

No numeric confidence is required. A confident tone cannot change evidence status.

## Validation

The application must validate model output before accepting or delivering it. Validation should conceptually check:

- The proposed action is allowed.
- The action matches the current conversation stage and task.
- Business and conversation scope are correct.
- State updates are consistent with the current revision and evidence history.
- Customer corrections replace superseded information correctly.
- The response contains no unsupported promise or claim.
- Audience-restricted or sensitive information is not exposed.
- Material business claims have eligible source support.
- Source identifiers and versions were available in the context package.
- Required escalation conditions are preserved.
- Completion criteria are actually satisfied.
- The handoff destination is application-authorized for the active business.
- The output does not attempt to alter platform instructions, profile activation, permanent knowledge, permissions, or tenant scope.

## Invalid Output Handling

Invalid output should be:

- Rejected when it cannot be used safely.
- Repaired only through a controlled, bounded process that preserves the original context and validation requirements.
- Regenerated only when retry is permitted and cannot hide a repeated systematic failure.
- Escalated when safe correction is uncertain, safety-sensitive, or repeatedly unsuccessful.

Invalid output must not silently affect customer communication, conversation state, business configuration, knowledge, or workflow.

The system should preserve validation failures and relevant component versions for authorized quality review.

## Model Authority

The model may recommend. The platform decides whether the recommendation is allowed and applies any authorized effect.

The model never has sole authority over:

- Pricing commitments
- Scheduling commitments
- Refunds
- Discounts
- Legal conclusions
- Medical conclusions
- Safety-critical actions
- Business Profile activation
- Permanent knowledge creation, correction, activation, or retirement
- Tenant access or business identity
- Audience permissions
- Human escalation destinations
- Tools, integrations, or external side effects

Human judgment remains required for unsupported commitments and exceptions.

## Contract Traceability

Each output evaluation should conceptually retain:

- Output contract version
- Context package traceability identifier
- Current business, profile, conversation, and state revision
- Proposed customer response
- Proposed state changes and actions
- Proposed knowledge references
- Validation result and reasons
- Authorized effect, controlled retry, rejection, or escalation outcome

Traceability supports testing and accountability without granting rejected output authority.
