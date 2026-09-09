# Sprint 10: Moderated Fictional Customer Evaluation

## Status and Authority

Sprint 10 is Started. Milestone 10.0 is Complete: Evaluation Scope, Plan, and
Acceptance Gates. Milestone 10.1 is Complete; 10.2 is INCOMPLETE / NOT_READY;
10.3–10.5 are Not Started. Automated entry checks and dependency remediation
are complete, but every human/manual rehearsal gate remains pending. See the
[automated entry review](SPRINT_10_2_AUTOMATED_ENTRY_REVIEW.md).
Participant evaluation
has not started. Completed preparation authorizes materials and documentation
verification only; it does not authorize internal rehearsal or participant sessions.

Sprint 9 is COMPLETE; Milestone 9.9 is CERTIFIED at `96d205c`. Its final
advancement recommendation is YES for consideration of a separately approved
controlled evaluation. This historical readiness result is not current session
permission and is not a production recommendation.

| Capability | Current preparation decision |
| --- | --- |
| Planning and documentation verification | Authorized |
| Participant evaluation | Not authorized |
| Production deployment | Not authorized |
| Real customer/business data | Not authorized |
| Real provider/channel integration | Not authorized |
| Production authentication | Not authorized |
| Unsupervised operation | Not authorized |
| External actions/customer response release | Not authorized |

## Purpose

Determine whether small-service-business owners/staff can understand the
existing fictional intake workflow and whether its derived handoff is useful
for human follow-up. Collect formative evidence before choosing more product
implementation. A small sample cannot establish market demand or production readiness.

## Scope and Non-Goals

Scope is one existing fictional Business Profile, the deterministic fixture
conversation, supervised local browser tasks, sanitized manual observations,
internal rehearsal, bounded findings, and a separate next-step recommendation.

Production deployment, real customer data, real business configuration, real
provider integrations, phone/SMS/email sending, production authentication,
protected data, public APIs, unsupervised operation, remote/public hosting,
external actions, handoff dispatch, telemetry export, recordings, and unrelated
features are prohibited. No participant recruitment or session occurs in 10.0 or 10.1.
No dependencies, migrations, runtime wiring, or application behavior change is required.

## Evaluation Surface Decision

Decision A: the existing deterministic fixture interface is sufficient for the
first evaluation. Use `/prototype`, Fixture-backed deterministic mode, on a
moderator-controlled local machine using loopback only. Use a local production
build for rehearsal/sessions; this is not deployment. No public tunnel or remote
participant access. Select and reset fixture mode before each scenario.

Inspection evidence:

- [PrototypeChat](../components/prototype/PrototypeChat.tsx) creates
  `createPrototypeChatSession`, defaults to fixture mode, and renders bounded
  progress, errors, conversation read models, and a derived handoff.
- [PrototypeChatSession](../src/prototype-ui/prototype-chat-session.ts) owns
  process-local fixture sessions, ordered questions, explicit correction syntax,
  confirmation, unsupported-service escalation, reset, 500-character input and
  100-message retention bounds. Refresh/restart loses this session by design.
- Durable mode renders `DurableActivatedBoundary`: runtime not connected, no
  fixture fallback. It is not a browser persistence integration.
- [Durable turn/restart](../src/application/end-to-end/durable-turn-and-restart.ts)
  and PostgreSQL coordinators provide backend atomic state/evidence and pinned
  recovery contracts. [Existing experience verification](../src/verification/internal-fictional-mvp-experience.verify.ts)
  covers fixture completion/correction and the disconnected UI boundary; it
  does not prove a durable participant browser workflow.

Decision B is not selected. No durable-browser milestone is a prerequisite.
Persistence, restart recovery, configuration activation, free-form AI language
quality, arbitrary knowledge Q&A, and real delivery are outside participant
claims. Existing backend regressions remain applicable engineering evidence.
If research later requires durability, return to explicit scope planning before
building or exposing it; do not turn on the disconnected mode as a workaround.
The developer labels, field IDs, debug-style panels, and command-based correction
are study limitations to observe, not a reason to redesign the interface now.

## Participant Model and Moderator Responsibilities

Plan a first cohort of 5 adult small-service-business owners/staff from at least
2 service-business categories. This is a formative convenience sample, not a
statistical validation. Everyone role-plays the same fictional business; no
participant's actual business configuration is entered. Fewer than 5 completed
sessions means insufficient evidence, not a relaxed passing threshold.

Curt Vance is assigned as moderator and evidence/cleanup owner for Sprint 10.1
materials and Sprint 10.2 internal rehearsal, as explicitly confirmed by the
project owner. This assignment does not start rehearsal or participant sessions.
The project owner approves scope and any later session authorization in 10.2/10.3.
One person may fill multiple roles, explicitly recorded. Internal rehearsals
do not count as participant sessions. Necessary observers must be named and
bound to the same restrictions. No public, anonymous, unattended, or real-customer use.

The moderator briefs participants that this is fictional deterministic software,
obtains voluntary verbal agreement before interaction, explains withdrawal and
data prohibitions, supplies invented task values, verifies local scope, records
help given, stops unsafe activity, and resets/cleans up. No persuasion to continue.
Participation consent is procedural; it is not product authentication.
Scheduling/contact arrangements remain outside the app and repository using
owner-approved arrangements; this plan creates no participant directory or outreach authority.

## Fictional Scenarios

Use only the existing Friendly Home Services profile and invented values such
as Jordan Example, Fictional written follow-up, North Harbor, and Maple Glen.
The exact task cards and expected observations are prepared in 10.1 and must
still be rehearsed in 10.2. See the [scenario pack](evaluation/sprint-10/scenario-pack.md)
and [participant cards](evaluation/sprint-10/participant-cards.md).
Do not use realistic contact identifiers, private addresses, emergencies, or
actual participant stories. Criteria map to [the test plan](SPRINT_10_TEST_PLAN.md).

| Scenario | Task | Expected observation |
| --- | --- | --- |
| F01 | Request project help; enter invented required fields; confirm | Ordered intake and accurate visible handoff without promises or dispatch |
| F02 | Request consultation, then choose one exact offered service | Ambiguity is explained; no invented service selection |
| F03 | Correct service-location from North Harbor to Maple Glen at confirmation | Latest correction is preserved through reconfirmation and handoff |
| F04 | Ask for an unconfigured fictional service, such as spaceship detailing | Unsupported request is preserved for human review; routine intake pauses |
| F05 | Attempt blank input; recover with the supplied valid fictional task | Submit remains disabled for blank/whitespace input; valid input enables it; prior progress preserved |
| F06 | Explain handoff, next human responsibility, and reset to a fresh scenario | Participant understands nothing was sent; previous session is cleared |

## Measurable Acceptance Criteria

Thresholds are proposed study gates, not already observed results. Freeze them
and task cards before the cohort; any change requires a new version and rerun,
never retrospective threshold adjustment. Record integer counts as well as rates.

- All 5 participants attempt F01–F06. Withdrawal is allowed; incomplete sessions
  are recorded as incomplete and cannot be silently removed to improve scores.
  Recruit replacement sessions only under the same approved protocol.
- Usability: at least 4 of 5 complete F01 and F03 within 10 minutes each without
  moderator procedural help beyond the initial task card. Record help separately.
- Comprehension: at least 4 of 5 explain the F02/F04 next step; all 5 must explain
  that the F06 handoff is fictional, requires human follow-up, and was not sent.
- Handoff usefulness: at least 4 of 5 rate clarity/usefulness at least 4 on a
  fixed 1–5 scale and identify service, latest location, and remaining human work.
- Reliability: 100% of reviewed handoffs match supplied confirmed facts and
  latest corrections; zero unhandled crashes, duplicate committed submissions,
  cross-scenario retained facts after reset, or unintended state loss during a task.
- On the declared rehearsal device, measure at least 20 valid submissions from
  submit activation to stable visible result; nearest-rank p95 must be <= 1000 ms.
  This is a local responsiveness budget, not production capacity evidence.
- Accessibility: no blocking keyboard, focus, status/error announcement, 200%/
  400% reflow, screen-reader, forced-colors, contrast, text-spacing, or touch-target
  issue in the declared browser/device matrix. Human reviews are required.
- Safety: zero prohibited data retained, external transmissions/actions,
  misleading delivery claims, or bypassed stop conditions. Any critical/high
  safety, reliability, or accessibility finding blocks advancement.

## Data and Evidence Collection

Record only session code (for example P01, without an identity key), UTC date,
commit/build and protocol version, fictional profile/version, device/browser,
scenario ID, expected/observed outcome, pass/fail/blocked/incomplete, elapsed time,
help count, rating, sanitized observation, issue ID/severity/owner, review status,
and cleanup deadline/result. No names, contact details, identifying business
details, demographics, transcripts, screenshots, audio/video, prompts, raw state,
journals, credentials, or verbatim participant stories in research evidence.
Record verbal agreement as yes/no without identity or signature.

10.1 defines [blank evidence templates](evaluation/sprint-10/evidence-templates.json),
[neutral feedback and severity rules](evaluation/sprint-10/feedback-and-severity.md),
and a [moderator runbook](evaluation/sprint-10/moderator-runbook.md), not fabricated
PASS records. Keep notes in an owner-approved local access-controlled folder
outside the repository and cloud synchronization. Only the named moderator and
evidence owner may access session notes. Only reviewed, de-identified aggregate
findings and fictional reproduction steps may enter repository documentation.
This is manual research evidence, not new application telemetry or database storage.

Research notes remain subordinate and non-replayable: they grant no state,
configuration, identity, deployment, customer-response, or external-action authority.
Do not mislabel external feedback as an automated test or automatic Sprint 9
release-gate input. Runtime/identity policies remain disconnected and unchanged.

## Evidence Freshness

Required entry evidence must reference the exact candidate commit and protocol,
be no more than 7 days old at session start and final review, and never be
future-dated. This matches the Sprint 9 gate's 7-day maximum age; its verifier's
fixed September 5 clock is synthetic evidence, not live session approval.

Missing, stale, failed, blocked, contradictory, duplicate, or unknown-classification
evidence fails closed. A relevant source/configuration/protocol/environment change
invalidates affected evidence immediately even inside 7 days. Rerun affected
checks and human reviews; preserve previous results as history. Check scope,
consent, incident status, and environment again immediately before each session.
Older cohort observations remain historical findings, not current acceptance;
retest affected scenarios or mark the decision insufficient if freshness expires.

## Retention and Cleanup

Reset between scenarios and participants; at session end close the dedicated
browser session, remove clipboard/task remnants and temporary downloads, and
confirm no prior facts are visible after reopening. Browser memory reset is not
a claim of forensic erasure. No recording or transcript export is permitted.

Delete individual sanitized session notes within 7 days of collection, after
reviewing aggregate findings where possible; deadlines cannot be extended merely
because analysis is late. Delete immediately on withdrawal while identifiable
by the participant's session code. Keep only de-identified aggregate findings
and fictional defects in repository history. Do not commit individual notes:
Git history is unsuitable for temporary research-data retention.

The named cleanup owner records date, artifacts checked, deletion result, and
any exception without copying content. Unknown cleanup blocks the next session
and final exit. If prohibited data is entered, stop, avoid copying it, close/reset
the surface and remove accidental notes under owner review before any resumption.
No database is connected; no database cleanup/restore is part of this study.

## Stop Conditions

Stop immediately for suspected real/protected data, unintended external traffic
or release, wrong environment/mode, prior participant facts, bypassed isolation,
crash/corruption, inaccessible essential interaction, participant distress or
withdrawal, missing moderator, or uncertainty about scope, consent, or cleanup.
Record only a sanitized issue; no automatic remediation or retry. Moderator
blocks further sessions until the owner reviews the cause, affected evidence is
renewed, and an explicit resume decision is recorded. Critical/high findings
require correction and retest; medium/low findings require owner disposition.

## Entry and Exit Gates

10.0 entry: Sprint 9 certification inspected and planning explicitly requested.
10.0 exit: reconciled statuses, surface decision, milestones, criteria, TODO
classification, test plan, deterministic document verifier, lint, TypeScript,
build, affected regressions, and clean diff checks pass. No session is an exit requirement.

Before 10.3: 10.1 materials and named owners complete; 10.2 internal rehearsal,
fresh technical/manual evidence, frozen cohort protocol, environment check,
consent/withdrawal process, cleanup rehearsal, and stop drill pass; no unresolved
critical/high finding. The owner must separately authorize the exact cohort,
surface, commit, protocol, dates, and moderator. A passing document verifier or
Sprint 9 YES cannot substitute for that decision. No protected-data exception.

Sprint exit at 10.5: cohort/evidence completeness and every acceptance criterion
assessed, findings traceable, required remediation/retests complete, cleanup
confirmed, and a binary next-step recommendation with limitations published.
If any threshold fails or evidence is insufficient, report NO and the owning
remediation task; do not certify evaluation success. Process completion and
successful outcomes must be reported separately. No outcome authorizes launch.

## Sprint 10.1 Acceptance Criteria

10.1 prepares materials only. Package `sprint-10.1-materials-v1` must contain all
six F01–F06 specifications with context, starting/omitted facts, expected
clarification, correction and escalation, outcomes, prohibitions, moderator
notes and pass/fail criteria. Separate task cards must omit system answers,
command syntax and success coaching. The runbook must include setup, named
roles, consent, neutral presentation, observation/intervention, severity,
safety stops, termination, cleanup and reset. Templates must be blank reusable
records, with no participant evidence, fabricated results or real customer data.

F03 begins from a fresh moderator-prepared confirmation screen; F06 begins
from a fresh moderator-prepared handoff. Preparation is hidden from participants
and excluded from task timing; the 600-second F01/F03 thresholds are unchanged.
This defines consistent starting conditions without adding state-injection code
or requiring success on an earlier task. Rehearsal and protocol freeze remain 10.2.

Completion requires `verify:sprint-10-materials`, `verify:sprint-10-planning`,
lint, TypeScript, build, affected regressions and diff checks to pass. The
materials verifier checks missing fields, nonblank evidence and status drift,
plus representative automated fixture behavior. It does not certify human
usability, consent, measured latency, cleanup or a completed evaluation session.

## Milestone Sequence

Each milestone depends on the previous exit and separate authorization.

| Milestone | Name | Status | Deliverable and exit |
| --- | --- | --- | --- |
| 10.0 | Evaluation Scope, Plan, and Acceptance Gates | Complete | This plan, test plan, reconciliation, and deterministic documentation check |
| 10.1 | Scenario Pack and Moderator Runbook | Complete | Versioned task cards, blank evidence/rating templates, named owners, consent wording, environment and cleanup/stop instructions; reviewed against fixture behavior; cohort freeze after 10.2 rehearsal |
| 10.2 | Internal Rehearsal and Evaluation Entry Review | INCOMPLETE / NOT_READY | Automated entry checks and bounded dependency remediation complete; manual rehearsal, accessibility/usability, timing, stop/cleanup confirmation and final entry review remain pending; no participant sessions |
| 10.3 | Separately Authorized Moderated Evaluation | Not Started | Only after explicit cohort authorization, execute F01–F06; preserve sanitized actual results and cleanup evidence; stop rules enforced |
| 10.4 | Findings, Bounded Remediation, and Retest | Not Started | Rank findings against thresholds; separately authorize only demonstrated fixes; rerun affected regressions and explicitly authorized participant retests; if no fixes needed, document that result |
| 10.5 | Evaluation Certification and Next-Step Recommendation | Not Started | Audit outcomes, evidence freshness, limitations and cleanup; report PASS/FAIL/insufficient per criterion and binary YES/NO recommendation, with no launch authority |

## TODO Classification

| Scaffold | Classification | Rationale |
| --- | --- | --- |
| `src/validation/output-validator.ts` | Obsolete/removable later | Unused interface; current AI prototype uses `PrototypeProposalValidator` and application/domain validators. Not required before fixture evaluation. |
| `src/conversation/context-builder.ts` | Obsolete/removable later | Unused interface; current paths use `PrototypeContextPackageBuilder` and activated context/grounding boundaries. Not required before fixture evaluation. |

Leave both source files unchanged in 10.0. Removal is a later explicit cleanup
with a fresh reference/export audit; classification is not authorization to
delete them or evidence that production validation is complete.

## Risks and Open Decisions

Curt Vance is assigned for materials and internal rehearsal. Exact cohort/date,
device/browser matrix, local notes location and deletion-request method remain
10.2 entry decisions. Versioned task wording is prepared in 10.1 and must pass
rehearsal before cohort freeze; these later decisions do not block material preparation.
Command syntax and developer panels may limit novice comprehension. The sample
is small, one fictional profile cannot establish cross-industry correctness,
and mock behavior cannot demonstrate provider quality or live-call outcomes.
Do not add features to conceal those limitations. Threshold changes and durable
integration needs return to explicit planning, not silent scope expansion.

## References

- [Sprint 9 certification](certification/SPRINT9_CERTIFICATION.md)
- [Sprint 9 recommendation](SPRINT_9_RELEASE_RECOMMENDATION.md)
- [Controlled-evaluation boundary](CONTROLLED_EVALUATION_BOUNDARY.md)
- [Sprint 10 test plan](SPRINT_10_TEST_PLAN.md)
- [Customer discovery](CUSTOMER_DISCOVERY.md)
