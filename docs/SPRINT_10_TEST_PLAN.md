# Sprint 10 Test and Evaluation Plan

## Status and Limits

Milestone 10.0 is Complete; participant evaluation has not started. This plan
defines checks, not session results. A documentation PASS cannot authorize
evaluation, production deployment, real customer data, real providers, or
unsupervised operation. [The Sprint 10 Plan](SPRINT_10_PLAN.md) owns scope,
acceptance thresholds, freshness, retention, stop conditions, and milestone gates.

## 10.0 Documentation Verification

Run `npm run verify:sprint-10-planning`. The verifier checks:

- final Sprint 9 YES/CERTIFIED statuses agree with certification/recommendation;
- 10.0 completion is preserved, current preparation statuses agree with the
  roadmap, and later execution milestones remain Not Started;
- required planning topics, fixture decision, exclusions, and TODO disposition;
- every participant scenario has a test-plan row and measurable observations;
- referenced local documentation/implementation files exist;
- the existing interface remains fixture-backed with a disconnected durable mode;
- the two scaffold interfaces remain unused by other source files; and
- the documented evidence window matches the application gate's 7-day constant.

It reads files and constants, performs no evaluation, starts no browser/server,
connects no database, and collects no participant evidence. Its npm wrapper
uses the existing TypeScript build directory, as do other repository verifiers.
It cannot establish actual human usability, live operational readiness, or consent.

## Required 10.0 Engineering Checks

```powershell
npm.cmd run verify:sprint-10-planning
npm.cmd run lint
npx.cmd tsc --noEmit --incremental false
npm.cmd run build
npm.cmd run verify:prototype
npm.cmd run verify:internal-fictional-mvp-experience
npm.cmd run verify:sprint-9-6-hardening
npm.cmd run verify:controlled-validation-gate
npm.cmd run verify:sprint-9-8-integrated
npm.cmd run verify:sprint-9-certification
git diff --check
```

Review the final diff for production-source, dependency, lockfile, migration,
route, and configuration changes. Only planning/status docs, a verification
source, and its package script are expected. No live PostgreSQL suite is required
for 10.0: no storage code changes and no durable evaluation surface is selected.
Build and `.prototype-build` outputs are local ignored artifacts, not deployment.

## 10.0 Verification Record — September 9, 2026

- PASS: `npm run verify:sprint-10-planning`, ESLint, non-incremental no-emit
  TypeScript, local production build, and `git diff --check`.
- PASS: conversation-state, intake-flow, prototype-chat-session,
  sprint-3-certification, internal-fictional-mvp-experience, sprint-9-6-hardening,
  controlled-validation-gate, sprint-9-8-integrated, and sprint-9-certification
  verifier entry points. These ran from the freshly compiled `.prototype-build`
  output of the shared TypeScript project, without recompiling for each entry.
- Local Markdown file links in the reconciled/planning documents passed the
  planning verifier's existence checks. This does not validate remote URLs.
- The first restricted-network build could not fetch existing Google Geist
  fonts; the build passed on retry with network access. No font or product code changed.
- No participant session, manual study review, new performance measurement,
  live PostgreSQL operation, or deployment was performed. Their later evidence
  remains pending where required; this record certifies planning checks only.
- Final change scope is documentation, one verifier, and one package script.
  No dependency, lockfile, migration, or application implementation changed.

## Sprint 10.1 Materials Verification

Milestone 10.1 is Complete. Package `sprint-10.1-materials-v1` is materials
only, with no human rehearsal or participant results. Run
`npm run verify:sprint-10-materials`, the 10.0 planning verifier, lint,
non-incremental TypeScript, build, affected prototype/experience/hardening and
Sprint 9 gate/integrated/certification regressions, and `git diff --check`.

The materials verifier requires all F01–F06 fields, separate non-coaching cards,
runbook steps, assigned roles, neutral questions/severity rules, local links,
blank template leaves, and status/authority boundaries. In-memory negative cases
must reject a missing field, fabricated result, missing scenario and leaked
correction syntax. Representative automated fixture checks confirm supported
setup, required questions, ambiguity, correction/reconfirmation, unsupported
escalation, blank API rejection and reset; static browser checks distinguish
disabled blank submission from an API error. These are engineering tests, not
human rehearsal, timing measurements, accessibility evidence or consent.

No application code, dependency, lockfile, schema or migration change is needed.
The previous planning verifier is updated only to allow the separately authorized
10.1 preparation status. Following separately authorized automated entry checks
and dependency remediation, 10.2 must remain INCOMPLETE / NOT_READY while manual
gates are pending; 10.3–10.5 must remain Not Started. Only after required
checks pass may 10.1 be marked Complete. Fresh manual/browser/latency and entry
evidence remain 10.2 work; no session is authorized by a documentation PASS.

See [scenario pack](evaluation/sprint-10/scenario-pack.md),
[cards](evaluation/sprint-10/participant-cards.md),
[runbook](evaluation/sprint-10/moderator-runbook.md),
[templates](evaluation/sprint-10/evidence-templates.json) and
[feedback/severity rules](evaluation/sprint-10/feedback-and-severity.md).

## 10.1 Verification Record — September 9, 2026

- PASS: `verify:sprint-10-materials` (document completeness, blank template state,
  negative cases and automated fixture contracts) and `verify:sprint-10-planning`.
- PASS: ESLint, non-incremental no-emit TypeScript, local production build and
  diff whitespace checks. Build used network access for existing Google fonts;
  no font, dependency or application behavior was changed.
- PASS: conversation-state, intake-flow, prototype-chat-session,
  sprint-3-certification, internal-fictional-mvp-experience, sprint-9-6-hardening,
  controlled-validation-gate, sprint-9-8-integrated and sprint-9-certification
  entry points, run from the freshly compiled shared TypeScript project.
- PASS: local link checks and final scope review. The only implementation-file
  changes are verification code and the added package script. Blank master
  templates contain no observed outcomes, consent, ratings or timings.
- No human rehearsal, participant session, manual accessibility check, new
  latency measurement, live PostgreSQL operation or deployment was performed.
  Curt Vance's role assignment is recorded; actual 10.2 entry evidence remains
  pending. These results certify material preparation only.

## Participant Scenario Matrix (10.3 Only)

10.1 prepares task cards using exact existing fictional fields and values;
10.2 rehearses them before an owner-authorized cohort can run in 10.3. The
moderator records actual outcomes, including failures and help, without coaching
to obtain PASS. Read the initial card uniformly; procedural hints count as help.

| Scenario | Procedure and expected result | Measurement |
| --- | --- | --- |
| F01 | Fresh fixture; project help; Jordan Example; Fictional written follow-up; invented project description; North Harbor; confirm; inspect handoff | Completion/time/help; all confirmed facts match, no dispatch; at least 4/5 independently complete within 10 minutes |
| F02 | Fresh fixture; consultation; choose exact Home Project Consultation or Seasonal Home Check-In when prompted | No invented choice; at least 4/5 explain why clarification is needed and next step |
| F03 | Reach confirmation; use correct service-location: Maple Glen; follow any repeated location question; reconfirm | Latest correction appears in handoff; at least 4/5 complete within 10 minutes without procedural help |
| F04 | Fresh fixture; spaceship detailing | Unsupported service preserved and human review shown; routine intake paused; at least 4/5 explain next step |
| F05 | Enter blank/whitespace; observe disabled Submit; enter the supplied valid fictional request | No blank message submitted, prior accepted progress unchanged, valid input enables Submit; record assistance and outcome for all 5 |
| F06 | Review fictional handoff, rate usefulness 1–5, explain human follow-up; reset | At least 4/5 rate >= 4 and identify required handoff information; all 5 understand nothing was sent; zero prior facts after reset |

Evaluate F01/F03 independently; a participant can fail one and pass the other.
F02 and F04 comprehension are scored separately against their stated thresholds.
Record all five attempts per scenario; incomplete/withdrawn sessions are visible
and never counted as successes. Keep first-attempt results separate from retests.
No test instructs the system to contact anyone, trigger a real emergency, accept
actual contact information, answer arbitrary knowledge questions, or persist a session.

[ChatWindow](../components/prototype/ChatWindow.tsx) prevents blank submission
and caps browser input at 500 characters. The session API's empty/oversized
error messages are tested internally; participant F05 must not claim to observe
an error that the browser prevents from occurring.

## Internal Reliability and Boundary Matrix (10.2)

| Check | Method/evidence | Passing condition |
| --- | --- | --- |
| Intake, clarification, correction, confirmation, escalation | Prototype and internal-fictional-MVP verifiers plus F01–F06 rehearsal | Exact facts and stages; required fields not skipped; correction retained |
| Blank/oversized/overlapping submissions | Sprint 9.6 verifier; internal 501-character synthetic input and overlap checks | Rejected before inappropriate mutation; 500-character and 100-message bounds preserved |
| Rejected/projection errors and duplicate handling | Prototype/read-model and hardening regressions | Sanitized errors; authoritative progress preserved; no duplicate committed operation |
| Reset and refresh | Internal browser walkthrough | Reset clears prior facts/messages; refresh starts a new fixture session, never claims durable recovery |
| Durable selector | Internal browser walkthrough and experience verifier | Disconnected message, no fixture substitution; participant tasks remain fixture-only |
| Runtime/identity/release/incident boundaries | Existing Sprint 9 focused/integrated verifiers | Deny-by-default policies preserved; no production/provider/protected-data authority |
| Local responsiveness | At least 20 valid submissions on declared candidate/device; record timing method and sorted durations | Nearest-rank p95 <= 1000 ms, zero crashes; no production-load claim |
| Environment and network | Loopback-only startup; moderator checks local URL, listening scope and browser requests before session | Only same-origin local assets/operations; no provider, telemetry, external navigation or tunnel |
| Cleanup and stop | Rehearse reset/close/reopen and a synthetic stop trigger without real data | No prior facts; named owner can stop; sanitized incident and cleanup result recorded |

Existing PostgreSQL tests remain backend evidence, not participant evidence.
No live database/backup test is required for the fixture study. If future scope
changes to durable mode, new integration, disposable database authorization,
fresh pinning/atomicity/restart/isolation/backup evidence, and explicit surface
approval are prerequisites; no default database URL or fixture fallback.

## Manual Accessibility and Usability (10.2 and 10.3)

Declare the actual browser, OS, device, screen reader and versions in the
rehearsal record. At minimum rehearse desktop keyboard, screen reader, 200% and
400% zoom/reflow, Windows forced colors, contrast/readability, text spacing,
reduced motion, and a real touch-device layout where it is part of the declared
evaluation surface. If device coverage is unavailable, record blocked rather
than claim coverage. Complete the plan's required checks before entry.

Verify service selection, input, submit, confirmation, correction, reset, and
mode controls have understandable names, visible focus, useful status/error
announcements, usable targets and no essential content loss. Record the human
reviewer and actual observations. Static ARIA/class-name checks and historical
Sprint 9 manual PASS do not replace current human testing. No formal WCAG
certification is claimed. Participant comprehension/usefulness measurements
follow F01–F06 and do not replace accessibility checks.

## Entry Evidence and Freshness Review

Before every session, the moderator checks the owner's explicit 10.3 cohort
authorization, exact candidate commit/protocol, named roles, local scope, consent,
data instructions, current incident state, and cleanup readiness. Technical and
manual entry evidence must be <= 7 days old, not future-dated, and match the
candidate. Rerun evidence affected by any relevant change immediately. Do not
renew evidence by editing timestamps or copying prior PASS outcomes.

The Sprint 9 integration fixture uses a fixed test clock and fabricated test
inputs to exercise a pure gate. Its PASS is regression evidence only. Manual
study review, including actual participant findings, is a separate procedural
decision. There is no new application authorization or gate integration in 10.0.

## Evidence, Retention, and Stop Review

Use only the blank template approved in 10.1 and fields allowlisted in the plan.
Record pass/fail/blocked/incomplete, counts, help, timings, ratings, sanitized
findings, and owners. No identity mapping, contact data, transcripts, screenshots,
recordings, or raw internal payloads. Record actual UTC time and cleanup deadline.
Review completeness and sanitization before aggregation; keep individual notes
outside Git in the approved local folder. Delete within 7 days or on withdrawal
by session code; record cleanup without retaining deleted content.

Stop on every condition listed in the plan; unsafe/unknown outcomes cannot pass.
Never provoke a stop drill with real/protected data. Resume only after owner
review and renewed affected evidence. No automatic retry or silent substitution.

## Outcome Review and Retest (10.4–10.5)

For each criterion, report numerator/denominator, original results, retest results,
candidate/protocol versions, evidence dates, and PASS/FAIL/insufficient. All
hard safety/reliability invariants must pass; averages cannot hide a violation.
Unknown evidence, incomplete cohort, stale evidence, unresolved critical/high
findings, missing cleanup, or any unmet threshold yields a NO advancement
recommendation. A NO is an honest completed review, not evaluation-success certification.

Only separately authorized fixes for observed issues may be implemented in 10.4.
Run relevant regressions and repeat affected manual/participant checks with
explicit retest authorization. Do not broaden into provider, durable browser,
channel, authentication, or production work. Preserve failures as history and
publish only de-identified aggregate findings and fictional reproduction steps.
