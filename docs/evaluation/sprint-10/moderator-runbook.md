# Sprint 10.1 Moderator Runbook

Package version: `sprint-10.1-materials-v1`.
Materials only. Participant evaluation has not started. No session is authorized.
Commands and interaction procedures below are instructions for later separately
authorized work, not a record of completed rehearsal or participant activity.
No real providers, real customer data, production deployment, authentication,
durable browser integration or unsupervised operation is permitted.

## Roles and Authority

- Moderator: **Curt Vance**.
- Evidence/cleanup owner: **Curt Vance**.
- Assignment scope: Sprint 10.1 materials and Sprint 10.2 internal rehearsal,
  explicitly confirmed by the project owner during preparation.
- Observers: none assigned. Do not add one without a documented need and approval.
- The project owner separately approves a candidate/cohort before 10.3. These
  role assignments do not authorize rehearsal now or any external session.

Operator identity in this runbook is administrative information, not participant
research data. Research records use only opaque session codes without an identity
key. Do not write a participant's name or business into any evidence field.

## Environment Setup (Later Authorized Rehearsal)

1. Use the approved local repository and exact candidate commit plus package
   version. Record any dirty source/materials state; an unreviewed dirty candidate
   fails entry. Never reuse an unidentified running server or stale build.
2. Inspect local configuration without printing secrets. Use an owner-approved
   credential-free environment with no production/provider/database credentials,
   including inherited variables or local env files. Do not copy credentials to
   notes or remove unrelated configuration. Resolve uncertainty before startup.
3. Run the engineering checks from the [test plan](../../SPRINT_10_TEST_PLAN.md),
   including both Sprint 10 verification scripts, lint, TypeScript, build and
   affected fixture/boundary regressions. Google-font downloads are a build-time
   dependency; a successful download does not authorize external session traffic.
4. Only after preparation is approved, run a local production server from the
   repository in a dedicated terminal, bound explicitly to loopback:

   ```powershell
   npm.cmd run start -- --hostname 127.0.0.1 --port 3000
   ```

5. Check the listener before opening the browser:

   ```powershell
   Get-NetTCPConnection -State Listen -LocalPort 3000 |
     Select-Object LocalAddress, LocalPort, OwningProcess
   ```

   Require `127.0.0.1` and the process just started; no `0.0.0.0`, `::`, other
   interface or unknown process. If occupied, stop preparation; do not kill an
   unrelated process or improvise a public port/tunnel. Reapprove a different
   local port if necessary. Next.js defaults to a broad bind without this flag.
6. Open only `http://127.0.0.1:3000/prototype`. No hosted URL, remote desktop,
   public tunnel, LAN participant access, or cloud browser. Do not follow public
   website/contact links. No authentication or database connection is needed.

## Fixture Selection and Browser/Device Preparation

Use a dedicated local browser profile with sign-in/sync, autofill, spellchecking
uploads, extensions, recording and remote assistance disabled. Use the approved
browser/device/accessibility matrix; document OS/browser/assistive versions.
No participant accounts or personal browser profile. Use only local peripherals.
Touch testing must use an approved local touch-capable device, not expose the
server over a network to accommodate a phone.

Select **Fixture-backed deterministic**, then **Reset prototype**. Check the
initial prompt, no collected facts, no completed handoff, no prior messages
beyond the initial prompt, and no busy operation. Durable activated mode must
remain disconnected; if accidentally selected, stop the task, record the
deviation and restore a fresh fixture only after review. Do not count a reset
or mode-switch rescue as independent participant success.

Before any human session, inspect browser requests locally without exporting
logs; require only same-origin loopback assets/operations. Disable unrelated
background browser traffic for the dedicated environment; unknown traffic or
scope blocks entry. Inspect once during 10.2 and again at each later startup.
Close developer tools before participant interaction; never inject state.

## Pre-Session Verification

This checklist applies to 10.2 internal rehearsal or, with additional explicit
authorization, 10.3 participants. Internal actors do not count toward the cohort.

- Confirm named moderator/cleanup owner, purpose, protocol version, candidate
  commit/build, date window, selected device/browser, and local evidence folder.
- For 10.3, inspect the owner's explicit authorization naming candidate, cohort,
  dates, surface, protocol, moderator and observers. A past YES or verifier PASS
  is not session permission. Materials preparation alone cannot satisfy this gate.
- Required engineering/manual evidence must be <= 7 days old at use and final
  review, not future-dated, and match candidate/protocol/environment. Changed,
  missing, failed, stale or contradictory evidence blocks entry immediately.
- Complete 10.2 accessibility, response-time, safety-stop and cleanup rehearsals
  before participants. A role assignment or completed template cannot substitute.
- No unresolved critical/high findings, unsafe environment, open cleanup exception
  or unclear data classification. Resolve unknowns before proceeding.
- Have only current task card ready; keep scenario pack, rubrics, commands and
  expected answers out of participant view. Confirm fixture initial condition.
- Prepare a local copy of blank templates in the approved non-synced folder
  outside Git. No recordings, screenshots, transcripts or identity directory.

## Participant Introduction and Fictional-Data Reminder

Read the following wording uniformly only when a participant session is authorized:

> We are reviewing a fictional software prototype, not testing you. It uses
> deterministic rules and does not arrange a real service or send a request to
> anyone. All people, businesses and facts in the task cards are invented.
> Please use only those facts. Do not enter real names, contact details,
> addresses, business information, payment details or sensitive stories.
> You can tell us what you are trying to do, but there is no need to describe
> your own customers or business. We want to observe what is clear or unclear.

Do not describe the correct task steps, service choices, correction syntax,
handoff interpretation or success thresholds. The necessary no-delivery briefing
means F06 measures understanding of a disclosed boundary, not discovery from UI alone.

## Consent and Participation Wording

> Taking part is optional. You can skip a task, pause or stop without giving a
> reason or any penalty. We will write short, de-identified observations about
> the interface, task timings and your ratings. We will not record audio,
> video, screenshots or a transcript, and we will not record your identity.
> Individual notes will be deleted within 7 days. We may keep de-identified
> aggregate findings. You can request deletion of your individual notes during
> that period using your session code; after aggregation we cannot identify
> your contribution. Is that clear, and do you voluntarily agree to take part?

Answer procedural privacy questions without promising capabilities beyond this
protocol. Record agreement as yes/no and UTC time, never a signature/name.
If declined or unclear, do not start; retain no task notes. Give the participant
their opaque session code and an owner-approved way to request deletion without
collecting their contact details. That method and storage location must be
approved in 10.2; if unavailable, entry is blocked. Internal rehearsal consent
is recorded separately and never presented as external participant agreement.

## Task Presentation Procedure

Use F01–F06 in that order for the initial cohort; record order as a study
limitation, not a randomized comparison. Freeze this package after 10.2 review.
Changing wording, setup or thresholds requires a new protocol version, review,
and renewed affected evidence. Never retroactively improve scores.

1. Reset between every scenario. F01/F02/F04/F05 begin at the initial prompt.
2. For F03 only, hide participant view and use the scenario pack's canonical
   setup to confirmation. For F06 only, reset and prepare a new completed
   handoff with that sequence plus confirm. Verify preparation and then reveal
   only the task card; do not reuse another task's outcome or let them watch setup.
3. Let the participant read the current card. Say: "Please use the information
   on this card and work as you normally would. Tell me when you are ready."
4. Start the timer when they say ready, after setup and reading. End at the
   scenario's scoring checkpoint. Include hesitation and UI waiting; pause only
   for a non-task interruption, recording reason and both wall and active time.
5. F01/F03 independent-completion limit is 600 seconds. At that limit record
   failure of the time criterion before offering to stop. F02/F04/F05/F06 have
   a 300-second observation cap for scheduling, not a new acceptance percentage.
   An incomplete capped task is not a PASS. No pressure to finish.
6. Ask the scenario's neutral feedback questions after scoring. Do not reveal
   expected answers before recording responses. Close the task record before
   any optional debrief or assisted exploration; those cannot overwrite attempt 1.

## Neutrality and Permitted Intervention

Do not praise a particular choice, point to controls, complete an answer, name
the correct service, supply correction syntax, demonstrate reset, or say the
system "should" do something. Use "What are you trying to do?" or repeat the
card verbatim when requested. Log all interventions, including neutral ones.

Intervention types: `neutral-probe`, `card-repeat`, `procedural-help`,
`accessibility-accommodation`, `safety-stop`. The first two alone do not count as
procedural help; any instruction that reveals a step/answer does. Record elapsed
time, type, sanitized reason, and whether independent scoring was affected.
Planned assistive technology is not coaching. Unplanned task-performing help
is assisted completion and must be reported as such. Stop inaccessible essential
interaction rather than completing it for the participant.

Intervene immediately for safety, withdrawal or distress. If a participant
requests task help, offer "You may continue, skip this task, or stop." If they
choose help after the independent attempt ends, log it as assisted exploration,
not independent success. No debugging, code changes or improvised data during sessions.

## Observation and Evidence Recording

Use [blank templates](evidence-templates.json) and the field rules in
[feedback and severity](feedback-and-severity.md). Copy only the section needed
for a readiness record, session, scenario attempt, issue or cleanup. All master
values remain null. No completed individual evidence belongs in the repository.

Separate observed system behavior, participant understanding and interpretation.
Record actual completion, elapsed seconds, clarification quality, correction
handling, escalation/handoff, confusion, interventions, errors and feedback.
Write short de-identified paraphrases, never verbatim participant stories or raw
transcripts. Unknown is not false; not observed is not PASS. Distinguish a
prevented browser action from a tested backend rejection. Never invent timing
values or infer human accessibility from static tests.

## Failure Classification

Use the five categories and severity mapping in the rubric. Category describes
the kind of issue; severity determines urgency. Record a reproduction step with
fictional values, expected versus observed result, category, severity, owner and
follow-up. Expected safe rejection/escalation is not a defect. Wrong participant
interpretation and a misleading application statement are separate observations.
Do not downgrade a critical/high issue to meet a cohort threshold.

## Safety Stop Conditions

Stop immediately for suspected real/protected data, unintended external traffic
or release, wrong mode/environment, prior participant facts, bypassed isolation,
crash/corruption, inaccessible essential interaction, distress/withdrawal, missing
moderator, or uncertainty about consent, scope or cleanup. Unknown severity is
treated as high until reviewed. No automatic retry, remediation or fixture fallback.

Tell the participant "We are stopping this task. You do not need to do anything
else." Stop input, avoid copying content, and end observation. Record only a
sanitized issue and stop reason. Close/reset the surface as appropriate and have
the owner inspect containment and cleanup. Further sessions remain blocked until
owner review, corrected cause, renewed affected evidence, and an explicit resume
decision. Do not run a deliberate drill with actual prohibited data.

## Session Termination

End on completion, participant request, observation cap, or a stop condition.
Ask optional end-of-session Q09/Q10 without seeking identifying stories. Thank
the participant without claiming success. Record completed/incomplete/withdrawn/
stopped truthfully; link any sanitized issue and cleanup record. No scheduling,
contact collection or invitation to production use. Unanswered questions stay
not answered; skipped tasks remain visible in denominators.

## Evidence Cleanup

Curt Vance checks notes immediately for prohibited information, sanitizes before
aggregation, and sets deletion deadline no later than collection time plus 7 days.
Delete individual notes by that deadline regardless of analysis progress, or
immediately on withdrawal identified by session code. Review access-controlled
folder, temporary copies and recycle/recovery locations according to the approved
local storage method; do not claim deletion while recoverable copies remain
unaccounted for. Resolve exact filenames before deletion; no broad cleanup commands.

No transcripts, recordings or screenshots should exist; if they do, stop and
review as a protocol violation. Preserve only de-identified aggregate findings
and fictional defect reproductions, never individual notes in Git history.
Record cleanup UTC time, owner role, checked artifacts, outcome and exceptions
without retaining deleted content. Unknown cleanup blocks the next session and
final exit. Session codes and deletion instructions do not create an identity map.

## Post-Session Reset Procedure

1. Stop any operation; if state is uncertain, terminate the dedicated browser
   rather than repeatedly submitting. Clear unsent text as well as reset state.
2. Select fixture mode and Reset prototype only when no operation is busy.
   Verify initial prompt, no collected facts, no handoff and no previous messages.
3. Close the dedicated browser session. Clear clipboard, locally saved temporary
   card copies/downloads and approved site/session remnants. No data exports.
4. Reopen the local prototype and verify a clean initial state; record pass/fail
   of this check, then close it. This is not a claim of forensic memory erasure.
5. At the end of the authorized work period stop the dedicated server with
   Ctrl+C in its terminal; confirm its listener has gone. Do not stop unrelated
   processes. Complete the cleanup record before allowing another session.

## Preparation Acceptance and Remaining Entry Work

10.1 passes only when F01–F06 have complete moderator specifications and separate
non-coaching cards; consent, introduction, intervention, observation, severity,
stop/termination, cleanup and reset instructions exist; reusable evidence values
are all blank; named material/rehearsal roles are recorded; package/version links,
scenario consistency, safety boundaries, type/lint/build and affected regressions
pass. No real customer information or completed human session is included.

10.2 must still approve the exact candidate, device/browser matrix, evidence
folder and deletion-request method; rehearse timing, accessibility, scenario
setup, stop and cleanup; and freeze the materials or document revisions. A
complete package is not a completed rehearsal. Participant authorization remains
a separate 10.3 gate. A 10.1 verifier PASS proves documentation consistency, not
that a browser, human or device has passed any study criterion.
