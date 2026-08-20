import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ActivatedConfigurationPrototypeResult } from "../ai/prototype/activated-configuration-prototype-integration";
import type { ActiveConfigurationSnapshot } from "../business-configuration/activation-contracts";
import { ConversationStateManager } from "../conversation/conversation-state-manager";
import { DeterministicConversationEngine } from "../conversation/conversation-engine";
import { ConversationReadModelProjector } from "../conversation-read-model/conversation-read-model-projector";
import { buildPrototypeProjectionContext } from "../conversation-read-model/prototype-projection-context";
import type { ConversationState } from "../domain/conversation-state";
import { fictionalBusinessProfile } from "../fixtures/business-profile";
import { fictionalKnowledgeRecords } from "../fixtures/knowledge";
import {
  END_TO_END_PREPARATION_FAILURES,
  type EndToEndTurnRequest,
} from "../application/end-to-end/contracts";
import {
  EndToEndConversationCoordinator,
  type ActivatedConversationCompositionPort,
} from "../application/end-to-end/end-to-end-conversation-coordinator";

const effectiveAt = "2026-08-20T12:00:00.000Z";
const conversationId = "sprint-8-1-fictional-conversation";

async function run(): Promise<void> {
  await verifyStartAndResumeComposition();
  await verifyExactInputValidation();
  await verifyScopeAndFailureIsolation();
  await verifyDerivedHandoffBoundary();
  verifyNarrowTechnologyNeutralCapabilities();
  console.log("Sprint 8.1 end-to-end contract verification passed.");
}

async function verifyStartAndResumeComposition(): Promise<void> {
  const port = new StubActivatedConversationPort(successSnapshot(initializedState()));
  const coordinator = new EndToEndConversationCoordinator(port);
  const started = await coordinator.prepareTurn(startRequest());
  assert(started.status === "success", "valid start request composes certified boundaries");
  if (started.status !== "success") return;
  assert(
    port.initializeCalls === 1 && port.recoverCalls === 0,
    "start delegates only to activated initialization",
  );
  assert(
    started.value.identity.businessProfileId === fictionalBusinessProfile.id
      && started.value.identity.businessProfileVersion === fictionalBusinessProfile.version
      && started.value.identity.conversationId === conversationId
      && started.value.identity.stateRevision === 0,
    "prepared identity preserves exact resolved scope and revision",
  );
  assert(
    started.value.configuration.knowledge.length === fictionalKnowledgeRecords.length
      && started.value.configuration.knowledge.every((reference, index) =>
        reference.knowledgeRecordId === fictionalKnowledgeRecords[index].id
        && reference.knowledgeRecordVersion === fictionalKnowledgeRecords[index].version
        && reference.source === fictionalKnowledgeRecords[index].source
      ),
    "configuration exposes only exact versioned source references",
  );
  assert(
    started.value.applicationDecision.turnStateMutationAuthorized === false
      && started.value.applicationDecision.transitionExecutionAuthorized === false
      && started.value.applicationDecision.customerReleaseAuthorized === false
      && started.value.applicationDecision.externalActionAuthorized === false
      && started.value.response.status === "not-produced",
    "preparation grants no mutation, execution, release, or action authority",
  );
  assert(
    started.value.inboundMessage.acceptedForProcessing
      && !started.value.inboundMessage.contentPersisted
      && !("content" in started.value.inboundMessage)
      && !JSON.stringify(started.value).includes(startRequest().message.content),
    "message content is validated but not returned or persisted by composition",
  );
  assert(started.value.handoff.status === "not-ready", "initial state is not handoff-ready");
  assertDeeplyFrozen(started, "start preparation result");

  const resumed = await coordinator.prepareTurn(resumeRequest());
  assert(resumed.status === "success", "valid exact resume request composes recovery");
  const callsAfterResume = port.callCounts();
  assert(
    callsAfterResume.initialize === 1 && callsAfterResume.recover === 1,
    "resume delegates only to exact pinned recovery",
  );
}

async function verifyExactInputValidation(): Promise<void> {
  const port = new StubActivatedConversationPort(successSnapshot(initializedState()));
  const coordinator = new EndToEndConversationCoordinator(port);
  const valid = startRequest();
  const invalid: readonly unknown[] = [
    null,
    {},
    { ...valid, extra: true },
    { ...valid, turnId: " padded " },
    { ...valid, effectiveAt: "not-a-date" },
    { ...valid, message: { ...valid.message, source: "application" } },
    { ...valid, message: { ...valid.message, conversationId: "another-conversation" } },
    { ...valid, message: { ...valid.message, content: "" } },
    { ...valid, message: { ...valid.message, content: "x".repeat(4_001) } },
    { ...resumeRequest(), scope: { ...resumeRequest().scope, businessProfileVersion: 0 } },
    { ...resumeRequest(), scope: { ...resumeRequest().scope, extra: true } },
  ];
  for (const candidate of invalid) {
    const result = await coordinator.prepareTurn(candidate);
    assertFailure(result, "InvalidInput", "malformed or broad input fails closed");
  }
  assert(
    port.initializeCalls === 0 && port.recoverCalls === 0,
    "invalid input never reaches activated configuration or persistence boundaries",
  );
}

async function verifyScopeAndFailureIsolation(): Promise<void> {
  const mismatched = successSnapshot({
    ...initializedState(),
    conversationId: "another-fictional-conversation",
  });
  const mismatchCoordinator = new EndToEndConversationCoordinator(
    new StubActivatedConversationPort(mismatched),
  );
  assertFailure(
    await mismatchCoordinator.prepareTurn(startRequest()),
    "ScopeMismatch",
    "resolved conversation mismatch fails without broad fallback",
  );

  const bindingSource = successSnapshot(initializedState());
  if (bindingSource.status !== "success") {
    throw new Error("Fictional binding source is unavailable.");
  }
  const bindingMismatch: ActivatedConfigurationPrototypeResult = {
    status: "success",
    value: {
      ...bindingSource.value,
      configuration: {
        ...bindingSource.value.configuration,
        activation: {
          ...bindingSource.value.configuration.activation,
          knowledge: bindingSource.value.configuration.activation.knowledge.slice(1),
        },
      },
    },
  };
  const bindingCoordinator = new EndToEndConversationCoordinator(
    new StubActivatedConversationPort(bindingMismatch),
  );
  assertFailure(
    await bindingCoordinator.prepareTurn(startRequest()),
    "ScopeMismatch",
    "resolved knowledge must exactly match activation bindings",
  );

  for (const [sourceReason, expected] of [
    ["ConfigurationUnavailable", "ConfigurationUnavailable"],
    ["ConversationUnavailable", "ConversationUnavailable"],
    ["PrototypeUnavailable", "CompositionUnavailable"],
  ] as const) {
    const coordinator = new EndToEndConversationCoordinator(
      new StubActivatedConversationPort({
        status: "failure",
        reason: sourceReason,
        errors: ["internal detail that must not escape"],
      }),
    );
    const result = await coordinator.prepareTurn(startRequest());
    assertFailure(result, expected, "activated failure maps to bounded application outcome");
    assert(
      result.status === "failure"
        && !result.errors.join(" ").includes("internal detail"),
      "lower-layer detail is not disclosed",
    );
  }

  const throwing: ActivatedConversationCompositionPort = {
    initialize: async () => { throw new Error("fictional infrastructure detail"); },
    recover: async () => { throw new Error("fictional infrastructure detail"); },
  };
  const unavailable = await new EndToEndConversationCoordinator(throwing)
    .prepareTurn(startRequest());
  assertFailure(unavailable, "CompositionUnavailable", "thrown dependency failure is sanitized");
}

async function verifyDerivedHandoffBoundary(): Promise<void> {
  const ready = readyForHandoffState();
  const coordinator = new EndToEndConversationCoordinator(
    new StubActivatedConversationPort(successSnapshot(ready)),
  );
  const result = await coordinator.prepareTurn(startRequest());
  assert(
    result.status === "success"
      && result.value.handoff.status === "ready"
      && result.value.handoff.summary.conversationId === conversationId
      && result.value.handoff.summary.businessProfileVersion
        === fictionalBusinessProfile.version
      && result.value.handoff.summary.stateRevision === ready.revision,
    "handoff readiness is derived from exact validated state and pinned profile",
  );
  assert(
    result.status === "success"
      && result.value.response.customerReleaseAuthorized === false,
    "handoff readiness does not authorize customer release",
  );
}

function verifyNarrowTechnologyNeutralCapabilities(): void {
  assertEquivalent(
    END_TO_END_PREPARATION_FAILURES,
    [
      "InvalidInput",
      "ConfigurationUnavailable",
      "ConversationUnavailable",
      "ScopeMismatch",
      "HandoffUnavailable",
      "CompositionUnavailable",
    ],
    "failure vocabulary is explicit and bounded",
  );
  const capabilities = EndToEndConversationCoordinator.prototype as unknown as Record<string, unknown>;
  for (const prohibited of [
    "advance",
    "execute",
    "persist",
    "query",
    "release",
    "send",
    "dispatch",
    "authenticate",
    "activate",
    "retry",
  ]) {
    assert(typeof capabilities[prohibited] === "undefined", `coordinator exposes no ${prohibited} capability`);
  }

  const source = [
    "src/application/end-to-end/contracts.ts",
    "src/application/end-to-end/end-to-end-conversation-coordinator.ts",
  ].map((file) => readFileSync(join(process.cwd(), file), "utf8")).join("\n");
  for (const prohibited of [
    'from "pg"',
    "postgresql",
    "node-postgres",
    "fetch(",
    "axios",
    "React",
    "NextRequest",
    "NextResponse",
  ]) {
    assert(!source.includes(prohibited), `application boundary contains no ${prohibited} dependency`);
  }
}

class StubActivatedConversationPort implements ActivatedConversationCompositionPort {
  initializeCalls = 0;
  recoverCalls = 0;

  constructor(private readonly result: ActivatedConfigurationPrototypeResult) {}

  async initialize(): Promise<ActivatedConfigurationPrototypeResult> {
    this.initializeCalls += 1;
    return structuredClone(this.result);
  }

  async recover(): Promise<ActivatedConfigurationPrototypeResult> {
    this.recoverCalls += 1;
    return structuredClone(this.result);
  }

  callCounts(): Readonly<{ initialize: number; recover: number }> {
    return { initialize: this.initializeCalls, recover: this.recoverCalls };
  }
}

function successSnapshot(state: ConversationState): ActivatedConfigurationPrototypeResult {
  const projectionContext = buildPrototypeProjectionContext(fictionalBusinessProfile, state);
  if (!projectionContext) throw new Error("Fictional projection context is unavailable.");
  const projection = new ConversationReadModelProjector().project(state, projectionContext);
  if (projection.status === "failure") throw new Error(projection.errors.join(" "));
  const activation: ActiveConfigurationSnapshot = {
    businessProfileId: fictionalBusinessProfile.id,
    businessProfileVersion: fictionalBusinessProfile.version,
    activationRevision: 1,
    requestId: "sprint-8-1-activation",
    activatedAt: effectiveAt,
    priorActivationRevision: null,
    priorBusinessProfileVersion: null,
    knowledge: fictionalKnowledgeRecords.map((record) => ({
      businessProfileId: fictionalBusinessProfile.id,
      businessProfileVersion: fictionalBusinessProfile.version,
      knowledgeRecordId: record.id,
      knowledgeRecordVersion: record.version,
    })),
  };
  return {
    status: "success",
    value: {
      configuration: {
        activation,
        businessProfile: structuredClone(fictionalBusinessProfile),
        knowledge: structuredClone(fictionalKnowledgeRecords),
      },
      recovery: {
        status: "success",
        state: structuredClone(state),
        journal: { entries: [] },
        readModel: projection.readModel,
      },
    },
  };
}

function initializedState(): ConversationState {
  const manager = new ConversationStateManager();
  const result = manager.initialize({
    conversationId,
    businessProfileId: fictionalBusinessProfile.id,
    businessProfileVersion: fictionalBusinessProfile.version,
    requiredFields: ["requested-service", "customer-name", "contact-method"],
    authorizedEscalationDestination: fictionalBusinessProfile.escalation.destination,
  });
  if (result.status === "failure") throw new Error(result.errors.join(" "));
  return result.state;
}

function readyForHandoffState(): ConversationState {
  const manager = new ConversationStateManager();
  const initialized = manager.initialize({
    conversationId,
    businessProfileId: fictionalBusinessProfile.id,
    businessProfileVersion: fictionalBusinessProfile.version,
    requiredFields: ["requested-service", "customer-name", "contact-method"],
    authorizedEscalationDestination: fictionalBusinessProfile.escalation.destination,
  });
  if (initialized.status === "failure") throw new Error(initialized.errors.join(" "));
  const engine = new DeterministicConversationEngine(
    fictionalBusinessProfile,
    manager,
    conversationId,
  );
  engine.initializeIntake("project help", "sprint-8-1-service-message");
  answer(engine, "customer-name", "Jordan Example");
  answer(engine, "contact-method", "Fictional written follow-up");
  answer(engine, "project-description", "A fictional room needs a routine project review.");
  answer(engine, "service-location", "Maple Glen");
  engine.coordinateReadiness();
  const confirmed = engine.confirmIntake();
  assert(confirmed.handoffAvailable, "fictional fixture reaches handoff readiness");
  const snapshot = manager.snapshot({
    conversationId,
    businessProfileId: fictionalBusinessProfile.id,
    businessProfileVersion: fictionalBusinessProfile.version,
  });
  if (snapshot.status === "failure") throw new Error(snapshot.errors.join(" "));
  return snapshot.state;
}

function answer(engine: DeterministicConversationEngine, fieldId: string, value: string): void {
  const question = engine.selectAndMarkNextQuestion();
  assert(
    question.status === "selected" && question.field.id === fieldId,
    `expected fictional question for ${fieldId}`,
  );
  engine.applyAnswer(fieldId, value, `sprint-8-1-${fieldId}-message`);
}

function startRequest(): Extract<EndToEndTurnRequest, { readonly mode: "start" }> {
  return {
    mode: "start",
    turnId: "sprint-8-1-turn-001",
    businessProfileId: fictionalBusinessProfile.id,
    conversationId,
    effectiveAt,
    message: {
      messageId: "sprint-8-1-message-001",
      conversationId,
      source: "customer",
      sequence: 1,
      content: "I need fictional project help.",
    },
  };
}

function resumeRequest(): Extract<EndToEndTurnRequest, { readonly mode: "resume" }> {
  return {
    mode: "resume",
    turnId: "sprint-8-1-turn-002",
    scope: {
      businessProfileId: fictionalBusinessProfile.id,
      businessProfileVersion: fictionalBusinessProfile.version,
      conversationId,
    },
    effectiveAt,
    message: {
      messageId: "sprint-8-1-message-002",
      conversationId,
      source: "customer",
      sequence: 2,
      content: "Here is more fictional information.",
    },
  };
}

function assertFailure(
  result: Awaited<ReturnType<EndToEndConversationCoordinator["prepareTurn"]>>,
  reason: string,
  message: string,
): void {
  assert(result.status === "failure" && result.reason === reason, message);
  if (result.status === "failure") assertDeeplyFrozen(result, `${message} result`);
}

function assertDeeplyFrozen(value: unknown, label: string): void {
  assert(value !== null && typeof value === "object" && Object.isFrozen(value), `${label} is frozen`);
  for (const child of Object.values(value as Record<string, unknown>)) {
    if (child && typeof child === "object") assertDeeplyFrozen(child, label);
  }
}

function assertEquivalent(actual: unknown, expected: unknown, message: string): void {
  assert(JSON.stringify(actual) === JSON.stringify(expected), message);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Sprint 8.1 verification failed: ${message}`);
}

void run();
