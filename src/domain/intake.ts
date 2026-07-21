import type { IntakeFieldDefinition, ServiceDefinition } from "./business-profile";
import type { ConversationStage, EscalationState } from "../shared/constants";

export type ServiceResolutionResult =
  | { status: "resolved"; service: ServiceDefinition; matchedBy: "id" | "name" | "alias"; evidence: string }
  | { status: "ambiguous"; candidates: readonly ServiceDefinition[]; reason: string }
  | { status: "unsupported"; candidates: readonly []; reason: string }
  | { status: "missing"; candidates: readonly []; reason: string }
  | { status: "blocked"; candidates: readonly []; errors: readonly string[] };

export type QuestionSelectionResult =
  | { status: "selected"; field: IntakeFieldDefinition; questionId: string; question: string; reason: "unasked-required" | "reopened-correction" }
  | { status: "none"; reason: string }
  | { status: "clarification-required"; field?: IntakeFieldDefinition; questionId?: string; question?: string; reason: string }
  | { status: "blocked"; errors: readonly string[] };

export type IntakeReadinessResult =
  | { status: "not-ready"; unresolvedFields: readonly string[]; reason: string }
  | { status: "ready-for-confirmation"; unresolvedFields: readonly []; reason: string }
  | { status: "ready-for-handoff"; unresolvedFields: readonly []; reason: string }
  | { status: "escalation-required"; unresolvedFields: readonly string[]; reason: string }
  | { status: "blocked"; unresolvedFields: readonly string[]; errors: readonly string[] };

export interface DeterministicIntakeResult {
  stage: ConversationStage;
  serviceResolution: ServiceResolutionResult;
  nextQuestion: QuestionSelectionResult;
  unresolvedRequiredFields: readonly string[];
  readiness: IntakeReadinessResult;
  escalationStatus: EscalationState;
  handoffAvailable: boolean;
  validationErrors: readonly string[];
}
