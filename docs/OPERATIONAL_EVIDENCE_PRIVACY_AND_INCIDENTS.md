# Operational Evidence, Privacy, Retention, and Incidents

## Scope

Milestone 9.5 adds a disconnected application-owned in-memory operational
evidence policy for fictional local/test verification. It answers bounded
questions about success, failure, safe rejection, subsystem, reason, and
correlation without retaining customer or provider content.

It is not production monitoring, analytics, an audit replacement, a telemetry
exporter, durable storage, a vendor integration, or an incident automation
system. Controlled evaluation and production remain unauthorized.

## Evidence Model

Each retained entry contains only:

- an allowlisted event type, subsystem, outcome, and sanitized reason code;
- a bounded correlation identifier;
- local-development or automated-test identity;
- an ISO timestamp and fictional-operational classification;
- sequence, schema version, and a bounded redaction summary; and
- literal false state, replay, authorization, configuration, recovery, export,
  customer-release, and external-action authority.

Unknown events, subsystems, reasons, environments, shapes, or evidence classes
fail closed. Evidence is deeply immutable, process-local, and capped at 100
entries. It cannot replace the Execution Journal or message evidence.

## Privacy and Redaction

The API accepts an explicitly untrusted context only to inspect bounded shape
and discard it entirely. No value from that context enters evidence. Traversal
is capped at 64 nodes and six levels, handles circular references, and fails
closed for throwing proxies/getters or excessive depth. It never invokes
custom `toString` or `valueOf` behavior.

Customer messages, protected/sensitive data, credentials, passwords, tokens,
API keys, connection strings, private keys, raw prompts/provider responses,
headers, request bodies, business configuration content, and unknown/mixed
content must never be retained. A sanitization failure rejects the event and is
a high-severity blocking incident condition.

## Retention

Only `fictional-operational` evidence may be retained. The provisional local
controlled-evaluation window is 24 hours, enforced by explicit cleanup. The
store remains bounded even before cleanup and has no durable adapter. Test and
evaluation operators own cleanup at session end and on expiry.

This is not a production legal or compliance policy. Before real customer use,
purpose, lawful basis, notice/consent where applicable, access, retention,
deletion, legal hold, regional storage, vendor terms, and accountable ownership
must be separately approved. Evidence must never be sufficient to reconstruct
Conversation State.

## Incident Readiness

The application-owned incident classifier blocks controlled evaluation and any
future release for:

- secret exposure;
- protected-data leakage;
- cross-business access;
- authorization bypass;
- authoritative-state corruption;
- migration-integrity or recovery-proof failure;
- environment or runtime-configuration failure;
- unresolved high/critical dependency vulnerability;
- unauthorized response release or external action; and
- inability to sanitize operational evidence.

Unknown or malformed incident conditions also block. The bounded response
sequence is: detect, contain, preserve bounded evidence, assess, remediate,
verify, and document the decision. It grants no automatic remediation or
external-action authority and invents no enterprise organization or SLA.

## Authority and Export Boundaries

Operational evidence is subordinate and non-replayable. It cannot mutate,
reconstruct, validate, repair, or override Conversation State, configuration
pins, authorization, migrations, repositories, recovery, journal/message
evidence, release, or external actions. Correlation identity is not actor or
scope authority.

Environment identity and credential presence grant no evidence or export
authority. There is no network call, monitoring credential, vendor, sink,
background worker, migration, dependency, database table, route, or client
integration.

Related documentation:

- [Data Classification](DATA_CLASSIFICATION.md)
- [Threat Model and Risk Register](THREAT_MODEL_AND_RISK_REGISTER.md)
- [Data and State Ownership](DATA_AND_STATE_OWNERSHIP.md)
- [Runtime Configuration and Secrets](RUNTIME_CONFIGURATION_AND_SECRETS.md)
- [Identity, Authorization, and Protected-Data Gate](IDENTITY_AUTHORIZATION_AND_PROTECTED_DATA.md)
- [Operational PostgreSQL Readiness](OPERATIONAL_POSTGRESQL_READINESS.md)
- [Sprint 9 Plan](SPRINT_9_PLAN.md)
- [Sprint 9 Test Plan](SPRINT_9_TEST_PLAN.md)
