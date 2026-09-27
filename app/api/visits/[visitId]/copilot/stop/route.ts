import { NextResponse } from "next/server";
import { z } from "zod";
import { readJson, route } from "@/lib/api";
import { loadVisit } from "@/lib/access";
import { requireDoctorApi } from "@/lib/auth/current";
import { withCopilotLock } from "@/lib/copilot/lock";
import { settleRealtime } from "@/lib/usage";
import { updateVisit } from "@/lib/visits";

export const runtime = "nodejs";

const Body = z.object({
  realtimeSeconds: z.number().min(0).max(3600),
  error: z.string().max(200).optional(),
});

/**
 * The realtime session ended (End visit, auto-stop, or a connection error). Refunds the unused part of
 * the audio reservation. Allowed in any status: the upload may already have moved the visit on.
 */
export const POST = route(async (req: Request, ctx: RouteContext<"/api/visits/[visitId]/copilot/stop">) => {
  const { visitId } = await ctx.params;
  const session = await requireDoctorApi();
  const body = await readJson(req, Body.parse);
  await withCopilotLock(visitId, async () => {
    const { visit } = await loadVisit(visitId, session.doctorId);
    const copilot = visit.copilot;
    if (!copilot || copilot.status !== "listening") return;
    settleRealtime(copilot.realtimeSecondsReserved, body.realtimeSeconds);
    await updateVisit(visitId, {
      copilot: { ...copilot, status: body.error ? "error" : "ended", ...(body.error ? { error: body.error } : {}) },
    });
  });
  return NextResponse.json({ ok: true });
});
