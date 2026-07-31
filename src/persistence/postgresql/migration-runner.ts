import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Pool, type PoolClient } from "pg";

export interface PostgresqlMigrationOptions {
  readonly connectionString: string;
  readonly schema?: string;
}

const POSTGRESQL_MIGRATIONS = [
  "001_conversation_states.sql",
  "002_execution_journal.sql",
] as const;

export async function applyPostgresqlMigrations(
  options: Readonly<PostgresqlMigrationOptions>,
): Promise<void> {
  const schema = validatedSchema(options.schema);
  const pool = new Pool({ connectionString: requiredConnectionString(options) });
  let client: PoolClient | null = null;

  try {
    client = await pool.connect();
    await client.query("BEGIN");
    await client.query(`SET LOCAL search_path TO ${quoteIdentifier(schema)}`);
    for (const migrationName of POSTGRESQL_MIGRATIONS) {
      const migration = await readFile(
        join(process.cwd(), "database", "migrations", migrationName),
        "utf8",
      );
      await client.query(migration);
    }
    await client.query("COMMIT");
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    throw error;
  } finally {
    client?.release();
    await pool.end();
  }
}

function requiredConnectionString(
  options: Readonly<PostgresqlMigrationOptions>,
): string {
  if (!options.connectionString.trim()) {
    throw new Error("A PostgreSQL connection string is required.");
  }
  return options.connectionString;
}

export function validatedSchema(schema = "public"): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) {
    throw new Error("PostgreSQL schema name is invalid.");
  }
  return schema;
}

export function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}
