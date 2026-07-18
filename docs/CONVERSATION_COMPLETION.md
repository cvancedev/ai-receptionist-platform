# Conversation Completion

## Purpose

Conversation completion determines when the engine should stop routine questioning and produce a clear outcome. A conversation may be successfully completed, incomplete, escalated, or abandoned. Each outcome must preserve useful context and avoid implying more certainty or action than the business approved.

## Successful Completion

A conversation may be ready for handoff when:

- The customer's intent is sufficiently understood for the applicable path.
- An active configured service is resolved when the intent requires one.
- Required universal fields are complete.
- Required service fields are complete.
- Triggered conditional fields are complete, explicitly unknown, declined, or permitted for later human follow-up under profile rules.
- Material contradictions are resolved or clearly flagged for an allowed human handoff.
- The customer has had a meaningful opportunity to confirm and correct the summary.
- Approved next steps are explained without unsupported commitments.
- No blocking escalation remains unresolved.
- The configured handoff destination and required summary content are available.

Completion means the conversation achieved its approved outcome. It does not mean the business accepted the work, confirmed availability, resolved a complaint, approved a price, or made another commitment unless the active profile explicitly authorizes that statement.

## Completion Confirmation

Before completion, the engine should provide a concise summary of material understanding, including the request, applicable service, key confirmed details, customer concerns, meaningful unknowns, and next step.

The customer must be able to correct the summary. A correction updates conversation state, replaces superseded information, and reopens only the dependencies affected by the change.

Silence must not be treated as confirmation when material uncertainty remains. If the channel ends without confirmation, the conversation is incomplete or abandoned unless the active profile explicitly permits a partial handoff and the summary accurately records the missing confirmation.

## Completed Conversation

A conversation is **Completed** when:

- Its approved outcome and handoff status are recorded.
- Material state is accurately summarized.
- The customer received a clear, honest closing when the channel allowed it.
- No further engine question is needed.

Completed records retain the active profile version and evidence distinctions needed for accountability.

## Incomplete Conversations

A conversation is **Incomplete** when useful interaction occurred but normal completion criteria were not met and the engine can identify the outstanding gap.

### Required Information Is Missing

Record the field as unknown, declined, incomplete, or deferred. Explain why it matters when appropriate. Use a permitted partial handoff when configured; otherwise state that a person must complete intake without pressuring the customer.

### Customer Leaves

Preserve all useful context, the last completed stage, and the next unresolved need. Do not mark unconfirmed information as confirmed.

### Conversation Times Out

Apply the channel's approved inactivity rule, preserve the same evidence state, and avoid implying that timeout equals customer confirmation or refusal.

### Customer Refuses Information

Respect the refusal. Record it distinctly from unknown or unanswered information. Continue only if profile completion rules permit; otherwise provide the constructive partial or human path.

### Human Must Complete Intake

Stop routine automation at the safe point, summarize what is known, identify outstanding questions, and route to the approved destination. Do not continue collecting details simply to satisfy a checklist.

## Escalated Conversations

An escalated conversation must record:

- **Escalation reason:** The exact universal or profile-defined trigger.
- **Urgency:** The applicable priority without exaggerating risk or promising response timing.
- **Human destination:** The validated team, person, or route configured for the trigger.
- **Customer-facing explanation:** A plain-language reason a person is better placed to help.
- **Preserved context:** Confirmed information, customer claims, concerns, emotional context, corrections, and relevant knowledge already used.
- **Outstanding questions:** Only what remains useful for the human, without requiring the customer to repeat completed intake.
- **Recommended next action:** The approved action for staff or the customer, clearly distinguished from a guarantee.

Escalation is a constructive completion path, not an engine failure. Once a blocking escalation is active, the engine gathers only the safe minimum needed for continuity.

## Abandoned Conversations

A conversation is **Abandoned** when the customer stops participating or the channel closes before completion or acknowledged escalation.

An abandoned record still retains:

- Known and confirmed customer information
- Customer claims and stated intent
- Candidate or resolved service status
- Intake progress completed
- Questions asked and skipped
- Last unresolved question
- Corrections and material contradictions
- Active escalation indicators
- Appropriate follow-up status under the Business Profile

Abandonment must not erase a potentially valuable inquiry or turn missing answers into negative assumptions. Follow-up may occur only through approved business rules and available contact permission.

## Handoff Output

The final handoff aligns with the active Business Profile's handoff configuration and includes:

- **Customer information:** Confirmed contact and identification details, with unknowns visible.
- **Intent:** The customer's reason for contact in their own words and its resolution status.
- **Resolved service:** Active configured service or services when applicable, including confidence or unsupported status.
- **Summary:** Concise account of the request and desired outcome.
- **Confirmed details:** Material information the customer confirmed.
- **Customer concerns:** Priorities, constraints, emotional context, or risks relevant to follow-up.
- **Missing information:** Required or useful fields that remain unknown, declined, incomplete, or deferred.
- **Contradictions:** Unresolved conflicts that staff must not overlook.
- **Escalation reasons:** Active or completed escalation triggers and applicable destination.
- **Recommended next action:** Approved next step for staff or customer, not an unsupported promise.
- **Priority:** Profile-defined or platform-required indicator with its reason.

The handoff should be concise enough to scan and complete enough that staff do not make the customer reconstruct the conversation.

## Outcome Rules

- **Successful completion** requires applicable completion criteria and confirmation standards.
- **Incomplete** preserves progress and names the gap when the interaction remains recoverable.
- **Escalated** preserves context and transfers authority when the engine should not continue independently.
- **Abandoned** preserves the last reliable state when the customer stops participating.
- One conversation may be both incomplete and escalated in descriptive terms, but its primary lifecycle outcome should be **Escalated** when human action is required.
- No terminal outcome may hide corrections, unknowns, contradictions, or an active safety concern.

## Professional Close

When the channel allows, every outcome should end with:

- Acknowledgment of the customer's request or concern
- An accurate statement of what was captured
- Any material limitation or outstanding information
- The approved next step or human path
- No unsupported guarantee of response time, availability, price, resolution, or outcome

If the customer has already left, the preserved handoff state serves this continuity purpose without fabricating a customer-facing close.
