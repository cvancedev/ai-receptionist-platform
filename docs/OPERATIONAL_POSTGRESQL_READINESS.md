# Operational PostgreSQL Readiness

## Scope and Status

Sprint 9.4 verifies PostgreSQL operations only against isolated, disposable
local test databases containing fictional/synthetic data. It does not authorize
a production connection, hosted database, customer data, deployment, or
request-time migration. Migration integrity, backup/restore, recovery, restart,
and applicable persistence evidence passed against disposable local databases.

## Authority and Migration Model

PostgreSQL supplies storage and transaction mechanics only. Conversation State
remains authoritative. Execution Journal and message evidence remain
subordinate and are never replayed to create, repair, or override state.
Migration history, restored rows, credentials, and backups grant no business,
configuration, authorization, transition, release, or action authority.

The certified manifest is exactly migrations `001` through `007`. Before any
database connection or SQL, the runner verifies each file against its fixed
SHA-256 digest. Missing, renamed, or modified sources fail with one sanitized
error. In one transaction, existing history must be an exact prefix of the
certified `(version, name)` sequence; only pending migrations are applied.
Unknown, newer, out-of-order, missing-predecessor, or ambiguous histories fail
and roll back. No schema gap was found and migration `008` is not created.

## Backup, Restore, and Recovery

The PostgreSQL-only verifier:

1. creates unique source and restore databases from `template0`;
2. migrates the source through `007` and proves already-current behavior;
3. persists deterministic fictional state and bounded subordinate evidence;
4. creates a custom-format `pg_dump` backup;
5. drops the source database to model loss;
6. restores into a separate empty database with ownership/privileges disabled;
7. validates history, exact state/version pins, evidence, fresh-adapter restart,
   and cross-business isolation;
8. proves invalid and incomplete restores fail explicitly; and
9. deletes all disposable databases and temporary artifacts in `finally`.

Recovery is operator-controlled: stop writes, validate the approved application
and migration manifest, restore into a separate database, verify authoritative
state and exact pins, decode evidence independently, test isolation, and only
then authorize cutover separately. Unavailable, invalid, partial, corrupt, or
version-mismatched candidates are discarded. There is no automatic repair,
evidence replay, fixture fallback, retry invention, or history mutation.

Backup artifacts are sensitive even when fictional. They must be restricted,
encrypted when retained or transported, integrity checked, retention bounded,
and deleted after the drill. They must never be committed.

## Recovery Objectives

These are verification targets, not a production SLA:

- RPO evidence is exact equality to the selected completed backup; no claim is
  made for writes after it.
- Each local `pg_dump` or `pg_restore` invocation has a two-minute timeout.
- Production RPO/RTO, backup frequency, retention, encryption/key ownership,
  regions, and staffing require later deployment evidence and authorization.

## Credential Boundary and Required Evidence

`TEST_DATABASE_URL` must identify an approved isolated local test database.
`POSTGRESQL_BIN_DIRECTORY` identifies local PostgreSQL client tools. The
verifier removes passwords from arguments and supplies them only in the child
environment. Neither value is logged, persisted, or committed. Credential
presence grants no application capability. The test role needs create/drop
rights only for disposable test databases.

Run in PowerShell after setting `TEST_DATABASE_URL` locally without printing it:

```powershell
$env:POSTGRESQL_BIN_DIRECTORY = "C:\Program Files\PostgreSQL\18\bin"
npm.cmd run verify:operational-postgresql-readiness
npm.cmd run verify:operational-postgresql-backup-restore
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

Do not paste or commit the connection URL. All listed commands passed during
the Sprint 9.4 local evidence run.

Related documentation:

- [PostgreSQL Development](POSTGRESQL_DEVELOPMENT.md)
- [Sprint 9 Plan](SPRINT_9_PLAN.md)
- [Sprint 9 Test Plan](SPRINT_9_TEST_PLAN.md)
- [Data and State Ownership](DATA_AND_STATE_OWNERSHIP.md)
- [Runtime Configuration and Secrets](RUNTIME_CONFIGURATION_AND_SECRETS.md)
