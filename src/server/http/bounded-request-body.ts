if (typeof window !== "undefined") {
  throw new Error("Bounded request body reading is server-only.");
}

export type BoundedBodyResult =
  | { readonly status: "text"; readonly text: string }
  | { readonly status: "too-large" }
  | { readonly status: "empty" }
  | { readonly status: "invalid" };

/**
 * Read a request body with a hard byte ceiling.
 *
 * The declared `Content-Length` is checked by callers before this runs, but the
 * streamed total is authoritative: a lying or absent header cannot make the
 * server buffer an unbounded body. Text must be valid UTF-8.
 */
export async function readBoundedBody(
  request: Request,
  maximumBytes: number,
): Promise<BoundedBodyResult> {
  if (!request.body) return { status: "empty" };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        return { status: "too-large" };
      }
      chunks.push(value);
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    return { status: "invalid" };
  }
  if (total === 0) return { status: "empty" };

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return {
      status: "text",
      text: new TextDecoder("utf-8", { fatal: true }).decode(merged),
    };
  } catch {
    return { status: "invalid" };
  }
}
