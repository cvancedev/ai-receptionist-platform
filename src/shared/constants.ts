export const CONVERSATION_STAGES = {
  INITIALIZED: "initialized",
  UNDERSTANDING_REQUEST: "understanding-request",
  COLLECTING_INFORMATION: "collecting-information",
  CONFIRMING_DETAILS: "confirming-details",
  READY_FOR_HANDOFF: "ready-for-handoff",
  CLOSED: "closed",
} as const;

export type ConversationStage =
  (typeof CONVERSATION_STAGES)[keyof typeof CONVERSATION_STAGES];

export const ESCALATION_STATES = {
  NONE: "none",
  RECOMMENDED: "recommended",
  REQUIRED: "required",
} as const;

export type EscalationState =
  (typeof ESCALATION_STATES)[keyof typeof ESCALATION_STATES];

export const COMPLETION_STATES = {
  IN_PROGRESS: "in-progress",
  READY_FOR_HANDOFF: "ready-for-handoff",
  COMPLETE: "complete",
  INCOMPLETE: "incomplete",
} as const;

export type CompletionState =
  (typeof COMPLETION_STATES)[keyof typeof COMPLETION_STATES];

export const LIFECYCLE_STATES = {
  DRAFT: "draft",
  UNDER_REVIEW: "under-review",
  APPROVED: "approved",
  ACTIVE: "active",
  EXPIRED: "expired",
  SUPERSEDED: "superseded",
  SUSPENDED: "suspended",
  ARCHIVED: "archived",
  REJECTED: "rejected",
} as const;

export type LifecycleState =
  (typeof LIFECYCLE_STATES)[keyof typeof LIFECYCLE_STATES];
