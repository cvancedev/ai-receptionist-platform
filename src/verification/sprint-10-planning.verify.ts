import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { MAX_VALIDATION_EVIDENCE_AGE_MS } from "../validation-evidence/controlled-validation-gate";

const PLAN = "docs/SPRINT_10_PLAN.md";
const TEST_PLAN = "docs/SPRINT_10_TEST_PLAN.md";

function run(): void {
  const plan = read(PLAN);
  const tests = read(TEST_PLAN);
  const roadmap = read("ROADMAP.md");
  const sprint9 = read("docs/SPRINT_9_PLAN.md");
  const certification = read("docs/certification/SPRINT9_CERTIFICATION.md");
  const recommendation = read("docs/SPRINT_9_RELEASE_RECOMMENDATION.md");

  assert(certification.includes("Sprint 9 is **CERTIFIED**")
    && recommendation.includes("**YES**"), "Sprint 9 final certification and recommendation agree");
  assert(roadmap.includes("Advancement Recommendation YES")
    && !roadmap.includes("Advancement Recommendation NO"), "roadmap has no stale Sprint 9 recommendation");
  assert(sprint9.includes("is `YES` for consideration of a separately approved controlled evaluation.")
    && sprint9.includes("Historical context:"), "Sprint 9 status reconciled with history preserved");
  assert(!/^\*\*Status:.*(?:NOT_READY|Recommendation NO)/m.test(sprint9), "Sprint 9 milestone headings have no stale gates");
  assert(sprint9.includes("Final Certification Gate READY_FOR_CONTROLLED_EVALUATION")
    && sprint9.includes("Milestone 9.9 is CERTIFIED"), "Sprint 9 final gate and milestone recorded");

  for (const heading of [
    "Status and Authority", "Purpose", "Scope and Non-Goals", "Evaluation Surface Decision",
    "Participant Model and Moderator Responsibilities", "Fictional Scenarios",
    "Measurable Acceptance Criteria", "Data and Evidence Collection", "Evidence Freshness",
    "Retention and Cleanup", "Stop Conditions", "Entry and Exit Gates", "Milestone Sequence",
    "TODO Classification", "Risks and Open Decisions",
  ]) assert(plan.includes(`## ${heading}\n`), `plan defines ${heading}`);

  const milestoneRows = rows(plan).filter((row) => /^10\.\d+$/.test(row[0]));
  assert(milestoneRows.length === 6, "exactly six planned milestones");
  milestoneRows.forEach((row, index) => {
    const id = `10.${index}`;
    // Automated 10.2 work does not satisfy the pending human/manual gates.
    const status = index === 1 ? row[2] : index === 0 ? "Complete"
      : index === 2 ? "INCOMPLETE / NOT_READY" : "Not Started";
    if (index === 1) assert(["In Progress", "Complete"].includes(status), "10.1 has a preparation-only status");
    assert(row[0] === id && row[2] === status && row[3].length > 30, `${id} has expected status and exit`);
    assert(roadmap.includes(`Milestone ${id}: ${row[1]} — ${status}`), `${id} roadmap and plan agree`);
  });
  assert(milestoneRows[0][1] === "Evaluation Scope, Plan, and Acceptance Gates", "10.0 scope is fixed");
  assert(plan.includes("Participant evaluation\nhas not started")
    && tests.includes("participant evaluation has not started"), "planning does not claim participant results");
  for (const capability of [
    "Participant evaluation", "Production deployment", "Real customer/business data",
    "Real provider/channel integration", "Production authentication", "Unsupervised operation",
    "External actions/customer response release",
  ]) {
    const matches = rows(plan).filter((row) => row[0] === capability);
    assert(matches.length === 1 && matches[0][1] === "Not authorized", `${capability} remains unauthorized`);
  }

  const scenarios = rows(plan).filter((row) => /^F\d+$/.test(row[0]));
  const scenarioTests = rows(tests).filter((row) => /^F\d+$/.test(row[0]));
  assert(scenarios.length === 6 && scenarioTests.length === 6, "six matching participant scenarios");
  scenarios.forEach((row, index) => {
    assert(row[0] === `F0${index + 1}` && scenarioTests[index][0] === row[0]
      && scenarioTests[index][2].length > 40, `${row[0]} has evaluation observations`);
  });
  assert(plan.includes("Decision A:") && plan.includes("Decision B is not selected."), "fixture surface explicitly selected");
  assert(plan.includes("7 days") && tests.includes("7 days")
    && MAX_VALIDATION_EVIDENCE_AGE_MS === 7 * 24 * 60 * 60 * 1000, "documented freshness matches current gate");
  for (const criterion of ["4 of 5", "10 minutes", "20 valid submissions", "1000 ms", "100%", "zero"])
    assert(plan.includes(criterion), `measurable acceptance includes ${criterion}`);

  const ui = read("components/prototype/PrototypeChat.tsx");
  assert(ui.includes("useState(createPrototypeChatSession)")
    && ui.includes('useState<"fixture" | "durable-activated">("fixture")')
    && ui.includes("Durable runtime not connected.")
    && ui.includes("fails closed instead of substituting fixture data"), "documented surface still matches implementation");
  const scaffolds = [
    ["src/validation/output-validator.ts", "OutputValidator"],
    ["src/conversation/context-builder.ts", "ContextBuilder"],
  ];
  for (const [path, symbol] of scaffolds) {
    const disposition = rows(plan).find((row) => row[0] === `\`${path}\``);
    assert(disposition?.[1] === "Obsolete/removable later", `${path} has explicit deferred removal disposition`);
    assert(read(path).includes(`export interface ${symbol}`), `${path} scaffold remains unchanged in purpose`);
    for (const file of sourceFiles("src")) {
      if (file === path || file === "src/verification/sprint-10-planning.verify.ts") continue;
      assert(!new RegExp(`\\b${symbol}\\b`).test(read(file)), `${path} remains unused by ${file}`);
    }
  }
  for (const file of [PLAN, TEST_PLAN, "ROADMAP.md", "README.md", "docs/SPRINT_9_PLAN.md",
    "docs/IMPLEMENTATION_SEQUENCE.md", "docs/CONTROLLED_EVALUATION_BOUNDARY.md"]) {
    for (const match of read(file).matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const target = match[1].split("#")[0];
      if (!target || /^[a-z]+:/i.test(target)) continue;
      assert(existsSync(resolve(dirname(join(process.cwd(), file)), target)), `${file} link resolves: ${target}`);
    }
  }
  const scripts = (JSON.parse(read("package.json")) as { scripts: Record<string, string> }).scripts;
  assert(scripts["verify:sprint-10-planning"] === "tsc -p tsconfig.prototype.json && node .prototype-build/verification/sprint-10-planning.verify.js",
    "planning verification is reproducible through package script");
  console.log("Sprint 10.0 planning verification passed. Documentation only; participant evaluation is not authorized.");
}

function rows(markdown: string): string[][] {
  return markdown.split(/\r?\n/).filter((line) => line.startsWith("| "))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));
}
function sourceFiles(directory: string): string[] {
  return readdirSync(join(process.cwd(), directory), { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? sourceFiles(path) : /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}
function read(path: string): string { return readFileSync(join(process.cwd(), path), "utf8").replace(/\r\n/g, "\n"); }
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Sprint 10.0 planning verification failed: ${message}.`);
}
try { run(); } catch (error: unknown) { console.error(error); process.exitCode = 1; }
