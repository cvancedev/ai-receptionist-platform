import { handleReceptionistTurn } from "@/src/server/http/receptionist-turn-handler";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handleReceptionistTurn(request);
}
