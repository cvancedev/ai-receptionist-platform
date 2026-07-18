# Adaptive Question Logic

## Purpose

Adaptive question logic selects the smallest useful next question from the active conversation context. It turns profile-defined intake requirements into a natural conversation without hardcoded industry questionnaires.

This is a conceptual decision policy, not implementation code or a production prompt.

## Inputs to Question Selection

The engine uses:

- Active validated Business Profile requirements
- Resolved platform-level intent
- Resolved active configured service or current service candidates
- Existing confirmed answers and customer claims
- Conditional intake rules and their triggering evidence
- Customer corrections, refusals, and stated uncertainty
- Conversation and channel context
- Questions already asked, skipped, or deferred
- Active escalation conditions
- Applicable completion criteria

Invalid or conflicting profile configuration cannot be repaired through questioning. It must follow the configured failure or human-review path.

## Question Priority

The engine evaluates needs in this order:

1. **Immediate safety or urgent escalation:** Interrupt routine intake and follow universal and configured safety paths.
2. **Resolve major ambiguity:** Clarify uncertainty that prevents safe intent, service, or escalation decisions.
3. **Obtain essential contact information:** Gather the minimum reachable contact information needed for a handoff, unless safety or a direct human path takes precedence.
4. **Identify the applicable service:** Resolve an active configured service when the interaction requires one.
5. **Gather required service information:** Address profile-required fields that materially support the handoff.
6. **Trigger relevant conditional questions:** Ask only fields whose explicit conditions are met.
7. **Clarify contradictions or incomplete answers:** Reconcile material conflicts or record them for human review.
8. **Collect useful optional context:** Ask only when it clearly improves the current handoff and does not burden or pressure the customer.
9. **Confirm understanding:** Present the material summary and allow correction before completion.

Priority does not create a rigid script. Information volunteered early should satisfy later needs without being requested again.

## Next-Question Decision

Before asking, the engine should determine:

- Is an immediate escalation or direct human request active?
- Is the information already confirmed, supplied as a usable customer claim, or present in prior context?
- Is the field applicable to the resolved intent, active service, or triggered condition?
- Is it required now, safely deferrable, optional, declined, or irrelevant?
- Will the answer change routing, safety, service resolution, completion, or handoff usefulness?
- Is clarification necessary because the current answer is ambiguous or contradictory?
- Can the question be asked clearly and proportionately through the current channel?
- Are completion criteria already satisfied?

If the question has no material purpose, it should not be asked.

## Question Rules

The engine must:

- Ask one manageable question or a small group of closely related details at a time.
- Prefer natural, plain language over questionnaire behavior.
- Never ask for information already confirmed without a specific valid reason.
- Revisit information only after a correction, contradiction, unclear answer, or changed dependency.
- Refer to the relevant prior answer when clarification is needed.
- Explain why sensitive, unusual, or effortful information is necessary.
- Skip irrelevant fields and stop asking fields whose conditions no longer apply.
- Accept “I don't know,” refusal, and uncertainty without pressure.
- Stop routine questioning when completion criteria are satisfied or escalation takes control.
- Respect a direct request for human assistance immediately.

The engine should not collect optional information merely because it is available in the profile.

## Conditional Logic

A conditional field becomes applicable only when an explicit active-profile rule is triggered by confirmed information or a sufficiently clear customer claim. An inference may prompt clarification but must not silently activate a burdensome or sensitive intake path.

Generic illustrative examples:

- If a customer says the request is time-sensitive, an approved urgency question may become relevant.
- If the selected configured service requires a location, the profile-defined location field becomes applicable.
- If the customer prefers written follow-up, an approved written contact field may become required.
- If the request falls outside standard profile guidance, a limited exception question may activate before human escalation.

These examples describe conditional behavior only. They are not default fields, services, or business rules.

When a condition becomes false after correction, dependent unanswered questions are skipped and already collected answers are retained only when still relevant to the handoff.

## Repetition Prevention

Question history and evidence status work together:

- Confirmed answers close the corresponding information need.
- Volunteered information should be recognized even if it arrived before the expected stage.
- Semantically equivalent questions count as repetition, even when wording changes.
- A clarification question must name the ambiguity or conflict rather than repeat the original request.
- A channel interruption does not justify restarting intake when prior state remains valid.
- Separate requests may reuse shared confirmed customer information while maintaining separate service progress.

## Corrections

Customer corrections must:

1. Replace the prior incorrect value as the current authoritative conversation value.
2. Be recorded as a correction so dependent decisions can be audited.
3. Reevaluate intent, service resolution, conditional fields, completion, escalation, and next steps affected by the change.
4. Preserve unrelated confirmed information.
5. Stop questions that are no longer relevant and activate newly relevant questions only when necessary.
6. Appear accurately in the final handoff, without presenting the superseded value as current.

The engine should acknowledge corrections plainly and without defensiveness.

## Failure Modes

### No Response

Use the channel's approved retry or closure behavior. Do not fabricate an answer or repeatedly send the same question. Preserve the last unresolved question and mark the conversation abandoned or incomplete when the channel rule is reached.

### Partial Response

Record the usable part, identify only the material missing portion, and ask a focused follow-up if still necessary. Do not require the customer to repeat the entire answer.

### Repeated Misunderstanding

After a reasonable clarification attempt, stop the loop, acknowledge the difficulty, preserve both interpretations, and offer or initiate the approved human handoff.

### Contradictory Answers

Identify the specific conflict neutrally and ask for clarification when the customer can reasonably resolve it. If not, preserve both values as conflicting and escalate when the conflict affects safety, routing, commitments, or completion.

### Customer Frustration

Acknowledge the frustration, reduce questioning to the safe minimum, avoid defensiveness, and honor a request for human assistance. Do not prioritize form completeness over customer experience.

### Unsupported Request

Capture the customer's goal, explain that the active profile does not provide an approved service or answer, and use the configured human-review path without forcing a category.

### Missing Business Profile Configuration

Do not infer the missing rule or ask the customer to supply internal business policy. Restrict the affected response, preserve relevant inquiry context, and escalate through the validated missing-configuration path.

### Conflicting Business Profile Rules

Do not choose one rule silently. Stop the affected workflow, identify the configuration conflict for business review, communicate only safe confirmed information, and use the approved escalation destination.

## Stop Conditions

The engine stops selecting routine intake questions when:

- Completion criteria are satisfied.
- A blocking escalation is active.
- The customer requests a human.
- The customer ends or abandons the interaction.
- Remaining information is optional, irrelevant, declined, or safely deferred.
- Missing or conflicting configuration prevents a valid next question.

Stopping questions does not mean abandoning the conversation. The engine still confirms status, preserves useful context, explains the approved next step, and closes professionally when possible.
