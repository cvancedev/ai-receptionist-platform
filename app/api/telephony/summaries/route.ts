import { timingSafeEqual, createHash } from "node:crypto";
import { resolveTelephoneRuntime } from "../../../../src/server/telephony/telephone-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Server-side variable holding the owner's read token. Never sent to a browser. */
export const OWNER_INBOX_TOKEN_VARIABLE = "AI_RECEPTIONIST_OWNER_INBOX_TOKEN" as const;
const MAXIMUM_SUMMARIES = 50;

/**
 * The owner's view of recent calls for the pilot business.
 *
 * There is deliberately no dashboard: the pilot owner opens this with their own
 * token and reads the same summaries the notification outbox holds. The response
 * is private, uncached, and scoped to the one configured business.
 */
export async function GET(request: Request): Promise<Response> {
  const resolution = await resolveTelephoneRuntime();
  if (resolution.status === "unavailable") {
    return json({ status: "unavailable" }, 503);
  }

  const expected = process.env[OWNER_INBOX_TOKEN_VARIABLE];
  if (typeof expected !== "string" || expected.length < 16) {
    return json({ status: "unavailable" }, 503);
  }
  const presented = bearerToken(request.headers.get("authorization"));
  if (presented === null || !constantTimeEquals(expected, presented)) {
    return json({ status: "unauthorized" }, 401);
  }

  const businessId = resolution.runtime.business.profile.id;
  const summaries = await resolution.runtime.store.listSummaries(businessId, MAXIMUM_SUMMARIES);
  if (summaries === null) return json({ status: "unavailable" }, 503);

  return json({
    status: "ok",
    business: resolution.runtime.business.profile.businessName,
    calls: summaries.map((summary) => ({
      callId: summary.callId,
      receivedAt: summary.receivedAt,
      durationSeconds: Math.round(summary.durationMs / 1000),
      outcome: summary.outcome,
      callerName: summary.caller.name,
      callbackNumber: summary.caller.callbackNumber,
      reason: summary.caller.issueSummary,
      unansweredQuestions: summary.unresolved.map((entry) => entry.question),
      brief: summary.ownerBrief,
    })),
  }, 200);
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, private",
      "x-robots-tag": "noindex",
    },
  });
}

function bearerToken(header: string | null): string | null {
  if (typeof header !== "string") return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/** Compare digests so the comparison length never depends on the secret. */
function constantTimeEquals(expected: string, presented: string): boolean {
  const left = createHash("sha256").update(expected, "utf8").digest();
  const right = createHash("sha256").update(presented, "utf8").digest();
  return timingSafeEqual(left, right);
}
