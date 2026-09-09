# Sprint 10.1 Fictional Scenario Pack

Package version: `sprint-10.1-materials-v1`.
Materials only. Participant evaluation has not started. No session is authorized.
Moderator-only: do not show this document to participants. Show only the current
section of [participant cards](participant-cards.md). Use the
[runbook](moderator-runbook.md), [feedback/severity rubric](feedback-and-severity.md),
and [blank templates](evidence-templates.json).

## Common Fixture and Scoring Rules

All scenarios use Friendly Home Services, profile `friendly-home-services`,
version 1, local `/prototype`, Fixture-backed deterministic mode. Jordan Example,
North Harbor, Maple Glen, and every request below are invented. Contact method
is the literal fictional preference `Fictional written follow-up`, never a real
email address or telephone number. No optional date, price or availability is supplied.

This fixture matches exact service names/aliases, not arbitrary natural-language
intent. Each card supplies an initial note to make the starting condition
repeatable; this limits conclusions about language understanding. Missing-input
coverage means asking for omitted required fields, not interpreting an invented
"I don't know" as missing; the current text fields would accept that as text.
F02 covers ambiguous service choice, F03 reopened clarification, F04 unsupported
scope, F05 prevented empty input, and F06 handoff comprehension/reset.

Score system correctness separately from participant independent completion.
Never manufacture a PASS because expected behavior is written here. Do not expose
rubrics or give command syntax during an unassisted attempt. A procedural hint
means assisted completion, even if the system later behaves correctly. Record
fail, blocked, incomplete or not observed explicitly; no skipped denominator.
The [Sprint 10 thresholds](../../SPRINT_10_PLAN.md) remain unchanged.

Canonical moderator-only preparation, used later in authorized rehearsal/sessions:
reset, send `project help`, `Jordan Example`, `Fictional written follow-up`,
`A fictional room needs routine project review.`, then `North Harbor`, one at a
time. This should reach confirmation without a handoff. For completed-handoff
setup, then send `confirm`. Perform setup while the participant cannot watch;
do not seed SQL, edit state, use developer tools, or replay evidence. A mismatch
is setup failure, not permission to improvise. These instructions were not run
as a human rehearsal in 10.1.

## F01 — Straightforward Intake with Missing Details

- **Scenario ID:** F01.
- **Context:** Jordan Example wants a routine fictional home-project review from Friendly Home Services.
- **Participant goal:** Complete the request using only the supplied invented facts.
- **Starting information:** Fresh fixture; opening note `project help`; name Jordan Example; contact preference Fictional written follow-up; description A fictional room needs routine project review.; area North Harbor.
- **Intentionally omitted:** Opening note contains no name, contact preference, description or area. Those facts are available on the card but not prefilled in the application. Price, booking date and actual contact details are absent entirely.
- **Expected clarification:** Ask the still-missing required fields in profile order: customer-name, contact-method, project-description, service-location. No completion before those facts and confirmation.
- **Correction opportunities:** Participant can review before confirmation; no staged change in this task. Record spontaneous corrections separately; F03 is the standardized change test.
- **Escalation/handoff conditions:** Supported service plus confirmed required facts permits the visible derived handoff only. No dispatch or booking is performed.
- **Expected outcome:** Home Project Consultation, four accurate supplied facts, confirmation, visible handoff and no invented commitments.
- **Prohibited assumptions:** Do not infer name/contact from participant identity, fill missing facts, invent dates/prices, or count free-form service parsing as supported.
- **Moderator notes:** Show F01 card only. Start timing when the participant has read it and says ready; stop at visible handoff. Observe whether questions and next steps are understood, not just whether text can be copied. At 10 minutes record the threshold miss before any assisted continuation.
- **Pass/fail criteria:** Individual independent success requires handoff within 600 seconds with zero procedural help and all supplied confirmed facts correct. Any skipped requirement, wrong fact or premature handoff is a functional failure. Cohort gate: at least 4/5 independent successes; 100% of reviewed handoffs correct. Record which fields were requested rather than inferring clarification quality from completion alone.

## F02 — Ambiguous Consultation Request

- **Scenario ID:** F02.
- **Context:** Jordan Example initially calls a routine home-project review a consultation; the profile offers two services with that alias.
- **Participant goal:** Make the request describe the intended home-project review.
- **Starting information:** Fresh fixture; opening note `consultation`; actual need is a routine home-project review, not a seasonal visit; the same invented name/contact/description/area as F01 are available if needed.
- **Intentionally omitted:** No exact configured service name in the opening. No seasonal property notes, date, price or real contact information.
- **Expected clarification:** Present both Home Project Consultation and Seasonal Home Check-In and request an exact choice before intake; do not guess from the alias alone.
- **Correction opportunities:** Resolve the ambiguous request by choosing the matching offered service. Do not introduce a mid-intake service switch: that is not a fixture capability under test.
- **Escalation/handoff conditions:** Clarification is not escalation. No handoff is expected at the scoring checkpoint. Once a valid exact choice is made, the usual required-field intake may begin.
- **Expected outcome:** No premature selection; intended Home Project Consultation resolves and asks for the next required fact.
- **Prohibited assumptions:** No automatic preference, invented third service, commitment or hidden use of participant business context.
- **Moderator notes:** Stop the scored interaction at the next required question after selection; ask Q04 and Q06 without naming the right answer. A wrong exact service chosen by the participant is distinct from a system inventing a service.
- **Pass/fail criteria:** System pass requires both candidates, no pre-choice resolution, and correct resolution of the supplied exact choice. Individual comprehension pass requires identifying that the opening could mean more than one service and describing the next requested information without a hint. Cohort gate: at least 4/5 explain clarification and next step. Record wrong/absent resolution as functional failure; inability to choose as usability evidence.

## F03 — Changed Location and Reconfirmation

- **Scenario ID:** F03.
- **Context:** Jordan Example's fictional project was described for North Harbor; the correct area is now Maple Glen.
- **Participant goal:** Change the location and finish the request using the updated information.
- **Starting information:** Moderator prepares a fresh fixture to confirmation using the canonical sequence, without final confirmation. Participant sees their invented original facts and the F03 update card. All other facts stay the same.
- **Intentionally omitted:** No correction command, field identifier or expected response on the card. No new service, contact detail, date or price.
- **Expected clarification:** The existing syntax `correct service-location: Maple Glen` reopens service-location and asks What is the corrected fictional service location? The answer Maple Glen restores confirmation; final confirm produces handoff. A natural-language correction may produce command guidance; observe that limitation rather than promising understanding.
- **Correction opportunities:** This is the staged correction task. Old North Harbor may remain in correction history, but must not be the current confirmed location or final handoff fact.
- **Escalation/handoff conditions:** No handoff while the corrected field is unresolved. Updated confirmation is required; no external action.
- **Expected outcome:** Final visible handoff location Maple Glen; name, contact preference, description and service unchanged.
- **Prohibited assumptions:** No silent acceptance of unconfirmed changes, command coaching, wiping unrelated facts, treating historical old values as current, or inventing availability for the new area.
- **Moderator notes:** Start the 600-second timer after hidden setup, when the card is read and participant says ready. Preparation time is separate. Do not point out field IDs or type the command for them. If they confirm the old value prematurely, score the attempt as unsuccessful; any fresh attempt is a separately labeled retest.
- **Pass/fail criteria:** Individual independent success requires correct updated handoff within 600 seconds and zero procedural help. System pass requires reopened clarification, no early handoff, and preservation of unaffected facts. Cohort gate: at least 4/5 independent successes and 100% correct reviewed handoffs; confusing command syntax remains reportable even when eventual completion passes.

## F04 — Unsupported Request and Human Review

- **Scenario ID:** F04.
- **Context:** Jordan Example has a purely imaginary spaceship-detailing request; no such service is configured for Friendly Home Services.
- **Participant goal:** Ask for the invented service and determine what to do next.
- **Starting information:** Fresh fixture; opening note `spaceship detailing`. No further project facts are needed for this boundary probe.
- **Intentionally omitted:** No configured service match, quote, booking date, urgency, actual contact details or payment data.
- **Expected clarification:** Unsupported-service explanation and human-review status, not an attempt to force this into an unrelated supported service. Routine intake pauses.
- **Correction opportunities:** No staged change. A participant may recognize the mismatch; do not rescue the task by substituting a supported service during scoring.
- **Escalation/handoff conditions:** Escalation stage; unresolved service and no routine completed handoff. The human-review indicator is not a sent message or accepted job.
- **Expected outcome:** Request preserved as unsupported; no invented service; participant can explain that a person must review the request.
- **Prohibited assumptions:** No arbitrary emergency detection claim, autonomous quoting, real dispatch, service substitution, or demands for sensitive information. Do not add a real emergency or complaint story.
- **Moderator notes:** Observe the escalation message/status, ask Q04/Q06, then end the task. Do not interpret the absence of a completed handoff as failure here. Prompt injection and real-data probes are not participant tasks.
- **Pass/fail criteria:** System pass requires unresolved service, human-review status, no routine handoff and no external-action claim. Individual comprehension pass requires describing the human-review next step without help; at least 4/5 must do so. Invented commitment or release is a safety/boundary failure and immediate stop; ordinary inability to explain is usability evidence.

## F05 — Empty Input Boundary and Recovery

- **Scenario ID:** F05.
- **Context:** Jordan Example begins the same fictional project request but has not entered an opening message.
- **Participant goal:** Try continuing with no written request, then continue with the supplied fictional note.
- **Starting information:** Fresh fixture and F05 card with `project help`, Jordan Example, Fictional written follow-up, the F01 description and North Harbor as reference facts.
- **Intentionally omitted:** First attempt contains no service text; no personal information, date or contact identifier is supplied.
- **Expected clarification:** Browser Submit is disabled for blank/whitespace input; entering valid text enables it and begins the usual name question. No visible session-API error is expected because the browser prevents submission.
- **Correction opportunities:** Replace empty input with the supplied note. This is input recovery, not a state correction.
- **Escalation/handoff conditions:** Empty input causes neither escalation nor handoff. Stop after valid request resolution and the next required question.
- **Expected outcome:** No blank message retained or state change; supplied valid request can proceed without a reload or reset.
- **Prohibited assumptions:** Do not bypass controls using developer tools, claim an empty-input error was displayed, force oversized input beyond the browser limit, or count an empty input as a valid request.
- **Moderator notes:** Observe button state and retained messages; no screenshot or raw-state capture. The task card asks for the attempted action, not its expected result. Ask Q02 and Q04 after the attempt.
- **Pass/fail criteria:** System pass requires no blank submission/progress change and enabled valid recovery. Record completion, confusion and help for all 5 participants; no new cohort percentage is introduced. Any accepted empty operation or broken valid recovery is a functional failure; an unclear disabled control is separately classified usability evidence.

## F06 — Handoff Understanding and Fresh Start

- **Scenario ID:** F06.
- **Context:** Jordan Example's fictional home-project request has a completed visible summary in North Harbor, awaiting fictional human follow-up.
- **Participant goal:** Review the request, explain what happens next, and begin a separate request.
- **Starting information:** Moderator resets and prepares a new completed handoff with the canonical sequence; do not reuse a failed prior task. The participant card includes the original invented facts for comparison.
- **Intentionally omitted:** No explanation of the correct next-step answer, dispatch result, booking confirmation, price, or reset instructions on the card.
- **Expected clarification:** Participant explanation is elicited by neutral feedback questions. No new receptionist intake is expected until a fresh start. Reset should clear old facts and show the initial prompt.
- **Correction opportunities:** Ask the participant to compare summary against card facts, but do not ask for post-handoff editing; that is not supported. Record noticed discrepancy without correcting it during the score.
- **Escalation/handoff conditions:** The displayed handoff is derived evidence only. No delivery, acknowledgement, scheduling or customer response has occurred.
- **Expected outcome:** Participant identifies service/location and remaining human work, gives an unprompted next-step explanation and usefulness rating, then starts a clean fixture request without old facts.
- **Prohibited assumptions:** No treating a displayed summary as sent/received, equating a preference to a booking, claiming durable recovery, or copying prior facts into the new request.
- **Moderator notes:** Ask Q04/Q06/Q08 before explaining anything. Record prior briefing as a limitation: this measures understanding/retention of a disclosed fictional boundary, not spontaneous discovery that a live service is unavailable. Observe fresh-start interaction after ratings.
- **Pass/fail criteria:** All 5 must explain fictional status, human follow-up and that nothing was sent. At least 4/5 rate usefulness >=4/5 and identify service, current location and human work. Reset correctness is absolute: zero prior facts/handoff after reset. Separate a wrong participant belief from an actual misleading system claim; correct unsafe misunderstanding after scoring and stop if the boundary is uncertain.
