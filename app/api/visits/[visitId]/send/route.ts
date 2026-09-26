import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, readJson, route } from "@/lib/api";
import { loadVisit } from "@/lib/access";
import { requireDoctorApi } from "@/lib/auth/current";
import { sendEmail } from "@/lib/email/send";
import { logEvent } from "@/lib/events";
import { renderSummaryPdf, visitDateLabel } from "@/lib/pdf/render";
import { assertStatus, updateVisit, visitView } from "@/lib/visits";

export const runtime = "nodejs";

const Body = z.object({ email: z.string().trim().email(), language: z.enum(["en", "es"]) });

const MESSAGE = {
  en: (name: string, date: string) => ({
    subject: `Your visit summary from ${date}`,
    text: `Hi ${name},\n\nYour visit summary is attached as a PDF. It lists what we talked about, your medicines, and what to do next.\n\nIf you have questions, call the clinic.\n\nCarryover Demo Clinic\n\n(Prototype for hackUMBC 2026. Not for clinical use. Synthetic data only.)`,
  }),
  es: (name: string, date: string) => ({
    subject: `Resumen de su visita del ${date}`,
    text: `Hola ${name}:\n\nAdjuntamos el resumen de su visita en PDF. Incluye lo que hablamos, sus medicinas y qué hacer ahora.\n\nSi tiene preguntas, llame a la clínica.\n\nCarryover Demo Clinic\n\n(Prototipo para hackUMBC 2026. No es para uso clínico. Solo datos sintéticos.)`,
  }),
};

/** Doctor-approved send: renders the PDF in the approved language and emails it. */
export const POST = route(async (req: Request, ctx: RouteContext<"/api/visits/[visitId]/send">) => {
  const { visitId } = await ctx.params;
  const session = await requireDoctorApi();
  const { email, language } = await readJson(req, Body.parse);
  const { visit, patient } = await loadVisit(visitId, session.doctorId);
  assertStatus(visit, ["signed", "sent"], "send the summary");
  const ft = visit.followthrough;
  if (!ft?.summaries[language]) throw new ApiError(409, "No summary in that language yet");
  if (language === "es" && !ft.translationReviewed) {
    throw new ApiError(409, "Review the machine-translated Spanish summary before sending");
  }

  const approved = { ...ft, approvedLanguage: language };
  await updateVisit(visit.id, { followthrough: approved });
  const pdf = await renderSummaryPdf({ ...visit, followthrough: approved }, patient, language);
  const msg = MESSAGE[language](patient.firstName, visitDateLabel(visit, language));
  const result = await sendEmail({
    to: email,
    subject: msg.subject,
    text: msg.text,
    attachment: { filename: language === "es" ? "resumen-de-visita.pdf" : "visit-summary.pdf", content: pdf },
  });

  await logEvent("email_sent", {
    visitId, doctorId: session.doctorId,
    payload: { language, provider: result.provider, messageId: result.id, toPatientEmail: email === patient.email },
  });
  const saved = await updateVisit(visit.id, { status: "sent", sentAt: new Date() });
  return NextResponse.json(visitView(saved, patient));
});
