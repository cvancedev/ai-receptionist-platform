import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { verifyCertifiedPostgresqlMigrationSources } from "../persistence/postgresql/migration-runner";

async function run(): Promise<void> {
  const certification = read("docs/certification/SPRINT9_CERTIFICATION.md");
  const recommendation = read("docs/SPRINT_9_RELEASE_RECOMMENDATION.md");
  for (const required of ["Sprint 9 is **CERTIFIED**", "Documented, not re-executed", "Pending", "Not authorized", "Not implemented", "Conversation State remains authoritative", "Sprint 9.7 gate remains **NOT_READY**", "live PostgreSQL suites were not", "human review remains pending"]) {
    assert(certification.includes(required), `certification records ${required}`);
  }
  assert(recommendation.includes("**NO**") && recommendation.includes("gate remains `NOT_READY`")
    && recommendation.includes("No result was\nfabricated") && recommendation.includes("not freshly executed"),
  "binary NO aligns with current blockers without fabricated evidence");
  for (const prohibited of ["**YES**", "production is authorized", "controlled customer evaluation is authorized"])
    assert(!recommendation.includes(prohibited), `recommendation excludes ${prohibited}`);
  for (const boundary of ["Customer-response release", "external actions", "production remain unauthorized"])
    assert(certification.includes(boundary), `certification preserves ${boundary}`);
  const migrations = readdirSync(join(process.cwd(), "database/migrations")).sort();
  assert(migrations.length === 7 && migrations.every((file, index) => file.startsWith(String(index + 1).padStart(3, "0"))), "migrations remain exactly 001-007");
  await verifyCertifiedPostgresqlMigrationSources();
  for (const source of [certification, recommendation]) assert(!/password\s*[:=]|postgresql:\/\//i.test(source), "artifacts contain no database secret");
  console.log("Sprint 9.9 certification and binary release recommendation verification passed: NO.");
}
function read(path: string): string { return readFileSync(join(process.cwd(), path), "utf8"); }
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(`Sprint 9.9 verification failed: ${message}.`); }
run().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
