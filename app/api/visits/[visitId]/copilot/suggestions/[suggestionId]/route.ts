import { NextResponse } from "next/server";
import { z } from "zod";
import { readJson, route } from "@/lib/api";
import { loadVisit } from "@/lib/access";
import { requireDoctorApi } from "@/lib/auth/current";
import { dismissSuggestion } from "@/lib/copilot/gate";
import { withCopilotLock } from "@/lib/copilot/lock";
import { logSuggestion, requireCopilot } from "@/lib/copilot/server";
import { updateVisit } from "@/lib/visits";

export const runtime = "nodejs";

const Body = z.object({ action: z.literal("dismiss"), elapsedSeconds: z.number().min(0).max(3600) });

/** The doctor dismissed a "Consider asking" card. Idempotent: dismissing a resolved card changes nothing. */
export const POST = route(async (req: Request, ctx: RouteContext<"/api/visits/[visitId]/copilot/suggestions/[suggestionId]">) => {
  const { visitId, suggestionId } = await ctx.params;
  const session = await requireDoctorApi();
  const body = await readJson(req, Body.parse);
  const copilot = await withCopilotLock(visitId, async () => {
    const { visit } = await loadVisit(visitId, session.doctorId);
    const current = requireCopilot(visit);
    const res = dismissSuggestion(current, suggestionId, body.elapsedSeconds);
    if (!res) return current;
    await updateVisit(visitId, { copilot: res.state });
    await logSuggestion(visitId, session.doctorId, res.suggestion);
    return res.state;
  });
  return NextResponse.json({ copilot });
});
