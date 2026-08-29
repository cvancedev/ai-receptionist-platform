export const CONTROLLED_EVALUATION_POLICY_VERSION = "sprint-9.1-controlled-evaluation-v1";

export const CONTROLLED_EVALUATION_DATA_CLASSES = Object.freeze([
  "fictional-test-data",
  "public-business-information",
  "internal-business-configuration",
  "customer-provided-information",
  "protected-sensitive-information",
  "credentials-secrets",
  "operational-audit-evidence",
] as const);

export type ControlledEvaluationDataClass =
  (typeof CONTROLLED_EVALUATION_DATA_CLASSES)[number];

export const CONTROLLED_EVALUATION_CAPABILITIES = Object.freeze([
  "local-fictional-experience",
  "deterministic-mock",
  "fictional-durable-activated-path",
  "bounded-operational-evidence",
  "real-provider",
  "customer-response-release",
  "external-action",
  "communication-channel",
  "production-database",
  "production-deployment",
  "administrative-interface",
  "protected-data-processing",
] as const);

export type ControlledEvaluationCapability =
  (typeof CONTROLLED_EVALUATION_CAPABILITIES)[number];

export const CONTROLLED_EVALUATION_ACTORS = Object.freeze([
  "internal-evaluator",
  "invited-business-participant",
  "authorized-observer",
] as const);

export type ControlledEvaluationActor =
  (typeof CONTROLLED_EVALUATION_ACTORS)[number];

export const CONTROLLED_EVALUATION_ENVIRONMENTS = Object.freeze([
  "local",
  "test",
  "production-like",
  "production",
] as const);

export type ControlledEvaluationEnvironment =
  (typeof CONTROLLED_EVALUATION_ENVIRONMENTS)[number];

export interface ControlledEvaluationRequest {
  readonly policyVersion: typeof CONTROLLED_EVALUATION_POLICY_VERSION;
  readonly requestId: string;
  readonly actor: ControlledEvaluationActor;
  readonly environment: ControlledEvaluationEnvironment;
  readonly dataClassifications: readonly ControlledEvaluationDataClass[];
  readonly capabilities: readonly ControlledEvaluationCapability[];
  readonly moderated: boolean;
  readonly fictionalDataOnly: boolean;
  readonly customerResponseReleaseAuthorized: boolean;
  readonly externalActionAuthorized: boolean;
}

export type ControlledEvaluationRejectionReason =
  | "InvalidRequest"
  | "ActorNotAllowed"
  | "EnvironmentNotAllowed"
  | "DataNotAllowed"
  | "CapabilityNotAllowed"
  | "ModerationRequired"
  | "FictionalDataRequired"
  | "CustomerResponseReleaseProhibited"
  | "ExternalActionProhibited";

export type ControlledEvaluationDecision =
  | Readonly<{
      status: "conforms";
      policyVersion: typeof CONTROLLED_EVALUATION_POLICY_VERSION;
      requestId: string;
      decision: "within-planned-fictional-boundary";
      actor: ControlledEvaluationActor;
      environment: "local" | "test";
      dataClassifications: readonly (
        "fictional-test-data" | "operational-audit-evidence"
      )[];
      capabilities: readonly (
        | "local-fictional-experience"
        | "deterministic-mock"
        | "fictional-durable-activated-path"
        | "bounded-operational-evidence"
      )[];
      evaluationExecutionAuthorized: false;
      productionLikeRuntimeAuthorized: false;
      protectedDataAuthorized: false;
      customerResponseReleaseAuthorized: false;
      externalActionAuthorized: false;
    }>
  | Readonly<{
      status: "rejected";
      policyVersion: typeof CONTROLLED_EVALUATION_POLICY_VERSION;
      requestId: string | null;
      reason: ControlledEvaluationRejectionReason;
      errors: readonly string[];
      evaluationExecutionAuthorized: false;
      productionLikeRuntimeAuthorized: false;
      protectedDataAuthorized: false;
      customerResponseReleaseAuthorized: false;
      externalActionAuthorized: false;
    }>;

export interface ControlledEvaluationDataDecision {
  readonly classification: ControlledEvaluationDataClass;
  readonly permittedInPlannedFictionalBoundary: boolean;
  readonly releaseAuthorized: false;
}

export const CONTROLLED_EVALUATION_DATA_DECISIONS: readonly Readonly<
  ControlledEvaluationDataDecision
>[] = Object.freeze(CONTROLLED_EVALUATION_DATA_CLASSES.map((classification) =>
  Object.freeze({
    classification,
    permittedInPlannedFictionalBoundary:
      classification === "fictional-test-data"
      || classification === "operational-audit-evidence",
    releaseAuthorized: false as const,
  })));

const ALLOWED_DATA = new Set<ControlledEvaluationDataClass>([
  "fictional-test-data",
  "operational-audit-evidence",
]);

const ALLOWED_CAPABILITIES = new Set<ControlledEvaluationCapability>([
  "local-fictional-experience",
  "deterministic-mock",
  "fictional-durable-activated-path",
  "bounded-operational-evidence",
]);

/**
 * Evaluates whether a proposal conforms to the documented Sprint 9.1
 * fictional boundary. A conforming decision is not permission to run an
 * evaluation; later milestones retain that authorization gate.
 */
export function evaluateControlledEvaluationRequest(
  input: unknown,
): ControlledEvaluationDecision {
  try {
    return evaluateRequest(input);
  } catch {
    return rejection("InvalidRequest", null);
  }
}

function evaluateRequest(input: unknown): ControlledEvaluationDecision {
  if (!isRequest(input)) return rejection("InvalidRequest", null);

  if (!CONTROLLED_EVALUATION_ACTORS.includes(input.actor)) {
    return rejection("ActorNotAllowed", input.requestId);
  }
  if (input.environment !== "local" && input.environment !== "test") {
    return rejection("EnvironmentNotAllowed", input.requestId);
  }
  if (!input.moderated) {
    return rejection("ModerationRequired", input.requestId);
  }
  if (!input.fictionalDataOnly) {
    return rejection("FictionalDataRequired", input.requestId);
  }
  if (input.customerResponseReleaseAuthorized) {
    return rejection("CustomerResponseReleaseProhibited", input.requestId);
  }
  if (input.externalActionAuthorized) {
    return rejection("ExternalActionProhibited", input.requestId);
  }
  if (
    !input.dataClassifications.includes("fictional-test-data")
    || input.dataClassifications.some((classification) => !ALLOWED_DATA.has(classification))
  ) {
    return rejection("DataNotAllowed", input.requestId);
  }
  if (
    !input.capabilities.includes("local-fictional-experience")
    || input.capabilities.some((capability) => !ALLOWED_CAPABILITIES.has(capability))
  ) {
    return rejection("CapabilityNotAllowed", input.requestId);
  }

  return freezeDecision({
    status: "conforms",
    policyVersion: CONTROLLED_EVALUATION_POLICY_VERSION,
    requestId: input.requestId,
    decision: "within-planned-fictional-boundary",
    actor: input.actor,
    environment: input.environment,
    dataClassifications: [...input.dataClassifications] as (
      "fictional-test-data" | "operational-audit-evidence"
    )[],
    capabilities: [...input.capabilities] as (
      | "local-fictional-experience"
      | "deterministic-mock"
      | "fictional-durable-activated-path"
      | "bounded-operational-evidence"
    )[],
    evaluationExecutionAuthorized: false,
    productionLikeRuntimeAuthorized: false,
    protectedDataAuthorized: false,
    customerResponseReleaseAuthorized: false,
    externalActionAuthorized: false,
  });
}

function isRequest(value: unknown): value is ControlledEvaluationRequest {
  if (!isPlainRecord(value) || !hasExactKeys(value, [
    "policyVersion",
    "requestId",
    "actor",
    "environment",
    "dataClassifications",
    "capabilities",
    "moderated",
    "fictionalDataOnly",
    "customerResponseReleaseAuthorized",
    "externalActionAuthorized",
  ])) return false;

  return value.policyVersion === CONTROLLED_EVALUATION_POLICY_VERSION
    && isIdentifier(value.requestId)
    && typeof value.actor === "string"
    && typeof value.environment === "string"
    && isKnownUniqueArray(value.dataClassifications, CONTROLLED_EVALUATION_DATA_CLASSES)
    && isKnownUniqueArray(value.capabilities, CONTROLLED_EVALUATION_CAPABILITIES)
    && typeof value.moderated === "boolean"
    && typeof value.fictionalDataOnly === "boolean"
    && typeof value.customerResponseReleaseAuthorized === "boolean"
    && typeof value.externalActionAuthorized === "boolean";
}

function isKnownUniqueArray<Value extends string>(
  value: unknown,
  known: readonly Value[],
): value is readonly Value[] {
  return Array.isArray(value)
    && value.length > 0
    && new Set(value).size === value.length
    && value.every((item) => typeof item === "string" && known.includes(item as Value));
}

function rejection(
  reason: ControlledEvaluationRejectionReason,
  requestId: string | null,
): ControlledEvaluationDecision {
  return freezeDecision({
    status: "rejected",
    policyVersion: CONTROLLED_EVALUATION_POLICY_VERSION,
    requestId,
    reason,
    errors: [safeError(reason)],
    evaluationExecutionAuthorized: false,
    productionLikeRuntimeAuthorized: false,
    protectedDataAuthorized: false,
    customerResponseReleaseAuthorized: false,
    externalActionAuthorized: false,
  });
}

function safeError(reason: ControlledEvaluationRejectionReason): string {
  const errors: Record<ControlledEvaluationRejectionReason, string> = {
    InvalidRequest: "Controlled-evaluation request is invalid.",
    ActorNotAllowed: "Controlled-evaluation participant is unavailable.",
    EnvironmentNotAllowed: "Controlled-evaluation environment is unavailable.",
    DataNotAllowed: "Controlled-evaluation data is not permitted.",
    CapabilityNotAllowed: "Controlled-evaluation capability is not permitted.",
    ModerationRequired: "Controlled evaluation requires active moderation.",
    FictionalDataRequired: "Controlled evaluation requires fictional data.",
    CustomerResponseReleaseProhibited: "Customer response release is prohibited.",
    ExternalActionProhibited: "External actions are prohibited.",
  };
  return errors[reason];
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string"
    && value === value.trim()
    && value.length > 0
    && value.length <= 160;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function hasExactKeys(
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

function freezeDecision<Decision extends ControlledEvaluationDecision>(
  decision: Decision,
): Decision {
  for (const value of Object.values(decision)) {
    if (Array.isArray(value)) Object.freeze(value);
  }
  return Object.freeze(decision);
}
