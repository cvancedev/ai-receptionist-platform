import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  createPrototypeChatSession,
  MAX_PROTOTYPE_MESSAGE_LENGTH,
  MAX_PROTOTYPE_MESSAGES,
} from "../prototype-ui/prototype-chat-session";

async function run(): Promise<void> {
  await verifyReliabilityAndBounds();
  verifyAccessibleAndUsableSurface();
  verifyAuthorityAndNetworkBoundaries();
  console.log("Sprint 9.6 reliability, accessibility, performance, and usability verification passed.");
}

async function verifyReliabilityAndBounds(): Promise<void> {
  const session = createPrototypeChatSession();
  const initial = session.view();
  const empty = await session.submit("   ");
  assert(empty.error === "Enter a fictional message before submitting.", "empty input has a useful error");
  assert(empty.messages.length === initial.messages.length, "empty input does not add message evidence");
  assert(empty.integration.status === "success" && initial.integration.status === "success"
    && empty.integration.readModel.revision === initial.integration.readModel.revision,
  "empty input does not mutate authoritative conversation state");

  const oversizedCanary = "private-internal-canary".padEnd(MAX_PROTOTYPE_MESSAGE_LENGTH + 1, "x");
  const oversized = await session.submit(oversizedCanary);
  assert(oversized.error?.includes(`${MAX_PROTOTYPE_MESSAGE_LENGTH} characters`) === true,
    "oversized input reports its public bound");
  assert(!JSON.stringify(oversized).includes(oversizedCanary), "rejected oversized input is not retained or echoed");
  assert(oversized.integration.status === "success" && initial.integration.status === "success"
    && oversized.integration.readModel.revision === initial.integration.readModel.revision,
  "oversized input does not mutate authoritative conversation state");

  const first = session.submit("project help");
  const duplicate = session.submit("project help");
  const [, duplicateView] = await Promise.all([first, duplicate]);
  assert(duplicateView.error === "Wait for the current fictional operation to finish before submitting again.",
    "overlapping duplicate submission fails safely without retry");
  assert(duplicateView.messages.filter((message) => message.role === "customer").length === 1,
    "overlapping duplicate submission is not appended twice");

  for (let index = 0; index < MAX_PROTOTYPE_MESSAGES + 10; index += 1) {
    await session.submit(`bounded-${index}`);
  }
  const bounded = session.view();
  assert(bounded.messages.length <= MAX_PROTOTYPE_MESSAGES, "retained UI message state is bounded");
  assert(new Set(bounded.messages.map((message) => message.id)).size === bounded.messages.length,
    "bounded messages retain unique stable keys");
}

function verifyAccessibleAndUsableSurface(): void {
  const chat = source("components/prototype/ChatWindow.tsx");
  const shell = source("components/prototype/PrototypeChat.tsx");
  const progress = source("components/prototype/StageProgress.tsx");
  const header = source("components/layout/SiteHeader.tsx");
  for (const required of [
    'htmlFor="prototype-message"', 'id="prototype-message"', "maxLength={MAX_PROTOTYPE_MESSAGE_LENGTH}",
    'aria-describedby="prototype-message-help prototype-submit-status"', 'role="status"',
    'aria-live="polite"', 'aria-relevant="additions"', 'type="submit"', "Submitting…",
  ]) assert(chat.includes(required), `chat surface includes ${required}`);
  for (const required of [
    'type="button"', "disabled={mode !== \"fixture\" || busy}", '<main', '<header', '<aside',
    'role="alert"', "fails closed instead of substituting fixture data",
  ]) assert(shell.includes(required), `prototype shell includes ${required}`);
  assert(progress.includes('aria-current={active ? "step" : undefined}'), "progress identifies its current step");
  assert(header.includes('aria-label="Primary navigation"'), "site navigation has an accessible name");
  assert(header.includes("How It Works") && header.includes("Early Access"), "primary links remain present");
  assert(!/aria-label="Primary navigation" className="[^"]*hidden/.test(header),
    "primary navigation is not removed at narrow or zoomed viewport widths");
  assert(header.includes("flex-wrap") && header.includes("sm:w-auto"),
    "header navigation reflows without forcing a horizontal layout");
  const manualEvidence = source("docs/SPRINT_9_MANUAL_ACCESSIBILITY_EVIDENCE.md");
  for (const passed of [
    "Keyboard navigation", "200% browser zoom", "400% browser zoom/reflow",
    "Screen-reader behavior", "Forced colors / Windows High Contrast",
    "Contrast/readability", "Text spacing", "Real-device reflow",
    "Touch targets", "Human comprehension/usability",
  ]) {
    assert(manualEvidence.includes(`| ${passed} | **PASS** |`), `${passed} manual PASS is recorded`);
  }
  assert(manualEvidence.includes("All required Sprint 9 manual accessibility and usability reviews are complete"),
    "manual evidence records completion without substituting automated evidence");
  assert(manualEvidence.includes("deterministic gate")
    && manualEvidence.includes("`READY_FOR_CONTROLLED_EVALUATION`"),
  "manual evidence records the current recommendation-only release gate result");
  for (const uiSource of [chat, shell, progress]) {
    assert(!/tabIndex\s*=\s*[{"']?[1-9]/.test(uiSource), "UI has no positive tabindex");
    assert(!uiSource.includes("onClick") || uiSource.includes("<button"), "click behavior uses native buttons");
  }
  const css = source("app/globals.css");
  assert(css.includes("prefers-reduced-motion: reduce"), "reduced-motion preference is honored");
  assert(css.includes("scroll-behavior: auto"), "reduced-motion removes smooth scrolling");
}

function verifyAuthorityAndNetworkBoundaries(): void {
  const changedRuntimeSources = [
    source("src/prototype-ui/prototype-chat-session.ts"),
    source("components/prototype/PrototypeChat.tsx"),
    source("components/prototype/ChatWindow.tsx"),
  ].join("\n");
  for (const prohibited of [
    "fetch(", "XMLHttpRequest", "WebSocket", 'from "pg"', "process.env", "setInterval(",
    "setTimeout(", "retry", "rawModelOutput", "providerPayload", "console.",
  ]) assert(!changedRuntimeSources.includes(prohibited), `hardening adds no ${prohibited} path`);
  const migrations = readdirSync(join(process.cwd(), "database/migrations")).sort();
  assert(migrations.length === 7 && migrations[0]?.startsWith("001_") && migrations[6]?.startsWith("007_"),
    "migration history remains exactly 001-007");
}

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Sprint 9.6 verification failed: ${message}.`);
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
