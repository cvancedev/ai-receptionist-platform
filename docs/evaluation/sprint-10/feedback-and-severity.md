# Feedback, Evidence Field Guide, and Severity Rubric

Package version: `sprint-10.1-materials-v1`.
Materials only. Participant evaluation has not started. No session is authorized.
Moderator-only. Use [the runbook](moderator-runbook.md) and
[blank evidence templates](evidence-templates.json). No answers or scores have
been collected in this document.

## Neutral Feedback Questions

Ask after the scored interaction. Do not identify a desired answer or read the
scoring anchors aloud. All questions are optional; not answered is distinct from
a low score. Paraphrase only interface-related feedback without identifying stories.

| ID | Question | Response format | Use |
| --- | --- | --- | --- |
| Q01 | How easy or difficult was this task? | 1 very difficult; 2 difficult; 3 neither; 4 easy; 5 very easy; not answered | Every task |
| Q02 | How clear or unclear was the information shown? | 1 very unclear; 2 unclear; 3 neither; 4 clear; 5 very clear; not answered | Every task |
| Q03 | How confident or uncertain are you about what the receptionist did? | 1 very uncertain; 2 uncertain; 3 neither; 4 confident; 5 very confident; not answered | Every task |
| Q04 | What would you do next? | Short sanitized paraphrase; not answered | Every task; F02/F04/F06 scored comprehension |
| Q05 | Was anything confusing? | Short sanitized paraphrase; none reported; not answered | Every task |
| Q06 | What do you think happened to your request? | Short sanitized paraphrase; not answered | Every task; F02/F04/F06 scored comprehension |
| Q07 | How correct or incorrect did the information seem? | 1 very incorrect; 2 incorrect; 3 neither; 4 correct; 5 very correct; not answered | F01/F03/F06 |
| Q08 | How useful or unhelpful is this summary for deciding what to do next? | 1 very unhelpful; 2 unhelpful; 3 neither; 4 useful; 5 very useful; not answered | F06; established usefulness threshold >=4 |
| Q09 | What, if anything, would you change? | Short sanitized paraphrase; none reported; not answered | End of session |
| Q10 | Is there anything else about the interface you want to mention? | Short sanitized paraphrase; none reported; not answered | End of session |

Confidence and perceived correctness are opinions, not proof of correct facts.
Only Q08 has the established >=4 usefulness gate; Q01/Q02/Q03/Q07 remain
descriptive and cannot replace it. Q04/Q06 answers are scored against the
scenario-specific rubric without a leading follow-up. Ask the same questions
even if the task failed; do not suggest "human review" or "nothing was sent."

## Failure Categories and Severity

| Category | Definition | Severity | Disposition |
| --- | --- | --- | --- |
| observation | Preference or noteworthy behavior with no demonstrated task impairment; includes expected safe refusal | informational | Record; no defect or automatic remediation |
| minor-usability | Recoverable hesitation or unclear wording while task can still complete independently | low | Record friction, owner review; does not override an unmet acceptance threshold |
| significant-usability | Task cannot be completed independently, next step misunderstood, or essential interaction inaccessible | medium, elevated to high for blocked essential accessibility or unsafe misunderstanding | Record failed criterion; high means stop and block advancement; medium requires owner disposition and any necessary retest |
| functional-failure | Wrong/lost confirmed facts, skipped required clarification, unintended duplicate operation, broken correction/reset or crash | high | Stop affected work; block advancement until corrected and retested |
| safety-boundary | Real/protected data, unintended transmission/action, invented commitment, misleading release claim, isolation or scope breach | critical | Immediate stop/containment; owner review and explicit resume only after correction, cleanup and renewed evidence |

Categories and severity are separate fields. An ordinary participant difficulty
is not automatically a backend defect. Expected unsupported-service escalation
is correct behavior, not a functional failure. If several categories apply, link
separate observations to one issue and use the highest applicable severity.
Unknown category/severity is recorded unknown and treated as high until reviewed.
All critical/high issues block advancement; medium/low issues still cannot waive
the Sprint 10 outcome thresholds. Stale/missing evidence is a blocked gate even
when no software defect has been demonstrated.

## Evidence Template Usage

[evidence-templates.json](evidence-templates.json) is a set of blank reusable
sections. All leaf values are null, including outcome, consent, timing and
ratings. Null means not recorded; it never means success, false, zero or consent.
Copy needed sections into the approved local folder only after the relevant
work is authorized. Leave repository masters unchanged. Repeated scenario
attempts, interventions and issues are separate records linked by opaque IDs;
do not overwrite failures. No real customer or sensitive information is allowed.

- **readiness:** Operational setup and approval references, including candidate,
  protocol, declared device, role assignment, evidence dates and cleanup plan.
  Moderator/owner roles refer to Curt Vance's runbook assignment; do not create
  a participant identity directory. Unknown readiness blocks rehearsal/session.
- **session:** Opaque session code, `internal-rehearsal` or `participant` kind,
  UTC date/time, candidate/package/protocol, browser/device, consent/withdrawal
  and completion status. Do not fill participant kind during an internal rehearsal.
- **scenario:** F01–F06, attempt number, initial condition, expected outcome and
  observed result, system correctness and independent completion separately,
  clarification/correction/escalation/handoff, confusion, help, errors, timing,
  issue/severity and follow-up. Use pass/fail/blocked/incomplete/not-observed for
  observations as applicable; absent correction in F02 is not-applicable, not PASS.
- **intervention:** One per occurrence: session/scenario/attempt, elapsed seconds,
  one runbook type, sanitized reason and effect on independent scoring. Count
  procedural help separately from neutral prompts and planned accommodations.
- **feedback:** Copy per task, with Q01–Q10 keys and scenario ID (`session-end`
  for Q09/Q10). Use rating integers 1–5 or not-answered for scale questions;
  short sanitized paraphrases for others. Mark questions not scheduled for that
  task not-applicable. Never store a participant quote or story verbatim.
- **issue:** Opaque issue ID, scenario/attempt, category, severity, fictional
  reproduction, expected/observed, owner role, action and retest disposition.
- **cleanup:** Session/issue reference, collection/deadline/deletion UTC times,
  owner role, artifact check, actual outcome and exception. No copy of removed data.

Date/time format is UTC ISO 8601. Store timing in seconds: start, finish, wall
duration, pause duration/reason and active duration. `active = wall - pause`;
normal thinking and system waits are never subtracted. Failed/timed-out attempts
retain their duration; not measured is not zero. F01/F03 limit is 600 active
seconds, with wall duration also visible. Independent means zero procedural help
and task complete within its threshold. System correctness is reviewed against
fictional supplied facts, not participant confidence ratings.

No names/contact identifiers, participant business categories tied to session
codes, demographics, identity key, raw transcript, screenshots, recordings,
credentials, raw state, journal or message exports in evidence. Cohort diversity
is an owner-checked recruitment constraint recorded only as an aggregate count,
not an individual participant attribute. Do not collect recruitment information
inside this app or repository.

## Aggregation and Retest Rules

Preserve initial attempt and assisted/retest outcomes separately. Report
numerator/denominator with withdrawals, incomplete tasks, failed gates and missing
responses visible; do not cherry-pick five favorable records. Complete all six
tasks for five participants for sufficient cohort evidence; replacements require
the same approved protocol. Keep review timing within the 7-day evidence window.
F01/F03 independent completion, F02/F04 comprehension and F06 usefulness are
separate gates; 100% handoff correctness and safety invariants cannot be averaged.

No critical/high finding, missing consent, incomplete cleanup or failed criterion
can become ready through an average rating. Later retests need explicit
authorization and a versioned candidate/protocol, with affected technical/manual
evidence renewed. Only de-identified aggregate findings and fictional reproductions
may enter Git after review; individual local records must be deleted within
7 days or on withdrawal by session code. This package contains no aggregate results.
