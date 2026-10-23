import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { OfflineTransport } from "../ai/providers/transport-model-provider-adapter";
import { createAiDemoChatSession, type AiDemoChatSession } from "../prototype-ui/ai-demo-chat-session";
import { createPrototypeChatSession } from "../prototype-ui/prototype-chat-session";
import {
  AI_SIMULATED_MODE_ENABLED_BY_DEFAULT,
  PROTOTYPE_EXPERIENCE_MODES,
} from "../prototype-ui/prototype-experience-mode";

const NEW_SOURCE_FILES = [
  "src/ai/demo/turn-task-router.ts",
  "src/ai/demo/simulated-model-transport.ts",
  "src/ai/demo/ai-demo-turn.ts",
  "src/prototype-ui/ai-demo-chat-session.ts",
  "src/prototype-ui/prototype-experience-mode.ts",
  "components/prototype/AiDemoChatPanel.tsx",
];

async function run(): Promise<void> {
  verifyModeDefaults();
  await verifyFixtureModeUnchanged();
  await verifyMultiTurnHandoff();
  await verifyCorrectionReopensField();
  await verifyRejectedAnswerAudit();
  await verifyAmbiguityThenResolution();
  await verifyUnsupportedEscalation();
  await verifyAuthorityViolationsCannotMutate();
  await verifyProviderFailuresFailClosed();
  verifyAuditImmutability();
  verifyOfflineSourceBoundaries();
  console.log(
    "AI demo session verification passed: multi-turn handoff, ambiguity, escalation, "
    + "authority rejection, provider failure, offline boundaries, AI mode default off.",
  );
}

function verifyModeDefaults(): void {
  assert(AI_SIMULATED_MODE_ENABLED_BY_DEFAULT === false,
    "the simulated AI mode is disabled by default");
  assert(PROTOTYPE_EXPERIENCE_MODES.includes("ai-simulated"),
    "the simulated AI mode exists as an explicit option");
  const shell = readFileSync(
    join(process.cwd(), "components/prototype/PrototypeChat.tsx"),
    "utf8",
  );
  assert(shell.includes('useState<"fixture" | "durable-activated">("fixture")'),
    "the certified fixture mode remains the literal default state");
  assert(shell.includes("useState(AI_SIMULATED_MODE_ENABLED_BY_DEFAULT)"),
    "the AI demonstration flag is initialized from its disabled-by-default constant");
  assert(shell.includes('checked={!aiDemo && mode === "fixture"}'),
    "the fixture option stays selected unless the AI demonstration is chosen");
}

async function verifyFixtureModeUnchanged(): Promise<void> {
  const fixture = createPrototypeChatSession();
  const view = await fixture.submit("project help");
  assert(view.messages.some((message) => message.text.includes("Resolved fictional service")),
    "the certified fixture flow still resolves a configured service");
  assert(view.handoff === null, "the fixture flow still withholds handoff until confirmation");
}

async function verifyMultiTurnHandoff(): Promise<void> {
  const session = createAiDemoChatSession();
  const initial = session.view();
  assert(initial.decision.decision === "not-attempted",
    "a fresh AI demonstration records no decision");
  assert(initial.handoff === null, "a fresh AI demonstration has no handoff");
  assert(initial.integration.status === "success"
    && initial.integration.readModel.stage === "initialized",
  "a fresh AI demonstration starts initialized");

  const first = await session.submit(
    "Hi, I would like to book a home project consultation for my fictional house.",
  );
  assert(first.decision.taskIdentifier === "language_interpretation",
    "the first turn routes to approved language interpretation");
  assert(first.decision.decision === "accepted",
    "a clear fictional request is accepted");
  assert(first.decision.stateMutationAuthorized === false
    && first.decision.customerReleaseAuthorized === false,
  "an accepted simulated interpretation carries no mutation or release authority");
  assert(first.pendingFieldId === "customer-name",
    "the certified engine asks its first required question");
  assert(first.integration.status === "success"
    && first.integration.readModel.resolvedServiceId === "home-project-consultation",
  "the certified engine resolves the service the model proposed");

  const turns: [string, string][] = [
    ["My name is Riley Example.", "contact-method"],
    ["Written follow-up is best.", "project-description"],
    ["The fictional guest bathroom needs a routine review.", "service-location"],
    ["Maple Glen", "confirmation"],
  ];

  for (const [message, expected] of turns) {
    const view = await session.submit(message);
    assert(view.decision.decision === "accepted",
      `the simulated turn for ${message} is accepted`);
    assert(view.decision.taskIdentifier === "candidate_fact_extraction"
      || view.decision.taskIdentifier === "language_interpretation",
    `the simulated turn for ${message} uses an approved task`);
    if (expected === "confirmation") {
      assert(view.pendingFieldId === null,
        "the engine stops asking once readiness is reached");
      assert(view.readiness === "ready-for-confirmation",
        "the engine reports readiness for confirmation");
      assert(view.handoff === null,
        "no handoff exists before explicit confirmation");
    } else {
      assert(view.pendingFieldId === expected,
        `the engine asks ${expected} next`);
    }
  }

  const confirmed = await session.submit("confirm");
  assert(confirmed.decision.decision === "deterministic-confirmation",
    "confirmation stays on the deterministic path");
  assert(confirmed.handoff !== null, "a validated handoff summary is produced");
  const handoff = confirmed.handoff;
  assert(handoff, "the handoff summary is readable");
  if (!handoff) return;
  assert(handoff.requestedService === "Home Project Consultation",
    "the handoff records the resolved fictional service name");
  assert(handoff.confirmedFacts["requested-service"] === "home-project-consultation",
    "the handoff records the certified service identifier");
  assert(handoff.missingInformation.length === 0,
    "the handoff reports no missing required information");
  assert(handoff.customerName === "My name is Riley Example.",
    "the handoff carries the fact the simulated layer extracted");
  assert(handoff.corrections.length === 0,
    "the handoff records no spurious corrections");
  assert(confirmed.integration.status === "success"
    && confirmed.integration.readModel.stage === "handoff",
  "the certified engine owns the final handoff stage");
  assert(confirmed.integration.status === "success"
    && confirmed.integration.readModel.status.canReleaseToCustomer === false,
  "the read model still refuses customer release");

  const audit = session.auditLog();
  assert(audit.length === 6, "every turn is recorded in the audit trail");
  assert(audit.every((entry) => entry.revisionAfter >= entry.revisionBefore),
    "audit revisions never move backwards");
  assert(audit.filter((entry) => entry.applied).length === 6,
    "every accepted turn is recorded as applied through the engine");
  assert(audit.every((entry) => entry.failures.length === 0
    || entry.decision !== "accepted"),
  "an accepted turn records no validation failures");
}

async function verifyCorrectionReopensField(): Promise<void> {
  const session = createAiDemoChatSession();
  await session.submit("I would like a home project consultation please.");
  for (const answer of [
    "My name is Riley Example.",
    "Written follow-up is best.",
    "The fictional guest bathroom needs a routine review.",
    "Maple Glen",
  ]) {
    const view = await session.submit(answer);
    assert(view.decision.decision === "accepted",
      `the simulated answer ${answer} is accepted`);
  }
  const corrected = await session.submit("correct service-location: Pine Crossing");
  assert(corrected.decision.decision === "deterministic-confirmation",
    "a correction stays on the deterministic path");
  assert(corrected.pendingFieldId === "service-location",
    "a correction reopens only the corrected field");
  assert(corrected.handoff === null, "a reopened correction withholds the handoff");

  const answered = await session.submit("Pine Crossing");
  assert(answered.decision.taskIdentifier === "candidate_fact_extraction",
    "the reopened question routes to approved fact extraction");
  assert(answered.decision.decision === "accepted",
    "the simulated layer answers a reopened correction question");
  assert(answered.pendingFieldId === null && answered.readiness === "ready-for-confirmation",
    "the engine returns to confirmation after the corrected value is applied");

  const confirmed = await session.submit("confirm");
  assert(confirmed.handoff !== null, "the corrected intake still builds a handoff");
  assert(confirmed.handoff?.confirmedFacts["service-location"] === "Pine Crossing",
    "the handoff carries the corrected fictional value");
  assert(confirmed.handoff?.corrections.length === 1
    && confirmed.handoff.corrections[0]?.includes("Maple Glen -> Pine Crossing"),
  "the handoff preserves the correction history");
}

async function verifyRejectedAnswerAudit(): Promise<void> {
  const session = createAiDemoChatSession();
  await session.submit("I would like a home project consultation please.");
  for (const answer of [
    "My name is Riley Example.",
    "Written follow-up is best.",
    "The fictional guest bathroom needs a routine review.",
    "Maple Glen",
  ]) {
    const view = await session.submit(answer);
    assert(view.decision.decision === "accepted",
      `the simulated answer ${answer} is accepted`);
  }
  await session.submit("correct service-location: Pine Crossing");

  const rejected = await session.submit("Somewhere Else");
  assert(rejected.decision.decision !== "accepted",
    "an answer that contradicts the correction history is rejected");
  assert(rejected.pendingFieldId === "service-location",
    "a rejected answer leaves the corrected field pending for a retry");
  const audit = session.auditLog();
  assert(audit[audit.length - 1]?.applied === false,
    "a rejected answer is never recorded as applied");

  const retried = await session.submit("Pine Crossing");
  assert(retried.decision.decision === "accepted",
    "the retry with the corrected value is accepted");
  assert(retried.pendingFieldId === null && retried.readiness === "ready-for-confirmation",
    "the retry completes the corrected field");
  const retriedAudit = session.auditLog();
  assert(retriedAudit[retriedAudit.length - 1]?.applied === true,
    "the successful retry is recorded as applied");
}

async function verifyAmbiguityThenResolution(): Promise<void> {
  const session = createAiDemoChatSession();
  const before = session.view();
  assert(before.integration.status === "success", "the ambiguity session projects");
  const initialRevision = before.integration.readModel.revision;

  const ambiguous = await session.submit("I think I need a consultation.");
  assert(ambiguous.decision.decision === "accepted",
    "an ambiguous alias is still a valid interpretation");
  assert(ambiguous.decision.stateMutationAuthorized === false,
    "an ambiguous interpretation carries no mutation authority");
  assert(ambiguous.pendingFieldId === null,
    "an ambiguous request does not start intake");
  assert(ambiguous.integration.status === "success"
    && ambiguous.integration.readModel.revision === initialRevision,
  "an ambiguous request mutates no conversation state");
  assert(ambiguous.messages.some((message) => message.text.includes("more than one fictional service")),
    "the application asks the customer to choose a configured service");
  assert(session.auditLog()[0]?.applied === false,
    "the audit trail records that the ambiguous turn applied nothing");

  const resolved = await session.submit("Seasonal Home Check-In");
  assert(resolved.decision.decision === "accepted",
    "naming an exact service is accepted");
  assert(resolved.integration.status === "success"
    && resolved.integration.readModel.resolvedServiceId === "seasonal-home-check-in",
  "the engine resolves the second configured service");
  assert(resolved.pendingFieldId === "customer-name",
    "intake starts with the global required field");
}

async function verifyUnsupportedEscalation(): Promise<void> {
  const session = createAiDemoChatSession();
  const escalation = await session.submit("My fictional basement is flooding right now.");
  assert(escalation.integration.status === "success",
    "the escalation session projects");
  if (escalation.integration.status !== "success") return;
  assert(escalation.decision.decision === "accepted",
    "the simulated layer may label an unsupported request");
  assert(escalation.integration.readModel.stage === "escalation",
    "the certified engine owns the escalation stage");
  assert(escalation.integration.readModel.escalation.status === "required",
    "the certified engine activates the escalation requirement");
  assert(escalation.handoff === null, "an escalated conversation has no handoff");
  assert(session.auditLog()[0]?.applied === true,
    "the engine-applied escalation is recorded");

  const revisionAfterEscalation = escalation.integration.readModel.revision;
  const followUp = await session.submit("hello?");
  assert(followUp.integration.status === "success"
    && followUp.integration.readModel.revision === revisionAfterEscalation,
  "a paused escalation accepts no further state change");
  assert(followUp.messages.some((message) => message.text.includes("human review")),
    "the paused conversation tells the customer a person will review it");
}

async function verifyAuthorityViolationsCannotMutate(): Promise<void> {
  const cases: [string, Record<string, unknown>, string][] = [
    ["tool call", { toolCall: "send-email" }, "rejected"],
    ["state mutation", { stateMutation: { field: "customer-name", value: "Changed" } }, "safe_stop"],
    ["customer release", { customerReleased: true }, "safe_stop"],
  ];

  for (const [label, violation, expectedDecision] of cases) {
    const session: AiDemoChatSession = createAiDemoChatSession({
      transport: violatingTransport(violation),
    });
    const before = session.view();
    assert(before.integration.status === "success", `${label} session projects`);
    const revisionBefore = before.integration.readModel.revision;

    const view = await session.submit("I would like a home project consultation.");
    assert(view.decision.decision === expectedDecision,
      `a simulated ${label} is ${expectedDecision}`);
    assert(view.error !== null, `a simulated ${label} surfaces a bounded error`);
    assert(view.integration.status === "success"
      && view.integration.readModel.revision === revisionBefore,
    `a simulated ${label} mutates no conversation state`);
    assert(view.handoff === null, `a simulated ${label} produces no handoff`);
    assert(view.decision.stateMutationAuthorized === false
      && view.decision.customerReleaseAuthorized === false,
    `a simulated ${label} keeps both authority flags false`);
    assert(session.auditLog()[0]?.applied === false,
      `a simulated ${label} is recorded as not applied`);
  }
}

async function verifyProviderFailuresFailClosed(): Promise<void> {
  const malformed = createAiDemoChatSession({
    transport: async () => ({
      status: "completed",
      rawOutput: "not-json",
      usage: { inputUnits: 1, outputUnits: 1 },
      finishReason: "stop",
      error: null,
    }),
  });
  const beforeMalformed = malformed.view();
  assert(beforeMalformed.integration.status === "success", "the malformed session projects");
  const malformedRevision = beforeMalformed.integration.readModel.revision;
  const malformedView = await malformed.submit("project help");
  assert(malformedView.decision.decision === "interpretation-failed",
    "malformed simulated output yields no decision");
  assert(malformedView.error?.includes("RawOutputMalformed") === true,
    "malformed simulated output reports a bounded reason");
  assert(malformedView.integration.status === "success"
    && malformedView.integration.readModel.revision === malformedRevision,
  "malformed simulated output mutates no state");
  assert(malformedView.handoff === null, "malformed simulated output produces no handoff");

  const refused = createAiDemoChatSession({
    transport: async () => ({
      status: "refused",
      rawOutput: null,
      usage: { inputUnits: 1, outputUnits: 0 },
      finishReason: "refusal",
      error: null,
    }),
  });
  const refusedView = await refused.submit("project help");
  assert(refusedView.error?.includes("ProviderResultRefused") === true,
    "a simulated refusal fails closed with a bounded reason");
  assert(refusedView.integration.status === "success"
    && refusedView.integration.readModel.revision === 0,
  "a simulated refusal mutates no state");
}

function verifyAuditImmutability(): void {
  const session = createAiDemoChatSession();
  const first = session.auditLog();
  assert(Array.isArray(first), "the audit log is readable");
  first.push({
    turn: 99,
    taskIdentifier: null,
    decision: "tampered",
    failures: [],
    applied: true,
    revisionBefore: 0,
    revisionAfter: 0,
  });
  assert(session.auditLog().length === 0,
    "mutating a returned audit copy cannot alter the session audit trail");
}

function verifyOfflineSourceBoundaries(): void {
  for (const path of NEW_SOURCE_FILES) {
    const source = readFileSync(join(process.cwd(), path), "utf8");
    for (const prohibited of [
      "fetch(", "process.env", "XMLHttpRequest", "WebSocket",
      "openai", "anthropic", "generative-ai", "apiKey", "Authorization",
      "child_process", "eval(",
    ]) {
      assert(!source.includes(prohibited), `${path} adds no ${prohibited} path`);
    }
  }
  const scripts = (JSON.parse(
    readFileSync(join(process.cwd(), "package.json"), "utf8"),
  ) as { scripts: Record<string, string> }).scripts;
  assert(
    scripts["verify:ai-demo-session"]
      === "tsc -p tsconfig.prototype.json && node .prototype-build/verification/ai-demo-session.verify.js",
    "the AI demo session verifier is exposed as one deterministic script",
  );
}

function violatingTransport(
  violation: Readonly<Record<string, unknown>>,
): OfflineTransport {
  return async (request) => {
    const parsed = JSON.parse(request.input) as {
      identity: Record<string, unknown>;
      currentCustomerInput: { messageId: string };
    };
    const schema = JSON.parse(request.schema) as { proposalType: string };
    const payload = schema.proposalType === "intent_interpretation"
      ? {
          candidateIntent: "service-inquiry",
          candidateServiceReference: "home-project-consultation",
          ambiguity: false,
          unsupportedRequest: false,
          sourceMessageReference: parsed.currentCustomerInput.messageId,
          customerObjective: "Request a fictional consultation",
        }
      : {
          fieldIdentifier: "customer-name",
          candidateValue: "Riley Example",
          sourceMessageReference: parsed.currentCustomerInput.messageId,
        };
    return {
      status: "completed",
      rawOutput: JSON.stringify({ ...parsed.identity, ...payload, ...violation }),
      usage: { inputUnits: 1, outputUnits: 1 },
      finishReason: "stop",
      error: null,
    };
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`AI demo session verification failed: ${message}.`);
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
