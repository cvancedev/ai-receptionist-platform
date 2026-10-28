import { createHash, randomBytes } from "node:crypto";

if (typeof window !== "undefined") {
  throw new Error("Conversation handles are server-only.");
}

/**
 * Opaque conversation handles.
 *
 * A handle is a server-minted, high-entropy reference to exactly one
 * conversation owned by one business. It carries no business identifier, no
 * conversation identifier, and no signature the client could usefully read or
 * forge, so substituting, extending, or truncating one yields an unknown
 * reference rather than another tenant's conversation.
 *
 * Handles are never returned to a browser by the receptionist endpoint. They are
 * held by the authenticated session on the server and passed only between
 * server components, which keeps conversation authority independent of HTTP
 * fields and of any future channel such as telephony.
 */
export const CONVERSATION_HANDLE_VERSION = "b2.3.1-conversation-handle/v1" as const;
export const CONVERSATION_HANDLE_BYTES = 32;
export const CONVERSATION_HANDLE_MINIMUM_LENGTH = 43;
export const CONVERSATION_HANDLE_MAXIMUM_LENGTH = 128;

export function createConversationHandle(
  generateBytes: (size: number) => Buffer = randomBytes,
): string {
  const bytes = generateBytes(CONVERSATION_HANDLE_BYTES);
  if (!Buffer.isBuffer(bytes) || bytes.byteLength < CONVERSATION_HANDLE_BYTES) {
    throw new Error("The conversation handle source is unavailable.");
  }
  return bytes.toString("base64url");
}

export function isConversationHandle(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length < CONVERSATION_HANDLE_MINIMUM_LENGTH) return false;
  if (value.length > CONVERSATION_HANDLE_MAXIMUM_LENGTH) return false;
  for (const character of value) {
    const code = character.charCodeAt(0);
    const allowed = (code >= 0x30 && code <= 0x39)
      || (code >= 0x41 && code <= 0x5a)
      || (code >= 0x61 && code <= 0x7a)
      || code === 0x2d
      || code === 0x5f;
    if (!allowed) return false;
  }
  return true;
}

/**
 * Handles are stored by hash so a memory dump, log, or diagnostic that captures
 * a map key cannot be replayed as a live reference.
 */
export function digestConversationHandle(handle: string): string {
  return createHash("sha256").update(handle, "utf8").digest("hex");
}
