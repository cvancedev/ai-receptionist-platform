# Conversation State

## Purpose

Conversation state is the conceptual record the Conversation Engine maintains so it can preserve context, avoid repetition, handle corrections, and produce an accurate handoff. This document defines meaning and lifecycle behavior, not a storage model, database schema, API contract, or implementation type.

## Evidence Classes

Every material piece of conversation information must retain its evidence class.

- **Confirmed fact:** Information explicitly confirmed by the customer or supplied by the active validated Business Profile. Customer confirmation establishes the conversation record; it does not imply independent verification.
- **Customer claim:** Information directly stated by the customer but not yet confirmed where confirmation is material.
- **Inference:** A tentative interpretation derived from context. It may guide a clarification question but cannot be presented or handed off as confirmed.
- **Assumption:** An unsupported placeholder or guess. It must not guide a customer answer, service resolution, commitment, or completion decision.
- **Unknown:** Information not provided, not understood, declined, unavailable, or intentionally deferred. It must remain visible as unknown when relevant.

The engine must never promote an inference or assumption into a confirmed fact without customer confirmation. Approved Business Profile information may be treated as confirmed business context only within its active version and stated scope.

## Conversation Metadata

- **Conversation identifier:** A unique reference for the interaction.
- **Business Profile identifier:** The business configuration associated with the conversation.
- **Active profile version:** The exact validated version governing the interaction.
- **Channel:** The communication channel and its approved constraints.
- **Start time:** When the interaction began, interpreted using appropriate time context.
- **Last activity:** The most recent meaningful customer or engine activity.
- **Current lifecycle state:** The engine's current conceptual stage.

The active profile version must remain attributable throughout the interaction and handoff. A later profile change must not silently rewrite what governed an earlier conversation.

## Customer Information

- **Confirmed information:** Customer details explicitly verified for current use.
- **Unconfirmed information:** Direct customer claims or tentative interpretations still needing clarification when material.
- **Corrected information:** Prior values replaced by the customer's correction, with the current value clearly authoritative.
- **Missing required information:** Required profile fields that are unknown, declined, incomplete, or deferred to a human.

Correction history exists to prevent reliance on superseded information. The final summary should show the current corrected value and mention prior information only when the change itself matters to the handoff.

## Intent and Service

- **Stated customer intent:** The customer's reason for contact in their own words.
- **Candidate services:** Active configured services that may fit, each still unresolved.
- **Resolved service:** The active configured service confirmed as applicable, when service resolution is required.
- **Confidence status:** Resolved, probable, ambiguous, unsupported, or conflicting.
- **Unresolved ambiguity:** The specific distinction or missing information preventing resolution.

A probable service remains a candidate until confirmation or sufficient direct evidence resolves it. An unsupported request must not be forced into the nearest configured service.

## Intake Progress

- **Required fields completed:** Required fields with acceptable confirmed values.
- **Optional fields completed:** Optional context supplied without pressure.
- **Conditional fields triggered:** Fields made applicable by an explicit profile rule and its triggering evidence.
- **Questions already asked:** Questions or information requests already presented to the customer.
- **Questions skipped:** Irrelevant, already answered, optional-declined, or intentionally deferred questions, with the applicable reason.
- **Answers requiring clarification:** Responses that are incomplete, contradictory, ambiguous, or dependent on confirmation.

Question history prevents repetition. A corrected answer may reopen a dependent question, but the engine must explain the specific need rather than repeat a generic prompt.

## Knowledge and Boundaries

- **Business knowledge used:** Approved knowledge relied on in a customer-facing answer, attributable to its business, source, version, lifecycle status, and effective context at use time.
- **Unknown information:** Questions the active profile and conversation evidence cannot answer.
- **Conflicting information:** Customer or profile information that cannot safely be reconciled.
- **Statements requiring human review:** Pricing, scheduling, policy, safety, exception, or other matters outside approved authority.

Unknown or conflicting information must not be hidden by a confident tone. It must cause clarification, an honest limitation, or escalation according to applicable rules.

Conversation knowledge remains scoped to the current interaction. Customer statements and corrections do not alter permanent business knowledge without separate business review and approval.

## Escalation State

- **Escalation required:** Whether a universal or business-configured trigger is active.
- **Escalation reason:** The specific safety, authority, uncertainty, complaint, human-request, or configuration reason.
- **Priority:** The applicable profile-defined or platform-required urgency indicator.
- **Destination:** The validated human destination for the trigger.
- **Context preserved:** The information, emotional context, outstanding questions, and requested outcome needed for continuity.

Once escalation is required, the engine may gather only safe, relevant handoff context. It must not continue routine intake merely to make the record appear complete.

## Completion State

### Initialized

The conversation has a valid active profile, channel context, and starting state but intent discovery has not begun.

### Discovering Intent

The customer is explaining the reason for contact and the engine is preserving their words before narrowing.

### Resolving Service

The engine is comparing a service-related request only with active configured services.

### Gathering Information

Required universal, service-defined, and triggered conditional information is being collected.

### Clarifying

A material ambiguity, contradiction, incomplete answer, or low-confidence interpretation is being resolved.

### Confirming

The engine is presenting its material understanding and accepting customer corrections.

### Ready for Handoff

Completion criteria are satisfied and the conversation can produce the configured handoff summary and approved next step.

### Escalated

A human-assistance condition is active and the context is being or has been routed through the approved path.

### Completed

The handoff or approved non-handoff outcome is recorded, the customer received a clear status, and no further engine question is required.

### Incomplete

The interaction ended with a known completion gap, but useful context and an approved partial or human follow-up status were preserved. Unlike abandonment, the engine reached a recognized close or handoff outcome.

### Abandoned

The customer left, timed out, or stopped responding before a normal completion or acknowledged escalation. Useful context and the last unresolved point remain preserved.

## Lifecycle Transitions

- **Initialized** moves to **Discovering Intent** after greeting and customer engagement.
- **Discovering Intent** may move to **Resolving Service**, **Gathering Information**, **Clarifying**, **Escalated**, or **Completed**, depending on intent.
- **Resolving Service** may move to **Gathering Information**, **Clarifying**, or **Escalated**.
- **Gathering Information** may move to **Clarifying**, **Confirming**, or **Escalated**.
- **Clarifying** returns only to the stage affected by the resolved issue or moves to **Escalated**.
- **Confirming** moves to **Ready for Handoff**, returns to an affected stage after correction, or moves to **Escalated**.
- **Ready for Handoff** moves to **Completed** after summary and approved close, or **Escalated** if a blocker appears.
- A nonterminal state may become **Incomplete** when the engine reaches an approved partial close or handoff with known gaps.
- Any nonterminal state may become **Abandoned** when the customer stops participating before a recognized close or handoff.
- Any state may move to **Escalated** when a safety trigger or direct human request occurs.

Terminal labels do not erase context. Completed, incomplete, escalated, and abandoned conversations retain the evidence needed for accountability and follow-up.

## State Integrity Rules

- Customer corrections override superseded values and trigger reevaluation of dependent state.
- Confirmed information must not be asked for again without a documented contradiction, correction, or changed dependency.
- Unknowns remain unknown; missing fields do not acquire default values from industry assumptions.
- Skipped and declined fields remain distinguishable from unanswered fields.
- Profile conflicts cannot be resolved by choosing a convenient rule.
- The final handoff must reflect the current evidence state, not an earlier draft of the conversation.
