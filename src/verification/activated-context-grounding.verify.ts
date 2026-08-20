import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ActivatedConfigurationPrototypeResult } from "../ai/prototype/activated-configuration-prototype-integration";
import {
  ActivatedContextAssembler,
  EndToEndGroundingValidator,
} from "../application/end-to-end/activated-context-and-grounding";
import {
  ACTIVATED_CONTEXT_POLICY_VERSION,
  type EndToEndKnowledgeReference,
  type EndToEndTurnRequest,
} from "../application/end-to-end/contracts";
import {
  EndToEndConversationCoordinator,
  type ActivatedConversationCompositionPort,
} from "../application/end-to-end/end-to-end-conversation-coordinator";
import type { ActiveConfigurationSnapshot } from "../business-configuration/activation-contracts";
import { ConversationStateManager } from "../conversation/conversation-state-manager";
import { ConversationReadModelProjector } from "../conversation-read-model/conversation-read-model-projector";
import { buildPrototypeProjectionContext } from "../conversation-read-model/prototype-projection-context";
import type { BusinessProfile } from "../domain/business-profile";
import type { ConversationState } from "../domain/conversation-state";
import type { KnowledgeRecord } from "../domain/knowledge-record";
import { fictionalBusinessProfile } from "../fixtures/business-profile";
import { fictionalKnowledgeRecords } from "../fixtures/knowledge";

const effectiveAt = "2026-08-20T12:00:00.000Z";
const conversationId = "sprint-8-2-fictional-conversation";

async function run(): Promise<void> {
  await verifyActivatedContextAndGrounding();
  verifyContextEligibilityFailures();
  verifyGroundingFailures();
  await verifyHistoricalPinAfterReactivation();
  verifyNarrowBoundary();
  console.log("Sprint 8.2 activated context and grounded knowledge verification passed.");
}

async function verifyActivatedContextAndGrounding(): Promise<void> {
  const snapshot = successSnapshot(fictionalBusinessProfile, fictionalKnowledgeRecords, stateFor(1), 1);
  const coordinator = new EndToEndConversationCoordinator(new StaticPort(snapshot));
  const result = await coordinator.prepareTurn(startRequest());
  assert(result.status === "success", "exact activated scope assembles context");
  if (result.status !== "success") return;
  const context = result.value.context;
  assert(
    context.identity.businessProfileId === fictionalBusinessProfile.id
      && context.identity.businessProfileVersion === fictionalBusinessProfile.version
      && context.identity.conversationId === conversationId
      && context.identity.stateRevision === 0
      && context.identity.activationRevision === 1,
    "context preserves exact profile, conversation, state, and activation identity",
  );
  assert(
    context.businessProfile.version === 1
      && context.currentCustomerInput.trust === "untrusted-customer-input"
      && context.currentCustomerInput.content === startRequest().message.content,
    "pinned profile and explicitly untrusted current input enter transient context",
  );
  assert(
    context.knowledge.length === fictionalKnowledgeRecords.length
      && context.knowledge.every((record, index) =>
        record.knowledgeRecordId === fictionalKnowledgeRecords[index].id
        && record.knowledgeRecordVersion === fictionalKnowledgeRecords[index].version
        && record.source === fictionalKnowledgeRecords[index].source
        && (record.audience === "customer" || record.audience === "both")
        && record.effectiveDate === fictionalKnowledgeRecords[index].effectiveDate
        && record.activationRevision === 1
        && record.contextPolicyVersion === ACTIVATED_CONTEXT_POLICY_VERSION
        && record.eligibility.decision === "included"),
    "only exact activation-bound customer knowledge enters context with provenance",
  );
  assert(
    context.authority.assembledBy === "application"
      && !context.authority.providerExecutionAuthorized
      && !context.authority.stateMutationAuthorized
      && !context.authority.customerReleaseAuthorized
      && result.value.response.status === "not-produced",
    "context grants no provider, mutation, response, or release authority",
  );

  const reference = referenceFor(context.knowledge[0]);
  const validation = new EndToEndGroundingValidator().validate({
    candidateId: "sprint-8-2-candidate",
    content: "The fictional guide supports this bounded answer.",
    sourceReferences: [reference],
  }, context);
  assert(
    validation.status === "success"
      && validation.value.sourceReferences[0]?.source === reference.source
      && validation.value.sourceReferences[0]?.audience === reference.audience
      && validation.value.sourceReferences[0]?.effectiveDate === reference.effectiveDate
      && validation.value.sourceReferences[0]?.activationRevision === 1
      && validation.value.customerReleaseAuthorized === false,
    "output validation preserves exact source, audience, time, version, activation, and policy provenance",
  );
  assertDeeplyFrozen(result, "assembled context result");
  assertDeeplyFrozen(validation, "grounding validation result");
}

function verifyContextEligibilityFailures(): void {
  const assembler = new ActivatedContextAssembler();
  const state = stateFor(1);
  const base = snapshotValue(successSnapshot(fictionalBusinessProfile, fictionalKnowledgeRecords, state, 1));
  const cases: readonly [string, ActivatedConfigurationPrototypeResult["status"] extends never ? never : unknown][] = [
    ["suspended knowledge", withKnowledge(base.configuration, 0, { lifecycleState: "suspended" })],
    ["expired knowledge", withKnowledge(base.configuration, 0, { lifecycleState: "expired" })],
    ["malformed knowledge", withKnowledge(base.configuration, 0, { source: "" })],
    ["future-effective knowledge", withKnowledge(base.configuration, 0, { effectiveDate: "2030-01-01" })],
    ["staff-only knowledge", withKnowledge(base.configuration, 0, { audience: "staff" })],
    ["future activation", {
      ...base.configuration,
      activation: { ...base.configuration.activation, activatedAt: "2030-01-01T00:00:00.000Z" },
    }],
    ["suspended profile", {
      ...base.configuration,
      businessProfile: { ...base.configuration.businessProfile, status: "suspended" },
    }],
    ["malformed profile", {
      ...base.configuration,
      businessProfile: { ...base.configuration.businessProfile, businessName: "" },
    }],
  ];
  for (const [label, configuration] of cases) {
    const result = assembler.build({
      configuration: configuration as typeof base.configuration,
      conversationState: state,
      currentCustomerInput: startRequest().message,
      effectiveAt,
    });
    assertFailure(result, "ContextUnavailable", `${label} fails closed`);
  }

  const unbound = {
    ...base.configuration,
    activation: {
      ...base.configuration.activation,
      knowledge: base.configuration.activation.knowledge.slice(1),
    },
  };
  assertFailure(assembler.build({
    configuration: unbound,
    conversationState: state,
    currentCustomerInput: startRequest().message,
    effectiveAt,
  }), "ScopeMismatch", "unbound knowledge fails exact binding scope");

  const missing = {
    ...base.configuration,
    knowledge: base.configuration.knowledge.slice(1),
  };
  assertFailure(assembler.build({
    configuration: missing,
    conversationState: state,
    currentCustomerInput: startRequest().message,
    effectiveAt,
  }), "ScopeMismatch", "missing bound knowledge fails exact binding scope");

  const wrongBusiness = {
    ...base.configuration,
    businessProfile: { ...base.configuration.businessProfile, id: "another-business" },
  };
  assertFailure(assembler.build({
    configuration: wrongBusiness,
    conversationState: state,
    currentCustomerInput: startRequest().message,
    effectiveAt,
  }), "ScopeMismatch", "wrong-business profile fails closed");

  assertFailure(assembler.build({
    configuration: base.configuration,
    conversationState: { ...state, conversationId: "another-conversation" },
    currentCustomerInput: startRequest().message,
    effectiveAt,
  }), "ScopeMismatch", "wrong-conversation input fails closed");

  const conflictingRecord: KnowledgeRecord = {
    ...structuredClone(fictionalKnowledgeRecords[0]),
    id: "conflicting-knowledge",
    content: "A contradictory fictional claim.",
  };
  const conflicting = {
    ...base.configuration,
    knowledge: [...base.configuration.knowledge, conflictingRecord],
    activation: {
      ...base.configuration.activation,
      knowledge: [...base.configuration.activation.knowledge, {
        businessProfileId: fictionalBusinessProfile.id,
        businessProfileVersion: 1,
        knowledgeRecordId: conflictingRecord.id,
        knowledgeRecordVersion: conflictingRecord.version,
      }],
    },
  };
  assertFailure(assembler.build({
    configuration: conflicting,
    conversationState: state,
    currentCustomerInput: startRequest().message,
    effectiveAt,
  }), "ContextUnavailable", "contradictory activated knowledge fails closed");
}

function verifyGroundingFailures(): void {
  const state = stateFor(1);
  const value = snapshotValue(successSnapshot(fictionalBusinessProfile, fictionalKnowledgeRecords, state, 1));
  const assembled = new ActivatedContextAssembler().build({
    configuration: value.configuration,
    conversationState: state,
    currentCustomerInput: startRequest().message,
    effectiveAt,
  });
  assert(assembled.status === "success", "grounding fixture assembles");
  if (assembled.status !== "success") return;
  const validator = new EndToEndGroundingValidator();
  const validReference = referenceFor(assembled.value.knowledge[0]);
  assertGroundingFailure(validator.validate({
    candidateId: "missing-grounding",
    content: "A fictional answer.",
    sourceReferences: [],
  }, assembled.value), "GroundingRequired", "missing grounding fails closed");
  for (const [label, reference] of [
    ["wrong version", { ...validReference, knowledgeRecordVersion: 999 }],
    ["wrong source", { ...validReference, source: "Unbound source" }],
    ["wrong activation", { ...validReference, activationRevision: 999 }],
    ["wrong effective time", { ...validReference, effectiveDate: "2025-01-01" }],
    ["unbound record", { ...validReference, knowledgeRecordId: "unbound-record" }],
  ] as const) {
    assertGroundingFailure(validator.validate({
      candidateId: `candidate-${label.replace(/\s+/g, "-")}`,
      content: "A fictional answer.",
      sourceReferences: [reference],
    }, assembled.value), "GroundingScopeMismatch", `${label} cannot validate`);
  }
}

async function verifyHistoricalPinAfterReactivation(): Promise<void> {
  const profileV2: BusinessProfile = { ...structuredClone(fictionalBusinessProfile), version: 2 };
  const knowledgeV2 = fictionalKnowledgeRecords.map((record) => ({ ...structuredClone(record), version: 2 }));
  const historical = successSnapshot(fictionalBusinessProfile, fictionalKnowledgeRecords, stateFor(1), 1);
  const current = successSnapshot(profileV2, knowledgeV2, stateFor(2), 2);
  const coordinator = new EndToEndConversationCoordinator(new SelectionPort(current, historical));
  const started = await coordinator.prepareTurn(startRequest());
  const resumed = await coordinator.prepareTurn(resumeRequest());
  assert(
    started.status === "success"
      && started.value.context.identity.businessProfileVersion === 2
      && started.value.context.knowledge.every((record) => record.knowledgeRecordVersion === 2),
    "new conversation may use the exact newer activation",
  );
  assert(
    resumed.status === "success"
      && resumed.value.context.identity.businessProfileVersion === 1
      && resumed.value.context.knowledge.every((record) => record.knowledgeRecordVersion === 1),
    "existing conversation remains on exact historical profile and knowledge versions",
  );
}

function verifyNarrowBoundary(): void {
  const source = [
    "src/application/end-to-end/activated-context-and-grounding.ts",
    "src/application/end-to-end/end-to-end-conversation-coordinator.ts",
  ].map((file) => readFileSync(join(process.cwd(), file), "utf8")).join("\n");
  for (const prohibited of [
    'from "pg"',
    "postgresql",
    "../fixtures",
    "fetch(",
    "OpenAI",
    "NextRequest",
    "NextResponse",
  ]) assert(!source.includes(prohibited), `activated context boundary contains no ${prohibited}`);
  for (const prohibited of ["execute", "advance", "persist", "release", "send", "activate"]) {
    assert(
      typeof (ActivatedContextAssembler.prototype as unknown as Record<string, unknown>)[prohibited] === "undefined",
      `context assembler exposes no ${prohibited} capability`,
    );
  }
}

class StaticPort implements ActivatedConversationCompositionPort {
  constructor(private readonly result: ActivatedConfigurationPrototypeResult) {}
  async initialize(): Promise<ActivatedConfigurationPrototypeResult> { return structuredClone(this.result); }
  async recover(): Promise<ActivatedConfigurationPrototypeResult> { return structuredClone(this.result); }
}

class SelectionPort implements ActivatedConversationCompositionPort {
  constructor(
    private readonly current: ActivatedConfigurationPrototypeResult,
    private readonly historical: ActivatedConfigurationPrototypeResult,
  ) {}
  async initialize(): Promise<ActivatedConfigurationPrototypeResult> { return structuredClone(this.current); }
  async recover(): Promise<ActivatedConfigurationPrototypeResult> { return structuredClone(this.historical); }
}

function successSnapshot(
  profile: Readonly<BusinessProfile>,
  knowledge: readonly Readonly<KnowledgeRecord>[],
  state: ConversationState,
  activationRevision: number,
): ActivatedConfigurationPrototypeResult {
  const projectionContext = buildPrototypeProjectionContext(profile, state);
  if (!projectionContext) throw new Error("Fictional projection context is unavailable.");
  const projection = new ConversationReadModelProjector().project(state, projectionContext);
  if (projection.status === "failure") throw new Error(projection.errors.join(" "));
  const activation: ActiveConfigurationSnapshot = {
    businessProfileId: profile.id,
    businessProfileVersion: profile.version,
    activationRevision,
    requestId: `sprint-8-2-activation-${activationRevision}`,
    activatedAt: effectiveAt,
    priorActivationRevision: activationRevision === 1 ? null : activationRevision - 1,
    priorBusinessProfileVersion: profile.version === 1 ? null : profile.version - 1,
    knowledge: knowledge.map((record) => ({
      businessProfileId: profile.id,
      businessProfileVersion: profile.version,
      knowledgeRecordId: record.id,
      knowledgeRecordVersion: record.version,
    })),
  };
  return {
    status: "success",
    value: {
      configuration: {
        activation,
        businessProfile: structuredClone(profile),
        knowledge: structuredClone(knowledge),
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

function snapshotValue(result: ActivatedConfigurationPrototypeResult): Extract<ActivatedConfigurationPrototypeResult, { status: "success" }>["value"] {
  if (result.status === "failure") throw new Error("Fictional activated snapshot is unavailable.");
  return result.value;
}

function stateFor(profileVersion: number): ConversationState {
  const result = new ConversationStateManager().initialize({
    conversationId,
    businessProfileId: fictionalBusinessProfile.id,
    businessProfileVersion: profileVersion,
    requiredFields: ["requested-service", "customer-name", "contact-method"],
    authorizedEscalationDestination: fictionalBusinessProfile.escalation.destination,
  });
  if (result.status === "failure") throw new Error(result.errors.join(" "));
  return result.state;
}

function withKnowledge(
  configuration: ReturnType<typeof snapshotValue>["configuration"],
  index: number,
  changes: Partial<KnowledgeRecord>,
): ReturnType<typeof snapshotValue>["configuration"] {
  return {
    ...configuration,
    knowledge: configuration.knowledge.map((record, recordIndex) =>
      recordIndex === index ? { ...record, ...changes } : record),
  };
}

function referenceFor(record: Readonly<EndToEndKnowledgeReference>): EndToEndKnowledgeReference {
  return {
    knowledgeRecordId: record.knowledgeRecordId,
    knowledgeRecordVersion: record.knowledgeRecordVersion,
    source: record.source,
    audience: record.audience,
    effectiveDate: record.effectiveDate,
    activationRevision: record.activationRevision,
    contextPolicyVersion: record.contextPolicyVersion,
  };
}

function startRequest(): Extract<EndToEndTurnRequest, { readonly mode: "start" }> {
  return {
    mode: "start",
    turnId: "sprint-8-2-turn-current",
    businessProfileId: fictionalBusinessProfile.id,
    conversationId,
    effectiveAt,
    message: {
      messageId: "sprint-8-2-message-current",
      conversationId,
      source: "customer",
      sequence: 1,
      content: "What does the fictional service guide say?",
    },
  };
}

function resumeRequest(): Extract<EndToEndTurnRequest, { readonly mode: "resume" }> {
  return {
    mode: "resume",
    turnId: "sprint-8-2-turn-historical",
    scope: {
      businessProfileId: fictionalBusinessProfile.id,
      businessProfileVersion: 1,
      conversationId,
    },
    effectiveAt,
    message: {
      messageId: "sprint-8-2-message-historical",
      conversationId,
      source: "customer",
      sequence: 2,
      content: "Please keep the existing fictional conversation pinned.",
    },
  };
}

function assertFailure(
  result: { readonly status: string; readonly reason?: string },
  reason: string,
  message: string,
): void {
  assert(result.status === "failure" && result.reason === reason, message);
}

function assertGroundingFailure(
  result: ReturnType<EndToEndGroundingValidator["validate"]>,
  reason: string,
  message: string,
): void {
  assert(result.status === "failure" && result.reason === reason, message);
}

function assertDeeplyFrozen(value: unknown, label: string): void {
  assert(value !== null && typeof value === "object" && Object.isFrozen(value), `${label} is frozen`);
  for (const child of Object.values(value as Record<string, unknown>)) {
    if (child && typeof child === "object") assertDeeplyFrozen(child, label);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Sprint 8.2 verification failed: ${message}`);
}

void run();
