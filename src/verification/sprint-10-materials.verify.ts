import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fictionalBusinessProfile } from "../fixtures/business-profile";
import { createPrototypeChatSession, type PrototypeChatView } from "../prototype-ui/prototype-chat-session";

const ROOT = "docs/evaluation/sprint-10/";
const VERSION = "sprint-10.1-materials-v1";
const IDS = ["F01", "F02", "F03", "F04", "F05", "F06"];
const SPEC_FIELDS = ["Scenario ID", "Context", "Participant goal", "Starting information",
  "Intentionally omitted", "Expected clarification", "Correction opportunities",
  "Escalation/handoff conditions", "Expected outcome", "Prohibited assumptions",
  "Moderator notes", "Pass/fail criteria"];
const TEMPLATE_KEYS: Record<string, string> = {
  readiness: "record_id candidate_commit candidate_dirty_state_review build_reference package_version protocol_version moderator_assignment_reference cleanup_owner_assignment_reference work_authorization_reference work_kind approved_date_window browser_device_matrix_reference local_url loopback_listener_check credential_free_environment_check network_check fixture_check technical_evidence_reference technical_evidence_utc manual_evidence_reference manual_evidence_utc freshness_review_utc open_critical_high_findings local_evidence_folder_reference deletion_request_method_reference cleanup_readiness entry_outcome",
  session: "session_id work_kind started_utc ended_utc candidate_commit package_version protocol_version fictional_profile_version browser_version device_os assistive_technology readiness_record_id voluntary_agreement agreement_utc withdrawal_requested task_order completion_status termination_reason cleanup_record_id",
  scenario: "session_id scenario_id attempt_number attempt_kind date_utc browser_device_reference starting_condition expected_outcome observed_outcome task_completion independent_completion system_correctness clarification_quality correction_handling escalation_handoff_behavior participant_confusion moderator_intervention_count procedural_help_count intervention_record_ids errors_failures started_utc finished_utc wall_seconds pause_seconds pause_reason completion_seconds participant_feedback_reference category severity issue_id follow_up_action owner_role review_status",
  intervention: "record_id session_id scenario_id attempt_number elapsed_seconds intervention_type sanitized_reason independent_scoring_effect",
  feedback: "record_id session_id scenario_id attempt_number Q01 Q02 Q03 Q04 Q05 Q06 Q07 Q08 Q09 Q10",
  issue: "issue_id session_id scenario_id attempt_number date_utc category severity fictional_reproduction expected_outcome observed_outcome stop_decision owner_role follow_up_action retest_authorization_reference retest_result_reference review_disposition",
  cleanup: "record_id session_id issue_id collection_utc deletion_deadline_utc withdrawal_reference owner_role artifact_checks reset_result close_reopen_result listener_shutdown_result deletion_utc cleanup_outcome exception next_session_blocked",
};

async function run(): Promise<void> {
  const pack = read(`${ROOT}scenario-pack.md`);
  const cards = read(`${ROOT}participant-cards.md`);
  const runbook = read(`${ROOT}moderator-runbook.md`);
  const rubric = read(`${ROOT}feedback-and-severity.md`);
  const template: unknown = JSON.parse(read(`${ROOT}evidence-templates.json`));
  verifyPack(pack, cards);
  verifyBlankTemplate(template);
  verifyStatuses(read("docs/SPRINT_10_PLAN.md"), read("ROADMAP.md"));

  for (const source of [pack, cards, runbook, rubric]) {
    assert(source.includes(VERSION), "materials use one version");
    // Limited accidental-identifier scan, not a guarantee that prose is de-identified.
    assert(!/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(source)
      && !/\b\d{3}[- .]\d{3}[- .]\d{4}\b/.test(source), "no email or telephone identifiers in materials");
  }
  for (const source of [pack, runbook, rubric]) assert(source.includes("Materials only.")
    && source.includes("Participant evaluation has not started.")
    && source.includes("No session is authorized."), "materials assert non-execution boundary");
  for (const heading of ["Roles and Authority", "Environment Setup (Later Authorized Rehearsal)",
    "Fixture Selection and Browser/Device Preparation", "Pre-Session Verification",
    "Participant Introduction and Fictional-Data Reminder", "Consent and Participation Wording",
    "Task Presentation Procedure", "Neutrality and Permitted Intervention", "Observation and Evidence Recording",
    "Failure Classification", "Safety Stop Conditions", "Session Termination", "Evidence Cleanup",
    "Post-Session Reset Procedure", "Preparation Acceptance and Remaining Entry Work"])
    assert(runbook.includes(`## ${heading}\n`), `runbook defines ${heading}`);
  for (const required of ["Moderator: **Curt Vance**", "Evidence/cleanup owner: **Curt Vance**",
    "--hostname 127.0.0.1", "Fixture-backed deterministic", "voluntarily agree", "within 7 days",
    "suspected real/protected data", "explicit resume", "No automatic retry", "Ctrl+C"])
    assert(runbook.includes(required), `runbook contains ${required}`);
  const questions = [...rubric.matchAll(/^\| (Q\d{2}) \|/gm)].map((match) => match[1]);
  assert(questions.join() === Array.from({ length: 10 }, (_, i) => `Q${String(i + 1).padStart(2, "0")}`).join(),
    "ten unique ordered neutral feedback questions");
  for (const category of ["observation", "minor-usability", "significant-usability", "functional-failure", "safety-boundary"])
    assert(rubric.includes(`| ${category} |`), `${category} has a severity definition`);
  assert(rubric.includes("Unknown category/severity") && rubric.includes("treated as high"), "unknown severity fails closed");

  for (const file of [`${ROOT}scenario-pack.md`, `${ROOT}participant-cards.md`, `${ROOT}moderator-runbook.md`,
    `${ROOT}feedback-and-severity.md`, "docs/SPRINT_10_PLAN.md", "docs/SPRINT_10_TEST_PLAN.md", "README.md"])
    for (const match of read(file).matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const target = match[1].split("#")[0];
      if (target && !/^[a-z]+:/i.test(target))
        assert(existsSync(resolve(dirname(join(process.cwd(), file)), target)), `local link resolves in ${file}: ${target}`);
    }

  // In-memory mutations prove that malformed or fabricated records cannot pass.
  const filled = structuredClone(template) as Record<string, Record<string, unknown>>;
  filled.scenario.task_completion = "pass";
  rejects(() => verifyBlankTemplate(filled), "fabricated result rejected");
  const missing = structuredClone(template) as Record<string, Record<string, unknown>>;
  delete missing.session.voluntary_agreement;
  rejects(() => verifyBlankTemplate(missing), "missing consent field rejected");
  rejects(() => verifyPack(pack.replace("## F06", "## X06"), cards), "missing scenario rejected");
  rejects(() => verifyPack(pack, `${cards}\ncorrect service-location: Maple Glen`), "coaching syntax rejected");
  rejects(() => verifyStatuses(read("docs/SPRINT_10_PLAN.md"), read("ROADMAP.md").replace(
    "Milestone 10.2: Internal Rehearsal and Evaluation Entry Review — INCOMPLETE / NOT_READY",
    "Milestone 10.2: Internal Rehearsal and Evaluation Entry Review — Complete")), "premature next milestone rejected");
  await verifyFixturePreparation();
  const scripts = (JSON.parse(read("package.json")) as { scripts: Record<string, string> }).scripts;
  assert(scripts["verify:sprint-10-materials"] === "tsc -p tsconfig.prototype.json && node .prototype-build/verification/sprint-10-materials.verify.js",
    "materials have a reproducible package command");
  console.log("Sprint 10.1 materials verification passed: package, blank templates, negative checks and automated fixture contracts. No human session performed or authorized.");
}

function verifyPack(pack: string, cards: string): void {
  for (const source of [pack, cards]) {
    const found = [...source.matchAll(/^## (F\d{2}) — /gm)].map((match) => match[1]);
    assert(found.join() === IDS.join(), "six unique ordered scenario/card IDs");
  }
  for (const id of IDS) {
    const spec = section(pack, id);
    for (const field of SPEC_FIELDS) assert(spec.includes(`**${field}:**`), `${id} defines ${field}`);
    assert(spec.includes(`**Scenario ID:** ${id}.`), `${id} self-identifies`);
    assert(section(cards, id).includes("This is a fictional exercise."), `${id} card states fictional nature`);
  }
  assert(!/correct\s+service-location\s*:|Expected (outcome|clarification)|Pass\/fail|600 seconds|at least 4\/5|human-review status|nothing was sent|Submit is disabled/i.test(cards),
    "participant cards do not expose moderator answers, syntax or scoring");
}
function section(source: string, id: string): string {
  return source.split(`## ${id} — `)[1]?.split("\n## ")[0] ?? "";
}
function verifyBlankTemplate(value: unknown): void {
  assert(isRecord(value), "blank template is an object");
  exactKeys(value, Object.keys(TEMPLATE_KEYS), "template sections");
  for (const [name, fields] of Object.entries(TEMPLATE_KEYS)) {
    const entry = value[name];
    assert(isRecord(entry), `${name} is a reusable blank record`);
    exactKeys(entry, fields.split(" "), `${name} fields`);
    assert(Object.values(entry).every((leaf) => leaf === null), `${name} contains no prefilled evidence`);
  }
}
function verifyStatuses(plan: string, roadmap: string): void {
  for (let i = 0; i <= 5; i++) {
    const row = plan.split("\n").find((line) => line.startsWith(`| 10.${i} |`));
    assert(row, `milestone 10.${i} exists`);
    const cells = row.split("|").map((cell) => cell.trim());
    const status = cells[3];
    assert(i === 1 ? ["In Progress", "Complete"].includes(status)
      : status === (i === 0 ? "Complete" : i === 2 ? "INCOMPLETE / NOT_READY" : "Not Started"),
    `10.${i} preserves the pending manual and participant gates`);
    assert(roadmap.includes(`Milestone 10.${i}: ${cells[2]} — ${status}`), `10.${i} statuses agree`);
  }
  for (const capability of ["Participant evaluation", "Production deployment", "Real customer/business data",
    "Real provider/channel integration", "Production authentication", "Unsupervised operation", "External actions/customer response release"])
    assert(plan.includes(`| ${capability} | Not authorized |`), `${capability} remains denied`);
}

async function verifyFixturePreparation(): Promise<void> {
  assert(fictionalBusinessProfile.id === "friendly-home-services" && fictionalBusinessProfile.version === 1,
    "materials target existing fictional profile version");
  const session = createPrototypeChatSession();
  let view = await session.submit("project help");
  const answers = ["Jordan Example", "Fictional written follow-up", "A fictional room needs routine project review.", "North Harbor"];
  const fields = ["customer-name", "contact-method", "project-description", "service-location"];
  for (let i = 0; i < answers.length; i++) {
    assert(view.pendingFieldId === fields[i], `F01 missing information requests ${fields[i]}`);
    assert(view.handoff === null, "F01 has no premature handoff");
    view = await session.submit(answers[i]);
  }
  assert(model(view).stage === "confirmation" && view.handoff === null, "canonical hidden F03 setup is supported");
  view = await session.submit("confirm");
  assert(view.handoff?.confirmedFacts["service-location"] === "North Harbor", "F01 and hidden F06 handoff setup match materials");
  assert(!model(view).status.canReleaseToCustomer, "fixture handoff has no release authority");

  session.reset();
  view = await session.submit("consultation");
  assert(model(view).resolvedServiceId === null && view.messages.at(-1)?.text.includes("Home Project Consultation")
    && view.messages.at(-1)?.text.includes("Seasonal Home Check-In"), "F02 alias asks for both candidates without guessing");
  view = await session.submit("Home Project Consultation");
  assert(model(view).resolvedServiceId === "home-project-consultation" && view.pendingFieldId === "customer-name", "F02 exact choice continues intake");
  for (const answer of answers) view = await session.submit(answer);
  view = await session.submit("correct service-location: Maple Glen");
  assert(model(view).stage === "intake" && view.pendingFieldId === "service-location" && view.handoff === null,
    "F03 reopens the location and withholds handoff");
  view = await session.submit("Maple Glen");
  assert(model(view).stage === "confirmation", "F03 requires reconfirmation");
  view = await session.submit("confirm");
  assert(view.handoff?.confirmedFacts["service-location"] === "Maple Glen"
    && fields.slice(0, 3).every((field, i) => view.handoff?.confirmedFacts[field] === answers[i]),
    "F03 handoff uses correction and preserves unrelated facts");

  session.reset();
  view = await session.submit("spaceship detailing");
  assert(model(view).stage === "escalation" && model(view).resolvedServiceId === null && view.handoff === null,
    "F04 unsupported request escalates without a service or routine handoff");
  const initial = session.reset();
  view = await session.submit("   ");
  assert(view.messages.length === initial.messages.length && model(view).revision === model(initial).revision,
    "F05 API rejects blank input without new progress");
  const chat = read("components/prototype/ChatWindow.tsx");
  assert(chat.includes("if (!value || submitting || disabled) return;")
    && chat.includes("disabled={inputDisabled || !message.trim()}"), "F05 browser prevents blank submission; no UI error claimed");
  view = await session.submit("project help");
  assert(view.pendingFieldId === "customer-name", "F05 valid input recovers");
  const reset = session.reset();
  assert(model(reset).stage === "initialized" && model(reset).collectedFacts.length === 0
    && reset.handoff === null && reset.messages.length === 1, "F06 fresh start has no prior facts or handoff");
}
function model(view: PrototypeChatView) {
  assert(view.integration.status === "success", "fixture produces a bounded read model");
  return view.integration.readModel;
}
function exactKeys(value: Record<string, unknown>, expected: string[], label: string): void {
  assert(Object.keys(value).sort().join() === [...expected].sort().join(), `${label} are exact`);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function rejects(check: () => void, label: string): void {
  let rejected = false;
  try { check(); } catch { rejected = true; }
  assert(rejected, label);
}
function read(path: string): string { return readFileSync(join(process.cwd(), path), "utf8").replace(/\r\n/g, "\n"); }
function assert(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(`Sprint 10.1 materials verification failed: ${label}.`);
}
run().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
