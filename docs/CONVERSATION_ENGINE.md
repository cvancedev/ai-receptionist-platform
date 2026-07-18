# Conversation Engine

## Purpose

The Conversation Engine is the industry-agnostic coordinator for a customer interaction. It determines what the conversation needs next by applying platform behavior rules to an active, validated Business Profile and the current conversation state.

The engine defines responsibilities, evidence handling, state transitions, and completion standards. It does not define an AI provider, production prompt, API, database, storage mechanism, or user interface.

## Inputs

- **Active validated Business Profile:** The approved business identity, active services, intake rules, escalation paths, handoff rules, and communication preferences for the conversation.
- **Platform behavior rules:** Universal safety, honesty, privacy, accessibility, conversation, and escalation standards.
- **Approved business knowledge:** Profile content the business has authorized for the applicable context.
- **Customer messages:** The customer's words, corrections, questions, concerns, refusals, and requests for human help.
- **Existing conversation state:** The current lifecycle stage, evidence, progress, unresolved issues, and escalation status.
- **Channel context:** The interaction channel and any channel-specific capabilities or constraints approved by the profile.
- **Prior confirmed answers:** Information already confirmed during the conversation and therefore protected from unnecessary repetition.

An inactive, incomplete, suspended, archived, unvalidated, or mismatched profile is not a valid input. The engine must restrict the interaction and follow the approved failure or human path rather than substitute another profile or industry assumption.

## Responsibilities

The Conversation Engine must:

- Greet the customer using approved business identity and style.
- Understand the reason for contact before narrowing the conversation.
- Identify an applicable active configured service when the intent requires one.
- Gather required universal information.
- Ask only relevant conditional and service-defined questions.
- Preserve confirmed information and customer corrections.
- Prevent repeated questions unless clarification is genuinely required.
- Detect uncertainty, contradictions, missing knowledge, and low-confidence resolution.
- Confirm material understanding before completion.
- Explain only approved next steps and expectations.
- Escalate safety issues, human requests, unsupported decisions, and configured conditions.
- Produce a concise handoff summary that distinguishes known, missing, conflicting, and escalated information.

## Boundaries

The Conversation Engine must not:

- Invent business information or use unapproved knowledge.
- Select an inactive or unconfigured service.
- Promise pricing, scheduling, availability, response timing, or outcomes without explicit approval.
- Override platform safety, privacy, honesty, or reliability rules.
- Treat assumptions or inferences as confirmed facts.
- Force a service match when the request is ambiguous or unsupported.
- Ask for information already confirmed without a specific contradiction, correction, or dependency change.
- Continue questioning after completion criteria are met.
- Silently discard customer corrections, refusals, uncertainty, or context.
- Hide unresolved issues from the customer-facing confirmation or human handoff.
- Replace human judgment for unsupported commitments or exceptions.

## Transition Principles

- Safety and explicit human requests may interrupt any stage and move directly toward escalation.
- Customer corrections may return the conversation to service resolution, intake, or clarification when dependent information changes.
- A stage may be revisited only for a clear unresolved dependency, not because the conversation followed an unexpected order.
- The engine may collect information volunteered early and mark later questions complete without asking them again.
- Completion and escalation are both constructive outcomes when they preserve context and make the next step clear.

## High-Level Stages

### 1. Conversation Initialization

- **Purpose:** Establish a safe, valid context before customer-facing behavior begins.
- **Inputs:** Active validated profile, active profile version, channel context, platform rules, and any permitted prior state.
- **Expected outcome:** The correct business context is bound to a new initialized conversation state.
- **Possible transitions:** Greeting; restricted failure handoff when valid configuration is unavailable.
- **Escalation conditions:** Missing, inactive, mismatched, suspended, or conflicting profile; unavailable required handoff path.

### 2. Greeting

- **Purpose:** Welcome the customer and invite the reason for contact using approved identity and tone.
- **Inputs:** Approved greeting, channel context, and any opening customer message.
- **Expected outcome:** The customer can explain the request and knows they reached the intended business context.
- **Possible transitions:** Intent discovery; immediate escalation; close if the customer ends contact.
- **Escalation conditions:** Immediate danger, explicit human request, complaint requiring direct human handling, or profile identity conflict.

### 3. Intent Discovery

- **Purpose:** Understand why the customer is contacting the business before choosing a workflow.
- **Inputs:** Customer messages, conversation context, prior answers, and platform-level intent categories.
- **Expected outcome:** A stated intent and appropriate confidence status are recorded without inventing detail.
- **Possible transitions:** Service resolution, knowledge response path, clarification, escalation, or close.
- **Escalation conditions:** Urgent or unsafe concern, unsupported high-risk request, repeated misunderstanding, or direct request for a person.

### 4. Service Resolution

- **Purpose:** Connect the request to active configured services when a service is relevant.
- **Inputs:** Stated intent, active services, approved aliases, customer terminology, and existing evidence.
- **Expected outcome:** A resolved service, candidate services with a clarification need, or an explicit unsupported or ambiguous status.
- **Possible transitions:** Universal intake, conditional intake, clarification, escalation, or non-service knowledge path.
- **Escalation conditions:** No safe match, persistent ambiguity, inactive-only match, conflicting service rules, or required human classification.

### 5. Universal Intake

- **Purpose:** Gather the minimum profile-required customer and request information for a useful handoff.
- **Inputs:** Universal intake categories, profile completion rules, confirmed answers, and customer-volunteered information.
- **Expected outcome:** Required universal fields are completed, explicitly unavailable, declined, or marked for human follow-up.
- **Possible transitions:** Conditional intake, clarification, confirmation, escalation, or incomplete close.
- **Escalation conditions:** Safety trigger, human request, required information that cannot be obtained under profile rules, or inappropriate data request.

### 6. Conditional Intake

- **Purpose:** Gather only the additional information activated by the resolved service, intent, or earlier answer.
- **Inputs:** Active service requirements, conditional rules, completed fields, and current conversation context.
- **Expected outcome:** Applicable required fields are addressed and irrelevant fields remain skipped.
- **Possible transitions:** Clarification, confirmation, service re-resolution, escalation, or completion assessment.
- **Escalation conditions:** Missing or conflicting profile rule, unsafe condition, unsupported exception, or conditional path without a valid handoff.

### 7. Clarification

- **Purpose:** Resolve material ambiguity, contradiction, or incomplete meaning with minimum customer effort.
- **Inputs:** Conflicting answers, low-confidence interpretations, unresolved service candidates, and dependent rules.
- **Expected outcome:** The issue becomes confirmed, remains explicitly unresolved, or is routed to a human.
- **Possible transitions:** Intent discovery, service resolution, intake, confirmation, or escalation.
- **Escalation conditions:** Repeated misunderstanding, customer frustration, low confidence after a reasonable attempt, or a conflict that requires business judgment.

### 8. Confirmation

- **Purpose:** Give the customer a concise opportunity to verify material understanding before handoff.
- **Inputs:** Proposed summary, confirmed information, unresolved unknowns, contradictions, and approved next step.
- **Expected outcome:** The customer confirms the summary or supplies corrections that update state and dependent progress.
- **Possible transitions:** Completion assessment, affected earlier stage after correction, clarification, or escalation.
- **Escalation conditions:** Material uncertainty cannot be resolved, correction exposes an unsupported path, or the customer requests a person.

### 9. Completion or Escalation

- **Purpose:** Determine whether the conversation meets handoff criteria or requires human intervention.
- **Inputs:** Completion rules, escalation rules, field status, confirmation status, unresolved blockers, and customer preference.
- **Expected outcome:** Ready for handoff, escalated, incomplete, or abandoned status with a clear reason.
- **Possible transitions:** Handoff summary; professional close; earlier stage only when the customer continues and a specific resolvable gap remains.
- **Escalation conditions:** Any unresolved blocking trigger, explicit human request, unsupported commitment, safety issue, or missing required authority.

### 10. Handoff Summary

- **Purpose:** Produce an accurate, concise record that lets human staff continue without making the customer start over.
- **Inputs:** Confirmed information, customer claims, intent, service status, concerns, unknowns, corrections, contradictions, escalation data, and profile-required summary fields.
- **Expected outcome:** A structured handoff that clearly distinguishes what is confirmed, missing, conflicting, or recommended for review.
- **Possible transitions:** Professional close; human handoff path.
- **Escalation conditions:** Required destination unavailable, summary cannot be produced without guessing, or new urgent information appears.

### 11. Professional Close

- **Purpose:** End the interaction respectfully with an accurate status and approved next step.
- **Inputs:** Completion status, approved closing, handoff result, and permitted response expectation.
- **Expected outcome:** The customer understands what was captured, what remains unresolved, and what may happen next.
- **Possible transitions:** Completed, escalated, incomplete, or abandoned terminal state; renewed conversation only if the customer continues.
- **Escalation conditions:** A new safety concern, correction, complaint, or request for human assistance before the interaction ends.

## Evidence and Correction Rule

Conversation decisions must use the evidence classes defined in [Conversation State](CONVERSATION_STATE.md). Customer corrections supersede prior incorrect information, dependent decisions must be reevaluated, and the final handoff must preserve the correction history needed to prevent staff from relying on outdated details.

## Related Architecture

- [Intent and Service Resolution](INTENT_AND_SERVICE_RESOLUTION.md) defines intent classification and active-service matching.
- [Adaptive Question Logic](ADAPTIVE_QUESTION_LOGIC.md) defines how the next question is selected.
- [Conversation Completion](CONVERSATION_COMPLETION.md) defines terminal outcomes and handoff content.
- [Business Profile](BUSINESS_PROFILE.md) defines the only source of business-specific behavior.
- [Escalation Rules](ESCALATION_RULES.md) defines universal human-assistance situations and handoff conduct.
