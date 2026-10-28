if (typeof window !== "undefined") {
  throw new Error("Receptionist HTTP responses are server-only.");
}

/**
 * JSON response with the headers every receptionist endpoint must set: no
 * storage, no MIME sniffing, no referrer leakage, and cookie/Origin variance.
 */
export function jsonResponse(
  status: number,
  body: unknown,
  extraHeaders: Readonly<Record<string, string>> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      vary: "Cookie, Origin",
      ...extraHeaders,
    },
  });
}
