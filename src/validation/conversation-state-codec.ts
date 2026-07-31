import type { ConversationStoreScope } from "../conversation/conversation-store";
import { cloneConversationState } from "../conversation/conversation-state-updates";
import type {
  ConfirmedFact,
  ConversationCorrection,
  ConversationFinalSnapshot,
  ConversationState,
  CustomerClaim,
} from "../domain/conversation-state";
import { validateConversationState } from "./conversation-state-validation";

export type ConversationStateDecodeResult =
  | { readonly status: "success"; readonly state: ConversationState }
  | { readonly status: "failure"; readonly errors: readonly string[] };

export function decodeConversationState(
  value: unknown,
  scope: Readonly<ConversationStoreScope>,
): ConversationStateDecodeResult {
  if (!isConversationStateShape(value)) {
    return {
      status: "failure",
      errors: ["Persisted Conversation State has an invalid structure."],
    };
  }

  try {
    const validation = validateConversationState(value, scope);
    return validation.valid
      ? { status: "success", state: cloneConversationState(value) }
      : { status: "failure", errors: validation.errors };
  } catch {
    return {
      status: "failure",
      errors: ["Persisted Conversation State could not be validated."],
    };
  }
}

function isConversationStateShape(value: unknown): value is ConversationState {
  return isRecord(value)
    && hasExactKeys(value, [
      "conversationId",
      "businessProfileId",
      "businessProfileVersion",
      "authorizedEscalationDestination",
      "revision",
      "stage",
      "confirmedFacts",
      "customerClaims",
      "corrections",
      "missingFields",
      "askedQuestions",
      "escalation",
      "completionState",
      "finalSnapshot",
    ])
    && typeof value.conversationId === "string"
    && typeof value.businessProfileId === "string"
    && typeof value.businessProfileVersion === "number"
    && (
      value.authorizedEscalationDestination === null
      || typeof value.authorizedEscalationDestination === "string"
    )
    && typeof value.revision === "number"
    && typeof value.stage === "string"
    && isConfirmedFacts(value.confirmedFacts)
    && isCustomerClaims(value.customerClaims)
    && isCorrections(value.corrections)
    && isStringArray(value.missingFields)
    && isStringArray(value.askedQuestions)
    && isEscalation(value.escalation)
    && typeof value.completionState === "string"
    && (
      value.finalSnapshot === null
      || isFinalSnapshot(value.finalSnapshot)
    );
}

function isConfirmedFacts(
  value: unknown,
): value is Readonly<Record<string, ConfirmedFact>> {
  return isRecord(value)
    && Object.values(value).every((fact) => isSequencedValue(fact));
}

function isCustomerClaims(value: unknown): value is readonly CustomerClaim[] {
  return Array.isArray(value)
    && value.every((claim) => isSequencedValue(claim));
}

function isCorrections(
  value: unknown,
): value is readonly ConversationCorrection[] {
  return Array.isArray(value)
    && value.every((correction) =>
      isRecord(correction)
      && hasOnlyKeys(correction, [
        "field",
        "previousValue",
        "correctedValue",
        "source",
        "sequence",
        "reason",
      ])
      && ["field", "previousValue", "correctedValue", "source"].every(
        (key) => typeof correction[key] === "string",
      )
      && Number.isInteger(correction.sequence)
      && (
        correction.reason === undefined
        || typeof correction.reason === "string"
      )
    );
}

function isSequencedValue(value: unknown): value is ConfirmedFact {
  return isRecord(value)
    && hasExactKeys(value, ["field", "value", "source", "sequence"])
    && typeof value.field === "string"
    && typeof value.value === "string"
    && typeof value.source === "string"
    && Number.isInteger(value.sequence);
}

function isEscalation(value: unknown): boolean {
  return isRecord(value)
    && hasExactKeys(value, [
      "status",
      "reason",
      "triggerSource",
      "destination",
    ])
    && typeof value.status === "string"
    && isNullableString(value.reason)
    && isNullableString(value.triggerSource)
    && isNullableString(value.destination);
}

function isFinalSnapshot(value: unknown): value is ConversationFinalSnapshot {
  return isRecord(value)
    && hasExactKeys(value, [
      "stage",
      "confirmedFacts",
      "customerClaims",
      "corrections",
      "missingFields",
      "askedQuestions",
      "escalationStatus",
      "completionStatus",
      "revision",
    ])
    && typeof value.stage === "string"
    && isConfirmedFacts(value.confirmedFacts)
    && isCustomerClaims(value.customerClaims)
    && isCorrections(value.corrections)
    && isStringArray(value.missingFields)
    && isStringArray(value.askedQuestions)
    && typeof value.escalationStatus === "string"
    && typeof value.completionStatus === "string"
    && Number.isInteger(value.revision);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function hasExactKeys(
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): boolean {
  return hasOnlyKeys(value, keys)
    && keys.every((key) => key in value);
}

function hasOnlyKeys(
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value)
    && value.every((item) => typeof item === "string");
}

function isNullableString(value: unknown): boolean {
  return value === null || typeof value === "string";
}
