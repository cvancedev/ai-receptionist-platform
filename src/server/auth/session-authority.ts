import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { isConversationHandle } from "./conversation-handle";

if (typeof window !== "undefined") {
  throw new Error("The receptionist session authority is server-only.");
}

/**
 * Server-side session authority for the B2.2 receptionist endpoint.
 *
 * B2.2 has no approved identity provider, account store, or login flow. This
 * module therefore does not implement authentication of a human actor. It
 * implements the server-side session boundary the endpoint relies on: opaque,
 * high-entropy tokens created only by trusted server composition, stored as
 * hashes in process memory, bound to one business and one conversation, and
 * paired with a separate CSRF token that is also stored only as a hash.
 *
 * Consequences, stated deliberately:
 * - a token is a bearer secret; it is never logged, returned in JSON, or put
 *   anywhere except the HttpOnly session cookie;
 * - restarting the process invalidates every session;
 * - there is no HTTP session-creation route, because minting an authenticated
 *   actor without an approved identity source would be fabricated authority.
 *
 * The endpoint can be exercised by trusted composition and verification, and
 * it rejects every request that does not present a valid session and CSRF
 * pair.
 */
export const SESSION_POLICY_VERSION = "b2.2-session-authority/v1" as const;
export const SESSION_COOKIE_NAME = "ai_receptionist_session";
export const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1_000;
export const MINIMUM_SESSION_TTL_MS = 60 * 1_000;
export const MAXIMUM_SESSION_TTL_MS = 60 * 60 * 1_000;
export const MAXIMUM_SESSION_RECORDS = 2_000;
const MAXIMUM_COOKIE_HEADER_LENGTH = 8_192;
const MAXIMUM_TOKEN_LENGTH = 256;
const MINIMUM_TOKEN_LENGTH = 32;

export interface SessionPrincipal {
  readonly businessId: string;
  readonly conversationId: string;
  /**
   * Opaque, server-issued conversation reference. It is never returned to a
   * browser; the endpoint reads it from the authenticated session only. A
   * trusted composition that has not begun a conversation yields null.
   */
  readonly conversationHandle: string | null;
  readonly actorId: string;
  readonly expiresAt: number;
  /** Server-only rate-limit key; never returned to a client. */
  readonly sessionKey: string;
}

export interface IssuedSession {
  readonly token: string;
  readonly csrfToken: string;
  readonly cookie: string;
  readonly principal: SessionPrincipal;
}

export type SessionAuthentication =
  | { readonly status: "authenticated"; readonly principal: SessionPrincipal }
  | { readonly status: "missing" }
  | { readonly status: "invalid" }
  | { readonly status: "csrf" };

export interface SessionAuthorityOptions {
  readonly now?: () => number;
  readonly ttlMs?: number;
  readonly maxSessions?: number;
  readonly generateBytes?: (size: number) => Buffer;
}

interface SessionRecord {
  readonly tokenHash: string;
  readonly csrfTokenHash: string;
  readonly businessId: string;
  readonly conversationId: string;
  readonly conversationHandle: string | null;
  readonly actorId: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly sessionKey: string;
}

export class SessionAuthority {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly now: () => number;
  private readonly ttlMs: number;
  private readonly maxSessions: number;
  private readonly generateBytes: (size: number) => Buffer;

  constructor(options: SessionAuthorityOptions = {}) {
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

  issue(input: unknown, secureCookie = false): IssuedSession {
    const fields = parseIssueInput(input);
    if (!fields) throw new Error("A valid session scope is required.");

    this.pruneExpired();
    while (this.sessions.size >= this.maxSessions) {
      const oldest = this.sessions.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.sessions.delete(oldest);
    }

    const token = this.generateToken();
    const csrfToken = this.generateToken();
    const now = this.currentTime();
    const expiresAt = now + this.ttlMs;
    const tokenHash = digest(token);
    const record: SessionRecord = {
      tokenHash,
      csrfTokenHash: digest(csrfToken),
      businessId: fields.businessId,
      conversationId: fields.conversationId,
      conversationHandle: fields.conversationHandle,
      actorId: fields.actorId,
      createdAt: now,
      expiresAt,
      sessionKey: tokenHash.slice(0, 32),
    };
    this.sessions.set(tokenHash, record);

    return Object.freeze({
      token,
      csrfToken,
      cookie: serializeSessionCookie(token, {
        secure: secureCookie,
        maxAgeSeconds: Math.floor(this.ttlMs / 1_000),
      }),
      principal: principalFrom(record),
    });
  }

  authenticate(token: unknown, csrfToken: unknown): SessionAuthentication {
    if (token === undefined || token === null || token === "") {
      return Object.freeze({ status: "missing" });
    }
    if (!isTokenShape(token)) return Object.freeze({ status: "invalid" });

    const record = this.sessions.get(digest(token));
    if (!record) return Object.freeze({ status: "invalid" });
    if (record.expiresAt <= this.currentTime()) {
      this.sessions.delete(record.tokenHash);
      return Object.freeze({ status: "invalid" });
    }
    if (csrfToken === undefined || csrfToken === null || csrfToken === "") {
      return Object.freeze({ status: "csrf" });
    }
    if (!isTokenShape(csrfToken)) return Object.freeze({ status: "csrf" });
    if (!safeEqualHex(record.csrfTokenHash, digest(csrfToken))) {
      return Object.freeze({ status: "csrf" });
    }
    return Object.freeze({
      status: "authenticated",
      principal: principalFrom(record),
    });
  }

  revoke(token: unknown): void {
    if (!isTokenShape(token)) return;
    this.sessions.delete(digest(token));
  }

  size(): number {
    this.pruneExpired();
    return this.sessions.size;
  }

  private generateToken(): string {
    const bytes = this.generateBytes(32);
    if (!Buffer.isBuffer(bytes) || bytes.byteLength < 32) {
      throw new Error("The session token source is unavailable.");
    }
    return bytes.toString("base64url");
  }

  private currentTime(): number {
    const value = this.now();
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error("The session clock is unavailable.");
    }
    return Math.trunc(value);
  }

  private pruneExpired(): void {
    const now = this.currentTime();
    for (const [key, record] of this.sessions) {
      if (record.expiresAt <= now) this.sessions.delete(key);
    }
  }
}

export function serializeSessionCookie(
  token: string,
  options: { readonly secure: boolean; readonly maxAgeSeconds: number },
): string {
  if (!isTokenShape(token)) throw new Error("A valid session token is required.");
  const parts = [
    `${SESSION_COOKIE_NAME}=${token}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Strict",
    `Max-Age=${Math.max(0, Math.trunc(options.maxAgeSeconds))}`,
  ];
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

export function parseSessionCookie(cookieHeader: string | null): string | null {
  if (typeof cookieHeader !== "string" || cookieHeader.length === 0) return null;
  if (cookieHeader.length > MAXIMUM_COOKIE_HEADER_LENGTH) return null;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (name !== SESSION_COOKIE_NAME) continue;
    const value = part.slice(separator + 1).trim();
    return value.length > 0 ? value : null;
  }
  return null;
}

const ISSUE_INPUT_KEYS = new Set([
  "businessId",
  "conversationId",
  "actorId",
  "conversationHandle",
]);

function parseIssueInput(input: unknown): {
  readonly businessId: string;
  readonly conversationId: string;
  readonly conversationHandle: string | null;
  readonly actorId: string;
} | null {
  if (!isPlainRecord(input)) return null;
  const keys = Object.keys(input);
  if (keys.some((key) => !ISSUE_INPUT_KEYS.has(key))) return null;
  if (!keys.includes("businessId")
    || !keys.includes("conversationId")
    || !keys.includes("actorId")) return null;
  if (!isIdentifier(input.businessId)
    || !isIdentifier(input.conversationId)
    || !isIdentifier(input.actorId)) return null;

  let conversationHandle: string | null = null;
  if (input.conversationHandle !== undefined) {
    if (!isConversationHandle(input.conversationHandle)) return null;
    conversationHandle = input.conversationHandle;
  }

  return {
    businessId: input.businessId,
    conversationId: input.conversationId,
    conversationHandle,
    actorId: input.actorId,
  };
}

function principalFrom(record: SessionRecord): SessionPrincipal {
  return Object.freeze({
    businessId: record.businessId,
    conversationId: record.conversationId,
    conversationHandle: record.conversationHandle,
    actorId: record.actorId,
    expiresAt: record.expiresAt,
    sessionKey: record.sessionKey,
  });
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function safeEqualHex(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  const leftBytes = Buffer.from(left, "hex");
  const rightBytes = Buffer.from(right, "hex");
  if (leftBytes.byteLength !== rightBytes.byteLength) return false;
  return timingSafeEqual(leftBytes, rightBytes);
}

function isTokenShape(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length < MINIMUM_TOKEN_LENGTH || value.length > MAXIMUM_TOKEN_LENGTH) return false;
  for (const character of value) {
    if (!isTokenCharacter(character)) return false;
  }
  return true;
}

function isTokenCharacter(character: string): boolean {
  const code = character.charCodeAt(0);
  return (code >= 0x30 && code <= 0x39)
    || (code >= 0x41 && code <= 0x5a)
    || (code >= 0x61 && code <= 0x7a)
    || code === 0x2d
    || code === 0x5f;
}

function isIdentifier(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length < 1 || value.length > 128) return false;
  if (value !== value.trim()) return false;
  for (const character of value) {
    const code = character.charCodeAt(0);
    const allowed = (code >= 0x30 && code <= 0x39)
      || (code >= 0x41 && code <= 0x5a)
      || (code >= 0x61 && code <= 0x7a)
      || code === 0x2d
      || code === 0x5f
      || code === 0x2e
      || code === 0x3a;
    if (!allowed) return false;
  }
  return true;
}

function boundedInteger(value: unknown, minimum: number, maximum: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < minimum || value > maximum) return null;
  return value;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
