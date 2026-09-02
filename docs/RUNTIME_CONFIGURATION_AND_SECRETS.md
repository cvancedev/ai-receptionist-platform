# Runtime Configuration and Secrets Boundary

## Purpose

Milestone 9.2 establishes an application-owned, deny-by-default preflight for
server runtime identity, capability selection, credential references, and
sanitized provenance. It does not deploy or start a new runtime, connect a
database, load a secret, authorize a controlled evaluation, or expose a public
configuration endpoint.

The contract is implemented in
`src/server/runtime/runtime-configuration.ts`. A future server composition root
must pass it an explicit environment snapshot. Domain, application, UI, and
persistence modules must not read ambient environment state to make business
decisions.

## Environment Model

| Environment identity | Recognized | Startup decision in 9.2 | Permitted scope |
| --- | --- | --- | --- |
| `local-development` | Yes | Eligible after valid preflight | Existing fictional deterministic fixture path; optional fictional durable activated path with a scoped test-database credential receipt; bounded operational evidence |
| `automated-test` | Yes | Eligible after valid preflight | Same bounded fictional capabilities as local development |
| `controlled-evaluation` | Yes | Denied | Identity is reserved, but 9.2 does not authorize evaluation execution or a production-like runtime |
| `production` | Yes | Denied | Production runtime, database, deployment, data, release, and actions remain unauthorized |

Unknown, missing, malformed, contradictory, or incomplete identity fails
closed. `NODE_ENV`, hostname, deployment-provider metadata, database URLs, and
credential presence cannot establish or override application environment
identity. Recognition of a name grants no capability.

## Runtime Input Contract

The server boundary accepts only an explicit snapshot of namespaced values:

- `AI_RECEPTIONIST_RUNTIME_ENVIRONMENT`;
- `AI_RECEPTIONIST_RUNTIME_CONFIGURATION_ID`;
- `AI_RECEPTIONIST_RUNTIME_CAPABILITIES`; and
- `AI_RECEPTIONIST_TEST_DATABASE_CREDENTIAL_REFERENCE`, only when the
  fictional durable activated path is explicitly selected.

Unknown `AI_RECEPTIONIST_*` keys fail closed. Capabilities use an exact,
duplicate-free allowlist. The validated result is deeply immutable and records
sanitized provenance: configuration ID, recognized input-key names, credential
purposes checked, and the explicit fact that no secret value was retained.

Runtime configuration may select an already-certified adapter path. It cannot
select or override Business Profile or Knowledge versions, activation,
Conversation State, revision, transition legality, grounding, persistence
ownership, response release, or external actions.

## Capability Boundary

Only these bounded capabilities may pass local/test preflight:

- deterministic fixture prototype;
- fictional durable activated path; and
- bounded operational evidence.

The durable capability requires both an explicit test-database credential
reference and an independently supplied `available` receipt. Missing,
unavailable, or revoked receipts fail before use. Presence of either item does
not add the capability when it was not explicitly requested.

Controlled-evaluation execution, provider/network model execution, customer
release, external actions, telephony, SMS, email sending, CRM actions,
scheduling, payments, production deployment, production database use,
protected-data processing, administration, and authentication/authorization
remain denied. They are names in a deny-by-default policy, not implemented
features.

## Secret and Credential Rules

- Secret material remains server-only and must never enter this configuration
  contract. The contract accepts only bounded references and availability
  receipts.
- Secret values must never appear in source, Git, public configuration, client
  bundles, logs, errors, telemetry, journal entries, message evidence,
  provenance, verification output, or documentation examples.
- Credential presence is not environment, capability, business, configuration,
  conversation, release, or action authority.
- There are no default or fallback production credentials. Missing required
  credentials fail only the capability that requires them, before service or
  mutation.
- Credentials must be least-privileged, scoped to one environment and purpose,
  independently rotatable, and revocable without changing domain state.
- Rotation supplies a new server-only secret under an approved stable or new
  reference, revalidates availability, verifies the dependent capability, then
  revokes the prior secret. Secret values are never copied into configuration
  provenance.
- Revocation changes the availability receipt to `revoked`; subsequent
  preflight fails closed. Suspected disclosure requires revocation, sanitized
  incident evidence, and later incident procedures before reuse.
- A future secret store, provider credential, channel credential, identity
  credential, monitoring credential, or production database credential
  requires its own explicit milestone and least-privilege review.

## Public and Client Boundary

Only the bounded public projection may cross a client-facing boundary. It
contains the validated local/test environment identity, permitted capability
names, configuration contract version, and literal false provider-network,
customer-release, and external-action authority. It contains no configuration
ID, credential purpose, credential reference, secret state, or secret value.

Client components must not import `src/server/runtime`, read namespaced runtime
keys, or infer capability from public environment variables. The current UI and
fixture-backed prototype remain unchanged and require no new configuration.

## Startup and Failure Behavior

The preflight is synchronous, technology-neutral, and side-effect free. It
returns either a deeply immutable validated configuration or one sanitized
typed rejection. It catches hostile unknown input and never echoes rejected
values. A rejected result carries literal false startup, controlled-evaluation,
production-runtime, production-database, protected-data, customer-release, and
external-action authority.

Milestone 9.2 does not wire preflight into Next.js startup because no
production-like runtime is authorized. A later explicitly authorized server
composition milestone must invoke preflight before serving, reading, or
mutating through a configuration-dependent capability.

## Current Exclusions

There is no real secret, secret store, provider SDK, network call, production
database connection, deployment, authentication, monitoring vendor, channel,
customer release, external action, migration, dependency, or Sprint 9.3
implementation. The controlled-evaluation boundary from Milestone 9.1 remains
in force.

Related documents:

- [Controlled-Evaluation Boundary](CONTROLLED_EVALUATION_BOUNDARY.md)
- [Data Classification](DATA_CLASSIFICATION.md)
- [Threat Model and Risk Register](THREAT_MODEL_AND_RISK_REGISTER.md)
- [Sprint 9 Plan](SPRINT_9_PLAN.md)
- [Sprint 9 Test Plan](SPRINT_9_TEST_PLAN.md)
