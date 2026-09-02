# Identity, Authorization, and Protected-Data Gate

## Decision

Milestone 9.3 does not implement real authentication. Milestone 9.1 approved
only moderated local/test evaluation with fictional or synthetic scenarios and
did not establish a need for protected business data, non-public customer
conversations, business administration, or an unmoderated actor flow.

The correct conditional outcome is therefore continued prohibition. Sprint
9.3 adds one disconnected server-side policy contract that makes the denial
explicit and testable. It does not create an authenticated actor, session,
account, membership, role assignment, protected operation, or evaluation
runtime.

## Identity Model

The policy recognizes anonymous/untrusted, controlled-evaluator,
authorized-observer, business-scoped, and privileged/admin actor descriptions.
These names do not prove identity or grant authority. Every actor remains
unvalidated because there is no approved identity validator, provider, session
authority, account store, or membership source.

Client claims, headers, UI state, network location, credential presence,
runtime configuration, database rows, and provider output cannot validate an
actor. Any later identity-provider assertion must remain untrusted until a
separately authorized server boundary validates and maps it.

## Authorization Model

Authorization is application-owned, server-side, deny-by-default, and distinct
from authentication. The isolated policy checks exact known actor and operation
types, local/test environment eligibility, requested business and conversation
scope, known data classification, and the continuing milestone prohibitions.

A successful scope comparison is necessary evidence only. It cannot establish
identity, membership, a role, configuration truth, conversation truth,
transition authority, grounding, release, or external-action authority. Every
Sprint 9.3 decision remains denied.

## Protected-Data Gate

Protected/sensitive information, credentials/secrets, unknown or mixed data,
non-public conversation access, and business administration remain prohibited.
No combination of actor name, matching identifiers, environment identity,
runtime configuration, or credential presence can open the gate.

Before any later protected-data workflow, a separately authorized milestone
must define necessity, purpose, consent, minimization, authenticated identity,
membership and role authority, session security and revocation, exact server
enforcement, audit/privacy controls, retention/deletion, incident response,
and existence-nondisclosing repository behavior.

## Server and Client Boundary

The contract lives at
`src/server/authorization/protected-data-authorization.ts`. It is not a route,
middleware, server action, UI permission check, session integration, public
configuration surface, or persistence adapter. Client-facing code cannot
import it. The website and fictional prototype remain unchanged.

## Preserved Authority and Exclusions

The policy cannot mutate or override Conversation State, activated Business
Configuration, configuration pins, grounding, transitions, repositories,
Execution Journal, message evidence, runtime configuration, release, handoff,
or external actions. PostgreSQL remains infrastructure only. Controlled
evaluation and production remain unauthorized by the runtime boundary.

Sprint 9.3 adds no identity provider, OAuth/OIDC, login, password, token,
cookie, session, account, membership store, administration UI, protected data,
route, middleware, provider, network call, database connection, migration,
dependency, channel, release, external action, deployment, or Sprint 9.4
behavior.

Related documents:

- [Controlled-Evaluation Boundary](CONTROLLED_EVALUATION_BOUNDARY.md)
- [Data Classification](DATA_CLASSIFICATION.md)
- [Runtime Configuration and Secrets](RUNTIME_CONFIGURATION_AND_SECRETS.md)
- [API Boundaries](API_BOUNDARIES.md)
- [Data and State Ownership](DATA_AND_STATE_OWNERSHIP.md)
- [Sprint 9 Plan](SPRINT_9_PLAN.md)
- [Sprint 9 Test Plan](SPRINT_9_TEST_PLAN.md)
