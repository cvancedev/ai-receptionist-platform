# Sprint 9 Test Plan: Customer Validation and Hardening

## Purpose

Define the evidence required to harden the certified Sprint 8 internal
fictional MVP and determine readiness for a later controlled-production
evaluation. Passing Sprint 9 tests does not itself authorize deployment,
customer response release, real data, a provider, a channel, or an external
action.

## Baseline

The fixed entry baseline is the certified Sprint 8 checkpoint and all existing
`verify:*` scripts. Every Sprint 9 milestone must run its focused checks plus
all affected certified regressions. Final certification must run the complete
Sprint 1–8 matrix and every applicable Sprint 9 verifier.

The durable activated path remains fixture-free and fail-closed. Fictional or
synthetic data is mandatory unless a separately authorized later milestone
first completes every applicable identity, privacy, authorization, and data-
governance gate.

## Cross-Cutting Gates

Every milestone must prove:

- exact business/profile/activation/knowledge/conversation/revision/message/
  turn/execution/sequence isolation;
- historical profile and activation pin preservation;
- exact grounded-source validation and untrusted-input treatment;
- application/domain authority and PostgreSQL technology isolation;
- deterministic workflow and deterministic mock compatibility;
- atomic durable turns and restart from authoritative Conversation State;
- subordinate, non-replayable journal/message/telemetry evidence;
- derived handoff and no fixture fallback on the durable path;
- bounded UI and sanitized failure behavior;
- no implicit provider, release, channel, external action, deployment, or
  Sprint 10 capability;
- exact migration history and lockfile/dependency integrity; and
- complete cleanup of databases, credentials, environment variables,
  processes, ports, temporary files, and external test resources.

## Milestone Evidence

### 9.0 Planning

- Confirm clean checkpoint `bafb143` and matching `origin/main`.
- Confirm planning/documentation-only diff.
- Verify links, lint, non-incremental TypeScript, production build, exact
  migrations 001–007, unchanged migrations/source/dependencies/lockfile, and
  absence of Sprint 9 implementation capability.

### 9.1 Controlled-Evaluation Boundary and Risk Review

- Trace roadmap/Phase 7 requirements to risks, owners, mitigations, tests, and
  go/no-go gates.
- Threat-model business isolation, authorization absence, prompt injection,
  untrusted customer/knowledge/model data, storage corruption, evidence replay,
  operator error, dependency failure, privacy, and release confusion.
- Verify every proposed actor, datum, environment, trust boundary, and external
  dependency is classified and minimized.
- Require explicit decisions for conditional milestones and block unknown
  critical/high risks.

### 9.2 Environment, Runtime Configuration, and Secrets

- Validate exact schemas and allowlists for each environment.
- Fail before service/read/write on missing, extra, malformed, contradictory,
  cross-environment, or insecure-default configuration.
- Prove secrets remain server-only and absent from source, browser bundles,
  build artifacts, logs, errors, journal, message evidence, and telemetry.
- Test least privilege, rotation, revocation, unavailable secret store, and
  deterministic local/test operation without production credentials.
- Scan public environment variables and client dependency graphs.

### 9.3 Identity, Authorization, and Protected-Data Gate

This suite is required only if the milestone is activated by a documented 9.1
need. Otherwise certification must prove it remains deferred and that no
protected-data or administrative capability entered scope.

- Test unauthenticated, expired, revoked, malformed, replayed, and wrong-
  environment sessions.
- Test wrong-business, wrong-role, wrong-profile, wrong-conversation, object-ID
  tampering, confused-deputy, CSRF/session fixation, and existence-disclosure
  paths.
- Prove server-side authorization on every protected operation; client checks
  are presentation only.
- Prove authentication cannot repin configuration, establish domain truth,
  authorize transitions, release content, or broaden repository scope.
- Audit session/authorization evidence without storing tokens or credentials.

### 9.4 Operational PostgreSQL, Migration, Backup, and Restore

- Run all PostgreSQL suites against disposable isolated databases.
- Test clean install and exact upgrade from approved predecessor histories.
- Reject unknown, renamed, missing-predecessor, out-of-order, duplicate, and
  newer histories before SQL or repair.
- Prove backup consistency and restore into a fresh isolated environment;
  validate authoritative state, configuration pins, journal/message evidence,
  progress, and derived handoff after restore.
- Test unavailable database, timeout, cancellation, pool exhaustion,
  interrupted migration, commit ambiguity, corruption, and operator abort.
- Prove no request-time migration, replay, retry invention, partial repair,
  cross-scope disclosure, or broad administrative credential.
- Record and verify recovery objectives, cleanup, stop conditions, and rollback
  behavior.

### 9.5 Observability, Privacy, Retention, and Incidents

- Map required signals to bounded technology-neutral events and metrics.
- Inject secret, message, prompt, knowledge, SQL, and cross-tenant canaries and
  prove redaction/minimization.
- Test telemetry sink failure, latency, backpressure, malformed events,
  excessive cardinality, duplicate events, and clock disorder without changing
  application outcomes.
- Prove telemetry cannot execute, retry, repair, replay, release, or reconstruct
  authoritative state.
- Verify access, retention, deletion, incident escalation, and audit trails.
- Exercise monitored failure paths and incident/runbook drills.

### 9.6 Reliability, Accessibility, Performance, and Usability

- Run fixed fictional acceptance and usability scenarios for greeting,
  understanding, required fields, clarification, correction, confirmation,
  escalation, completion, restart, and handoff.
- Verify keyboard, focus order, labels, status announcements, screen-reader
  semantics, contrast, zoom/reflow, small viewport, reduced motion, and error
  recovery.
- Measure bounded latency, throughput, memory, payload/context size, database
  connections, and concurrent exact-scope turns against approved budgets.
- Test slow, unavailable, cancelled, and repeatedly failing dependencies.
- Test stale revision, duplicate identity, conflicting activation, restart at
  every durable stage, and deterministic output stability.
- Require evidence-linked minimal defect corrections; feature requests return
  to planning.

### 9.7 Controlled Customer Validation and Release Gate

- Verify the approved participant, consent, minimization, retention, deletion,
  stop, escalation, and issue-handling protocol.
- Use moderated fictional/synthetic scenarios unless every separately
  authorized protected-data gate passes.
- Trace observations and customer feedback to reproducible evidence without
  treating feedback as configuration or state authority.
- Rehearse operator startup, safe failure, escalation, rollback, incident, and
  shutdown procedures.
- Prove no product response was released and no production channel or external
  action occurred without a separate release authorization.
- Produce binary go/no-go evidence with unresolved high-severity issues as
  blockers.

### 9.8 End-to-End Security, Failure, and Operational Verification

- Compose the complete negative matrix across environment, identity if
  present, authorization, configuration, context, grounding, model-neutral
  output, transitions, persistence, evidence, telemetry, UI, operations, and
  release.
- Test cross-business/existence disclosure, prompt injection, malformed and
  oversized inputs, suspended configuration, stale/duplicate/concurrent turns,
  partial failure, restart, backup/restore, secret failure, telemetry failure,
  and stop/rollback behavior.
- Run static dependency, route, SQL/driver leak, secret/private-key/debug,
  prohibited-capability, production-credential, external-network, and future-
  sprint scans.
- Do not weaken a verifier. Substantive gaps require separately authorized
  remediation at the owning milestone.

### 9.9 Certification and Release Recommendation

- Re-audit every Sprint 9 exit criterion against the current repository and
  operational evidence; do not rely on milestone status labels.
- Run every focused Sprint 9 verifier, every `verify:*` script, all applicable
  PostgreSQL/identity/backup/restore/observability suites, and all static gates.
- Review the complete diff, routes, runtime capability, migrations, dependency
  tree, lockfile, credentials, environment contracts, runbooks, residual risks,
  and known exclusions.
- Record exact checkpoint, environments, evidence, cleanup, defects,
  remediations, limitations, Git state, binary certification, and a separate
  binary controlled-evaluation release recommendation.

## Required Regression Baseline

Every implementation milestone runs its focused verifier and all affected
tests. Sprint 9.8 and 9.9 run every existing and newly added `verify:*` command,
including:

- deterministic prototype, AI foundation, State Executor, read model,
  integration, journal, and Progress Engine;
- persistence contracts, PostgreSQL Conversation Store, Execution Journal,
  transaction coordinator, restart integration, and recovery;
- Business Configuration contracts, profile/knowledge stores, activation,
  activated prototype, recovery, and lifecycle;
- Sprint 8 contracts, grounding, multi-turn workflow, durable restart,
  internal fictional MVP, provider deferral, and failure/security/recovery.

Required non-verifier gates:

```powershell
git diff --check
npm.cmd run lint
npx.cmd tsc --noEmit --incremental false
npm.cmd run build
npm.cmd audit
npm.cmd audit --omit=dev
```

Also require Markdown links, migration order/checksums/history, clean migration
application, dependency/lockfile integrity, architecture-boundary scans,
secrets/private-key/debug scans, prohibited-capability and external-network
scans, route/runtime scans, and complete Git/staging status.

## PostgreSQL and Disposable Resource Rules

- Use only an explicitly configured disposable test database or isolated
  production-like environment approved for the milestone.
- Use fictional/synthetic data unless protected-data authorization explicitly
  supersedes this rule.
- Resolve exact cleanup targets before destructive operations.
- Verify test schemas, roles/credentials, environment variables, connections,
  processes, ports, backup artifacts, and temporary files are removed.
- Never test destructive recovery against an existing shared or production
  database.

## Failure and Certification Rules

- Unknown, ambiguous, partially successful, or unavailable outcomes fail
  closed and preserve only committed authoritative facts.
- No test may invent transition, authorization, release, retry, replay, repair,
  fallback, or external-action authority.
- A substantive architecture or security gap blocks certification and returns
  to a separately authorized remediation milestone.
- Passing certification does not deploy the product or authorize customer
  release; those require a separate explicit decision.
