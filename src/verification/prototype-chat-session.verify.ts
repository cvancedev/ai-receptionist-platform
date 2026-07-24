import type { PrototypeChatView } from "../prototype-ui/prototype-chat-session";
import { createPrototypeChatSession } from "../prototype-ui/prototype-chat-session";
import { COMPLETION_STATES, CONVERSATION_STAGES } from "../shared/constants";

void verifyPrototypeChatSession();

async function verifyPrototypeChatSession() {
  await verifySuccessfulInterfaceFlow();
  await verifyReset();
  await verifyUnsupportedInterfaceFlow();
}

async function verifySuccessfulInterfaceFlow() {
  const session = createPrototypeChatSession();
  let view = await session.submit("project help");
  let model = readModel(view);
  assert(
    model.resolvedServiceId === "home-project-consultation",
    "UI reflects the resolved service identifier",
  );
  assert(view.pendingFieldId === "customer-name", "first approved field is pending");
  assert(
    view.integration.execution?.success === true,
    "UI integration follows controlled execution",
  );

  view = await session.submit("Riley Example");
  model = readModel(view);
  assert(
    model.collectedFacts.some(
      (fact) => fact.field === "customer-name" && fact.value === "Riley Example",
    ),
    "confirmed fact reflects projected backend state",
  );
  assert(
    !model.missingRequiredFields.includes("customer-name"),
    "resolved field leaves projected missing list",
  );

  view = await session.submit("Fictional written follow-up");
  view = await session.submit("A fictional room needs a routine review.");
  view = await session.submit("North Harbor");
  model = readModel(view);
  assert(
    model.stage === CONVERSATION_STAGES.CONFIRMATION,
    "complete intake reaches confirmation",
  );
  assert(view.readiness === "ready-for-confirmation", "UI readiness reflects backend");
  assert(view.handoff === null, "handoff remains hidden before confirmation");

  view = await session.submit("correct service-location: Maple Glen");
  model = readModel(view);
  assert(
    model.stage === CONVERSATION_STAGES.INTAKE,
    "correction returns UI to intake",
  );
  assert(
    model.missingRequiredFields.includes("service-location"),
    "correction reopens projected missing field",
  );
  assert(model.corrections.length === 1, "correction appears in read model");
  assert(view.handoff === null, "correction does not expose handoff");

  view = await session.submit("Maple Glen");
  model = readModel(view);
  assert(
    model.stage === CONVERSATION_STAGES.CONFIRMATION,
    "corrected answer restores confirmation",
  );
  view = await session.submit("confirm");
  model = readModel(view);
  assert(model.stage === CONVERSATION_STAGES.HANDOFF, "confirmation reaches handoff");
  assert(
    model.completionStatus === COMPLETION_STATES.READY_FOR_HANDOFF,
    "completion state remains authoritative",
  );
  assert(
    view.handoff?.confirmedFacts["service-location"] === "Maple Glen",
    "handoff displays corrected confirmed value",
  );
}

async function verifyReset() {
  const session = createPrototypeChatSession();
  await session.submit("project help");
  const reset = session.reset();
  const model = readModel(reset);
  assert(
    model.stage === CONVERSATION_STAGES.INITIALIZED,
    "reset creates initialized read model",
  );
  assert(model.revision === 0, "reset creates a fresh projected revision");
  assert(
    model.collectedFacts.length === 0,
    "reset clears projected conversation evidence",
  );
  assert(
    reset.integration.execution === null,
    "reset clears execution metadata",
  );
  assert(
    reset.handoff === null && reset.messages.length === 1,
    "reset clears handoff and message history",
  );
}

async function verifyUnsupportedInterfaceFlow() {
  const session = createPrototypeChatSession();
  const view = await session.submit("fictional unsupported roofing");
  const model = readModel(view);
  assert(
    model.stage === CONVERSATION_STAGES.ESCALATION,
    "unsupported service displays projected escalation",
  );
  assert(
    model.resolvedServiceId === null && view.handoff === null,
    "unsupported service is not invented or handed off",
  );
  assert(
    Boolean(view.messages.at(-1)?.text.includes("no service was invented")),
    "deterministic unsupported message is displayed",
  );
}

function readModel(view: PrototypeChatView) {
  assert(
    view.integration.status === "success",
    "prototype view contains a valid read model",
  );
  return view.integration.readModel;
}

function assert(condition: boolean, label: string): asserts condition {
  if (!condition) throw new Error(`Prototype chat verification failed: ${label}`);
}
