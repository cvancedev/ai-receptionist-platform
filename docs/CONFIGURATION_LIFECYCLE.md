# Configuration Lifecycle

## Purpose

This document maps the existing Business Profile and knowledge lifecycle
vocabulary to the Milestone 7.1 application contracts. It defines boundaries,
not executable workflows.

## Business Profile Statuses

| Status | Meaning | Conversation eligibility |
| --- | --- | --- |
| `draft` | Business-owned work in progress | Ineligible |
| `incomplete` | Blocking structure, dependency, or consistency issue exists | Ineligible |
| `ready-for-review` | Structured checks permit accountable review | Ineligible |
| `active` | Validated and approved exact revision | Potentially eligible after conversation-use validation |
| `suspended` | Use is disabled pending review | Ineligible |
| `archived` | Historical, read-only configuration | Ineligible |

An `active` label is necessary but never sufficient on its own. Exact scope,
current validation, platform safeguards, and applicable knowledge eligibility
still govern conversation use.

## Knowledge Statuses

Knowledge uses the existing explicit lifecycle: `draft`, `under-review`,
`approved`, `active`, `expired`, `superseded`, `suspended`, `archived`, and
`rejected`. Only active, approved, current, audience-permitted, business-matched
knowledge may be considered for conversation use.

## Validation Stages

### Draft Structure

Checks identity, shape, field relationships, scope, and other requirements
needed to continue the configuration process. Passing does not authorize review,
activation, or conversation use.

### Activation Eligibility

Checks required completeness, dependencies, conflicts, accountable review, and
platform safeguards for the exact revision. Passing provides an application
decision input; it does not activate anything.

### Conversation Use

Checks that the exact selected revision is active, business-matched, current,
and safe for the requested use. The existing Business Profile validator enforces
its active-profile rule. The existing knowledge validator enforces structure,
recognized lifecycle vocabulary, and business scope; a future conversation-use
implementation must additionally require active lifecycle and all documented
knowledge eligibility conditions.

## Implemented Transition Vocabulary

The lifecycle remediation implements the smallest existing-state matrix needed
for certification. Business Profiles allow `draft` to `ready-for-review`,
`ready-for-review` to `active`, and `active` to `suspended`. Knowledge Records
allow `draft` to `under-review`, `under-review` to `approved`, `approved` to
`active`, and `active` to `suspended`. All other source/target pairs fail
closed. Activation remains a separate application-owned atomic decision and
must exist for the exact profile and selected knowledge before their envelope
lifecycle may enter `active`.

## Version Rules

- Scope always identifies the exact Business Profile ID and positive version.
- Knowledge scope also identifies the exact knowledge-record ID and positive
  version.
- Meaningful edits require a new revision rather than silent overwrite.
- A prior active revision remains authoritative until a replacement is validly
  activated or immediate suspension is required.
- Existing conversations remain pinned to their selected profile version.
- Historical revisions do not regain current authority through inspection.

## Failure Rules

Malformed scope, invalid structure, ineligible activation, unauthorized action,
stale revision, missing revision, incompatible data, or persistence failure must
produce an explicit outcome. No failure may guess, repair, silently fall back,
promote a draft, switch versions, or partially activate configuration.

## Deferred Behavior

Milestone 7.4 records an application-authorized transition from one exact
`ready-for-review` Business Profile and explicitly selected `approved`
knowledge revisions into an immutable active-configuration record. Version
documents and their pre-activation evidence are not overwritten. Replacement
changes one active pointer atomically while retaining prior activation history.
Milestone 7.5 consumes that immutable evidence through an opt-in fictional
conversation path. It validates exact activated profile and bound knowledge
revisions, persists the selected profile version at initialization, and reloads
the historical activation for that pin after replacement or restart. It does
not mutate configuration documents, silently repin conversations, or add a
public administration workflow. Milestone 7.6 verifies that invalid, stale,
duplicate, malformed, unavailable, and failed-transaction paths preserve the
last committed lifecycle authority. The lifecycle remediation adds the
application-controlled transition and inspection workflow plus bounded durable
audit evidence without changing immutable version documents. Milestone 7.7
certification remains incomplete.
