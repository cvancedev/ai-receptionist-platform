import { jsonResponse } from "./json-response";

if (typeof window !== "undefined") {
  throw new Error("Receptionist pilot responses are server-only.");
}

/**
 * Explicit unavailability response. It never names the missing configuration or
 * database detail, and it never presents a simulated demonstration answer as if
 * it came from the requested pilot.
 */
export function pilotUnavailableResponse(mode: "demo" | "pilot"): Response {
  return jsonResponse(503, {
    ok: false,
    mode,
    simulated: true,
    error: {
      code: "pilot_unavailable",
      message: "The receptionist pilot is unavailable.",
    },
  });
}
