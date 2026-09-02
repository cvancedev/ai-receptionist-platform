# Threat Model and Risk Register

## Scope and Assets

This threat model covers the certified Sprint 8 internal fictional MVP and the
candidate controlled-evaluation boundary defined in Milestone 9.1. It does not
claim production security readiness.

Protected assets include tenant and conversation isolation; exact profile,
activation, and knowledge pins; authoritative Conversation State; business
configuration and knowledge; customer content; credentials; atomic state and
evidence integrity; source provenance; application decision authority; and the
absence of customer release or external actions.

## Threat Actors

- a participant intentionally probing prompts, scope, hidden context, or
  unsupported capability;
- an invited participant who accidentally enters real or sensitive data;
- malicious or compromised business configuration or knowledge content;
- malformed, adversarial, or provider-shaped output;
- an operator using the wrong environment, credentials, scope, or procedure;
- another tenant or conversation attempting identifier substitution;
- a dependency, database, filesystem, telemetry sink, or future provider that
  is unavailable, corrupt, delayed, compromised, or ambiguous; and
- an unauthorized observer gaining access to screens, logs, exports, backups,
  temporary artifacts, or credentials.

## Trust-Boundary Review

| Boundary crossing | Required control | Safe failure |
| --- | --- | --- |
| Participant to UI | Treat input as untrusted, bounded data; moderate and classify before retention | Reject/stop without mutation, release, or propagation |
| UI to application | Bounded contracts and exact identities; UI has presentation authority only | Sanitized failure; no raw-state or repository fallback |
| Configuration/knowledge to context | Exact lifecycle, activation, audience, time, source, version, and contradiction checks | Context unavailable; no fixture/current/nearest substitution |
| Provider-shaped result to decision | Inert bounded parsing, allowlists, grounding, authority and revision validation | Reject; no mutation, persistence authority, release, or action |
| Application to persistence | Application-approved exact-scope operations, optimistic concurrency, atomic commit | Preserve last committed state; no retry invention or partial evidence |
| Persistence/evidence to restart | Decode/validate authoritative state directly; evidence is subordinate and non-replayable | Recovery unavailable; no repair from journal/message/log data |
| Application to UI/release | Bounded read models and literal no-release authority | Local safe failure; no channel or callback |
| Operator/environment | Explicit classification, least privilege, stop/cleanup procedure, no insecure defaults | Startup/session no-go |
| Evidence to research review | Minimize, redact, purpose-limit, access-limit, retain/delete on schedule | Do not export; sanitize incident reference only |

## Risk Register

Severity reflects impact before the stated control. “Blocked” means the risk
prevents a later controlled evaluation if its gate is not satisfied.

| ID | Threat/abuse case | Severity | Existing control | Residual risk and required evidence | Owner/gate | Status |
| --- | --- | --- | --- | --- | --- | --- |
| R9-01 | Cross-business/profile/conversation identifier substitution or existence probing | Critical | Exact scoped contracts, repository keys, context validation, non-disclosing outcomes | Future identity or routing could become a confused deputy; rerun full isolation matrix | Application/security; 9.3 if activated, 9.8 | Blocked if any scope path is ambiguous |
| R9-02 | Prompt injection in customer text | High | Content/instruction separation, deterministic task selection, bounded contracts, validation, no tools/release | Real model robustness is untested and provider remains deferred | AI/application; provider gate and 9.8 | Controlled by deterministic-only boundary |
| R9-03 | Configuration or knowledge poisoning | High | Versioned lifecycle, review/approval, activation binding, audience/time/source checks, grounding | No authenticated approver exists for real business data | Configuration/security; 9.3 before real data | Real configuration prohibited |
| R9-04 | Malicious/malformed provider-shaped output requests mutation, disclosure, release, or tools | Critical | Mock-only provider-neutral parsing, allowlists, grounding, Transition Validator/Executor, no release/action capability | A future real provider changes envelope and operational risk | Application/AI; separate provider authorization | Provider remains deferred |
| R9-05 | Journal, message evidence, logs, or research notes are replayed as state | Critical | Conversation State authoritative; evidence subordinate/non-replayable; restart validation | Future telemetry/export tooling could accidentally gain repair authority | Application/persistence; 9.5 and 9.8 | Blocked on any replay path |
| R9-06 | Atomic persistence failure, stale/duplicate turn, commit ambiguity, or corruption | High | Optimistic concurrency, atomic coordinator, exact IDs, rollback, restart/recovery suites | Production-like backup/restore and operational objectives unproven | Persistence/operations; 9.4 | Production-like durable evaluation no-go |
| R9-07 | Unauthorized customer-response release | Critical | Literal false/absent release authority; local display only; no channel | Future route/channel could collapse validation and delivery | Application/security; separate release milestone | Release prohibited |
| R9-08 | Unauthorized external action or handoff dispatch | Critical | No tools/channels/dispatch integrations; handoff is derived data | Future integrations require authentication, authorization, idempotency, audit, rollback | Application/security; future explicit milestone | External actions prohibited |
| R9-09 | Credential, token, private-key, or connection-string exposure | Critical | Server-only reference/availability contract, sanitized provenance, no secret material, production credentials prohibited | No secret store or production credential path exists; future implementations require separate review and leak verification | Operations/security; future credential milestone | Production-like runtime no-go |
| R9-10 | Logs/telemetry expose customer, prompt, knowledge, SQL, or cross-tenant content | High | No monitoring vendor; bounded existing evidence; raw payloads excluded | Redaction, sink failure, access, retention, and deletion are not implemented | Privacy/operations; 9.5 | Monitored evaluation no-go |
| R9-11 | Participant accidentally supplies real, protected, payment, health, legal, or minor data | High | Moderation, fictional scenarios, explicit prohibition, stop rule | Automated detection and incident process are not implemented | Research/privacy; 9.5 and 9.7 | Blocked without containment/deletion procedure |
| R9-12 | Operator uses production/shared database, wrong environment, broad credentials, or skips cleanup | Critical | Exact environment identity, deny-by-default capability preflight, test-only credential receipt, disposable PostgreSQL rules | Production-like database runbooks, least-privilege operation, backup/restore, and cleanup drills remain unproven | Operations; 9.4 | Production-like evaluation no-go |
| R9-13 | Denial of service, oversized input, pool exhaustion, dependency outage, or repeated failure | High | Bounded messages/context/output, explicit failures, deterministic fallback, persistence recovery | Capacity budgets, timeouts, cancellation, and operational SLOs not certified | Reliability/operations; 9.4 and 9.6 | Participant evaluation no-go until budgets pass |
| R9-14 | UI exposes raw state, internal knowledge, SQL, credentials, or authority controls | High | Bounded immutable read model and presentation-only certified UI | Accessibility/error changes can regress boundaries | UI/application; 9.6 and 9.8 | Blocked on raw fallback |
| R9-15 | Research feedback is treated as configuration, customer fact, or product authority | Medium | Feedback is separate evidence; lifecycle and state contracts remain authoritative | Manual triage process must preserve provenance and scope | Product/research; 9.7 | Controlled by protocol |
| R9-16 | Dependency or supply-chain compromise introduces network, parsing, build, or image/CSS risk | High | Exact lockfile, audits, minimal dependencies, no untrusted CSS/image path | Audit is point-in-time and cannot prove package integrity permanently | Engineering/security; every milestone | Blocked on unresolved critical/high advisory |

## Residual-Risk Decision

The certified system has strong deterministic scope, authority, persistence,
and recovery controls for fictional use. It does not yet have authenticated
identity, protected-data authorization, authorized production runtime operation,
production database operations, monitoring/privacy operations, incident
response, capacity objectives, or release infrastructure. Those are explicit
gaps, not implied capabilities.

Accordingly:

- **GO** only to separately authorized work on later required hardening gates
  using fictional/synthetic data.
- **NO-GO** for running participant evaluation through Milestone 9.2.
- **NO-GO** for protected/real data, production-like runtime, production
  database, deployment, provider calls, customer release, and external action.
- Any unknown critical/high risk or failed certified boundary blocks progress
  and returns to its owning milestone; it is never accepted silently.

Related boundary: [Controlled-Evaluation Boundary](CONTROLLED_EVALUATION_BOUNDARY.md).

Milestone 9.3 reduces confused-deputy, identifier-tampering, client-claim, and
infrastructure-signal risk by making exact scope checks and universal denial
executable. Residual identity, session, membership, CSRF, replay, revocation,
and protected-data risks remain blocking because no real authentication system
or protected workflow exists. Those controls remain prerequisites for any
later protected-data or administration authorization.
