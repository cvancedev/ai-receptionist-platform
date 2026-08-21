# PostgreSQL Development

## Scope

Milestone 6.2 adds a PostgreSQL adapter for Conversation State. Milestone 6.3
adds a separate PostgreSQL adapter for the bounded Execution Journal. Milestone
6.4 adds an opt-in PostgreSQL coordinator that atomically persists one
already-approved state replacement and its required journal entry. The
Milestone 6.5 integration composes these contracts only when explicitly
injected and demonstrates restart through newly constructed application and
persistence objects. Milestone 6.6 verifies explicit recovery and failure
semantics without changing production source. The ordinary prototype,
`ConversationStateManager`, and AI orchestrator continue to use in-memory
storage by default. Milestone 6.7 certifies these boundaries and adds only the
required migration-history compatibility correction. No production database
connection exists. Sprint 7.4 adds migration 005 and an opt-in atomic
configuration activation store. The Sprint 7 lifecycle remediation adds
migration 006 for application-authorized, expected-revision lifecycle envelope
updates and append-only transition audit evidence. Neither milestone creates a
production connection or default database wiring.

Milestone 8.4 adds migration 007 and an opt-in bounded message-evidence reader.
Approved durable turns can include that subordinate evidence in the existing
atomic state-and-journal transaction.

## Integration Verification

The dedicated integration verifier requires an isolated PostgreSQL database
that contains no customer or shared development data. Set the connection URL
for the current PowerShell process:

```powershell
$env:TEST_DATABASE_URL = "postgresql://test_user:test_password@127.0.0.1:5432/test_database"
npm.cmd run verify:postgresql-conversation-store
npm.cmd run verify:postgresql-execution-journal
npm.cmd run verify:postgresql-transactional-execution
npm.cmd run verify:postgresql-restart-safe-prototype
npm.cmd run verify:persistence-recovery
npm.cmd run verify:postgresql-business-profile-versions
npm.cmd run verify:postgresql-knowledge-versions
npm.cmd run verify:postgresql-configuration-activation
npm.cmd run verify:activated-configuration-prototype
npm.cmd run verify:business-configuration-recovery
npm.cmd run verify:configuration-lifecycle-remediation
npm.cmd run verify:durable-turn-restart
```

Do not commit the connection URL or place it in application source. The
verifiers create uniquely named schemas, apply the ordered versioned
migrations, run their PostgreSQL contract checks, and drop those schemas in
`finally` cleanup paths.

## Migration

The ordered migrations are:

- [`database/migrations/001_conversation_states.sql`](../database/migrations/001_conversation_states.sql);
- [`database/migrations/002_execution_journal.sql`](../database/migrations/002_execution_journal.sql);
- [`database/migrations/003_business_profile_versions.sql`](../database/migrations/003_business_profile_versions.sql); and
- [`database/migrations/004_knowledge_record_versions.sql`](../database/migrations/004_knowledge_record_versions.sql); and
- [`database/migrations/005_configuration_activations.sql`](../database/migrations/005_configuration_activations.sql); and
- [`database/migrations/006_configuration_lifecycle_transitions.sql`](../database/migrations/006_configuration_lifecycle_transitions.sql).
- [`database/migrations/007_message_evidence.sql`](../database/migrations/007_message_evidence.sql).

They create only:

- the complete Conversation State snapshot table;
- the bounded append-only Execution Journal table and scoped ordering index;
- the schema-migration history table;
- immutable Business Profile draft revisions and creation audit evidence; and
- immutable Knowledge Record draft revisions with scope, source, lifecycle,
  audience, effective-date, authorization, and audit evidence; and
- immutable configuration activation history, exact knowledge associations,
  and one current active pointer per business; and
- append-only Business Profile and Knowledge Record lifecycle transition audit
  evidence coupled to exact expected-revision envelope updates.
- bounded append-only customer message evidence with exact conversation,
  profile-version, activation, turn, sequence, and resulting-state provenance.

The migration runner applies the migration within the configured schema and a
local database transaction. Application startup does not run migrations, and
the production migration/deployment process remains deferred.

Before executing migration SQL, the runner checks an existing migration
history as an exact prefix of the approved `(version, name)` sequence. Unknown,
newer, out-of-order, missing-predecessor, or renamed history fails with
`PostgreSQL migration history is incompatible.` The transaction rolls back and
does not delete, rewrite, or repair the recorded history.

## Configuration Boundary

`TEST_DATABASE_URL` is verification-only. The website, prototype, default
Conversation State Manager, default in-memory Execution Journal, and existing
deterministic verification suites do not require PostgreSQL or environment
configuration. The standalone PostgreSQL adapters remain available. The
Milestone 6.4 coordinator owns a separate opt-in pool and keeps its transaction
client entirely inside persistence infrastructure; no driver or transaction
type crosses the application contract.

The coordinator opens a transaction only after its scope and already-approved
execution input pass application-owned decoding and journal trust validation.
It serializes the scoped durable execution-identity check, applies the exact
expected-revision replacement, appends the journal entry, and commits both or
neither. It performs no retry or replay. Focused verification uses temporary
failure triggers to prove state-write, journal-write-after-state, and deferred
commit rollback. Migrations 001 and 002 require no change for this milestone.

The restart-safe verifier initializes through the PostgreSQL-backed State
Manager, commits the existing controlled transition through the transaction
coordinator, closes all three persistence pools, and creates a new integration
with new stores and coordinator. It reloads state directly from Conversation
State storage and journal history independently, then evaluates deterministic
progress from the recovered revision. It does not use the journal to rebuild
state or fall back to a new in-memory conversation when durable state is
missing.

The persistence-recovery verifier covers database unavailability, duplicate
conversation and execution, stale revision, malformed and incompatible stored
state, missing and negative business/profile scope, standalone and
transactional journal failure, deferred commit failure, restart after success,
restart after rollback, and incompatible schema state. It uses only fictional
data and uniquely named disposable schemas. Failure results remain sanitized;
the verifier confirms that request-time operations do not run migrations or
repair an unsupported schema.

These checks do not make the verification connection a production connection.
They add no retry or replay: committed Conversation State is recovered
directly, while journal history is loaded separately as audit evidence only.
Migrations 001 and 002 remain unchanged and ordered; Milestone 6.6 adds no
migration.

Sprint 6 certification reruns every PostgreSQL suite and proves the
migration-history compatibility check against fictional unknown version 99.
See [Sprint 6 Certification](certification/SPRINT6_CERTIFICATION.md).

Sprint 7 certification reruns every Business Configuration and Sprint 6
persistence suite against a fresh disposable PostgreSQL 18 cluster. It proves
the complete fictional lifecycle without direct SQL state seeding, exact
version and conversation isolation, activation atomicity, pinning, suspension
ineligibility, restart, recovery, and ordered migration history through 006.
See [Sprint 7 Certification](certification/SPRINT7_CERTIFICATION.md).
