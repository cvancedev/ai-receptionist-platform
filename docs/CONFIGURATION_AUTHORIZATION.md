# Configuration Authorization

## Purpose

Milestone 7.1 defines the authorization information an application decision
must receive before configuration may change. It does not implement identity,
authentication, roles, sessions, permissions storage, or a production policy
engine.

## Required Input

A configuration change context contains:

- a stable request identifier;
- the expected revision;
- an actor identifier;
- an authorization decision identifier;
- an explicit `authorized` or `denied` decision; and
- the required configuration audit context.

Missing or denied authorization cannot be interpreted as approval. Actor and
decision identifiers are traceability inputs, not proof that authentication
exists.

## Application Authority

The application owns whether a request may proceed. A future authentication or
authorization provider may supply evidence, but it cannot activate
configuration directly. Repositories receive only already-authorized requests
and still cannot infer authorization from possession of a record or database
connection.

## Fictional Verification Boundary

Sprint 7 may use explicit fictional actor and decision fixtures to verify
contracts. Those fixtures do not represent a real user, account, tenant session,
role model, or production security control. No real or protected business data
may enter this path before production authentication and authorization are
separately designed and certified.

## Model, UI, and Conversation Limits

- Model or provider output cannot supply authoritative actor approval.
- A UI event or API request is not authorization by itself.
- Customer messages and conversation state cannot authorize permanent
  configuration changes.
- Industry labels and inferred business type cannot authorize configuration.
- Business approval cannot override platform safety, privacy, honesty, or
  reliability rules.

## Audit Requirement

Every future accepted lifecycle-changing request must identify the audit event,
operation, subject, and non-empty reason. Configuration audit remains separate
from the Conversation Execution Journal and has no execution, replay, retry,
release, or external-action authority.

## Deferred Work

Production authentication, account ownership, roles, delegated administration,
session security, and authorization policy implementation remain outside
Milestone 7.1 and Sprint 7 unless separately authorized.

## Milestone 7.4 Activation Boundary

The activation coordinator now rejects denied authorization before persistence
and requires canonical request, actor, decision, audit, scope, and revision
evidence. The PostgreSQL store receives only an application-approved activation
and persists evidence without authenticating an actor or deciding permission.
Fictional verification identities remain non-production inputs.
