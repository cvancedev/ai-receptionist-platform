import type { ConversationState } from "../domain/conversation-state";
import type {
  CompletionState,
  ConversationStage,
  EscalationState,
} from "../shared/constants";
import {
  COMPLETION_STATES,
  CONVERSATION_STAGES,
  ESCALATION_STATES,
} from "../shared/constants";
import { validateConversationState } from "../validation/conversation-state-validation";
import {
  canTransitionStage,
  isActiveStage,
} from "./conversation-state-transitions";
import {
  escalationBlocksCompletion,
  getCurrentValue,
} from "./conversation-state-selectors";

export interface ConversationScope {
  conversationId: string;
  businessProfileId: string;
  businessProfileVersion: number;
}

interface ScopedUpdate {
  scope: ConversationScope;
}

export type ConversationStateUpdate =
  | (ScopedUpdate & {
      type: "record-claim";
      field: string;
      value: string;
      source: string;
    })
  | (ScopedUpdate & {
      type: "confirm-fact";
      field: string;
      value: string;
      source: string;
    })
  | (ScopedUpdate & {
      type: "correct-value";
      field: string;
      correctedValue: string;
      source: string;
      reason?: string;
    })
  | (ScopedUpdate & { type: "add-missing-field"; field: string })
  | (ScopedUpdate & { type: "resolve-missing-field"; field: string })
  | (ScopedUpdate & { type: "mark-question-asked"; questionId: string })
  | (ScopedUpdate & { type: "transition-stage"; stage: ConversationStage })
  | (ScopedUpdate & {
      type: "set-escalation";
      status: EscalationState;
      reason: string | null;
      triggerSource: string | null;
      destination?: string | null;
    })
  | (ScopedUpdate & { type: "set-completion"; status: CompletionState });

export type StateUpdateResult =
  | { status: "success"; state: ConversationState }
  | { status: "no-op"; state: ConversationState; reason: string }
  | { status: "failure"; state: ConversationState; errors: readonly string[] };

export function cloneConversationState(state: ConversationState): ConversationState {
  return {
    ...state,
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
    escalation: { ...state.escalation },
    finalSnapshot: state.finalSnapshot
      ? {
          ...state.finalSnapshot,
          confirmedFacts: Object.fromEntries(
            Object.entries(state.finalSnapshot.confirmedFacts).map(
              ([field, fact]) => [field, { ...fact }],
            ),
          ),
          customerClaims: state.finalSnapshot.customerClaims.map((claim) => ({
            ...claim,
          })),
          corrections: state.finalSnapshot.corrections.map((correction) => ({
            ...correction,
          })),
          missingFields: [...state.finalSnapshot.missingFields],
          askedQuestions: [...state.finalSnapshot.askedQuestions],
        }
      : null,
  };
}

export function applyConversationStateUpdate(
  currentState: ConversationState,
  update: ConversationStateUpdate,
): StateUpdateResult {
  const current = cloneConversationState(currentState);
  const scopeErrors = validateScope(current, update.scope);
  if (scopeErrors.length > 0) return failure(current, scopeErrors);

  const currentValidation = validateConversationState(current, update.scope);
  if (!currentValidation.valid) return failure(current, currentValidation.errors);
  if (
    (
      [
        CONVERSATION_STAGES.COMPLETED,
        CONVERSATION_STAGES.ABANDONED,
      ] as readonly ConversationStage[]
    ).includes(current.stage)
  ) {
    return failure(current, ["Terminal conversation state cannot be mutated."]);
  }

  const sequence = current.revision + 1;

  switch (update.type) {
    case "record-claim": {
      const inputError = validateFieldValueSource(
        update.field,
        update.value,
        update.source,
      );
      if (inputError) return failure(current, [inputError]);
      const repeated = current.customerClaims.some(
        (claim) => claim.field === update.field && claim.value === update.value,
      );
      if (repeated) return noOp(current, "The identical claim is already recorded.");
      return finish(current, {
        ...current,
        customerClaims: [
          ...current.customerClaims,
          {
            field: update.field,
            value: update.value,
            source: update.source,
            sequence,
          },
        ],
      });
    }
    case "confirm-fact": {
      const inputError = validateFieldValueSource(
        update.field,
        update.value,
        update.source,
      );
      if (inputError) return failure(current, [inputError]);
      const nextMissing = current.missingFields.filter(
        (field) => field !== update.field,
      );
      return finish(current, {
        ...current,
        confirmedFacts: {
          ...current.confirmedFacts,
          [update.field]: {
            field: update.field,
            value: update.value,
            source: update.source,
            sequence,
          },
        },
        missingFields: nextMissing,
      });
    }
    case "correct-value": {
      const previousValue = getCurrentValue(current, update.field);
      if (!previousValue) return failure(current, ["No current value exists to correct."]);
      if (!update.correctedValue.trim() || !update.source.trim()) {
        return failure(current, ["A corrected value and source are required."]);
      }
      if (previousValue === update.correctedValue) {
        return noOp(current, "The corrected value matches the current value.");
      }
      const confirmedFacts = { ...current.confirmedFacts };
      delete confirmedFacts[update.field];
      return finish(current, {
        ...current,
        stage:
          current.stage === CONVERSATION_STAGES.CONFIRMATION
            ? CONVERSATION_STAGES.INTAKE
            : current.stage,
        confirmedFacts,
        customerClaims: [
          ...current.customerClaims,
          {
            field: update.field,
            value: update.correctedValue,
            source: update.source,
            sequence,
          },
        ],
        corrections: [
          ...current.corrections,
          {
            field: update.field,
            previousValue,
            correctedValue: update.correctedValue,
            source: update.source,
            sequence,
            reason: update.reason,
          },
        ],
        missingFields: unique([...current.missingFields, update.field]),
        completionState: COMPLETION_STATES.NOT_READY,
        finalSnapshot: null,
      });
    }
    case "add-missing-field":
      if (!update.field.trim()) return failure(current, ["A field is required."]);
      if (current.missingFields.includes(update.field)) {
        return noOp(current, "The field is already unresolved.");
      }
      return finish(current, {
        ...current,
        missingFields: [...current.missingFields, update.field],
        completionState: COMPLETION_STATES.NOT_READY,
        finalSnapshot: null,
      });
    case "resolve-missing-field":
      if (!current.missingFields.includes(update.field)) {
        return noOp(current, "The field is not currently unresolved.");
      }
      return finish(current, {
        ...current,
        missingFields: current.missingFields.filter(
          (field) => field !== update.field,
        ),
      });
    case "mark-question-asked":
      if (!update.questionId.trim()) {
        return failure(current, ["A question identifier is required."]);
      }
      if (current.askedQuestions.includes(update.questionId)) {
        return noOp(current, "The question is already in the history.");
      }
      return finish(current, {
        ...current,
        askedQuestions: [...current.askedQuestions, update.questionId],
      });
    case "transition-stage":
      if (
        (
          [
            CONVERSATION_STAGES.ESCALATION,
            CONVERSATION_STAGES.COMPLETED,
            CONVERSATION_STAGES.ABANDONED,
          ] as readonly ConversationStage[]
        ).includes(update.stage)
      ) {
        return failure(current, [
          "Escalation and terminal stages require their validated state operation.",
        ]);
      }
      if (!canTransitionStage(current.stage, update.stage)) {
        return failure(current, [
          `Invalid stage transition: ${current.stage} -> ${update.stage}.`,
        ]);
      }
      if (update.stage === CONVERSATION_STAGES.HANDOFF) {
        const allowed =
          current.completionState === COMPLETION_STATES.READY_FOR_HANDOFF ||
          current.escalation.status === ESCALATION_STATES.HANDED_OFF;
        if (!allowed) {
          return failure(current, ["Handoff requires validated readiness."]);
        }
      }
      return finish(current, { ...current, stage: update.stage });
    case "set-escalation":
      return applyEscalation(current, update, sequence);
    case "set-completion":
      return applyCompletion(current, update.status, sequence);
  }
}

function applyEscalation(
  current: ConversationState,
  update: Extract<ConversationStateUpdate, { type: "set-escalation" }>,
  sequence: number,
): StateUpdateResult {
  if (update.status === current.escalation.status) {
    return noOp(current, "The escalation state is already current.");
  }
  if (!canTransitionEscalation(current.escalation.status, update.status)) {
    return failure(current, [
      `Invalid escalation transition: ${current.escalation.status} -> ${update.status}.`,
    ]);
  }
  if (
    update.status !== ESCALATION_STATES.NONE &&
    (!update.reason?.trim() || !update.triggerSource?.trim())
  ) {
    return failure(current, ["Escalation reason and trigger source are required."]);
  }
  const destination =
    update.status === ESCALATION_STATES.NONE
      ? null
      : (update.destination ?? current.escalation.destination);
  if (
    destination &&
    destination !== current.authorizedEscalationDestination
  ) {
    return failure(current, ["The escalation destination is not authorized."]);
  }
  let stage = current.stage;
  if (
    isActiveStage(stage) &&
    ([
      ESCALATION_STATES.REQUIRED,
      ESCALATION_STATES.REQUESTED_BY_CUSTOMER,
      ESCALATION_STATES.IN_PROGRESS,
    ] as readonly EscalationState[]).includes(update.status)
  ) {
    stage = CONVERSATION_STAGES.ESCALATION;
  }
  if (update.status === ESCALATION_STATES.HANDED_OFF) {
    if (stage !== CONVERSATION_STAGES.ESCALATION || !destination) {
      return failure(current, ["A valid escalation handoff is required."]);
    }
    stage = CONVERSATION_STAGES.HANDOFF;
  }
  return finish(current, {
    ...current,
    stage,
    escalation: {
      status: update.status,
      reason: update.reason,
      triggerSource: update.triggerSource,
      destination: destination ?? null,
    },
  }, sequence);
}

function applyCompletion(
  current: ConversationState,
  status: CompletionState,
  sequence: number,
): StateUpdateResult {
  if (status === COMPLETION_STATES.ABANDONED) {
    if (([CONVERSATION_STAGES.COMPLETED, CONVERSATION_STAGES.ABANDONED] as readonly ConversationStage[]).includes(current.stage)) {
      return failure(current, ["A terminal conversation cannot be abandoned again."]);
    }
    const next = {
      ...current,
      stage: CONVERSATION_STAGES.ABANDONED,
      completionState: status,
    };
    return finish(current, {
      ...next,
      finalSnapshot: createFinalSnapshot(next, sequence),
    }, sequence);
  }
  if (status !== COMPLETION_STATES.NOT_READY) {
    if (current.missingFields.length > 0) {
      return failure(current, ["Unresolved required fields block completion readiness."]);
    }
    if (escalationBlocksCompletion(current)) {
      return failure(current, ["Unresolved required escalation blocks completion."]);
    }
  }
  if (
    status === COMPLETION_STATES.READY_FOR_HANDOFF &&
    current.stage !== CONVERSATION_STAGES.CONFIRMATION
  ) {
    return failure(current, ["Handoff readiness requires the confirmation stage."]);
  }
  if (status === COMPLETION_STATES.COMPLETED) {
    if (current.stage !== CONVERSATION_STAGES.HANDOFF) {
      return failure(current, ["Completion requires the handoff stage."]);
    }
    const next = {
      ...current,
      stage: CONVERSATION_STAGES.COMPLETED,
      completionState: status,
    };
    return finish(current, {
      ...next,
      finalSnapshot: createFinalSnapshot(next, sequence),
    }, sequence);
  }
  return finish(current, {
    ...current,
    completionState: status,
    finalSnapshot: null,
  }, sequence);
}

function createFinalSnapshot(state: ConversationState, revision: number) {
  return {
    stage: state.stage,
    confirmedFacts: Object.fromEntries(
      Object.entries(state.confirmedFacts).map(([field, fact]) => [field, { ...fact }]),
    ),
    customerClaims: state.customerClaims.map((claim) => ({ ...claim })),
    corrections: state.corrections.map((correction) => ({ ...correction })),
    missingFields: [...state.missingFields],
    askedQuestions: [...state.askedQuestions],
    escalationStatus: state.escalation.status,
    completionStatus: state.completionState,
    revision,
  };
}

function finish(
  current: ConversationState,
  candidate: ConversationState,
  revision = current.revision + 1,
): StateUpdateResult {
  const next = cloneConversationState({ ...candidate, revision });
  const validation = validateConversationState(next, {
    conversationId: current.conversationId,
    businessProfileId: current.businessProfileId,
    businessProfileVersion: current.businessProfileVersion,
  });
  return validation.valid ? { status: "success", state: next } : failure(current, validation.errors);
}

function failure(state: ConversationState, errors: readonly string[]): StateUpdateResult {
  return { status: "failure", state: cloneConversationState(state), errors };
}

function noOp(state: ConversationState, reason: string): StateUpdateResult {
  return { status: "no-op", state: cloneConversationState(state), reason };
}

function validateScope(state: ConversationState, scope: ConversationScope): string[] {
  const errors: string[] = [];
  if (scope.conversationId !== state.conversationId) errors.push("Conversation scope does not match.");
  if (scope.businessProfileId !== state.businessProfileId) errors.push("Business scope does not match.");
  if (scope.businessProfileVersion !== state.businessProfileVersion) errors.push("Business Profile version does not match.");
  return errors;
}

function validateFieldValueSource(field: string, value: string, source: string) {
  if (!field.trim() || !value.trim() || !source.trim()) {
    return "Field, value, and source are required.";
  }
  return null;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function canTransitionEscalation(
  current: EscalationState,
  next: EscalationState,
): boolean {
  const transitions: Readonly<Record<EscalationState, readonly EscalationState[]>> = {
    [ESCALATION_STATES.NONE]: [
      ESCALATION_STATES.RECOMMENDED,
      ESCALATION_STATES.REQUIRED,
      ESCALATION_STATES.REQUESTED_BY_CUSTOMER,
    ],
    [ESCALATION_STATES.RECOMMENDED]: [
      ESCALATION_STATES.NONE,
      ESCALATION_STATES.REQUIRED,
      ESCALATION_STATES.REQUESTED_BY_CUSTOMER,
      ESCALATION_STATES.IN_PROGRESS,
    ],
    [ESCALATION_STATES.REQUIRED]: [
      ESCALATION_STATES.IN_PROGRESS,
      ESCALATION_STATES.HANDED_OFF,
    ],
    [ESCALATION_STATES.REQUESTED_BY_CUSTOMER]: [
      ESCALATION_STATES.IN_PROGRESS,
      ESCALATION_STATES.HANDED_OFF,
    ],
    [ESCALATION_STATES.IN_PROGRESS]: [
      ESCALATION_STATES.HANDED_OFF,
      ESCALATION_STATES.RESOLVED,
    ],
    [ESCALATION_STATES.HANDED_OFF]: [ESCALATION_STATES.RESOLVED],
    [ESCALATION_STATES.RESOLVED]: [
      ESCALATION_STATES.NONE,
      ESCALATION_STATES.RECOMMENDED,
      ESCALATION_STATES.REQUIRED,
      ESCALATION_STATES.REQUESTED_BY_CUSTOMER,
    ],
  };
  return transitions[current].includes(next);
}
