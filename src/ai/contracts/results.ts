import type { AiFailureCategory } from "./catalog";
import type { AiPackageIdentity, AiOperationIdentity } from "./identities";
import type { PromptPackage } from "./packages";

export type ProviderCompletionStatus = "completed" | "refused" | "incomplete" | "failed" | "cancelled";

export interface ProviderUsageMetadata {
  inputUnits: number;
  outputUnits: number;
}

export interface ProviderAdapterResult {
  requestId: string;
  traceId: string;
  adapterId: string;
  attemptId: string;
  status: ProviderCompletionStatus;
  rawOutput: unknown;
  usage: ProviderUsageMetadata;
  finishReason: string | null;
  error: { category: string; message: string } | null;
  durationMs: number;
}

export interface NormalizedProviderResult extends ProviderAdapterResult {
  normalizedAt: string;
}

export interface ModelGatewayRequest {
  identity: AiOperationIdentity;
  promptPackage: PromptPackage;
  outputContractIdentifier: string;
  outputContractVersion: number;
  attempt: { attemptId: string; attemptNumber: number };
  timeoutMs: number;
  cancelled: boolean;
}

export type ValidationStatus = "valid" | "invalid" | "repairable" | "retryable" | "cancelled";

export interface ValidationStageResult {
  stage: string;
  passed: boolean;
  failures: readonly AiFailureCategory[];
}

export interface AiValidationResult {
  status: ValidationStatus;
  failures: readonly AiFailureCategory[];
  warnings: readonly string[];
  acceptedFields: readonly string[];
  rejectedFields: readonly string[];
  stages: readonly ValidationStageResult[];
  policyVersions: { validatorVersion: string };
  traceId: string;
  proposal: Readonly<Record<string, unknown>> | null;
}

export type ApplicationDecisionType =
  | "accepted" | "partially_accepted" | "rejected" | "repair_required"
  | "retry_approved" | "clarification_required" | "deterministic_fallback"
  | "escalation_recommended" | "safe_stop" | "cancelled";

export interface ApplicationDecision {
  decision: ApplicationDecisionType;
  reasons: readonly (AiFailureCategory | string)[];
  acceptedFields: readonly string[];
  rejectedFields: readonly string[];
  stateMutationAuthorized: false;
  customerReleaseAuthorized: false;
}

export interface AiFoundationSnapshot {
  identity: AiPackageIdentity;
  providerStatus: ProviderCompletionStatus;
  validation: AiValidationResult;
  decision: ApplicationDecision;
  stateMutationOccurred: false;
  customerResponseReleased: false;
  networkAccessed: false;
}

export type OperationResult<T> =
  | { status: "success"; value: T }
  | { status: "failure"; failures: readonly AiFailureCategory[] };
