import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isDeepStrictEqual, promisify } from "node:util";
import { Pool } from "pg";
import { initializedConversationState } from "../fixtures/conversation";
import { applyPostgresqlMigrations } from "../persistence/postgresql/migration-runner";
import { PostgresqlConversationStore } from "../persistence/postgresql/postgresql-conversation-store";
import { PostgresqlMessageEvidenceStore } from "../persistence/postgresql/postgresql-message-evidence-store";

const runFile = promisify(execFile);
let maintenanceUrl = "";
const suffix = `${Date.now()}_${process.pid}`;
const sourceName = `sprint_9_4_source_${suffix}`;
const restoreName = `sprint_9_4_restore_${suffix}`;
const invalidName = `sprint_9_4_invalid_${suffix}`;
const tempDirectoryPromise = mkdtemp(join(tmpdir(), "sprint-9-4-backup-"));
const createdDatabases = new Set<string>();

run().then(() => {
  console.log("Sprint 9.4 disposable PostgreSQL backup and restore verification passed.");
}).catch((error: unknown) => {
  console.error(safeFailure(error));
  process.exitCode = 1;
});

async function run(): Promise<void> {
  maintenanceUrl = requiredUrl();
  const admin = new Pool({ connectionString: maintenanceUrl });
  const tempDirectory = await tempDirectoryPromise;
  try {
    await createDatabase(admin, sourceName);
    await createDatabase(admin, restoreName);
    await createDatabase(admin, invalidName);
    const sourceUrl = databaseUrl(maintenanceUrl, sourceName);
    const restoreUrl = databaseUrl(maintenanceUrl, restoreName);
    await applyPostgresqlMigrations({ connectionString: sourceUrl });
    await applyPostgresqlMigrations({ connectionString: sourceUrl });
    await seedFictionalEvidence(sourceUrl);

    const backup = join(tempDirectory, "fictional-backup.dump");
    await postgresTool("pg_dump", ["--format=custom", "--file", backup, safeCliUrl(sourceUrl)]);
    await terminateConnections(admin, sourceName);
    await admin.query(`DROP DATABASE ${quoteIdentifier(sourceName)}`);

    await postgresTool("pg_restore", [
      "--exit-on-error",
      "--no-owner",
      "--no-privileges",
      "--dbname",
      safeCliUrl(restoreUrl),
      backup,
    ]);
    await applyPostgresqlMigrations({ connectionString: restoreUrl });
    await verifyRestoredState(restoreUrl);
    await verifyInvalidBackupFails(tempDirectory, invalidName);
    await verifyIncompleteRestoreFails(restoreUrl);
  } finally {
    for (const name of createdDatabases) {
      await terminateConnections(admin, name).catch(() => undefined);
      await admin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(name)}`).catch(() => undefined);
    }
    await admin.end();
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

async function seedFictionalEvidence(connectionString: string): Promise<void> {
  const store = new PostgresqlConversationStore({ connectionString });
  try {
    const created = await store.create(initializedConversationState);
    assert(created.status === "success", "fictional authoritative state persists");
  } finally {
    await store.close();
  }
  const pool = new Pool({ connectionString });
  try {
    await pool.query(
      `INSERT INTO execution_journal_entries (
        journal_entry_id, sequence, execution_id, request_id, trace_id,
        task_identifier, conversation_id, business_profile_id,
        business_profile_version, expected_state_revision, previous_state_revision,
        resulting_state_revision, outcome, reason, execution_timestamp,
        execution_metadata, journal_schema_version, journal_source, journal_recorded_at
      ) VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8, 0, 0, 0, $9, $10, $11,
        $12::jsonb, 1, $13, $14)`,
      [
        "journal-sprint-9-4", "execution-sprint-9-4", "request-sprint-9-4",
        "trace-sprint-9-4", "fictional-operational-proof",
        initializedConversationState.conversationId,
        initializedConversationState.businessProfileId,
        initializedConversationState.businessProfileVersion,
        "failure", "NoExecution", "sprint-9.4-fictional",
        JSON.stringify({ evidenceOnly: true }), "application", "sprint-9.4-fictional",
      ],
    );
    await pool.query(
      `INSERT INTO conversation_message_evidence (
        business_profile_id, business_profile_version, conversation_id,
        activation_revision, message_id, turn_id, sequence, source, content,
        resulting_state_revision, recorded_at, evidence_schema_version
      ) VALUES ($1, $2, $3, 1, $4, $5, 1, 'customer', $6, 0, $7, 1)`,
      [
        initializedConversationState.businessProfileId,
        initializedConversationState.businessProfileVersion,
        initializedConversationState.conversationId,
        "message-sprint-9-4", "turn-sprint-9-4",
        "Fictional synthetic backup evidence.", "sprint-9.4-fictional",
      ],
    );
  } finally {
    await pool.end();
  }
}

async function verifyRestoredState(connectionString: string): Promise<void> {
  const scope = {
    businessProfileId: initializedConversationState.businessProfileId,
    businessProfileVersion: initializedConversationState.businessProfileVersion,
    conversationId: initializedConversationState.conversationId,
  };
  const state = new PostgresqlConversationStore({ connectionString });
  const messages = new PostgresqlMessageEvidenceStore({ connectionString });
  const evidencePool = new Pool({ connectionString });
  try {
    const recovered = await state.read(scope);
    assert(
      recovered.status === "success"
        && isDeepStrictEqual(recovered.state, initializedConversationState),
      "restored authoritative state and configuration pin are exact",
    );
    const journalSnapshot = await evidencePool.query<{ readonly count: string }>(
      `SELECT count(*)::text AS count FROM execution_journal_entries
       WHERE business_profile_id = $1 AND business_profile_version = $2 AND conversation_id = $3`,
      [scope.businessProfileId, scope.businessProfileVersion, scope.conversationId],
    );
    const messageSnapshot = await messages.snapshot(scope);
    assert(
      journalSnapshot.rows[0]?.count === "1",
      "subordinate journal evidence restores independently",
    );
    assert(
      messageSnapshot.status === "success" && messageSnapshot.snapshot.entries.length === 1,
      "subordinate message evidence restores independently",
    );
    const isolated = await state.read({ ...scope, businessProfileId: "other-fictional-business" });
    assert(
      isolated.status === "failure" && isolated.reason === "ConversationNotFound",
      "restored data preserves business isolation without existence disclosure",
    );
  } finally {
    await Promise.all([state.close(), messages.close(), evidencePool.end()]);
  }
}

async function verifyInvalidBackupFails(directory: string, databaseName: string): Promise<void> {
  const invalid = join(directory, "invalid-backup.dump");
  await writeFile(invalid, "not a PostgreSQL backup\n");
  try {
    await postgresTool("pg_restore", [
      "--exit-on-error", "--dbname", safeCliUrl(databaseUrl(maintenanceUrl, databaseName)), invalid,
    ]);
  } catch {
    return;
  }
  throw new Error("Sprint 9.4 verification failed: invalid backup was accepted.");
}

async function verifyIncompleteRestoreFails(connectionString: string): Promise<void> {
  const pool = new Pool({ connectionString });
  try {
    await pool.query("DELETE FROM app_schema_migrations WHERE version = 7");
  } finally {
    await pool.end();
  }
  try {
    await applyPostgresqlMigrations({ connectionString });
  } catch {
    return;
  }
  throw new Error("Sprint 9.4 verification failed: incomplete restore was accepted.");
}

async function createDatabase(admin: Pool, name: string): Promise<void> {
  await admin.query(`CREATE DATABASE ${quoteIdentifier(name)} TEMPLATE template0`);
  createdDatabases.add(name);
}

async function terminateConnections(admin: Pool, name: string): Promise<void> {
  await admin.query(
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
    [name],
  );
}

async function postgresTool(tool: "pg_dump" | "pg_restore", args: readonly string[]): Promise<void> {
  const executable = join(requiredBinDirectory(), `${tool}${process.platform === "win32" ? ".exe" : ""}`);
  const password = new URL(maintenanceUrl).password;
  await runFile(executable, [...args], {
    env: { ...process.env, PGPASSWORD: password },
    windowsHide: true,
    timeout: 120_000,
  });
}

function databaseUrl(value: string, databaseName: string): string {
  const url = new URL(value);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function safeCliUrl(value: string): string {
  const url = new URL(value);
  url.password = "";
  return url.toString();
}

function requiredUrl(): string {
  const value = process.env.TEST_DATABASE_URL?.trim();
  if (!value) throw new Error("TEST_DATABASE_URL is required for isolated PostgreSQL verification.");
  return value;
}

function requiredBinDirectory(): string {
  const value = process.env.POSTGRESQL_BIN_DIRECTORY?.trim();
  if (!value) throw new Error("POSTGRESQL_BIN_DIRECTORY is required for backup verification.");
  return value;
}

function quoteIdentifier(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error("Disposable database name is invalid.");
  return `"${value}"`;
}

function safeFailure(error: unknown): string {
  if (!(error instanceof Error)) return "Sprint 9.4 operational verification failed.";
  const value = error.message;
  if (value.includes("postgresql://") || value.includes("password")) {
    return "Sprint 9.4 operational verification failed with sanitized database details.";
  }
  return value;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Sprint 9.4 verification failed: ${message}.`);
}
