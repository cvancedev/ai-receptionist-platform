# PostgreSQL Development

## Scope

Milestone 6.2 adds a PostgreSQL adapter for Conversation State only. The
prototype and `ConversationStateManager` continue to use in-memory storage by
default. No production database connection, durable Execution Journal,
state-and-journal transaction coordinator, or Sprint 6.3 behavior exists.

## Integration Verification

The dedicated integration verifier requires an isolated PostgreSQL database
that contains no customer or shared development data. Set the connection URL
for the current PowerShell process:

```powershell
$env:TEST_DATABASE_URL = "postgresql://test_user:test_password@127.0.0.1:5432/test_database"
npm.cmd run verify:postgresql-conversation-store
```

Do not commit the connection URL or place it in application source. The
verifier creates a uniquely named schema, applies the versioned migration,
runs the PostgreSQL contract checks, and drops that schema in a `finally`
cleanup path.

## Migration

The current migration is
[`database/migrations/001_conversation_states.sql`](../database/migrations/001_conversation_states.sql).
It creates only:

- the complete Conversation State snapshot table; and
- the schema-migration history table.

The migration runner applies the migration within the configured schema and a
local database transaction. Application startup does not run migrations, and
the production migration/deployment process remains deferred.

## Configuration Boundary

`TEST_DATABASE_URL` is verification-only. The website, prototype, default
Conversation State Manager, and existing deterministic verification suites do
not require PostgreSQL or environment configuration.
