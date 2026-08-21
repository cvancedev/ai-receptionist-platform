# Sprint 8 Test Plan

## Purpose

Define the evidence required for each independently authorized Sprint 8
milestone and final certification. The deterministic/mock path is the baseline;
PostgreSQL evidence is required for every durable claim; a provider-backed
path is tested only if Milestone 8.6 separately authorizes one.

## Cross-Cutting Gates

Every milestone must run its focused verifier plus all affected certified
regressions. Every implementation result must prove:

- exact business, profile-version, knowledge-version, and conversation scope;
- application/domain authority and PostgreSQL technology isolation;
- immutable, detached inputs and bounded explicit outcomes;
- no direct model mutation, customer release, external action, or UI authority;
- no fixture fallback on the selected durable activated path;
- deterministic mock compatibility; and
- documentation, migration, dependency, secret, debug, and prohibited-capability
  integrity.

## Milestone Evidence

### 8.0 Planning

- Clean certified `2e2564d` baseline is confirmed.
- Plans are documentation-only and links resolve.
- Lint, TypeScript, production build, diff integrity, and Git scope pass.

### 8.1 Contracts and Composition

**Status: Complete**

- Contract-shape verification rejects missing, extra, malformed, broad, and
  cross-scope inputs.
- Coordinator capability scan shows no repository implementation, SQL,
  provider SDK, UI, callback, release, or external-action authority.
- Storage gap decision maps each acceptance datum to an existing authority or
  documents why a new durable record is necessary.

`npm.cmd run verify:end-to-end-contracts` proves exact start and resume input,
activated-boundary delegation, resolved-scope consistency, versioned knowledge
references, immutable bounded outputs, deterministic progress, derived
handoff readiness, sanitized failures, no message persistence, and absence of
mutation, transition, release, external-action, provider, UI, PostgreSQL, or
route authority.

### 8.2 Activated Context and Knowledge

- Exact current activation initializes a new conversation once.
- Exact historical activation reconstructs an existing pinned conversation.
- Only explicitly bound, active, effective, customer-audience knowledge enters
  context with record/version/source provenance.
- Missing, suspended, malformed, expired, future-effective, unbound,
  wrong-business, wrong-profile, and wrong-conversation inputs fail closed.
- Reactivation changes new conversations only; no fixture, nearest-version, or
  current-profile substitution occurs.

`npm.cmd run verify:activated-context-grounding` proves exact activated
context construction, full source provenance, deep immutability, bounded
application authority, grounded-candidate validation, historical profile and
knowledge pinning after reactivation, and fail-closed wrong-scope, unbound,
suspended, expired, malformed, future-effective, staff-only, contradictory,
and source-mismatch outcomes. The Sprint 6 and 7 PostgreSQL suites continue to
prove the durable resolution, ownership, restart, and isolation boundaries
composed beneath it.

### 8.3 Multi-Turn Workflow

**Status: Complete**

- Acceptance scenarios cover greeting, request understanding, resolved,
  ambiguous, missing, and unsupported service paths.
- Required questions are asked once in deterministic order; optional questions
  remain relevant and bounded.
- Claims do not become confirmed facts without validation.
- Corrections preserve history, reopen dependent requirements, and recalculate
  readiness.
- Deterministic confirmation, escalation, completion, and handoff operations
  follow the existing Conversation Engine and State Manager invariants with
  validated expected revisions; any model-controlled transition remains
  registry-, validator-, and executor-controlled.
- Invalid grounded candidates, invented fields, authority violations,
  duplicates, and stale requests cause no mutation or release.

`npm.cmd run verify:deterministic-multi-turn-workflow` proves exact activated
context seeding, detached inputs, deterministic ordered collection,
clarification, correction history, confirmation, escalation, completion,
derived handoff, grounded-source validation, and fail-closed malformed,
wrong-scope, wrong-message-conversation, stale, duplicate, invalid-sequence,
invalid-transition, and invalid-grounding outcomes. It also proves the
fixture-free production boundary, unchanged model-controlled Transition
Registry, no customer release, and no Milestone 8.4 persistence capability.

### 8.4 Durability and Restart

**Status: Complete**

- Approved state and required execution evidence commit together or neither
  commits.
- Duplicate execution and stale revision attempts do not create a second
  transition or audit fact.
- Rollback, unavailable storage, corruption, and ambiguous commit outcomes
  return explicit safe failures.
- Restart reconstructs exact state, profile pin, knowledge provenance,
  progress, corrections, question history, and derived handoff.
- If a migration is authorized, verify order, checksum/history compatibility,
  clean application, rollback, constraints, cross-business isolation, decoder
  failure, and unchanged migrations 001 through 006.

`npm.cmd run verify:durable-turn-restart` proves ordered migration 007,
atomic state/execution/message commit, rollback after the last dependent write,
duplicate and stale no-op behavior, restart through fresh adapters, exact
message-to-state revision and activation provenance, corruption rejection, and
cross-business isolation.

### 8.5 Internal Fictional Experience

- The existing prototype remains usable in its fixture-backed mode.
- The durable activated mode is explicit and cannot fall back to fixtures.
- UI renders bounded read models and cannot expose raw state, SQL, credentials,
  provider payloads, or internal-only knowledge.
- Keyboard, focus, labels, status announcements, small viewport, and reduced
  motion behavior pass accessibility checks.
- No response is transmitted outside the local fictional experience.

### 8.6 Provider Gate

**Status: Complete; provider deferred**

- Fixed fictional comparison scenarios measure task accuracy, grounding,
  invalid-output rate, latency, and failure behavior against the mock baseline.
- Prompt injection, knowledge conflict, source mismatch, oversized output,
  malformed output, refusal, timeout, cancellation, rate limit, and provider
  outage fail through the normalized contract.
- A provider decision identifies data sent, retention settings, credentials,
  cost bounds, supported model/version, retry policy, and accountable review.
- If no adapter is authorized, verification records deferral and the end-to-end
  deterministic path remains fully operable.
- If an adapter is authorized, it cannot mutate state or release content and
  can be replaced by the mock without domain/application changes.

`npm.cmd run verify:provider-evaluation` proves that the deterministic mock
remains functional; malformed, ungrounded, fabricated-source, authority-
violating, refused, failed, and cancelled results produce no mutation,
customer release, or network access; the evaluation records timeout,
unavailability, privacy, credential, cost, transport, and separate-
authorization requirements; and no provider dependency is selected.

### 8.7 Failure, Security, and Recovery

**Status: Complete**

- Compose the complete negative matrix across configuration, context, model,
  state, persistence, projection, and handoff.
- Prove no tenant/existence disclosure, silent repair, repinning, replay,
  fallback configuration, partial write, or external effect.
- Run secret/private-key/debug scans, dependency audits, PostgreSQL-type leak
  scans, prohibited-capability scans, migration-history checks, Markdown-link
  verification, lint, TypeScript, build, and the full certified regression
  suite.

`npm.cmd run verify:end-to-end-failure-security-recovery` maps every required
negative and recovery boundary to executable certified evidence and directly
rechecks untrusted provider outcomes, malformed and oversized message
evidence, UI isolation, technology-neutral application contracts, subordinate
non-replay evidence, and disabled release/external-action authority.

### 8.8 Certification

**Status: Complete; Sprint 8 certified**

- Re-run every focused Sprint 8 verifier and every certified Sprint 3 through
  Sprint 7 verifier.
- Run durable suites against a disposable localhost-only PostgreSQL environment
  with fictional data and complete cleanup.
- Review the complete diff, migrations, dependency tree, documentation claims,
  routes, and runtime capability surface.
- Record exact evidence, defects, limitations, security baseline, Git state,
  and a binary certification result.

The complete matrix passed and is recorded in the
[Sprint 8 Certification](certification/SPRINT8_CERTIFICATION.md). Sprint 9
remains Not Started.

## End-to-End Acceptance Scenarios

1. A new fictional conversation uses the current eligible activation, gathers
   complete intake, accepts a correction, confirms understanding, and derives
   an actionable handoff.
2. An ambiguous request asks bounded clarification without duplicate questions.
3. An unsupported request preserves the claim and routes to human review
   without inventing a service or promise.
4. An approved knowledge answer includes exact source/version provenance;
   absent or conflicting knowledge produces honest uncertainty and escalation.
5. Reactivation leaves an existing conversation on its original profile and
   allows a new conversation to use the newer active version.
6. Restart at each durable stage preserves exact state, pinning, progress, and
   reproducible handoff.
7. Wrong-business, wrong-profile, wrong-knowledge, and wrong-conversation
   requests fail without confirming whether another scoped record exists.
8. Invalid or unavailable model behavior creates no state mutation, customer
   release, or external action; the deterministic path remains available.
9. Suspension blocks new eligibility and fails safely for subsequent context
   use according to the certified lifecycle contract.
10. Transaction failure leaves the last committed state and required execution
    evidence authoritative and consistent.

## Required Regression Baseline

Certification must include all existing `verify:*` commands in `package.json`,
lint, non-incremental TypeScript checking, production build, both npm audits,
Markdown links, migration order/history, dependency/lockfile integrity,
application/domain PostgreSQL-type leakage, secrets/private-key/debug scans,
and Sprint 9 capability scans.

No milestone may weaken an existing verifier to obtain a pass. A discovered
contract mismatch must be classified and corrected at the owning authority
with the smallest scoped change.
