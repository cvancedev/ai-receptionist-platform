import { Pool } from "pg";
import type { HandoffSummary, TelephoneCall } from "../../telephony/call-session";
import type {
  CreateCallResult,
  LoadCallResult,
  OwnerNotification,
  SaveCallResult,
  TelephoneCallStore,
} from "../../server/telephony/call-store";

if (typeof window !== "undefined") {
  throw new Error("PostgreSQL telephone persistence is server-only.");
}

/**
 * Durable telephone call storage.
 *
 * Every write is idempotent in the way the carrier needs: creating a call twice
 * is a no-op, advancing a turn requires the stored turn count to still match,
 * and the summary and notification are inserted at most once per call. A
 * duplicate webhook therefore cannot repeat a question or notify the owner twice.
 */
export class PostgresqlTelephoneCallStore implements TelephoneCallStore {
  readonly kind = "postgresql" as const;
  private readonly pool: Pool;

  constructor(options: { readonly connectionString: string; readonly maximumConnections?: number }) {
    if (!options?.connectionString) throw new Error("A connection string is required.");
    this.pool = new Pool({
      connectionString: options.connectionString,
      max: options.maximumConnections ?? 4,
    });
  }

  /** True when every telephone table this store needs is present. */
  static async schemaReady(connectionString: string): Promise<boolean> {
    const pool = new Pool({ connectionString, max: 1 });
    try {
      const result = await pool.query<{ present: string | null }>(
        `select to_regclass('public.telephone_calls')::text as present`,
      );
      if (!result.rows[0]?.present) return false;
      const summary = await pool.query<{ present: string | null }>(
        `select to_regclass('public.telephone_call_summaries')::text as present`,
      );
      if (!summary.rows[0]?.present) return false;
      const notifications = await pool.query<{ present: string | null }>(
        `select to_regclass('public.telephone_owner_notifications')::text as present`,
      );
      return Boolean(notifications.rows[0]?.present);
    } catch {
      return false;
    } finally {
      await pool.end().catch(() => undefined);
    }
  }

  async createCall(call: TelephoneCall): Promise<CreateCallResult> {
    try {
      const result = await this.pool.query(
        `insert into telephone_calls (
           call_id, business_profile_id, business_profile_version,
           conversation_id, turn_count, state, snapshot
         ) values ($1, $2, $3, $4, $5, $6, $7::jsonb)
         on conflict (call_id) do nothing
         returning call_id`,
        [
          call.callId,
          call.businessProfileId,
          call.businessProfileVersion,
          call.conversationId,
          call.turnCount,
          call.state,
          JSON.stringify(call),
        ],
      );
      return result.rowCount === 1 ? "created" : "already-exists";
    } catch {
      return "failure";
    }
  }

  async loadCall(callId: string): Promise<LoadCallResult> {
    try {
      const result = await this.pool.query<{ snapshot: TelephoneCall }>(
        `select snapshot from telephone_calls where call_id = $1`,
        [callId],
      );
      const row = result.rows[0];
      if (!row) return { status: "not-found" };
      return { status: "found", call: row.snapshot };
    } catch {
      return { status: "failure" };
    }
  }

  async saveCall(call: TelephoneCall, expectedTurnCount: number): Promise<SaveCallResult> {
    try {
      const result = await this.pool.query(
        `update telephone_calls
            set snapshot = $2::jsonb,
                turn_count = $3,
                state = $4,
                updated_at = now()
          where call_id = $1 and turn_count = $5
          returning call_id`,
        [
          call.callId,
          JSON.stringify(call),
          call.turnCount,
          call.state,
          expectedTurnCount,
        ],
      );
      if (result.rowCount === 1) return "saved";

      const exists = await this.pool.query(
        `select 1 from telephone_calls where call_id = $1`,
        [call.callId],
      );
      return exists.rowCount === 1 ? "conflict" : "failure";
    } catch {
      return "failure";
    }
  }

  async saveSummary(summary: HandoffSummary): Promise<"saved" | "failure"> {
    try {
      await this.pool.query(
        `insert into telephone_call_summaries (
           call_id, business_profile_id, ended_at, summary
         ) values ($1, $2, $3, $4::jsonb)
         on conflict (call_id) do nothing`,
        [summary.callId, summary.businessProfileId, summary.endedAt, JSON.stringify(summary)],
      );
      return "saved";
    } catch {
      return "failure";
    }
  }

  async loadSummary(callId: string): Promise<HandoffSummary | null> {
    try {
      const result = await this.pool.query<{ summary: HandoffSummary }>(
        `select summary from telephone_call_summaries where call_id = $1`,
        [callId],
      );
      return result.rows[0]?.summary ?? null;
    } catch {
      return null;
    }
  }

  async listSummaries(
    businessProfileId: string,
    limit: number,
  ): Promise<readonly HandoffSummary[] | null> {
    try {
      const result = await this.pool.query<{ summary: HandoffSummary }>(
        `select summary
           from telephone_call_summaries
          where business_profile_id = $1
          order by ended_at desc
          limit $2`,
        [businessProfileId, Math.min(100, Math.max(1, limit))],
      );
      return result.rows.map((row) => row.summary);
    } catch {
      return null;
    }
  }

  async enqueueNotification(
    summary: HandoffSummary,
  ): Promise<"queued" | "already-queued" | "failure"> {
    try {
      const result = await this.pool.query(
        `insert into telephone_owner_notifications (
           call_id, notification_id, business_profile_id, created_at_ms, summary
         ) values ($1, $2, $3, $4, $5::jsonb)
         on conflict (call_id) do nothing
         returning call_id`,
        [
          summary.callId,
          `notification-${summary.callId}`,
          summary.businessProfileId,
          summary.endedAt,
          JSON.stringify(summary),
        ],
      );
      return result.rowCount === 1 ? "queued" : "already-queued";
    } catch {
      return "failure";
    }
  }

  async listNotifications(
    businessProfileId: string,
    limit: number,
  ): Promise<readonly OwnerNotification[] | null> {
    try {
      const result = await this.pool.query<{
        notification_id: string;
        call_id: string;
        business_profile_id: string;
        created_at_ms: number;
        summary: HandoffSummary;
      }>(
        `select notification_id, call_id, business_profile_id, created_at_ms, summary
           from telephone_owner_notifications
          where business_profile_id = $1
          order by created_at_ms desc
          limit $2`,
        [businessProfileId, Math.min(100, Math.max(1, limit))],
      );
      return result.rows.map((row) => Object.freeze({
        notificationId: row.notification_id,
        callId: row.call_id,
        businessProfileId: row.business_profile_id,
        createdAt: Number(row.created_at_ms),
        summary: row.summary,
      }));
    } catch {
      return null;
    }
  }

  async close(): Promise<void> {
    await this.pool.end().catch(() => undefined);
  }
}
