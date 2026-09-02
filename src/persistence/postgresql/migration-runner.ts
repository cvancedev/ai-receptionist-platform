import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
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
    sha256: "d13469e551d2887dc8290aec0849c34d77ef6ecabc16acabd9f73711e2106d5c",
  },
  {
    version: 2,
    name: "execution_journal",
    fileName: "002_execution_journal.sql",
    sha256: "a27b13800516edfe71d8d69c071ca4953191b22153cafbc42ddfb4c0047a5d45",
  },
  {
    version: 3,
    name: "business_profile_versions",
    fileName: "003_business_profile_versions.sql",
    sha256: "2d8b964ec0f67974c7e568eb8b9064e41030affe9a0a77e4bb714ec211d3332c",
  },
  {
    version: 4,
    name: "knowledge_record_versions",
    fileName: "004_knowledge_record_versions.sql",
    sha256: "1629450a9ffa807bd9e592ee3c71f35157eb8325b2f776f188f6f43f37c05942",
  },
  {
    version: 5,
    name: "configuration_activations",
    fileName: "005_configuration_activations.sql",
    sha256: "40072658d8efb4e672d719cd13cc5da9e8da3ad66ff62846c7bc22fe5669a212",
  },
  {
    version: 6,
    name: "configuration_lifecycle_transitions",
    fileName: "006_configuration_lifecycle_transitions.sql",
    sha256: "fc65e6b7b2a0b9143b2b1c5632125563260d5c51122aa996f9f22879cdcbd370",
  },
  {
    version: 7,
    name: "message_evidence",
    fileName: "007_message_evidence.sql",
    sha256: "c536e70fa4bc178a0c5a070ecff4f3ecc00bf1a17b1790aee2837a0606f789b8",
  },
] as const;

export async function applyPostgresqlMigrations(
  options: Readonly<PostgresqlMigrationOptions>,
): Promise<void> {
  await verifyCertifiedPostgresqlMigrationSources();
  const schema = validatedSchema(options.schema);
  const pool = new Pool({ connectionString: requiredConnectionString(options) });
  let client: PoolClient | null = null;

  try {
    client = await pool.connect();
    await client.query("BEGIN");
    await client.query(`SET LOCAL search_path TO ${quoteIdentifier(schema)}`);
    const appliedMigrationCount = await validateMigrationHistory(client);
    for (const migration of POSTGRESQL_MIGRATIONS.slice(appliedMigrationCount)) {
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

export async function verifyCertifiedPostgresqlMigrationSources(
  migrationsDirectory = join(process.cwd(), "database", "migrations"),
): Promise<void> {
  let sourceFiles: string[];
  try {
    sourceFiles = (await readdir(migrationsDirectory))
      .filter((fileName) => fileName.endsWith(".sql"))
      .sort();
  } catch {
    throw new Error("PostgreSQL migration source integrity check failed.");
  }
  const certifiedFiles = POSTGRESQL_MIGRATIONS.map(({ fileName }) => fileName).sort();
  if (
    sourceFiles.length !== certifiedFiles.length
    || sourceFiles.some((fileName, index) => fileName !== certifiedFiles[index])
  ) throw new Error("PostgreSQL migration source integrity check failed.");

  for (const migration of POSTGRESQL_MIGRATIONS) {
    let source: Buffer;
    try {
      source = await readFile(join(migrationsDirectory, migration.fileName));
    } catch {
      throw new Error("PostgreSQL migration source integrity check failed.");
    }
    const digest = createHash("sha256").update(source).digest("hex");
    if (digest !== migration.sha256) {
      throw new Error("PostgreSQL migration source integrity check failed.");
    }
  }
}

export const CERTIFIED_POSTGRESQL_MIGRATIONS = Object.freeze(
  POSTGRESQL_MIGRATIONS.map(({ version, name, fileName, sha256 }) => Object.freeze({
    version,
    name,
    fileName,
    sha256,
  })),
);

async function validateMigrationHistory(client: PoolClient): Promise<number> {
  const table = await client.query<{ readonly exists: boolean }>(
    "SELECT to_regclass('app_schema_migrations') IS NOT NULL AS exists",
  );
  if (!table.rows[0]?.exists) return 0;

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
  return history.rows.length;
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
