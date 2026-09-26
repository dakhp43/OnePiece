import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, readJson, route } from "@/lib/api";
import { loadVisit } from "@/lib/access";
import { requireDoctorApi } from "@/lib/auth/current";
import { PatientSummarySchema, TaskSchema } from "@/lib/contracts";
import { logEvent } from "@/lib/events";
import { syncTaskOpenItems } from "@/lib/followthrough";
import { assertStatus, updateVisit, visitView } from "@/lib/visits";

export const runtime = "nodejs";

const Body = z.object({
  summary: PatientSummarySchema.optional(),
  tasks: z.array(TaskSchema).optional(),
  translationReviewed: z.boolean().optional(),
});

/** Doctor edits to the follow-through: summary text (EN or ES), tasks, and the Spanish review checkbox. */
export const PATCH = route(async (req: Request, ctx: RouteContext<"/api/visits/[visitId]/summary">) => {
  const { visitId } = await ctx.params;
  const session = await requireDoctorApi();
  const body = await readJson(req, Body.parse);
  const { visit, patient } = await loadVisit(visitId, session.doctorId);
  assertStatus(visit, ["signed", "sent"], "edit the summary");
  const ft = visit.followthrough;
  if (!ft) throw new ApiError(409, "No follow-through yet");

  const next = structuredClone(ft);
  if (body.summary) {
    next.summaries[body.summary.language] = body.summary;
    // Editing the Spanish text means it needs a fresh review before sending.
    if (body.summary.language === "es") next.translationReviewed = false;
    await logEvent("summary_edited", { visitId, doctorId: session.doctorId, payload: { language: body.summary.language } });
  }
  if (body.tasks) {
    next.tasks = body.tasks;
    await syncTaskOpenItems(visit, body.tasks);
    await logEvent("summary_edited", { visitId, doctorId: session.doctorId, payload: { tasks: body.tasks.length } });
  }
  if (body.translationReviewed !== undefined) {
    if (!next.summaries.es) throw new ApiError(409, "No Spanish summary to review");
    next.translationReviewed = body.translationReviewed;
  }
  const saved = await updateVisit(visit.id, { followthrough: next });
  return NextResponse.json(visitView(saved, patient));
});
