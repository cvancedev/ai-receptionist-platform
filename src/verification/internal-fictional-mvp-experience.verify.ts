import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createPrototypeChatSession } from "../prototype-ui/prototype-chat-session";
import { CONVERSATION_STAGES } from "../shared/constants";

async function run(): Promise<void> {
  await verifyFixtureExperience();
  verifyUiBoundary();
  console.log("Sprint 8.5 internal fictional MVP experience verification passed.");
}

async function verifyFixtureExperience(): Promise<void> {
  const session = createPrototypeChatSession();
  let view = await session.submit("project help");
  assert(view.integration.status === "success", "fixture mode starts through the certified integration");
  view = await session.submit("Jordan Example");
  view = await session.submit("Fictional written follow-up");
  view = await session.submit("A fictional room needs routine project review.");
  view = await session.submit("North Harbor");
  assert(view.integration.status === "success" && view.integration.readModel.stage === CONVERSATION_STAGES.CONFIRMATION,
    "fixture mode collects required fields and reaches confirmation");
  view = await session.submit("correct service-location: Maple Glen");
  view = await session.submit("Maple Glen");
  view = await session.submit("confirm");
  assert(view.handoff?.confirmedFacts["service-location"] === "Maple Glen",
    "fixture mode preserves corrections and produces the validated handoff");
  assert(view.integration.status === "success" && !view.integration.readModel.status.canReleaseToCustomer,
    "bounded fixture read model grants no customer release");
}

function verifyUiBoundary(): void {
  const source = readFileSync(join(process.cwd(), "components/prototype/PrototypeChat.tsx"), "utf8");
  for (const required of [
    "Fixture-backed deterministic",
    "Durable activated",
    "fails closed instead of substituting fixture data",
    'role="status"',
    'aria-live="polite"',
    "Customer release",
    "Not authorized",
  ]) assert(source.includes(required), `UI includes ${required}`);
  for (const prohibited of [
    'from "pg"',
    "TEST_DATABASE_URL",
    "process.env",
    "PostgresqlConversationStore",
    "rawModelOutput",
    "providerPayload",
  ]) assert(!source.includes(prohibited), `UI excludes ${prohibited}`);
  const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
  assert(css.includes("prefers-reduced-motion"), "UI preserves reduced-motion behavior");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Sprint 8.5 verification failed: ${message}.`);
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
