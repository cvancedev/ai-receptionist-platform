import { AiFoundationPrototypeOrchestrator } from "../ai/prototype/ai-foundation-orchestrator";
import {
  DeterministicConversationProgressEngine,
} from "../conversation-progress/conversation-progress-engine";
import {
  CONVERSATION_PROGRESS_DECISIONS,
  CONVERSATION_PROGRESS_FAILURES,
  CONVERSATION_PROGRESS_SERVICE_STATUSES,
  DEFAULT_CONVERSATION_PROGRESS_POLICY,
  type ConversationProgressInput,
} from "../conversation-progress/contracts";
import {
  CONVERSATION_READ_MODEL_ACTIONS,
} from "../conversation-read-model/contracts";
import { ConversationReadModelProjector } from "../conversation-read-model/conversation-read-model-projector";
import {
  mapProgressDecisionToReadModelAction,
} from "../conversation-read-model/progress-decision-mapping";
import { StateTransitionRegistry } from "../ai/execution/transition-registry";
import { initializedConversationState } from "../fixtures/conversation";
import {
  COMPLETION_STATES,
  CONVERSATION_STAGES,
  ESCALATION_STATES,
} from "../shared/constants";

void verifyConversationProgress();

async function verifyConversationProgress() {
  verifyDecisionSemantics();
  verifyPrecedence();
  verifyFailClosedValidation();
  verifyDeterminismAndImmutability();
  verifyAuthorityBoundary();
  verifyReadModelMapping();
  await verifyExistingBoundaries();
}

function verifyDecisionSemantics() {
  assertDecision(
    {
      ...baseInput(),
      stage: CONVERSATION_STAGES.INITIALIZED,
      serviceResolution: {
        status: CONVERSATION_PROGRESS_SERVICE_STATUSES.UNRESOLVED,
        resolvedServiceId: null,
      },
      satisfiedRequiredFieldIds: [],
      missingRequiredFieldIds: ["requested-service", "customer-name"],
    },
    CONVERSATION_PROGRESS_DECISIONS.BEGIN_INTAKE,
    "initialized state begins intake",
  );
  assertDecision(
    baseInput(),
    CONVERSATION_PROGRESS_DECISIONS.ASK_REQUIRED_FIELD,
    "resolved intake with a missing required field asks that field",
  );
  assertDecision(
    {
      ...baseInput(),
      serviceResolution: {
        status: CONVERSATION_PROGRESS_SERVICE_STATUSES.AMBIGUOUS,
        resolvedServiceId: null,
      },
      satisfiedRequiredFieldIds: [],
      missingRequiredFieldIds: ["requested-service", "customer-name"],
    },
    CONVERSATION_PROGRESS_DECISIONS.CLARIFY_SERVICE,
    "ambiguous service requires clarification",
  );
  assertDecision(
    {
      ...baseInput(),
      serviceResolution: {
        status: CONVERSATION_PROGRESS_SERVICE_STATUSES.UNSUPPORTED,
        resolvedServiceId: null,
      },
      satisfiedRequiredFieldIds: [],
      missingRequiredFieldIds: ["requested-service", "customer-name"],
    },
    CONVERSATION_PROGRESS_DECISIONS.REVIEW_ESCALATION,
    "unsupported service follows explicit review policy",
  );
  assertDecision(
    {
      ...baseInput(),
      serviceResolution: {
        status: CONVERSATION_PROGRESS_SERVICE_STATUSES.UNSUPPORTED,
        resolvedServiceId: null,
      },
      satisfiedRequiredFieldIds: [],
      missingRequiredFieldIds: ["requested-service", "customer-name"],
      policy: {
        policyVersion: 1,
        unsupportedServiceDecision: CONVERSATION_PROGRESS_DECISIONS.NONE,
      },
    },
    CONVERSATION_PROGRESS_DECISIONS.NONE,
    "unsupported service may explicitly stop under application policy",
  );
  assertDecision(
    completeInput(),
    CONVERSATION_PROGRESS_DECISIONS.INTAKE_COMPLETE,
    "proven completion eligibility completes intake",
  );
  assertDecision(
    {
      ...completeInput(),
      stage: CONVERSATION_STAGES.INTAKE,
      completionState: COMPLETION_STATES.NOT_READY,
      completionEligible: false,
    },
    CONVERSATION_PROGRESS_DECISIONS.NONE,
    "valid resolved state with no permitted intent returns none",
  );
  assertDecision(
    {
      ...completeInput(),
      stage: CONVERSATION_STAGES.ABANDONED,
      completionState: COMPLETION_STATES.ABANDONED,
      completionEligible: false,
    },
    CONVERSATION_PROGRESS_DECISIONS.NONE,
    "abandoned state returns none",
  );
  assertDecision(
    {
      ...baseInput(),
      reopenedRequiredFieldIds: ["customer-name"],
    },
    CONVERSATION_PROGRESS_DECISIONS.ASK_REQUIRED_FIELD,
    "correction-reopened requirements remain unresolved",
  );
}

function verifyPrecedence() {
  assertDecision(
    {
      ...completeInput(),
      escalationState: ESCALATION_STATES.RECOMMENDED,
    },
    CONVERSATION_PROGRESS_DECISIONS.REVIEW_ESCALATION,
    "escalation review precedes completion",
  );
  assertDecision(
    {
      ...baseInput(),
      stage: CONVERSATION_STAGES.INITIALIZED,
      serviceResolution: {
        status: CONVERSATION_PROGRESS_SERVICE_STATUSES.AMBIGUOUS,
        resolvedServiceId: null,
      },
      satisfiedRequiredFieldIds: [],
      missingRequiredFieldIds: ["requested-service", "customer-name"],
    },
    CONVERSATION_PROGRESS_DECISIONS.BEGIN_INTAKE,
    "initialized state reaches controlled intake before service handling",
  );
}

function verifyFailClosedValidation() {
  assertFailure(
    { ...baseInput(), stage: "unknown-stage" },
    CONVERSATION_PROGRESS_FAILURES.MALFORMED_INPUT,
    "unknown stage",
  );
  assertFailure(
    {
      ...baseInput(),
      requiredFieldIds: ["customer-name", "customer-name"],
    },
    CONVERSATION_PROGRESS_FAILURES.CONTRADICTORY_REQUIRED_FIELDS,
    "duplicate required fields",
  );
  assertFailure(
    {
      ...baseInput(),
      satisfiedRequiredFieldIds: ["requested-service", "customer-name"],
      missingRequiredFieldIds: ["customer-name"],
    },
    CONVERSATION_PROGRESS_FAILURES.CONTRADICTORY_REQUIRED_FIELDS,
    "required field both satisfied and missing",
  );
  assertFailure(
    {
      ...baseInput(),
      satisfiedRequiredFieldIds: ["requested-service", "optional-fact"],
    },
    CONVERSATION_PROGRESS_FAILURES.CONTRADICTORY_REQUIRED_FIELDS,
    "optional fact cannot satisfy required fields",
  );
  assertFailure(
    {
      ...baseInput(),
      serviceResolution: {
        status: CONVERSATION_PROGRESS_SERVICE_STATUSES.RESOLVED,
        resolvedServiceId: null,
      },
    },
    CONVERSATION_PROGRESS_FAILURES.INVALID_SERVICE_RESOLUTION,
    "resolved service without application identity",
  );
  assertFailure(
    {
      ...baseInput(),
      completionEligible: true,
    },
    CONVERSATION_PROGRESS_FAILURES.INVALID_COMPLETION_ELIGIBILITY,
    "completion with missing requirements",
  );
  assertFailure(
    {
      ...completeInput(),
      completionState: COMPLETION_STATES.READY_FOR_HANDOFF,
      completionEligible: false,
    },
    CONVERSATION_PROGRESS_FAILURES.INVALID_COMPLETION_ELIGIBILITY,
    "completion state without eligibility",
  );
  assertFailure(
    {
      ...baseInput(),
      policy: {
        policyVersion: 2,
        unsupportedServiceDecision: CONVERSATION_PROGRESS_DECISIONS.NONE,
      },
    },
    CONVERSATION_PROGRESS_FAILURES.INVALID_POLICY,
    "unsupported policy",
  );
  assertFailure(
    {
      ...baseInput(),
      modelOutput: CONVERSATION_PROGRESS_DECISIONS.INTAKE_COMPLETE,
    },
    CONVERSATION_PROGRESS_FAILURES.MALFORMED_INPUT,
    "model output cannot enter the trusted input contract",
  );
}

function verifyDeterminismAndImmutability() {
  const engine = new DeterministicConversationProgressEngine();
  const input = baseInput();
  const before = JSON.stringify(input);
  const first = engine.evaluate(input);
  const second = engine.evaluate(structuredClone(input));

  assertEquivalent(first, second, "identical inputs evaluate identically");
  assert(JSON.stringify(input) === before, "evaluation does not mutate input");
  assertDeeplyFrozen(first, "successful progress result");
  assert(
    first.status === "success"
      && first.value.metadata.evaluationMode === "deterministic"
      && first.value.metadata.sourceRevision === input.revision,
    "deterministic metadata records policy and source revision",
  );

  const failure = engine.evaluate(null);
  assertDeeplyFrozen(failure, "failed progress result");
  assert(
    Object.values(CONVERSATION_PROGRESS_DECISIONS).length === 6,
    "Progress Decision allowlist contains exactly six values",
  );
}

function verifyAuthorityBoundary() {
  const engine = new DeterministicConversationProgressEngine();
  const result = engine.evaluate(baseInput());
  assert(result.status === "success", "authority fixture evaluates");
  assert(
    result.value.stateMutationAuthorized === false
      && result.value.transitionExecutionAuthorized === false
      && result.value.customerReleaseAuthorized === false,
    "Progress Decision explicitly denies mutation, execution, and release",
  );
  assert(
    !containsKey(result, "executionId")
      && !containsKey(result, "transitionIdentifier")
      && !containsKey(result, "applicationDecision")
      && !containsFunction(result),
    "Progress Decision exposes no execution request or callback",
  );
  const capabilities = engine as unknown as Record<string, unknown>;
  assert(
    typeof capabilities.execute === "undefined"
      && typeof capabilities.apply === "undefined"
      && typeof capabilities.append === "undefined",
    "Progress Engine exposes no executor, state, or journal capability",
  );
}

function verifyReadModelMapping() {
  const progressValues = Object.values(CONVERSATION_PROGRESS_DECISIONS);
  const readModelValues = Object.values(CONVERSATION_READ_MODEL_ACTIONS);
  assertEquivalent(
    progressValues,
    readModelValues,
    "read-model vocabulary aligns exactly with Progress Decisions",
  );
  for (const decision of progressValues) {
    assert(
      mapProgressDecisionToReadModelAction(decision) === decision,
      `${decision} maps explicitly to the read model`,
    );
  }
  assert(
    mapProgressDecisionToReadModelAction("unknown-progress") === null,
    "unknown action mapping fails closed",
  );

  const state = structuredClone(initializedConversationState);
  const projected = new ConversationReadModelProjector().project(state, {
    requiredFieldIds: [...state.missingFields],
    resolvedServiceId: null,
    serviceResolutionStatus:
      CONVERSATION_PROGRESS_SERVICE_STATUSES.UNRESOLVED,
    reopenedRequiredFieldIds: [],
    completionEligible: false,
    progressPolicy: DEFAULT_CONVERSATION_PROGRESS_POLICY,
  });
  assert(projected.status === "success", "read model consumes progress context");
  assert(
    projected.readModel.recommendedNextAction
      === CONVERSATION_PROGRESS_DECISIONS.BEGIN_INTAKE,
    "read model recommendation comes from Progress Engine semantics",
  );
  assert(
    projected.readModel.status.canReleaseToCustomer === false,
    "read-model integration preserves release denial",
  );
}

async function verifyExistingBoundaries() {
  const registry = new StateTransitionRegistry();
  const transitions = registry.list();
  assert(
    transitions.length === 1
      && transitions[0].identifier
        === "begin_intake_after_language_interpretation",
    "Sprint 5.5 adds no transition",
  );
  const orchestrator = new AiFoundationPrototypeOrchestrator();
  const execution = await orchestrator.runWithExecution("valid_intent");
  assert(execution.status === "success", "controlled execution remains available");
  assert(
    orchestrator.executionJournalSnapshot().entries.length === 1,
    "existing execution journal remains intact",
  );
}

function baseInput(): ConversationProgressInput {
  return {
    conversationId: "fictional-conversation-001",
    businessProfileId: "friendly-home-services",
    businessProfileVersion: 1,
    revision: 4,
    stage: CONVERSATION_STAGES.INTAKE,
    serviceResolution: {
      status: CONVERSATION_PROGRESS_SERVICE_STATUSES.RESOLVED,
      resolvedServiceId: "home-project-consultation",
    },
    requiredFieldIds: ["requested-service", "customer-name"],
    satisfiedRequiredFieldIds: ["requested-service"],
    missingRequiredFieldIds: ["customer-name"],
    reopenedRequiredFieldIds: [],
    escalationState: ESCALATION_STATES.NONE,
    completionState: COMPLETION_STATES.NOT_READY,
    completionEligible: false,
    policy: DEFAULT_CONVERSATION_PROGRESS_POLICY,
  };
}

function completeInput(): ConversationProgressInput {
  return {
    ...baseInput(),
    stage: CONVERSATION_STAGES.CONFIRMATION,
    satisfiedRequiredFieldIds: ["requested-service", "customer-name"],
    missingRequiredFieldIds: [],
    completionState: COMPLETION_STATES.READY_FOR_CONFIRMATION,
    completionEligible: true,
  };
}

function assertDecision(
  input: ConversationProgressInput,
  decision: string,
  label: string,
) {
  const result = new DeterministicConversationProgressEngine().evaluate(input);
  assert(result.status === "success", `${label} evaluates successfully`);
  assert(result.value.decision === decision, label);
}

function assertFailure(
  input: unknown,
  failure: string,
  label: string,
) {
  const result = new DeterministicConversationProgressEngine().evaluate(input);
  assert(result.status === "failure", `${label} fails closed`);
  assert(result.failures[0] === failure, `${label} has deterministic failure`);
  assert(result.errors.length === 1, `${label} has one bounded error`);
}

function containsKey(value: unknown, key: string): boolean {
  if (!value || typeof value !== "object") return false;
  if (key in value) return true;
  return Object.values(value).some((child) => containsKey(child, key));
}

function containsFunction(value: unknown): boolean {
  if (typeof value === "function") return true;
  if (!value || typeof value !== "object") return false;
  return Object.values(value).some(containsFunction);
}

function assertDeeplyFrozen(value: unknown, label: string) {
  if (!value || typeof value !== "object") return;
  assert(Object.isFrozen(value), `${label} is deeply immutable`);
  for (const child of Object.values(value)) {
    assertDeeplyFrozen(child, label);
  }
}

function assertEquivalent(first: unknown, second: unknown, label: string) {
  assert(JSON.stringify(first) === JSON.stringify(second), label);
}

function assert(condition: unknown, label: string): asserts condition {
  if (!condition) {
    throw new Error(`Conversation progress verification failed: ${label}`);
  }
}
