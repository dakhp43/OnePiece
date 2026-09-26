import { after, NextResponse } from "next/server";
import { ApiError, route } from "@/lib/api";
import { loadVisit } from "@/lib/access";
import { requireDoctorApi } from "@/lib/auth/current";
import { runPipeline } from "@/lib/pipeline";
import { assertStatus, updateVisit } from "@/lib/visits";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Starts the pipeline in the background and returns immediately; the processing page polls GET /api/visits/:id. */
export const POST = route(async (_req: Request, ctx: RouteContext<"/api/visits/[visitId]/process">) => {
  const { visitId } = await ctx.params;
  const session = await requireDoctorApi();
  const { visit } = await loadVisit(visitId, session.doctorId);
  assertStatus(visit, ["recording", "error"], "process");
  if (!visit.audioPath && !visit.transcript) throw new ApiError(409, "No recording uploaded yet");

  await updateVisit(visit.id, {
    status: "processing",
    processingStep: "transcribing",
    metrics: { ...(visit.metrics ?? {}), processingStartedAt: new Date().toISOString(), errorMessage: undefined },
  });
  after(() => runPipeline(visit.id));
  return NextResponse.json({ ok: true }, { status: 202 });
});
