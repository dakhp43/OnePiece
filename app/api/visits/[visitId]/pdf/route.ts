import { route } from "@/lib/api";
import { loadVisit } from "@/lib/access";
import { requireDoctorApi } from "@/lib/auth/current";
import { renderSummaryPdf } from "@/lib/pdf/render";

export const runtime = "nodejs";

/** GET /pdf?lang=en|es — preview the patient summary PDF (opens in a new tab). */
export const GET = route(async (req: Request, ctx: RouteContext<"/api/visits/[visitId]/pdf">) => {
  const { visitId } = await ctx.params;
  const session = await requireDoctorApi();
  const lang = new URL(req.url).searchParams.get("lang") === "es" ? "es" : "en";
  const { visit, patient } = await loadVisit(visitId, session.doctorId);
  const pdf = await renderSummaryPdf(visit, patient, lang);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="visit-summary-${lang}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
});
