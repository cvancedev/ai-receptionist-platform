# Sprint 9 Plan: Customer Validation and Hardening

## Status

Milestone 9.0 planning is complete and ready for review. Milestones 9.1 through
9.9 are Not Started and each requires separate explicit authorization.

Sprints 1 through 8 remain certified complete. This plan does not authorize
production deployment, real customer data, customer response release, a real
provider, a communication channel, or an external business action.

## 1. Roadmap Definition

The [Product Roadmap](../ROADMAP.md) defines Sprint 9 as **Customer Validation
and Hardening**: real-world testing, reliability improvements, usability
improvements, security review, bug fixes, and customer feedback.

The [Implementation Sequence](IMPLEMENTATION_SEQUENCE.md) defines the matching
Phase 7 goal as preparing the validated MVP for **controlled production
evaluation**. Its scope is security, tenant isolation, prompt injection,
failure recovery, observability, accessibility, performance, and production
configuration. Its deliverables are a risk review, operational runbooks,
monitored failure paths, and a release recommendation. Feature expansion
unrelated to validated MVP reliability is a non-goal.

Sprint 9 therefore prepares and evaluates readiness. It does not silently
mean production launch. A release recommendation is evidence for a later
authorization decision; it is not release authority.

## 2. Objective

Harden the certified internal fictional MVP, define the operational and
security controls required for a bounded controlled-production evaluation,
collect structured usability and customer evidence without weakening current
data restrictions, and produce a binary evidence-based release recommendation.

Sprint 9 must preserve the Sprint 8 workflow and authority model while closing
demonstrated reliability, security, accessibility, performance, configuration,
and operational-readiness gaps. Work remains milestone-gated and uses
fictional or synthetic data unless a later separately authorized milestone
first satisfies the identity, privacy, authorization, and data-governance
entry criteria defined here.

## 3. Certified Entry Boundary

All Sprint 9 work depends on and must preserve:

- exact business, profile-version, activation-revision, knowledge-version,
  conversation, state-revision, message, turn, execution, and sequence scope;
- exact historical configuration pinning after later activation;
- activation-bound grounded knowledge and exact source provenance;
- application-owned validation, decisions, transitions, persistence
  coordination, progress, completion, escalation, and handoff derivation;
- deterministic workflow and mandatory deterministic mock regression path;
- atomic durable state, Execution Journal, and message-evidence commits;
- restart from authoritative Conversation State only;
- subordinate, non-replayable journal and message evidence;
- derived handoff with no durable dispatch or follow-up authority;
- no fixture fallback on the durable activated path;
- bounded, presentation-only UI authority;
- PostgreSQL as subordinate infrastructure; and
- disabled provider integration, customer release, and external action.

No hardening concern permits silent repinning, broader lookup, data repair,
evidence replay, model-controlled mutation, UI-owned state, or storage-owned
business decisions.

## 4. Milestone Structure

### 9.0: Production Readiness Planning

**Status: Complete; ready for plan review**

**Objective:** Define the roadmap-consistent hardening sequence, decision
gates, test strategy, security and operational boundaries, exclusions, and
Sprint 9 exit criteria.

**Authorized scope:** Documentation and architecture review only.

**Prohibited scope:** Every runtime, schema, dependency, provider, channel,
identity, release, deployment, external-service, and production-data change.

**Architecture boundary:** The certified Sprint 8 implementation is the fixed
entry baseline. Planning may identify later work but grants no later milestone
authority.

**Expected implementation areas:** `docs/SPRINT_9_PLAN.md`,
`docs/SPRINT_9_TEST_PLAN.md`, and minimal roadmap/status documentation.

**Verification:** Documentation links, lint, non-incremental TypeScript,
production build, exact migrations 001–007, unchanged source/dependencies, and
prohibited-capability scans.

**Exit criteria:** A complete, non-contradictory plan and test strategy that
distinguishes readiness work from production authorization.

**Change assessment:** No migration, dependency, network, or external service.
Milestone 9.1 requires separate authorization.

### 9.1: Controlled-Evaluation Boundary and Risk Review

**Status: Not Started**

**Objective:** Define the exact controlled-evaluation target, actors, data
classification, trust boundaries, threat model, abuse cases, risk ownership,
go/no-go gates, and evidence required before any production-like runtime or
real data can be considered.

**Authorized scope when separately approved:** Architecture records, threat
model, data-flow inventory, risk register, environment classification,
customer-validation protocol, and decisions on which later conditional
milestones are necessary.

**Explicitly prohibited:** Runtime implementation, real customer or business
data, credentials, authentication implementation, provider selection,
customer release, channels, deployment, production database access, and
external actions.

**Architecture boundaries:** Application authority and exact scope remain
unchanged. Customer research is separate from product authority. Until later
gates pass, usability sessions must use fictional/synthetic data and the local
internal experience.

**Dependencies:** Sprint 8 certification and the existing project risk,
privacy, release, API, and ownership boundaries.

**Expected areas:** New focused risk/data-flow documentation and, only if
needed, updates to architecture and release-boundary documents.

**Verification:** Trace every Phase 7 concern and Sprint 8 exclusion to an
owner, threat, mitigation, test, and release gate; review cross-business,
prompt-injection, disclosure, corruption, operator-error, and third-party
failure risks.

**Exit criteria:** One approved controlled-evaluation definition and explicit
decisions for identity, data, runtime, observability, database operations, and
release needs. Unknown high-impact risks block later implementation.

**Change assessment:** No migration or dependency expected. No network or
external service. Separate authorization required.

### 9.2: Environment, Runtime Configuration, and Secret Boundaries

**Status: Not Started**

**Objective:** Establish fail-closed separation among local, test, staging-like
evaluation, and any later production environment; validate configuration and
secret-handling contracts without deploying the product.

**Authorized scope when separately approved:** Server-only configuration
schema, startup validation, environment classification, credential references,
rotation/revocation procedures, least-privilege requirements, secure failure
behavior, and test-only injection seams.

**Explicitly prohibited:** Committed secrets, browser-exposed credentials,
production credentials, deployment, production database connection, channel
credentials, provider credentials, customer release, or fallback to insecure
defaults.

**Architecture boundaries:** Configuration may select infrastructure adapters
but cannot select business truth, broaden scope, bypass validation, enable
release implicitly, or leak technology types into application/domain/UI.

**Dependencies:** Approved 9.1 environment and data classification. Existing
fixture and durable modes remain explicit; durable mode remains fail-closed.

**Expected areas:** A narrow server-runtime configuration boundary, validation
tests, and environment/secret runbooks. Public client configuration remains
separate and non-sensitive.

**Verification:** Missing, malformed, cross-environment, client-bundled,
over-privileged, rotated, and unavailable credential/configuration cases;
secret and build-artifact scans; deterministic local mode remains operational.

**Exit criteria:** No environment can accidentally gain another environment's
authority, and missing production-like configuration fails before serving or
mutating data.

**Change assessment:** No schema change expected. A dependency is not presumed;
the platform/runtime should be used unless evidence justifies a separately
approved addition. Network implications are configuration-only. Separate
authorization required.

### 9.3: Identity, Authorization, and Protected-Data Gate

**Status: Not Started; conditional**

**Objective:** If 9.1 proves protected business data, business administration,
or non-public conversation access is required for controlled evaluation,
define and implement the minimum authenticated business-user and authorization
boundary before that data or workflow exists.

**Authorized scope when separately approved:** Exact identity/session trust,
business membership, least-privilege roles, server-side authorization,
business and conversation access checks, session revocation, audit inputs, and
technology-neutral application identity contracts.

**Explicitly prohibited:** Public signup by default, generic account platform,
self-service onboarding, broad administration, identity-derived repinning,
client-only authorization, production customer release, channels, provider,
billing, and unrelated user management.

**Architecture boundaries:** Authentication proves identity; application-owned
authorization decides access. Neither establishes business configuration,
conversation, transition, grounding, release, or external-action authority.
Repository scope remains explicit even after authorization.

**Dependencies:** 9.1 must prove necessity and define actors/data. 9.2 must
establish secret and environment boundaries. Provider/vendor choice requires
a decision record and separate authorization.

**Expected areas:** Technology-neutral identity/authorization contracts,
server enforcement, minimal session integration, audit evidence, and focused
negative verification. No UI administration beyond the approved actor flow.

**Verification:** Unauthenticated, expired, revoked, wrong-business,
wrong-role, confused-deputy, identifier-tampering, replay, CSRF/session, and
cross-conversation tests without existence disclosure.

**Exit criteria:** Every protected operation is denied by default and requires
server-validated identity plus exact application authorization. If 9.1 does
not prove need, this milestone is explicitly deferred rather than implemented.

**Change assessment:** A narrowly scoped session/audit migration or identity
dependency may be necessary, but neither is preauthorized. Network/vendor
access may be implicated. Any selection and implementation require a separate
milestone authorization with an explicit migration/dependency decision.

### 9.4: Operational PostgreSQL, Migration, Backup, and Restore Readiness

**Status: Not Started**

**Objective:** Prove that the certified durable model can be operated safely
in an isolated production-like environment, including migration execution,
least privilege, backup, restore, integrity validation, and rollback planning.

**Authorized scope when separately approved:** Operational contracts and
runbooks, disposable production-like PostgreSQL verification, migration
preflight, restore drills, compatibility and corruption checks, connection
limits/timeouts, and recovery objectives derived from 9.1.

**Explicitly prohibited:** Connecting to a production database, destructive
repair, request-time migration, broad administrative credentials, changing
authoritative ownership, journal/message replay, silent rollback, or live data.

**Architecture boundaries:** PostgreSQL remains subordinate. Restore recovers
committed facts; it does not authorize them. Conversation State remains
authoritative, configuration pins remain exact, and evidence remains
non-replayable.

**Dependencies:** 9.1 risk and recovery objectives; 9.2 environment and secret
boundaries. Protected operational access may depend on 9.3.

**Expected areas:** Persistence infrastructure verification, operator tooling
with safety guards, and backup/restore/migration runbooks.

**Verification:** Fresh install, upgrade from exact 001–007 history, unknown or
out-of-order history, backup/restore, point-in-time assumptions where supported,
partial migration, unavailable database, pool exhaustion, timeout, failover
ambiguity, integrity checks, and complete disposable cleanup.

**Exit criteria:** Repeatable migration and restore evidence meets approved
recovery objectives without repair, replay, cross-scope disclosure, or partial
authority.

**Change assessment:** No schema change is assumed. An additive migration is
permitted only if a separately approved, demonstrated operational requirement
cannot be met by 001–007. No dependency is assumed. Network access is limited
to explicitly authorized disposable or isolated production-like databases.

### 9.5: Observability, Privacy, Retention, and Incident Readiness

**Status: Not Started**

**Objective:** Define and implement bounded operational signals and response
procedures that detect failures without logging sensitive content or creating
new authority.

**Authorized scope when separately approved:** Structured events and metrics
for request/trace identity, bounded scope hashes or opaque identifiers,
validation outcomes, latency, failures, retries if separately authorized,
commit outcomes, escalation, restart, and handoff readiness; redaction,
retention/deletion, alert, incident, and access procedures.

**Explicitly prohibited:** Raw credentials, unrestricted prompts, provider
payloads, raw database records, unnecessary message content, cross-business
dashboards, analytics product features, evidence replay, automatic repair, or
vendor export without approval.

**Architecture boundaries:** Observability is subordinate evidence. It cannot
mutate state, decide retry/release, reconstruct conversations, or disclose
tenant existence. Existing journal/message evidence does not become an
analytics or event queue.

**Dependencies:** 9.1 data classification and risk ownership; 9.2 environment
and secret boundaries. Any monitoring vendor requires a separate privacy,
network, retention, credential, cost, and dependency decision.

**Expected areas:** Technology-neutral telemetry contracts, redaction and
sampling policy, local/test sink, failure-path instrumentation, and runbooks.

**Verification:** Sensitive-data canaries, redaction, cardinality/bounds,
wrong-scope access, logging failure, unavailable sink, backpressure,
retention/deletion, incident drill, and no behavior change when telemetry fails.

**Exit criteria:** Required failure paths are detectable and actionable while
telemetry remains bounded, fail-safe, non-authoritative, and privacy-compliant.

**Change assessment:** A dedicated audit/retention schema or dependency is not
assumed. Any durable telemetry or external monitoring service requires a
separate demonstrated storage/vendor decision and explicit authorization.

### 9.6: Reliability, Accessibility, Performance, and Usability Hardening

**Status: Not Started**

**Objective:** Measure and correct demonstrated defects in the certified MVP
without broadening product capability.

**Authorized scope when separately approved:** Fixed fictional workload and
usability corpus, accessibility audits, keyboard/screen-reader/reduced-motion/
small-viewport checks, deterministic load and concurrency tests, bounded
latency/resource budgets, safe error and restart UX, and narrowly scoped fixes.

**Explicitly prohibited:** Feature redesign, industry-specific workflows,
analytics, provider integration, new channels, external actions, customer
release, or weakening validation for performance.

**Architecture boundaries:** UI stays presentation-only; performance changes
cannot cache or denormalize authoritative state without a separate decision;
reliability changes cannot invent retries, replay evidence, or alter pins.

**Dependencies:** 9.1 defines measurable risks and target users. Runtime and
database testing may depend on 9.2 and 9.4.

**Expected areas:** Existing UI, application composition, bounded read models,
test harnesses, and defect-owned production modules only when evidence proves
the smallest correction.

**Verification:** WCAG-oriented static/manual checks, deterministic scenarios,
concurrent and repeated turns, restart, slow/unavailable dependencies, memory
and payload bounds, response/read-model stability, and all Sprint 1–8 regressions.

**Exit criteria:** Approved accessibility, usability, reliability, and
performance budgets pass with no authority or scope regression. Findings that
require new capability return to planning.

**Change assessment:** No migration, dependency, or external service is
assumed. Any necessity requires explicit evidence and separate authorization.

### 9.7: Controlled Customer Validation and Release Gate

**Status: Not Started**

**Objective:** Execute the approved validation protocol and assemble go/no-go
evidence for a later controlled-production-evaluation decision without
silently launching the product.

**Authorized scope when separately approved:** Structured interviews,
moderated fictional/synthetic usability sessions, issue classification,
acceptance evidence, operator rehearsal, and release-readiness review. A later
authorization may permit a tightly bounded protected-data evaluation only
after every applicable identity, privacy, runtime, database, and incident gate
has passed.

**Explicitly prohibited:** Public launch, unmoderated real-customer traffic,
customer response release, production channel, external action, unsupported
data collection, implied consent, or bypassing a failed gate.

**Architecture boundaries:** Research feedback is evidence, not configuration
or workflow authority. Product state may change only through certified
application paths. No feedback can weaken isolation or grounding.

**Dependencies:** 9.1 validation protocol; 9.2 and 9.5 for any production-like
runtime; 9.3 before protected data; 9.4 before production-like persistence;
9.6 usability/accessibility criteria.

**Expected areas:** Validation records, release checklist, operator runbook,
bounded issue/remediation records, and documentation. No channel implementation.

**Verification:** Consent/data-minimization checks, scripted acceptance
scenarios, safe failure and escalation rehearsals, issue traceability,
rollback/stop conditions, and proof that no unauthorized release occurred.

**Exit criteria:** Evidence is sufficient for a binary recommendation; every
high-severity issue is remediated in its owning milestone or explicitly blocks
release recommendation.

**Change assessment:** No migration, dependency, provider, channel, or network
service is expected for fictional/moderated validation. Any protected-data or
production-like evaluation requires separate explicit authorization.

### 9.8: End-to-End Security, Failure, and Operational Verification

**Status: Not Started**

**Objective:** Re-audit the complete hardened boundary across identity if
implemented, configuration, context, model-neutral controls, state,
persistence, observability, UI, operations, and release gates.

**Authorized scope when separately approved:** Verification and documentation;
only separately authorized remediation may change production behavior.

**Explicitly prohibited:** Weakening verifiers, adding capability to satisfy a
test, production launch, provider/channel integration, customer release, or
external action.

**Architecture boundaries:** Fail closed at every trust boundary; only
committed authoritative facts survive restart; no evidence source gains replay
or decision authority.

**Dependencies:** All applicable 9.1–9.7 milestones and every Sprint 1–8
certified verifier.

**Expected areas:** Focused security/recovery verifier, architecture scans,
operational drills, and an evidence matrix.

**Verification:** Complete test plan, threat-to-test traceability, tenant and
conversation isolation, prompt injection, authorization if present, secret
handling, migration/restore, telemetry failure, load, accessibility, recovery,
and prohibited-capability scans.

**Exit criteria:** No unresolved critical/high risk and no substantive exit-
criteria gap. A substantive defect returns to a separately authorized owning
milestone.

**Change assessment:** Verification should require no migration, dependency,
or external service. Separate authorization required.

### 9.9: Sprint 9 Certification and Release Recommendation

**Status: Not Started**

**Objective:** Audit every Sprint 9 exit criterion and issue a binary Sprint 9
certification plus a separate release recommendation.

**Authorized scope when separately approved:** Certification evidence and
status documentation only.

**Explicitly prohibited:** Silently fixing substantive architecture,
deploying, enabling release, creating credentials, connecting production data,
or beginning the next sprint.

**Architecture boundaries:** Certification records evidence; it grants no
runtime authority. “Sprint 9 certified” and “authorized for controlled
production evaluation” remain separate decisions.

**Dependencies:** All required milestones and complete regression, security,
operational, privacy, accessibility, performance, and documentation evidence.

**Expected areas:** `docs/certification/SPRINT9_CERTIFICATION.md`, release
recommendation, and minimal status synchronization.

**Verification:** Every focused Sprint 9 verifier, all Sprint 1–8 regressions,
all applicable PostgreSQL/identity/operational suites, build and security
gates, complete diff/capability audit, and clean disposable-resource cleanup.

**Exit criteria:** Binary certification and binary release recommendation with
known exclusions, residual risks, exact checkpoint, and no implicit launch.

**Change assessment:** No migration, dependency, provider, network, or
external service. Separate authorization required.

## 5. Capability Decisions

| Capability | Sprint 9 planning decision |
| --- | --- |
| Real AI provider | Deferred. Sprint 8 found no acceptance gap. Reconsider only through a separate fixed-corpus authorization; not required for hardening. |
| Authentication/authorization | Conditional prerequisite only if 9.1 proves protected business data or administration is needed. Milestone 9.3 remains separately gated. |
| Real customer release | Not authorized. Sprint 9 may produce a recommendation; an actual release requires a separate explicit release milestone and channel policy. |
| Telephony, SMS, email sending | Deferred as future communication channels. Existing static `mailto:` links are not a product channel. |
| External business actions | Deferred. Handoff dispatch, assignment, acknowledgement, and follow-up remain separate workflows. |
| Billing/payments | Deferred and outside the validated MVP. |
| Production deployment | Not authorized by 9.0. Environment, rollback, and readiness planning are in scope; actual deployment requires separate authorization after a passing gate. |
| Production database operations | No production connection is authorized. Disposable production-like migration/backup/restore proof may be separately authorized in 9.4. |
| Monitoring/observability | Required by Phase 7, but implementation/vendor selection remains separately authorized in 9.5. Prefer technology-neutral local evidence first. |
| Backup/recovery | Required operational planning and disposable proof in 9.4; no live production operation is authorized. |
| Administrative interfaces | Deferred unless 9.1 proves one minimum protected workflow is necessary; authentication and exact authorization must precede it. |

## 6. Security and Operational Requirements

- Separate local, test, production-like evaluation, and any future production
  environment with deny-by-default configuration.
- Keep credentials server-only, least-privileged, rotatable, revocable, absent
  from source/build/browser/log/evidence, and scoped to one environment.
- Require authenticated identity and application authorization before any
  protected business data or administration; continue exact repository scope.
- Classify and minimize data before collection. Define purpose, consent,
  access, retention, deletion, incident, and breach-response ownership.
- Keep logs bounded and redacted. Operational telemetry must not contain raw
  credentials, unrestricted prompts, provider payloads, raw database records,
  or unnecessary customer content.
- Preserve exact ordered migrations, prefix integrity, preflight, backup, tested
  restore, rollback/stop conditions, and no request-time repair.
- Define measurable recovery objectives, dependency timeouts, capacity limits,
  failure classifications, operator actions, escalation, and incident drills.
- Require reversible deployment steps and verified rollback before any later
  deployment authorization.
- Any later external service requires explicit data, region, retention,
  credential, transport, availability, retry, rate, cost, and exit decisions.

## 7. Sprint 9 Exit Criteria

Sprint 9 may be certified only when:

- the controlled-evaluation boundary, actors, data, threats, residual risks,
  and go/no-go gates are explicit and approved;
- every applicable environment, secret, identity, authorization, tenant,
  privacy, retention, observability, database, backup, restore, failure,
  accessibility, usability, performance, and rollback control is implemented
  and verified in its separately authorized milestone;
- protected data and administration remain impossible unless the conditional
  identity/authorization gate is complete;
- all Sprint 8 authority, pinning, grounding, atomicity, restart, evidence,
  handoff, fixture-fallback, UI, PostgreSQL, release, and external-action
  invariants remain passing;
- high-severity customer-validation, security, reliability, accessibility, and
  operational findings are corrected by their owning authority or block
  certification;
- every Sprint 1–8 regression and applicable Sprint 9 focused, PostgreSQL,
  security, failure, recovery, isolation, migration, dependency, accessibility,
  performance, and operational test passes;
- migrations and dependencies are exact, reviewed, justified, and free of
  silent drift;
- provider, channel, release, external action, billing, deployment, and future
  features remain absent unless a later explicit authorization and test gate
  specifically supersedes the relevant prohibition; and
- certification records a binary Sprint 9 result and a separate binary release
  recommendation with exact exclusions and residual risk.

## 8. Sprint 9.0 Definition of Done

- The roadmap definition is preserved without treating hardening as launch.
- Milestones 9.1–9.9 have objective, scope, prohibitions, boundaries,
  dependencies, implementation areas, verification, exit criteria, and
  migration/dependency/network assessments.
- The test plan covers focused evidence, full regressions, PostgreSQL,
  isolation, security, recovery, migration, dependencies, prohibited
  capabilities, and final certification.
- Documentation changes only; production source, migrations, dependencies, and
  lockfile remain unchanged.
- Sprint 9.1 remains Not Started and separately authorized.
