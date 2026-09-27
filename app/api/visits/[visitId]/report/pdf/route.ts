import { route } from "@/lib/api";
import { loadVisit } from "@/lib/access";
import { requireDoctorApi } from "@/lib/auth/current";
import { renderReportPdf } from "@/lib/pdf/render";
import { assertStatus } from "@/lib/visits";

export const runtime = "nodejs";

/** GET /report/pdf — the clinician-facing visit report as a PDF (opens in a new tab). */
export const GET = route(async (_req: Request, ctx: RouteContext<"/api/visits/[visitId]/report/pdf">) => {
  const { visitId } = await ctx.params;
  const session = await requireDoctorApi();
  const { visit, patient } = await loadVisit(visitId, session.doctorId);
  assertStatus(visit, ["signed", "sent"], "export the report");
  const pdf = await renderReportPdf(visit, patient);
  const name = `visit-report-${patient.lastName.toLowerCase()}-${(visit.startedAt ?? new Date()).toISOString().slice(0, 10)}.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
});
