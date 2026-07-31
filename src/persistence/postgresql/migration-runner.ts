import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Pool, type PoolClient } from "pg";

export interface PostgresqlMigrationOptions {
  readonly connectionString: string;
  readonly schema?: string;
}

const POSTGRESQL_MIGRATIONS = [
  {
    version: 1,
    name: "conversation_states",
    fileName: "001_conversation_states.sql",
  },
  {
    version: 2,
    name: "execution_journal",
    fileName: "002_execution_journal.sql",
  },
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
    await validateMigrationHistory(client);
    for (const migration of POSTGRESQL_MIGRATIONS) {
      const source = await readFile(
        join(process.cwd(), "database", "migrations", migration.fileName),
        "utf8",
      );
      await client.query(source);
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

async function validateMigrationHistory(client: PoolClient): Promise<void> {
  const table = await client.query<{ readonly exists: boolean }>(
    "SELECT to_regclass('app_schema_migrations') IS NOT NULL AS exists",
  );
  if (!table.rows[0]?.exists) return;

  const history = await client.query<{
    readonly version: number;
    readonly name: string;
  }>(
    "SELECT version, name FROM app_schema_migrations ORDER BY version",
  );
  const compatible = history.rows.length <= POSTGRESQL_MIGRATIONS.length
    && history.rows.every((record, index) => {
      const expected = POSTGRESQL_MIGRATIONS[index];
      return expected !== undefined
        && record.version === expected.version
        && record.name === expected.name;
    });
  if (!compatible) {
    throw new Error("PostgreSQL migration history is incompatible.");
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
