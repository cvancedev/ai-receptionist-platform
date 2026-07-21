import { createPrototypeChatSession } from "../prototype-ui/prototype-chat-session";
import { COMPLETION_STATES, CONVERSATION_STAGES } from "../shared/constants";

verifySuccessfulInterfaceFlow();
verifyReset();
verifyUnsupportedInterfaceFlow();

function verifySuccessfulInterfaceFlow() {
  const session = createPrototypeChatSession();
  let view = session.submit("project help");
  assert(view.resolvedService === "Home Project Consultation", "UI reflects resolved service");
  assert(view.pendingFieldId === "customer-name", "first approved field is pending");

  view = session.submit("Riley Example");
  assert(view.state.confirmedFacts["customer-name"]?.value === "Riley Example", "confirmed fact reflects backend state");
  assert(view.state.customerClaims.some((claim) => claim.field === "customer-name"), "claim remains separate from fact");
  assert(!view.state.missingFields.includes("customer-name"), "resolved field leaves missing list");

  view = session.submit("Fictional written follow-up");
  view = session.submit("A fictional room needs a routine review.");
  view = session.submit("North Harbor");
  assert(view.state.stage === CONVERSATION_STAGES.CONFIRMATION, "complete intake reaches confirmation");
  assert(view.readiness === "ready-for-confirmation", "UI readiness reflects backend");
  assert(view.handoff === null, "handoff remains hidden before confirmation");

  view = session.submit("correct service-location: Maple Glen");
  assert(view.state.stage === CONVERSATION_STAGES.INTAKE, "correction returns UI to intake");
  assert(view.state.missingFields.includes("service-location"), "correction reopens missing field");
  assert(view.state.corrections.length === 1, "correction appears in UI state");
  assert(view.handoff === null, "correction does not expose handoff");

  view = session.submit("Maple Glen");
  assert(view.state.stage === CONVERSATION_STAGES.CONFIRMATION, "corrected answer restores confirmation");
  view = session.submit("confirm");
  assert(view.state.stage === CONVERSATION_STAGES.HANDOFF, "confirmation reaches handoff");
  assert(view.state.completionState === COMPLETION_STATES.READY_FOR_HANDOFF, "completion state is authoritative");
  assert(view.handoff?.confirmedFacts["service-location"] === "Maple Glen", "handoff displays corrected confirmed value");
}

function verifyReset() {
  const session = createPrototypeChatSession();
  session.submit("project help");
  const reset = session.reset();
  assert(reset.state.stage === CONVERSATION_STAGES.INITIALIZED, "reset creates initialized state");
  assert(reset.state.revision === 0, "reset creates a fresh revision");
  assert(reset.state.customerClaims.length === 0 && Object.keys(reset.state.confirmedFacts).length === 0, "reset clears conversation evidence");
  assert(reset.handoff === null && reset.messages.length === 1, "reset clears handoff and message history");
}

function verifyUnsupportedInterfaceFlow() {
  const session = createPrototypeChatSession();
  const view = session.submit("fictional unsupported roofing");
  assert(view.state.stage === CONVERSATION_STAGES.ESCALATION, "unsupported service displays backend escalation");
  assert(view.resolvedService === null && view.handoff === null, "unsupported service is not invented or handed off");
  assert(Boolean(view.messages.at(-1)?.text.includes("no service was invented")), "deterministic unsupported message is displayed");
}

function assert(condition: boolean, label: string): asserts condition {
  if (!condition) throw new Error(`Prototype chat verification failed: ${label}`);
}
