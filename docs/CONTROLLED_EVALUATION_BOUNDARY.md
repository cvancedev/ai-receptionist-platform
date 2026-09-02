# Controlled-Evaluation Boundary

## Decision

Milestone 9.1 defines one candidate for a later controlled evaluation: a
moderated session using the existing local or isolated test experience,
fictional or synthetic scenarios, the deterministic mock, and optionally the
existing opt-in durable activated path with fictional data.

This document is a readiness policy, not authorization to run an evaluation.
Milestone 9.7 and the applicable preceding gates must be separately authorized
and completed before participants use the candidate workflow.

Production-like or production environments, real business configuration,
customer-provided information, protected data, credentials, provider calls,
customer-response release, channels, external actions, and deployment are
outside the approved boundary.

## Participants

The later fictional evaluation may include only:

- named internal evaluators responsible for setup, moderation, stop decisions,
  evidence minimization, and cleanup;
- invited small-service-business owners or staff acting only as research
  participants in fictional scenarios; and
- named observers with a documented research need and no operational role.

Every session must be actively moderated. Participation is procedural at this
milestone; it is not application authentication or authorization. There are no
public, anonymous, self-service, real-customer, or unsupervised participants.
Participants must be told not to enter real customer, employee, confidential
business, regulated, credential, or payment data.

## Environment Boundary

| Environment | 9.1 decision | Conditions |
| --- | --- | --- |
| Local development | Candidate only | Moderated, fictional/synthetic data, no external network capability, complete cleanup |
| Isolated test | Candidate only | Same restrictions as local; test credentials and database must be disposable and scoped |
| Production-like evaluation | No-go | Requires separately authorized 9.2, 9.4, 9.5, and applicable identity/privacy gates |
| Production | Prohibited | Requires a later explicit deployment and release decision outside 9.1 |

Environment names cannot establish trust, data permission, release authority,
or application authority. Missing, unknown, contradictory, or insecure-default
environment information fails closed.

## Exposed Surfaces

The later candidate evaluation may expose only:

- the bounded internal fictional MVP experience;
- the existing deterministic mock behavior;
- the explicitly selected durable activated path using fictional data, with no
  fixture fallback;
- bounded Conversation Read Models, progress, safe failures, and derived
  handoff summaries; and
- minimized operational evidence produced from fictional sessions.

It may not expose repositories, raw Conversation State, SQL, database tools,
raw journal/message records, unrestricted prompts, internal-only knowledge,
credentials, provider payloads, administration, public APIs, real channels,
response delivery, handoff dispatch, or external actions.

## Data Flow

1. A moderator selects a pre-reviewed fictional scenario and participant role.
2. The participant enters only fictional customer messages through the bounded
   internal experience.
3. The application validates exact business, profile, activation, knowledge,
   conversation, revision, message, turn, execution, and sequence scope.
4. The deterministic workflow treats input as untrusted data and uses only the
   exact activated configuration and activation-bound eligible knowledge.
5. Approved state, Execution Journal evidence, and message evidence follow the
   certified atomic persistence boundary when durable mode is explicitly used.
6. The UI renders bounded read models and a derived handoff; nothing is sent to
   a customer or external system.
7. The moderator records only minimized research observations and bounded
   operational evidence, then follows the session cleanup and retention plan.

No research note, participant statement, log, journal entry, message record,
provider-shaped output, or database row can be replayed as Conversation State
or treated as a configuration, transition, release, or action decision.

## Trust Boundaries

- Participants, customer text, research feedback, knowledge content, and any
  provider-shaped payload are untrusted.
- Business configuration is business-owned data but remains subject to
  application validation, lifecycle, activation, audience, and scope rules.
- Application/domain services retain decision and transition authority.
- Conversation State remains authoritative after commit and restart.
- Execution Journal, message evidence, research notes, and future telemetry are
  subordinate evidence and non-replayable.
- PostgreSQL owns storage and integrity only.
- The UI owns presentation only.
- Operators can stop a session and manage the environment, but cannot bypass
  application validation or manufacture domain truth.

## Customer-Validation Protocol

Before a session, the moderator must verify the participant list, fictional
scenario, environment classification, absence of production credentials and
external connectivity, approved capability allowlist, stop procedure, evidence
plan, and deletion date. Participants receive the data prohibition and are
asked to avoid names, contact details, addresses, account identifiers, health,
legal, financial, payment, or other real sensitive facts.

During a session, the moderator stops on suspected real/protected data,
cross-scope behavior, unexpected network or release behavior, security-control
failure, unrecoverable storage error, or inability to prove environment scope.
The observation is recorded without copying prohibited content.

After a session, the moderator confirms no response or action left the local
experience, exports only approved minimized findings, deletes disposable data
on schedule, removes credentials and temporary resources, and records any
blocking risk against its owning milestone.

## Conditional Milestone Decisions

| Later milestone | 9.1 decision |
| --- | --- |
| 9.2 environment/runtime/secrets | Complete; fail-closed server preflight exists, but no evaluation runtime or execution is authorized |
| 9.3 identity/authorization | Conditional gate complete without real authentication; explicit server policy preserves denial because evaluation remains moderated and fictional |
| 9.4 operational PostgreSQL/backup/restore | Required before a production-like durable evaluation; no production database authorized |
| 9.5 observability/privacy/retention | Required before monitored evaluation; vendor selection remains deferred |
| 9.6 reliability/accessibility/performance | Required before participant evaluation evidence can support a go recommendation |
| 9.7 controlled customer validation | Required and separately authorized to run sessions |
| 9.8 integrated verification | Required before certification |
| 9.9 certification/recommendation | Required; certification and release authorization remain separate decisions |

## Go/No-Go Gates

The candidate may advance to later fictional evaluation planning only when:

- all data is fictional/synthetic and the classification is known;
- participants and moderators are named and the session is supervised;
- environment and capabilities match the allowlist;
- exact isolation, pinning, grounding, atomicity, restart, evidence, and UI
  boundaries remain passing;
- evidence collection is minimized with access, retention, deletion, and stop
  ownership; and
- there is no unresolved critical/high risk.

It is an immediate no-go when any classification, actor, environment, scope,
credential state, release state, external action, retention owner, or cleanup
outcome is unknown; real or protected data may be present; a production or
external surface is reachable; or a certified authority boundary fails.

Milestone 9.1 itself remains **NO-GO for evaluation execution, production-like
runtime, real data, deployment, customer release, and external action**.

## Related Documents

- [Data Classification](DATA_CLASSIFICATION.md)
- [Threat Model and Risk Register](THREAT_MODEL_AND_RISK_REGISTER.md)
- [Sprint 9 Plan](SPRINT_9_PLAN.md)
- [Sprint 9 Test Plan](SPRINT_9_TEST_PLAN.md)
- [Data and State Ownership](DATA_AND_STATE_OWNERSHIP.md)
- [Response Release Boundary](RESPONSE_RELEASE_BOUNDARY.md)
