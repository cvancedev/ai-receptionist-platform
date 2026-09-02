export const IDENTITY_AUTHORIZATION_POLICY_VERSION =
  "sprint-9.3-identity-authorization-v1";

export const ACTOR_TYPES = Object.freeze([
  "anonymous-untrusted",
  "controlled-evaluator",
  "authorized-observer",
  "business-scoped-actor",
  "privileged-admin-actor",
] as const);
export type ActorType = (typeof ACTOR_TYPES)[number];

export const AUTHORIZATION_OPERATIONS = Object.freeze([
  "observe-fictional-evaluation",
  "access-non-public-conversation",
  "access-protected-data",
  "administer-business",
] as const);
export type AuthorizationOperation = (typeof AUTHORIZATION_OPERATIONS)[number];

export const AUTHORIZATION_ENVIRONMENTS = Object.freeze([
  "local-development",
  "automated-test",
  "controlled-evaluation",
  "production",
] as const);
export type AuthorizationEnvironment = (typeof AUTHORIZATION_ENVIRONMENTS)[number];

export const AUTHORIZATION_DATA_CLASSIFICATIONS = Object.freeze([
  "fictional-synthetic",
  "public-business-information",
  "internal-business-configuration",
  "customer-provided-information",
  "protected-sensitive-information",
  "credential-secret",
  "unknown-mixed",
] as const);
export type AuthorizationDataClassification =
  (typeof AUTHORIZATION_DATA_CLASSIFICATIONS)[number];

export interface ProtectedDataAuthorizationInput {
  readonly actor: unknown;
  readonly requestedScope: unknown;
  readonly operation: unknown;
  readonly environment: unknown;
  readonly dataClassification: unknown;
  /** Client assertions are untrusted evidence and never become authority. */
  readonly clientClaims: unknown;
  /** Runtime/credential facts are explicitly non-authoritative inputs. */
  readonly infrastructureSignals: unknown;
}

export type AuthorizationRejectionReason =
  | "InvalidInput"
  | "UnknownActorType"
  | "IdentityNotValidated"
  | "ActorIneligible"
  | "UnknownOperation"
  | "EnvironmentUnauthorized"
  | "BusinessScopeMismatch"
  | "ConversationScopeMismatch"
  | "UnknownDataClassification"
  | "ProtectedDataProhibited"
  | "AdministrationProhibited"
  | "NonPublicConversationProhibited"
  | "EvaluationExecutionUnauthorized";

export interface AuthorizationDecision {
  readonly status: "denied";
  readonly reason: AuthorizationRejectionReason;
  readonly errors: readonly string[];
  readonly policyVersion: typeof IDENTITY_AUTHORIZATION_POLICY_VERSION;
  readonly actorType: ActorType | null;
  readonly identityValidated: false;
  readonly authorizationGranted: false;
  readonly protectedDataAuthorized: false;
  readonly administrationAuthorized: false;
  readonly nonPublicConversationAuthorized: false;
  readonly controlledEvaluationExecutionAuthorized: false;
  readonly customerResponseReleaseAuthorized: false;
  readonly externalActionAuthorized: false;
}

interface ParsedActor {
  readonly type: ActorType;
  readonly actorId: string | null;
  readonly businessId: string | null;
  readonly conversationId: string | null;
  readonly validation: "unvalidated";
}

interface ParsedScope {
  readonly businessId: string;
  readonly conversationId: string;
}

/**
 * Sprint 9.3 preserves the protected-data gate without implementing identity.
 * Every result is denied until a later milestone separately authorizes and
 * supplies server-validated identity, sessions, and protected operations.
 */
export function evaluateProtectedDataAuthorization(
  input: unknown,
): AuthorizationDecision {
  try {
    return evaluateAuthorization(input);
  } catch {
    return denial("InvalidInput", null);
  }
}

function evaluateAuthorization(input: unknown): AuthorizationDecision {
  if (!isPlainRecord(input) || !hasExactKeys(input, [
    "actor",
    "requestedScope",
    "operation",
    "environment",
    "dataClassification",
    "clientClaims",
    "infrastructureSignals",
  ])) return denial("InvalidInput", null);

  const actorResult = parseActor(input.actor);
  if (actorResult.status === "unknown") return denial("UnknownActorType", null);
  if (actorResult.status === "invalid") return denial("InvalidInput", null);
  const actor = actorResult.actor;

  if (
    typeof input.operation !== "string"
    || !AUTHORIZATION_OPERATIONS.includes(input.operation as AuthorizationOperation)
  ) return denial("UnknownOperation", actor.type);

  if (
    typeof input.environment !== "string"
    || !AUTHORIZATION_ENVIRONMENTS.includes(input.environment as AuthorizationEnvironment)
  ) return denial("EnvironmentUnauthorized", actor.type);
  if (input.environment === "controlled-evaluation" || input.environment === "production") {
    return denial("EnvironmentUnauthorized", actor.type);
  }

  const scope = parseScope(input.requestedScope);
  if (scope === null) return denial("InvalidInput", actor.type);
  if (actor.businessId !== null && actor.businessId !== scope.businessId) {
    return denial("BusinessScopeMismatch", actor.type);
  }
  if (actor.conversationId !== null && actor.conversationId !== scope.conversationId) {
    return denial("ConversationScopeMismatch", actor.type);
  }

  if (
    typeof input.dataClassification !== "string"
    || !AUTHORIZATION_DATA_CLASSIFICATIONS.includes(
      input.dataClassification as AuthorizationDataClassification,
    )
    || input.dataClassification === "unknown-mixed"
  ) return denial("UnknownDataClassification", actor.type);

  // Client and infrastructure inputs are accepted only as inert unknown data.
  // Their contents are deliberately never inspected as authorization facts.
  void input.clientClaims;
  void input.infrastructureSignals;

  if (actor.type === "anonymous-untrusted") return denial("ActorIneligible", actor.type);
  if (actor.validation !== "unvalidated") return denial("InvalidInput", actor.type);
  if (actor.actorId === null) return denial("IdentityNotValidated", actor.type);

  if (input.operation === "access-protected-data"
    || input.dataClassification === "protected-sensitive-information"
    || input.dataClassification === "credential-secret") {
    return denial("ProtectedDataProhibited", actor.type);
  }
  if (input.operation === "administer-business") {
    return denial("AdministrationProhibited", actor.type);
  }
  if (input.operation === "access-non-public-conversation") {
    return denial("NonPublicConversationProhibited", actor.type);
  }
  return denial("EvaluationExecutionUnauthorized", actor.type);
}

function parseActor(value: unknown):
  | Readonly<{ status: "parsed"; actor: ParsedActor }>
  | Readonly<{ status: "unknown" }>
  | Readonly<{ status: "invalid" }> {
  if (!isPlainRecord(value) || !hasExactKeys(value, [
    "type",
    "actorId",
    "businessId",
    "conversationId",
    "validation",
  ])) return Object.freeze({ status: "invalid" });
  if (typeof value.type !== "string" || !ACTOR_TYPES.includes(value.type as ActorType)) {
    return Object.freeze({ status: "unknown" });
  }
  if (
    !isNullableIdentifier(value.actorId)
    || !isNullableIdentifier(value.businessId)
    || !isNullableIdentifier(value.conversationId)
    || value.validation !== "unvalidated"
  ) return Object.freeze({ status: "invalid" });
  return Object.freeze({
    status: "parsed",
    actor: Object.freeze({
      type: value.type as ActorType,
      actorId: value.actorId,
      businessId: value.businessId,
      conversationId: value.conversationId,
      validation: "unvalidated" as const,
    }),
  });
}

function parseScope(value: unknown): ParsedScope | null {
  if (!isPlainRecord(value) || !hasExactKeys(value, ["businessId", "conversationId"])) {
    return null;
  }
  if (!isIdentifier(value.businessId) || !isIdentifier(value.conversationId)) return null;
  return Object.freeze({ businessId: value.businessId, conversationId: value.conversationId });
}

function denial(reason: AuthorizationRejectionReason, actorType: ActorType | null): AuthorizationDecision {
  return deepFreeze({
    status: "denied" as const,
    reason,
    errors: [safeError(reason)],
    policyVersion: IDENTITY_AUTHORIZATION_POLICY_VERSION,
    actorType,
    identityValidated: false as const,
    authorizationGranted: false as const,
    protectedDataAuthorized: false as const,
    administrationAuthorized: false as const,
    nonPublicConversationAuthorized: false as const,
    controlledEvaluationExecutionAuthorized: false as const,
    customerResponseReleaseAuthorized: false as const,
    externalActionAuthorized: false as const,
  });
}

function safeError(reason: AuthorizationRejectionReason): string {
  const errors: Record<AuthorizationRejectionReason, string> = {
    InvalidInput: "Authorization input is invalid.",
    UnknownActorType: "Actor type is unavailable.",
    IdentityNotValidated: "Actor identity is not validated.",
    ActorIneligible: "Actor is not eligible for this operation.",
    UnknownOperation: "Authorization operation is unavailable.",
    EnvironmentUnauthorized: "Environment is not authorized for this operation.",
    BusinessScopeMismatch: "Requested scope is not authorized.",
    ConversationScopeMismatch: "Requested scope is not authorized.",
    UnknownDataClassification: "Data classification is not authorized.",
    ProtectedDataProhibited: "Protected data access is not authorized.",
    AdministrationProhibited: "Business administration is not authorized.",
    NonPublicConversationProhibited: "Non-public conversation access is not authorized.",
    EvaluationExecutionUnauthorized: "Controlled evaluation execution is not authorized.",
  };
  return errors[reason];
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string"
    && value === value.trim()
    && value.length > 0
    && value.length <= 160
    && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value);
}

function isNullableIdentifier(value: unknown): value is string | null {
  return value === null || isIdentifier(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function hasExactKeys(value: Readonly<Record<string, unknown>>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

function deepFreeze<Value>(value: Value): Value {
  if (value && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
