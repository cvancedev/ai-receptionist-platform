# PostgreSQL Development

## Scope

Milestone 6.2 adds a PostgreSQL adapter for Conversation State. Milestone 6.3
adds a separate PostgreSQL adapter for the bounded Execution Journal. Milestone
6.4 adds an opt-in PostgreSQL coordinator that atomically persists one
already-approved state replacement and its required journal entry. The
prototype, `ConversationStateManager`, and AI orchestrator continue to use
in-memory storage by default. No production database connection or Sprint 6.5
integration exists.

## Integration Verification

The dedicated integration verifier requires an isolated PostgreSQL database
that contains no customer or shared development data. Set the connection URL
for the current PowerShell process:

```powershell
$env:TEST_DATABASE_URL = "postgresql://test_user:test_password@127.0.0.1:5432/test_database"
npm.cmd run verify:postgresql-conversation-store
npm.cmd run verify:postgresql-execution-journal
npm.cmd run verify:postgresql-transactional-execution
```

Do not commit the connection URL or place it in application source. The
verifiers create uniquely named schemas, apply the ordered versioned
migrations, run their PostgreSQL contract checks, and drop those schemas in
`finally` cleanup paths.

## Migration

The ordered migrations are:

- [`database/migrations/001_conversation_states.sql`](../database/migrations/001_conversation_states.sql); and
- [`database/migrations/002_execution_journal.sql`](../database/migrations/002_execution_journal.sql).

They create only:

- the complete Conversation State snapshot table; and
- the bounded append-only Execution Journal table and scoped ordering index;
- the schema-migration history table.

The migration runner applies the migration within the configured schema and a
local database transaction. Application startup does not run migrations, and
the production migration/deployment process remains deferred.

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
