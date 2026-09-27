import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { loadVisit } from "@/lib/access";
import { requireDoctorApi } from "@/lib/auth/current";
import { getClient } from "@/lib/stt/elevenlabs";
import { assertStatus } from "@/lib/visits";

export const runtime = "nodejs";

/**
 * Mints a 15-minute single-use token for Scribe v2 Realtime, so the browser can stream the live
 * conversation to ElevenLabs without ever seeing the API key.
 */
export const POST = route(async (_req: Request, ctx: RouteContext<"/api/visits/[visitId]/copilot/token">) => {
  const { visitId } = await ctx.params;
  const session = await requireDoctorApi();
  const { visit } = await loadVisit(visitId, session.doctorId);
  assertStatus(visit, ["created", "recording"], "start the live copilot");
  const { token } = await getClient().tokens.singleUse.create("realtime_scribe");
  return NextResponse.json({ token });
});
