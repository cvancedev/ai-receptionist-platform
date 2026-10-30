/**
 * Explicit, operator-invoked pilot migration step.
 *
 * This is the only supported way to bring a pilot database to the current
 * schema. The application never migrates during a request: a stale schema is
 * detected at pilot composition and fails closed instead.
 *
 * Usage (PowerShell):
 *   $env:AI_RECEPTIONIST_PILOT_DATABASE_URL = "<server-side connection URL>"
 *   npm run migrate:pilot
 *
 * The connection URL is read from the environment and is never printed. Only
 * the resulting schema version is reported.
 */
import { applyPostgresqlMigrations } from "../persistence/postgresql/migration-runner";
import { PostgresqlReceptionistPersistence } from "../persistence/postgresql/postgresql-receptionist-persistence";
import { RECEPTIONIST_SCHEMA_VERSION } from "../server/persistence/receptionist-persistence";

async function main(): Promise<void> {
  const connectionString = process.env.AI_RECEPTIONIST_PILOT_DATABASE_URL;
  if (typeof connectionString !== "string" || connectionString.trim() === "") {
    throw new Error("AI_RECEPTIONIST_PILOT_DATABASE_URL is not set.");
  }
  const schema = process.env.AI_RECEPTIONIST_PILOT_DATABASE_SCHEMA?.trim() || undefined;

  await applyPostgresqlMigrations({ connectionString, schema });

  const persistence = new PostgresqlReceptionistPersistence({ connectionString, schema });
  try {
    const version = await persistence.readSchemaVersion();
    if (version === null || version < RECEPTIONIST_SCHEMA_VERSION) {
      throw new Error("The pilot schema could not be verified after migration.");
    }
    console.log(`Pilot schema is at version ${version}.`);
  } finally {
    await persistence.close();
  }
}

main().catch((error: unknown) => {
  // Never echo the connection URL or a driver message that could contain it.
  const message = error instanceof Error && /^(AI_RECEPTIONIST_|The pilot schema)/.test(error.message)
    ? error.message
    : "Pilot migration failed. Inspect the pilot database and migration sources.";
  console.error(message);
  process.exitCode = 1;
});
