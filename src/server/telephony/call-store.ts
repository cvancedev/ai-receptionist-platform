import type { HandoffSummary, TelephoneCall } from "../../telephony/call-session";

if (typeof window !== "undefined") {
  throw new Error("Telephone call persistence is server-only.");
}

/**
 * Durable boundary for telephone calls.
 *
 * Calls are stored as whole snapshots keyed by the carrier's call identifier,
 * and every save is conditional on the turn count it was loaded with. That makes
 * a carrier retry of the same webhook a no-op instead of a second dialogue turn,
 * which is the failure mode that would otherwise double-charge a provider or
 * repeat a question to the caller.
 *
 * The summary and the owner notification are separate rows so the owner can be
 * notified exactly once even if the closing webhook is retried.
 */
export interface OwnerNotification {
  readonly notificationId: string;
  readonly callId: string;
  readonly businessProfileId: string;
  readonly createdAt: number;
  readonly summary: HandoffSummary;
}

export type LoadCallResult =
  | { readonly status: "found"; readonly call: TelephoneCall }
  | { readonly status: "not-found" }
  | { readonly status: "failure" };

export type SaveCallResult = "saved" | "conflict" | "failure";

export type CreateCallResult = "created" | "already-exists" | "failure";

export interface TelephoneCallStore {
  readonly kind: "postgresql" | "in-memory";
  createCall(call: TelephoneCall): Promise<CreateCallResult>;
  loadCall(callId: string): Promise<LoadCallResult>;
  /** Saves only when the stored turn count still equals `expectedTurnCount`. */
  saveCall(call: TelephoneCall, expectedTurnCount: number): Promise<SaveCallResult>;
  saveSummary(summary: HandoffSummary): Promise<"saved" | "failure">;
  loadSummary(callId: string): Promise<HandoffSummary | null>;
  listSummaries(
    businessProfileId: string,
    limit: number,
  ): Promise<readonly HandoffSummary[] | null>;
  /** Queues the owner notification for a call, at most once per call. */
  enqueueNotification(summary: HandoffSummary): Promise<"queued" | "already-queued" | "failure">;
  listNotifications(
    businessProfileId: string,
    limit: number,
  ): Promise<readonly OwnerNotification[] | null>;
  close(): Promise<void>;
}

export const MAXIMUM_LISTED_SUMMARIES = 100;

/**
 * In-memory store for local runs and verification. It is explicitly not durable:
 * a process restart loses every call, which is why the pilot composes the
 * PostgreSQL store.
 */
export class InMemoryTelephoneCallStore implements TelephoneCallStore {
  readonly kind = "in-memory" as const;
  private readonly calls = new Map<string, TelephoneCall>();
  private readonly summaries = new Map<string, HandoffSummary>();
  private readonly notifications = new Map<string, OwnerNotification>();

  async createCall(call: TelephoneCall): Promise<CreateCallResult> {
    if (this.calls.has(call.callId)) return "already-exists";
    this.calls.set(call.callId, call);
    return "created";
  }

  async loadCall(callId: string): Promise<LoadCallResult> {
    const call = this.calls.get(callId);
    return call ? { status: "found", call } : { status: "not-found" };
  }

  async saveCall(call: TelephoneCall, expectedTurnCount: number): Promise<SaveCallResult> {
    const existing = this.calls.get(call.callId);
    if (!existing) return "failure";
    if (existing.turnCount !== expectedTurnCount) return "conflict";
    this.calls.set(call.callId, call);
    return "saved";
  }

  async saveSummary(summary: HandoffSummary): Promise<"saved" | "failure"> {
    // A summary is written once; a retried closing webhook must not overwrite it.
    if (!this.summaries.has(summary.callId)) this.summaries.set(summary.callId, summary);
    return "saved";
  }

  async loadSummary(callId: string): Promise<HandoffSummary | null> {
    return this.summaries.get(callId) ?? null;
  }

  async listSummaries(
    businessProfileId: string,
    limit: number,
  ): Promise<readonly HandoffSummary[] | null> {
    const bounded = Math.min(MAXIMUM_LISTED_SUMMARIES, Math.max(1, limit));
    return [...this.summaries.values()]
      .filter((entry) => entry.businessProfileId === businessProfileId)
      .sort((left, right) => right.endedAt - left.endedAt)
      .slice(0, bounded);
  }

  async enqueueNotification(
    summary: HandoffSummary,
  ): Promise<"queued" | "already-queued" | "failure"> {
    if (this.notifications.has(summary.callId)) return "already-queued";
    this.notifications.set(summary.callId, Object.freeze({
      notificationId: `notification-${summary.callId}`,
      callId: summary.callId,
      businessProfileId: summary.businessProfileId,
      createdAt: summary.endedAt,
      summary,
    }));
    return "queued";
  }

  async listNotifications(
    businessProfileId: string,
    limit: number,
  ): Promise<readonly OwnerNotification[] | null> {
    const bounded = Math.min(MAXIMUM_LISTED_SUMMARIES, Math.max(1, limit));
    return [...this.notifications.values()]
      .filter((entry) => entry.businessProfileId === businessProfileId)
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, bounded);
  }

  async close(): Promise<void> {
    return undefined;
  }
}
