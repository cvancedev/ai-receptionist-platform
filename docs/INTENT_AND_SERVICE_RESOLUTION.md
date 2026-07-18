# Intent and Service Resolution

## Purpose

Intent discovery identifies why the customer is contacting the business. Service resolution determines whether an active configured service applies. These are separate decisions: some intents require a service, while complaints, billing questions, existing matters, urgent concerns, and human requests may follow other configured paths.

The engine uses customer language and the active validated Business Profile. It never derives services or workflows from an industry label.

## Intent Discovery

The engine should begin with open-ended understanding. It lets the customer describe the situation in their own words, preserves volunteered information, and narrows only when a distinction changes the next safe action.

Platform-level interaction intents may include:

- **New service inquiry:** The customer is exploring or requesting a service.
- **Existing project or appointment:** The customer is contacting the business about work already discussed, scheduled, or underway.
- **General question:** The customer seeks approved information that may not require service intake.
- **Complaint:** The customer reports dissatisfaction, a service failure, damage, or another concern requiring accountable review.
- **Billing or payment question:** The customer asks about charges, payment, refunds, or account-specific financial matters.
- **Cancellation or change request:** The customer wants to alter an existing commitment or request.
- **Emergency or urgent concern:** The customer describes immediate danger, urgency, safety risk, or a time-sensitive situation.
- **Request for a human:** The customer directly asks for a person.
- **Unknown or unsupported request:** The engine cannot responsibly classify the request or the business has no approved path.

These categories describe interaction purpose, not industry-specific services. They guide appropriate intake, knowledge, escalation, or handoff behavior without granting business authority.

## Intent Evidence

- The customer's direct description is preserved as a customer claim.
- An interpreted intent remains an inference until sufficiently clear or confirmed.
- Material ambiguity is stated explicitly rather than hidden behind a category.
- A customer correction replaces the prior intent and triggers reevaluation of service and intake dependencies.
- Urgent, safety, complaint, payment-dispute, and human-request signals may require escalation before detailed intent resolution.

## Service Resolution

When the intent requires a service, the engine should:

1. Consider only services marked active in the profile version bound to the conversation.
2. Compare the customer's stated need with approved service names, descriptions, aliases, terminology, availability, and scope.
3. Reuse relevant confirmed information already present in state.
4. Identify one service, multiple candidates, multiple applicable services, or no supported service.
5. Ask one concise clarification question when the answer can materially distinguish viable candidates.
6. Confirm the resolved service when the match is not already explicit.
7. Preserve the customer's language alongside the configured service label.

The engine must not select an inactive service, create a new category, infer scope from the industry label, or force a low-confidence match.

## Confidence

### Resolved

The active configured service is explicit or confirmed, and no material competing interpretation remains.

### Probable

One active service appears most applicable, but a material point still needs confirmation. A probable service may guide a clarification question, not final service-specific claims or completion.

### Ambiguous

Two or more active services or paths remain reasonably possible. The engine should ask the smallest useful clarification or escalate when the distinction requires human judgment.

### Unsupported

No active configured service or approved workflow responsibly covers the request. The engine remains helpful, preserves the request, explains the limit honestly, and uses the configured human-review path when appropriate.

### Conflicting

Customer information, service definitions, aliases, availability, or profile rules point to incompatible outcomes. The engine must surface the conflict and clarify or escalate; it must not choose silently.

Confidence is conceptual and evidence-based. This architecture defines no numeric score or threshold.

## Multiple Services

### One Request Involving Multiple Services

When multiple active services jointly describe one customer outcome, the engine records each applicable service and uses profile-defined combined handling when available. Without an approved combined workflow, it gathers only safe shared context and escalates for coordination.

### Primary and Secondary Service

The primary service is the main driver of intake and next steps. A secondary service is recorded without allowing it to activate irrelevant questions. The customer should confirm the relationship when it affects routing or completion.

### Separate Requests in One Conversation

The engine preserves each distinct request with its own intent, service status, required information, uncertainty, and handoff need. Shared confirmed customer information should not be requested again. If the profile cannot support a combined handoff, the engine explains and routes appropriately.

### Service Changes During the Conversation

A customer may correct or change the requested service. The engine replaces the resolved service state, preserves the correction, reevaluates dependent conditional fields, retains still-relevant confirmed information, and stops asking questions that no longer apply.

## Non-Service Intents

Service resolution may be unnecessary for a general question, complaint, billing matter, cancellation, existing-project contact, or direct human request. The engine should follow the applicable profile and platform path without forcing a service selection merely to satisfy a standard intake sequence.

## Unsupported Requests

For an unsupported request, the engine should:

- Acknowledge what the customer is trying to accomplish.
- State that the active business information does not confirm an applicable service or approved answer.
- Avoid implying that the business can or cannot help beyond configured guidance.
- Capture only the context needed for the approved human review.
- Explain the constructive next step without promising acceptance, timing, or outcome.

An unsupported request is not a reason to abandon the customer or erase the opportunity.

## Escalation Conditions

Escalation is required when:

- The customer requests a person.
- Safety, urgency, complaint, legal, payment-dispute, or other universal rules require human attention.
- Ambiguity remains after a reasonable clarification attempt.
- Resolving the service requires an unsupported business judgment.
- Only inactive services appear relevant.
- Profile aliases, scope, availability, or workflows conflict.
- The request spans services without an approved combined path.
- The engine cannot preserve a truthful, constructive next step.

## Resolution Output

The conversation state should retain:

- The customer's stated intent in their own words
- The platform-level intent status
- Candidate active services considered
- Resolved primary and secondary services, when applicable
- Confidence status and unresolved ambiguity
- Clarification asked and customer correction history
- Unsupported or conflicting conditions
- Any escalation reason and destination

This output informs adaptive questioning and handoff; it is not itself a promise that the business will accept or perform the work.
