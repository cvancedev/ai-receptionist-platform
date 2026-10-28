import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  DEFAULT_SESSION_TTL_MS,
  MAXIMUM_SESSION_RECORDS,
  MAXIMUM_SESSION_TTL_MS,
  MINIMUM_SESSION_TTL_MS,
  createSessionToken,
  digestSessionToken,
  isSessionTokenShape,
  parseSessionIssueInput,
  serializeSessionCookie,
  type IssuedSession,
  type SessionAuthentication,
  type SessionAuthenticationSource,
  type SessionPrincipal,
} from "./session-authority";
import { digestConversationHandle } from "./conversation-handle";
import type {
  PersistedSessionRecord,
  ReceptionistPersistence,
} from "../persistence/receptionist-persistence";

if (typeof window !== "undefined") {
  throw new Error("The persistent session authority is server-only.");
}

/**
 * Durable pilot session authority.
 *
 * Only SHA-256 digests of the session token and CSRF token are stored; the raw
 * handle is never persisted, only its digest. Authentication therefore works
 * after a restart without any recoverable secret at rest. Because the raw
 * handle cannot be reconstructed, an authenticated principal carries the
 * session's business and conversation scope instead, and the durable
 * conversation service resolves that trusted scope.
 */
export interface PersistentSessionAuthorityOptions {
  readonly persistence: ReceptionistPersistence;
  readonly now?: () => number;
  readonly ttlMs?: number;
  readonly maxSessions?: number;
  readonly generateBytes?: (size: number) => Buffer;
}

export class PersistentSessionAuthority implements SessionAuthenticationSource {
  private readonly persistence: ReceptionistPersistence;
  private readonly now: () => number;
  private readonly ttlMs: number;
  private readonly maxSessions: number;
  private readonly generateBytes: (size: number) => Buffer;

  constructor(options: PersistentSessionAuthorityOptions) {
    if (!options?.persistence) {
      throw new Error("Session persistence is required.");
    }
    this.persistence = options.persistence;
    this.now = options.now ?? Date.now;
    this.ttlMs = boundedInteger(
      options.ttlMs ?? DEFAULT_SESSION_TTL_MS,
      MINIMUM_SESSION_TTL_MS,
      MAXIMUM_SESSION_TTL_MS,
    ) ?? DEFAULT_SESSION_TTL_MS;
    this.maxSessions = boundedInteger(
      options.maxSessions ?? MAXIMUM_SESSION_RECORDS,
      1,
      MAXIMUM_SESSION_RECORDS,
    ) ?? MAXIMUM_SESSION_RECORDS;
    this.generateBytes = options.generateBytes ?? randomBytes;
  }

  async issue(input: unknown, secureCookie = false): Promise<IssuedSession> {
    const fields = parseSessionIssueInput(input);
    if (!fields
      || fields.businessProfileVersion === null
      || fields.conversationHandle === null) {
      throw new Error("A complete durable session scope is required.");
    }

    const now = this.currentTime();
    await this.persistence.pruneSessions(now);
    const existing = await this.persistence.countSessions();
    if (existing >= this.maxSessions) {
      throw new Error("Session capacity is exhausted.");
    }

    const token = createSessionToken(this.generateBytes);
    const csrfToken = createSessionToken(this.generateBytes);
    const tokenHash = digestSessionToken(token);
    const record: PersistedSessionRecord = Object.freeze({
      tokenHash,
      csrfTokenHash: digestSessionToken(csrfToken),
      sessionKey: tokenHash.slice(0, 32),
      businessProfileId: fields.businessId,
      businessProfileVersion: fields.businessProfileVersion,
      conversationId: fields.conversationId,
      conversationHandleHash: digestConversationHandle(fields.conversationHandle),
      actorId: fields.actorId,
      createdAt: now,
      expiresAt: now + this.ttlMs,
      revokedAt: null,
    });

    const created = await this.persistence.createSession(record);
    if (created !== "created") {
      throw new Error("Session persistence is unavailable.");
    }

    return Object.freeze({
      token,
      csrfToken,
      cookie: serializeSessionCookie(token, {
        secure: secureCookie,
        maxAgeSeconds: Math.floor(this.ttlMs / 1_000),
      }),
      principal: Object.freeze({
        businessId: record.businessProfileId,
        conversationId: record.conversationId,
        conversationHandle: fields.conversationHandle,
        businessProfileVersion: record.businessProfileVersion,
        actorId: record.actorId,
        expiresAt: record.expiresAt,
        sessionKey: record.sessionKey,
      }),
    });
  }

  async authenticate(token: unknown, csrfToken: unknown): Promise<SessionAuthentication> {
    if (token === undefined || token === null || token === "") {
      return Object.freeze({ status: "missing" });
    }
    if (!isSessionTokenShape(token)) return Object.freeze({ status: "invalid" });

    const found = await this.persistence.findSession(digestSessionToken(token));
    if (found.status === "failure") return Object.freeze({ status: "invalid" });
    if (found.status === "not-found") return Object.freeze({ status: "invalid" });

    const session = found.session;
    if (session.revokedAt !== null) return Object.freeze({ status: "invalid" });
    if (session.expiresAt <= this.currentTime()) {
      return Object.freeze({ status: "invalid" });
    }

    if (csrfToken === undefined || csrfToken === null || csrfToken === "") {
      return Object.freeze({ status: "csrf" });
    }
    if (!isSessionTokenShape(csrfToken)) return Object.freeze({ status: "csrf" });
    if (!safeEqualHex(session.csrfTokenHash, digestSessionToken(csrfToken))) {
      return Object.freeze({ status: "csrf" });
    }

    const principal: SessionPrincipal = Object.freeze({
      businessId: session.businessProfileId,
      conversationId: session.conversationId,
      conversationHandle: null,
      businessProfileVersion: session.businessProfileVersion,
      actorId: session.actorId,
      expiresAt: session.expiresAt,
      sessionKey: session.sessionKey,
    });
    return Object.freeze({ status: "authenticated", principal });
  }

  async revoke(token: unknown): Promise<void> {
    if (!isSessionTokenShape(token)) return;
    const result = await this.persistence.revokeSession(
      digestSessionToken(token),
      this.currentTime(),
    );
    if (result === "failure") throw new Error("Session revocation failed.");
  }

  async size(): Promise<number> {
    return this.persistence.countSessions();
  }

  private currentTime(): number {
    const value = this.now();
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error("The session clock is unavailable.");
    }
    return Math.trunc(value);
  }
}

function safeEqualHex(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  const leftBytes = Buffer.from(left, "hex");
  const rightBytes = Buffer.from(right, "hex");
  if (leftBytes.byteLength !== rightBytes.byteLength) return false;
  return timingSafeEqual(leftBytes, rightBytes);
}

function boundedInteger(value: unknown, minimum: number, maximum: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < minimum || value > maximum) return null;
  return value;
}
