import {
  CONVERSATION_READ_MODEL_ACTIONS,
  type ConversationReadModel,
} from "../conversation-read-model/contracts";
import { ConversationReadModelProjector } from "../conversation-read-model/conversation-read-model-projector";
import type {
  ConversationFinalSnapshot,
  ConversationState,
} from "../domain/conversation-state";
import { initializedConversationState } from "../fixtures/conversation";
import {
  COMPLETION_STATES,
  CONVERSATION_STAGES,
  ESCALATION_STATES,
} from "../shared/constants";

const requiredFieldIds = [
  "customer-name",
  "contact-method",
  "requested-service",
  "project-description",
] as const;

verifyConversationReadModel();

function verifyConversationReadModel() {
  verifyInitializedAndIntakeProjection();
  verifyFactsCorrectionsAndProgress();
  verifyEscalationCompletionAndActions();
  verifyDeepImmutabilityAndIsolation();
  verifyMalformedInputFailsClosed();
  verifyProjectionHasNoExecutionCapability();
}

function verifyInitializedAndIntakeProjection() {
  const projector = new ConversationReadModelProjector();
  const source = cloneState(initializedConversationState);
  const before = JSON.stringify(source);
  const first = project(projector, source, requiredFieldIds);
  const second = project(projector, source, requiredFieldIds);

  assertEquivalent(first, second, "identical state projects identically");
  assert(JSON.stringify(source) === before, "projection does not mutate source state");
  assert(
    first.identity.conversationId === source.conversationId
      && first.identity.businessProfileId === source.businessProfileId
      && first.identity.businessProfileVersion === source.businessProfileVersion,
    "conversation scope and identity are preserved",
  );
  assert(first.stage === CONVERSATION_STAGES.INITIALIZED, "initialized stage projects");
  assert(first.revision === 0 && first.metadata.sourceRevision === 0, "revision projects");
  assert(first.resolvedServiceId === null, "unresolved service projects explicitly");
  assert(
    first.recommendedNextAction === CONVERSATION_READ_MODEL_ACTIONS.BEGIN_INTAKE,
    "initialized state recommends the allowlisted intake action",
  );
  assert(
    first.completionProgress.status === "tracked"
      && first.completionProgress.percentage === 0,
    "initialized required-field progress is zero",
  );

  const intake = cloneState(source);
  intake.stage = CONVERSATION_STAGES.INTAKE;
  intake.revision = 1;
  const intakeModel = project(projector, intake, requiredFieldIds);
  assert(intakeModel.stage === CONVERSATION_STAGES.INTAKE, "intake stage projects");
  assert(
    intakeModel.recommendedNextAction
      === CONVERSATION_READ_MODEL_ACTIONS.ASK_REQUIRED_FIELD,
    "intake with unresolved requirements recommends a required field",
  );

  const noRequirements = cloneState(source);
  noRequirements.missingFields = [];
  const noRequirementsModel = project(projector, noRequirements, []);
  assert(
    noRequirementsModel.completionProgress.status === "not-applicable"
      && noRequirementsModel.completionProgress.percentage === null,
    "no required fields use an explicit non-applicable progress result",
  );
}

function verifyFactsCorrectionsAndProgress() {
  const state = richIntakeState();
  const model = project(
    new ConversationReadModelProjector(),
    state,
    requiredFieldIds,
  );

  assert(model.revision === 7, "current state revision is preserved");
  assert(
    model.resolvedServiceId === "home-project-consultation",
    "confirmed requested service projects as its identifier",
  );
  assert(model.collectedFacts.length === 3, "collected facts project");
  assert(
    model.collectedFacts[0].field === "requested-service"
      && model.collectedFacts[1].field === "preferred-date"
      && model.collectedFacts[2].value === "Jamie",
    "facts project in deterministic sequence order",
  );
  assert(
    model.corrections.length === 1
      && model.corrections[0].previousValue === "James"
      && model.corrections[0].correctedValue === "Jamie",
    "correction history projects",
  );
  assert(
    JSON.stringify(model.missingRequiredFields)
      === JSON.stringify(["contact-method", "project-description"]),
    "missing required fields project",
  );
  assert(
    JSON.stringify(model.askedQuestions)
      === JSON.stringify(["ask-requested-service", "ask-customer-name"]),
    "asked-question history projects",
  );
  assert(
    model.completionProgress.status === "tracked"
      && model.completionProgress.satisfiedRequiredFields === 2
      && model.completionProgress.totalRequiredFields === 4
      && model.completionProgress.percentage === 50,
    "required-field completion progress is deterministic",
  );
  assert(
    model.completionProgress.status === "tracked"
      && model.completionProgress.satisfiedRequiredFields
        < model.collectedFacts.length,
    "optional facts do not inflate required-field progress",
  );
  if (model.completionProgress.status === "tracked") {
    assert(
      model.completionProgress.percentage >= 0
        && model.completionProgress.percentage <= 100,
      "completion percentage is bounded",
    );
  }
}

function verifyEscalationCompletionAndActions() {
  const projector = new ConversationReadModelProjector();
  const escalation = richIntakeState();
  escalation.stage = CONVERSATION_STAGES.ESCALATION;
  escalation.revision = 8;
  escalation.escalation = {
    status: ESCALATION_STATES.REQUIRED,
    reason: "A human review is required.",
    triggerSource: "application-policy",
    destination: "Fictional customer care team",
  };
  const escalationModel = project(projector, escalation, requiredFieldIds);
  assert(escalationModel.status.isEscalated, "active escalation status projects");
  assert(
    escalationModel.escalation.status === ESCALATION_STATES.REQUIRED
      && escalationModel.escalation.reason === "A human review is required.",
    "escalation description projects",
  );
  assert(
    escalationModel.recommendedNextAction
      === CONVERSATION_READ_MODEL_ACTIONS.REVIEW_ESCALATION,
    "active escalation recommends only the allowlisted review action",
  );

  const completed = completedState();
  const completedModel = project(projector, completed, requiredFieldIds);
  assert(
    completedModel.completionStatus === COMPLETION_STATES.COMPLETED
      && completedModel.status.isComplete,
    "completion status projects",
  );
  assert(
    completedModel.recommendedNextAction
      === CONVERSATION_READ_MODEL_ACTIONS.INTAKE_COMPLETE,
    "completed intake projects its allowlisted terminal recommendation",
  );
  assert(
    completedModel.status.canReleaseToCustomer === false,
    "customer release remains unauthorized",
  );

  const clarification = cloneState(initializedConversationState);
  clarification.stage = CONVERSATION_STAGES.CLARIFICATION;
  clarification.revision = 2;
  const clarificationModel = project(projector, clarification, requiredFieldIds);
  assert(
    clarificationModel.recommendedNextAction
      === CONVERSATION_READ_MODEL_ACTIONS.CLARIFY_SERVICE,
    "unresolved service clarification uses an allowlisted action",
  );

  const allowlist = Object.values(CONVERSATION_READ_MODEL_ACTIONS);
  for (const model of [escalationModel, completedModel, clarificationModel]) {
    assert(
      allowlist.includes(model.recommendedNextAction),
      "recommended next action is allowlisted",
    );
  }
}

function verifyDeepImmutabilityAndIsolation() {
  const source = richIntakeState();
  const result = new ConversationReadModelProjector().project(source, {
    requiredFieldIds,
    resolvedServiceId: "home-project-consultation",
  });
  assert(result.status === "success", "immutable fixture projects");
  const model = result.readModel;

  assert(Object.isFrozen(result), "projection result is immutable");
  assert(Object.isFrozen(model), "read model is immutable");
  assert(Object.isFrozen(model.identity), "identity is immutable");
  assert(Object.isFrozen(model.collectedFacts), "fact collection is immutable");
  assert(Object.isFrozen(model.collectedFacts[0]), "nested fact is immutable");
  assert(Object.isFrozen(model.corrections), "correction collection is immutable");
  assert(Object.isFrozen(model.corrections[0]), "nested correction is immutable");
  assert(Object.isFrozen(model.missingRequiredFields), "missing fields are immutable");
  assert(Object.isFrozen(model.askedQuestions), "question history is immutable");
  assert(Object.isFrozen(model.escalation), "escalation projection is immutable");
  assert(Object.isFrozen(model.status), "status flags are immutable");
  assert(Object.isFrozen(model.completionProgress), "progress is immutable");
  assert(Object.isFrozen(model.metadata), "projection metadata is immutable");

  assert(
    model.collectedFacts !== Object.values(source.confirmedFacts),
    "fact collection is newly allocated",
  );
  assert(
    model.collectedFacts[0] !== source.confirmedFacts["requested-service"],
    "projected facts do not share object references",
  );
  assert(
    model.corrections !== source.corrections
      && model.corrections[0] !== source.corrections[0],
    "projected corrections do not share references",
  );
  assert(
    model.missingRequiredFields !== source.missingFields
      && model.askedQuestions !== source.askedQuestions,
    "projected arrays do not share source references",
  );

  assertThrows(
    () => (model.missingRequiredFields as string[]).push("another-field"),
    "immutable collection rejects mutation",
  );
  assertThrows(
    () => {
      (model.identity as { conversationId: string }).conversationId = "changed";
    },
    "immutable nested object rejects mutation",
  );
}

function verifyMalformedInputFailsClosed() {
  const projector = new ConversationReadModelProjector();
  assertFailure(
    projector.project(null, { requiredFieldIds, resolvedServiceId: null }),
  );
  assertFailure(
    projector.project({}, { requiredFieldIds, resolvedServiceId: null }),
  );
  assertFailure(projector.project(initializedConversationState, null));
  assertFailure(
    projector.project(initializedConversationState, {
      requiredFieldIds: ["customer-name", "customer-name"],
      resolvedServiceId: null,
    }),
  );

  const malformed = cloneState(initializedConversationState);
  malformed.conversationId = "";
  assertFailure(
    projector.project(malformed, { requiredFieldIds, resolvedServiceId: null }),
  );

  const inconsistent = cloneState(initializedConversationState);
  inconsistent.missingFields = [...inconsistent.missingFields, "unknown-field"];
  assertFailure(
    projector.project(inconsistent, {
      requiredFieldIds,
      resolvedServiceId: null,
    }),
  );

  const unresolvedNotMissing = cloneState(initializedConversationState);
  unresolvedNotMissing.missingFields =
    unresolvedNotMissing.missingFields.filter(
      (field) => field !== "customer-name",
    );
  assertFailure(
    projector.project(unresolvedNotMissing, {
      requiredFieldIds,
      resolvedServiceId: null,
    }),
  );

  const contradictory = richIntakeState();
  contradictory.missingFields = [
    ...contradictory.missingFields,
    "customer-name",
  ];
  assertFailure(
    projector.project(contradictory, {
      requiredFieldIds,
      resolvedServiceId: "home-project-consultation",
    }),
  );

  assertFailure(
    projector.project(richIntakeState(), {
      requiredFieldIds,
      resolvedServiceId: "seasonal-home-check-in",
    }),
  );
}

function verifyProjectionHasNoExecutionCapability() {
  let sideEffectCount = 0;
  const context = {
    requiredFieldIds,
    resolvedServiceId: null,
    execute: () => {
      sideEffectCount += 1;
    },
  };
  const state = cloneState(initializedConversationState);
  const before = JSON.stringify(state);
  const result = new ConversationReadModelProjector().project(state, context);
  assert(result.status === "success", "projection succeeds without an executor");
  assert(sideEffectCount === 0, "projection invokes no side-effecting callback");
  assert(state.revision === 0, "projection performs no transition");
  assert(JSON.stringify(state) === before, "projection preserves state integrity");
}

function richIntakeState(): ConversationState {
  return {
    ...cloneState(initializedConversationState),
    revision: 7,
    stage: CONVERSATION_STAGES.INTAKE,
    confirmedFacts: {
      "customer-name": {
        field: "customer-name",
        value: "Jamie",
        source: "application-confirmation",
        sequence: 6,
      },
      "requested-service": {
        field: "requested-service",
        value: "home-project-consultation",
        source: "application-confirmation",
        sequence: 2,
      },
      "preferred-date": {
        field: "preferred-date",
        value: "Next week",
        source: "application-confirmation",
        sequence: 3,
      },
    },
    customerClaims: [
      {
        field: "customer-name",
        value: "Jamie",
        source: "customer-message",
        sequence: 5,
      },
    ],
    corrections: [
      {
        field: "customer-name",
        previousValue: "James",
        correctedValue: "Jamie",
        source: "customer-message",
        sequence: 5,
        reason: "Customer correction",
      },
    ],
    missingFields: ["contact-method", "project-description"],
    askedQuestions: ["ask-requested-service", "ask-customer-name"],
  };
}

function completedState(): ConversationState {
  const state: ConversationState = {
    ...richIntakeState(),
    revision: 12,
    stage: CONVERSATION_STAGES.COMPLETED,
    confirmedFacts: {
      ...richIntakeState().confirmedFacts,
      "contact-method": {
        field: "contact-method",
        value: "Email",
        source: "application-confirmation",
        sequence: 8,
      },
      "project-description": {
        field: "project-description",
        value: "Fictional project",
        source: "application-confirmation",
        sequence: 9,
      },
    },
    missingFields: [],
    completionState: COMPLETION_STATES.COMPLETED,
    finalSnapshot: null,
  };
  state.finalSnapshot = finalSnapshot(state);
  return state;
}

function finalSnapshot(state: ConversationState): ConversationFinalSnapshot {
  return {
    stage: state.stage,
    confirmedFacts: Object.fromEntries(
      Object.entries(state.confirmedFacts).map(([field, fact]) => [
        field,
        { ...fact },
      ]),
    ),
    customerClaims: state.customerClaims.map((claim) => ({ ...claim })),
    corrections: state.corrections.map((correction) => ({ ...correction })),
    missingFields: [...state.missingFields],
    askedQuestions: [...state.askedQuestions],
    escalationStatus: state.escalation.status,
    completionStatus: state.completionState,
    revision: state.revision,
  };
}

function cloneState(state: ConversationState): ConversationState {
  return structuredClone(state);
}

function project(
  projector: ConversationReadModelProjector,
  state: ConversationState,
  fields: readonly string[],
): ConversationReadModel {
  const result = projector.project(state, {
    requiredFieldIds: fields,
    resolvedServiceId:
      state.confirmedFacts["requested-service"]?.value ?? null,
  });
  assert(result.status === "success", "valid state projects successfully");
  return result.readModel;
}

function assertFailure(
  result: ReturnType<ConversationReadModelProjector["project"]>,
) {
  assert(result.status === "failure", "malformed projection fails closed");
  assert(result.errors.length > 0, "failed projection includes errors");
  assert(Object.isFrozen(result), "failed projection result is immutable");
  assert(Object.isFrozen(result.errors), "failed projection errors are immutable");
}

function assertThrows(action: () => void, label: string) {
  let threw = false;
  try {
    action();
  } catch {
    threw = true;
  }
  assert(threw, label);
}

function assertEquivalent(first: unknown, second: unknown, label: string) {
  assert(JSON.stringify(first) === JSON.stringify(second), label);
}

function assert(condition: unknown, label: string): asserts condition {
  if (!condition) {
    throw new Error(`Conversation read-model verification failed: ${label}`);
  }
}
