export const CONVERSATION_STAGES = {
  INITIALIZED: "initialized",
  INTAKE: "intake",
  CLARIFICATION: "clarification",
  CONFIRMATION: "confirmation",
  ESCALATION: "escalation",
  HANDOFF: "handoff",
  COMPLETED: "completed",
  ABANDONED: "abandoned",
} as const;

export type ConversationStage =
  (typeof CONVERSATION_STAGES)[keyof typeof CONVERSATION_STAGES];

export const ESCALATION_STATES = {
  NONE: "none",
  RECOMMENDED: "recommended",
  REQUIRED: "required",
  REQUESTED_BY_CUSTOMER: "requested-by-customer",
  IN_PROGRESS: "in-progress",
  HANDED_OFF: "handed-off",
  RESOLVED: "resolved",
} as const;

export type EscalationState =
  (typeof ESCALATION_STATES)[keyof typeof ESCALATION_STATES];

export const COMPLETION_STATES = {
  NOT_READY: "not-ready",
  READY_FOR_CONFIRMATION: "ready-for-confirmation",
  READY_FOR_HANDOFF: "ready-for-handoff",
  COMPLETED: "completed",
  ABANDONED: "abandoned",
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
