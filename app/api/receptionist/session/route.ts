import { pilotUnavailableResponse } from "@/src/server/http/pilot-unavailable-response";
import { handleReceptionistSessionIssue } from "@/src/server/http/receptionist-session-handler";
import { resolveReceptionistHttpRuntime } from "@/src/server/pilot/pilot-runtime-provider";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const resolution = await resolveReceptionistHttpRuntime();
  if (resolution.status !== "pilot") {
    return pilotUnavailableResponse(resolution.status === "demo" ? "demo" : "pilot");
  }
  return handleReceptionistSessionIssue(request, resolution.runtime);
}
