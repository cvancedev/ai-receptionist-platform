import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CERTIFIED_POSTGRESQL_MIGRATIONS,
  verifyCertifiedPostgresqlMigrationSources,
} from "../persistence/postgresql/migration-runner";

run().then(() => {
  console.log("Sprint 9.4 operational PostgreSQL readiness preflight passed.");
}).catch((error: unknown) => {
  console.error(safeError(error));
  process.exitCode = 1;
});

async function run(): Promise<void> {
  assert(
    CERTIFIED_POSTGRESQL_MIGRATIONS.map(({ version }) => version).join(",")
      === "1,2,3,4,5,6,7",
    "certified history remains exactly 001 through 007",
  );
  assert(
    CERTIFIED_POSTGRESQL_MIGRATIONS.every((migration, index) =>
      migration.fileName.startsWith(String(index + 1).padStart(3, "0"))),
    "migration files remain exactly ordered",
  );
  assert(Object.isFrozen(CERTIFIED_POSTGRESQL_MIGRATIONS), "manifest is immutable");
  await verifyCertifiedPostgresqlMigrationSources();
  await verifyMissingAndChangedSourcesFailClosed();
  await verifyOperationalBoundarySource();
}

async function verifyMissingAndChangedSourcesFailClosed(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "sprint-9-4-migrations-"));
  try {
    for (const migration of CERTIFIED_POSTGRESQL_MIGRATIONS) {
      await cp(
        join(process.cwd(), "database", "migrations", migration.fileName),
        join(directory, migration.fileName),
      );
    }
    await rm(join(directory, "007_message_evidence.sql"));
    await assertRejected(directory, "missing predecessor/source");
    await writeFile(join(directory, "007_message_evidence.sql"), "SELECT 1;\n");
    await assertRejected(directory, "checksum mismatch");
    await cp(
      join(process.cwd(), "database", "migrations", "007_message_evidence.sql"),
      join(directory, "007_message_evidence.sql"),
    );
    await writeFile(join(directory, "008_unknown.sql"), "SELECT 1;\n");
    await assertRejected(directory, "unknown migration source");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function assertRejected(directory: string, label: string): Promise<void> {
  try {
    await verifyCertifiedPostgresqlMigrationSources(directory);
  } catch (error) {
    assert(
      safeError(error) === "PostgreSQL migration source integrity check failed.",
      `${label} is sanitized`,
    );
    return;
  }
  throw new Error(`Sprint 9.4 verification failed: ${label} was accepted.`);
}

async function verifyOperationalBoundarySource(): Promise<void> {
  const source = await readFile(join(
    process.cwd(),
    "src/persistence/postgresql/migration-runner.ts",
  ), "utf8");
  for (const prohibited of [
    "process.env",
    "TEST_DATABASE_URL",
    "pg_dump",
    "pg_restore",
    "customerResponseReleaseAuthorized: true",
    "externalActionAuthorized: true",
  ]) assert(!source.includes(prohibited), `migration runner has no ${prohibited} authority`);
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : "Operational verification failed.";
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Sprint 9.4 verification failed: ${message}.`);
}
