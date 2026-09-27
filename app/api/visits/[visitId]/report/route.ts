import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, readJson, route } from "@/lib/api";
import { loadVisit } from "@/lib/access";
import { requireDoctorApi } from "@/lib/auth/current";
import { ReportSchema, type Report } from "@/lib/contracts";
import { logEvent } from "@/lib/events";
import { changedFields, currentReport } from "@/lib/report";
import { assertStatus, updateVisit } from "@/lib/visits";

export const runtime = "nodejs";

const Body = z.object({ report: ReportSchema.omit({ editedAt: true }) });

/**
 * Saves the clinician's edits to the visit report. The signed note itself stays frozen; the report is
 * a separate document built from it, and every change is logged to the audit trail. Problems come from
 * the note (edits only change their text), and a report equal to the generated one is stored as null.
 */
export const PATCH = route(async (req: Request, ctx: RouteContext<"/api/visits/[visitId]/report">) => {
  const { visitId } = await ctx.params;
  const session = await requireDoctorApi();
  const body = await readJson(req, Body.parse);
  const { visit, patient } = await loadVisit(visitId, session.doctorId);
  assertStatus(visit, ["signed", "sent"], "edit the report");
  const current = currentReport(visit, patient);
  if (!current) throw new ApiError(409, "No signed note to build a report from");

  const edits = new Map(body.report.problems.map((p) => [p.problemId, p]));
  const next: Report = {
    chiefComplaint: body.report.chiefComplaint,
    hpi: body.report.hpi,
    examination: body.report.examination,
    additionalNotes: body.report.additionalNotes,
    problems: current.generated.problems.map((p) => ({
      ...p,
      assessment: edits.get(p.problemId)?.assessment ?? p.assessment,
      plan: edits.get(p.problemId)?.plan ?? p.plan,
    })),
  };

  const changed = changedFields(current.report, next);
  if (changed.length === 0) return NextResponse.json({ report: current.report, generated: current.generated });

  const pristine = changedFields(current.generated, next).length === 0;
  const saved: Report | null = pristine ? null : { ...next, editedAt: new Date().toISOString() };
  await updateVisit(visit.id, { report: saved });
  await logEvent("report_edited", { visitId, doctorId: session.doctorId, payload: { fields: changed, reverted: pristine } });
  return NextResponse.json({ report: saved ?? current.generated, generated: current.generated });
});
