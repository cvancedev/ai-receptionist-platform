# Data and State Ownership

## Platform-Owned Data

Platform rules, behavior standards, safety boundaries, output contracts, prompt-component versions, validation rules, and tenant-isolation policies are platform-owned and cannot be overridden by business or model content.

## Business-Owned Data

Business identity, services, hours, policies, service areas, intake requirements, knowledge, tone, escalation destinations, and handoff rules are business-owned. The platform controls validation and activation eligibility.

## Conversation-Owned Data

Customer messages, claims, confirmed facts, corrections, stage, intent, resolved service, missing fields, asked questions, escalation, and completion belong to one business-scoped conversation and profile context.

## Model-Generated Proposals

Suggested customer responses, state updates, actions, escalation, completion readiness, and knowledge references remain untrusted proposals until application validation. They are not authoritative state.

## Application-Owned Decisions

The application owns accepted state updates, allowed responses, escalation activation, completion determination, handoff creation, audit events, transaction coordination, and retry, repair, rejection, or failure behavior. Persistence infrastructure may commit already-approved state and audit inputs atomically but cannot decide their business meaning.

## Derived Data

| Derived category | Authoritative inputs | Owning validator |
| --- | --- | --- |
| Conversation summary | Validated conversation state and evidence history | State Manager |
| Handoff summary | Validated state plus profile handoff rules | Handoff Builder |
| Progress indicators | Required fields, stage, and completion rules | Conversation Engine |
| Profile validation status | Profile revision and platform validation rules | Profile Service |
| Knowledge eligibility | Source lifecycle, scope, audience, time, and authority | Knowledge Service |
| Context package | Validated profile, knowledge, state, task, and instruction versions | Context Builder |

Derived data remains traceable and cannot silently replace its authoritative inputs.

## Mutation Rules

- The model cannot directly mutate permanent or conversation state.
- Customer corrections supersede prior conversation facts only after validation and dependent reevaluation.
- Conversation data cannot alter a Business Profile or permanent knowledge.
- Business configuration changes require a new validated revision and activation.
- Knowledge changes follow review, approval, versioning, and activation.
- Cross-business reads and mutations are prohibited.
- State updates should be revision-aware and applied consistently with the accepted customer response.
- Rejected proposals remain audit evidence but have no operational authority.
- An approved durable state replacement and its required audit entry commit together or neither commits; storage cannot invent a retry or alternate transition.

## Human Authority

Authorized business users own operational truth and exceptions. The platform enforces boundaries; humans approve configuration, knowledge, unsupported commitments, and disputed outcomes.

## Sprint 7.1 Contract Status

Business-owned configuration remains subject to platform rules and
application-owned validation, authorization decisions, and lifecycle decisions.
Milestone 7.1 requires exact Business Profile and knowledge revision scope and
defines detached immutable repository results. Repositories may record only
already-authorized facts; they cannot decide validity, activation eligibility,
conversation use, or active-version selection.

The three validation stages—draft structure, activation eligibility, and
conversation use—remain distinct. Conversation data and model proposals gain no
configuration authority. No persistent configuration state or ownership rule is
changed in this milestone.

Milestone 7.2 persists already-accepted Business Profile draft revisions and
creation audit evidence. PostgreSQL owns durability and integrity only; the
application retains structural, authorization, lifecycle, activation, and
conversation-use authority.

Milestone 7.3 persists already-accepted Knowledge Record drafts and their
lifecycle, audience, source, effective-date, authorization, and audit evidence.
PostgreSQL owns durability and relational integrity only; the application
retains approval, lifecycle, eligibility, retrieval, conflict, activation, and
conversation-use authority.

Milestone 7.4 makes the application authoritative for activation eligibility,
authorization acceptance, selected versions, expected revisions, and conflict
rejection. PostgreSQL atomically owns activation history, selected-version
associations, and the one active pointer. Business Profile, knowledge, and
Conversation State documents remain unchanged; existing conversations retain
their recorded profile version.

Sprint 7 certification confirms this ownership model through the complete
lifecycle. The application decides legal review, approval, active, and
suspended transitions; PostgreSQL persists accepted lifecycle envelopes and
bounded audit atomically; immutable configuration documents retain their
authored content; and Conversation State retains the exact selected profile
version without gaining configuration authority. See
[Sprint 7 Certification](certification/SPRINT7_CERTIFICATION.md).

## Certified Sprint 8 Composition Status

The end-to-end preparation coordinator validates bounded fictional message
input and returns message identity and sequence as persistence metadata.
Milestone 8.2 also carries content only inside immutable transient context,
where it is explicitly labeled untrusted. It does not persist or claim
authority over that content. Conversation State and its exact profile pin
remain authoritative; progress and handoff remain derived views; activated
configuration remains business-owned data selected through the existing
application boundary. Grounding validation can accept only exact source
references already present in that context and grants no release authority.

The [Sprint 8 Storage Decision](SPRINT_8_STORAGE_DECISION.md) finds that no
separate handoff record is required. Milestone 8.4 implements the separately
authorized application-scoped message-evidence contract and additive migration
007. Approved state, required Execution Journal evidence, and bounded customer
message evidence commit atomically. Message evidence remains subordinate and
cannot be replayed to construct, repair, or override Conversation State.

Milestone 8.3 owns only a transient in-process conversation session seeded
from the exact Milestone 8.2 activated context. Accepted transient state is
mutated only through the existing deterministic Conversation Engine and State
Manager, while progress, grounding, and handoff remain derived. Turn IDs,
message IDs, message content, state replacements, and execution evidence are
not durably stored by that transient workflow itself. The separately composed
durable turn boundary owns atomic persistence, and restart still reads
authoritative Conversation State before independently validating subordinate
evidence. Sprint 8 certification confirms those responsibilities and the
derived, non-dispatched handoff boundary.

## Sprint 9.1 Controlled-Evaluation Ownership

Milestone 9.1 adds no authoritative data or runtime integration. Its policy
contract classifies a proposed later fictional evaluation and returns only a
non-executable conformance or rejection decision. Research feedback, participant
statements, threat records, risk decisions, logs, and operational evidence are
subordinate planning or audit evidence. They cannot become Conversation State,
Business Configuration, Knowledge, authorization, a state transition, a retry,
customer release, or an external action.

Only fictional/test data and bounded operational evidence can conform to the
planned local/test boundary. Public business information, internal business
configuration, customer-provided information, protected/sensitive information,
and credentials remain outside it. See [Data Classification](DATA_CLASSIFICATION.md)
and [Controlled-Evaluation Boundary](CONTROLLED_EVALUATION_BOUNDARY.md).

## Sprint 9.2 Runtime Configuration Ownership

Runtime environment identity, requested capability names, credential
references, availability receipts, public projection, and sanitized provenance
are operational configuration, not domain or business truth. The server
preflight owns their parsing and deny-by-default acceptance. It cannot alter
Business Configuration, Knowledge, activation, Conversation State, revision,
grounding, transition, persistence, release, or action authority.

Secret material is not owned or stored by this contract. A credential receipt
proves only bounded availability for one explicitly requested infrastructure
capability; it grants no capability by presence and cannot be replayed as
state, configuration, authorization, or audit truth. See
[Runtime Configuration and Secrets Boundary](RUNTIME_CONFIGURATION_AND_SECRETS.md).

## Sprint 9.3 Identity and Authorization Ownership

Actor claims, identity evidence, membership, roles, and access decisions are
not domain truth and cannot alter authoritative Conversation State or Business
Configuration. The server policy owns only fail-closed validation and denial.
It stores no identity/session data and grants no repository, protected-data,
administration, transition, release, or action authority. Exact business and
conversation scope checks remain mandatory but cannot create authority by
matching. See [Identity, Authorization, and Protected-Data
Gate](IDENTITY_AUTHORIZATION_AND_PROTECTED_DATA.md).

## Sprint 9.4 Restore Ownership

A backup or restored row is storage material, not application authority.
Recovery accepts Conversation State only through its existing decoder and exact
scope/version checks. Journal and message evidence are restored and decoded
independently but cannot replay, reconstruct, or override state. See
[Operational PostgreSQL Readiness](OPERATIONAL_POSTGRESQL_READINESS.md).
