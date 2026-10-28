import { handleReceptionistTurn } from "@/src/server/http/receptionist-turn-handler";
import { pilotUnavailableResponse } from "@/src/server/http/pilot-unavailable-response";
import { resolveReceptionistHttpRuntime } from "@/src/server/pilot/pilot-runtime-provider";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const resolution = await resolveReceptionistHttpRuntime();
  if (resolution.status === "pilot-unavailable") {
    return pilotUnavailableResponse("pilot");
  }
  return handleReceptionistTurn(request, resolution.runtime);
}
