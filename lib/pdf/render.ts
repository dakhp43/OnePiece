import { renderToBuffer } from "@react-pdf/renderer";
import { eq } from "drizzle-orm";
import { createElement } from "react";
import { ApiError } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import type { PatientRow, VisitRow } from "@/lib/db/schema";
import { currentReport } from "@/lib/report";
import { loadReportContext } from "@/lib/report-context";
import { VISIT_TYPE_LABELS, ageFromDob, sexLabel } from "@/lib/utils";
import { ReportDocument, type ReportDocumentProps } from "./ReportDocument";
import { SummaryDocument, type SummaryDocumentProps } from "./SummaryDocument";

export function visitDateLabel(visit: VisitRow, lang: "en" | "es") {
  const d = visit.startedAt ?? visit.signedAt ?? new Date();
  return d.toLocaleDateString(lang === "es" ? "es-US" : "en-US", { year: "numeric", month: "long", day: "numeric" });
}

export async function renderSummaryPdf(visit: VisitRow, patient: PatientRow, lang: "en" | "es"): Promise<Buffer> {
  const summary = visit.followthrough?.summaries[lang];
  if (!summary) throw new ApiError(404, `No ${lang === "es" ? "Spanish" : "English"} summary yet`);
  const db = await getDb();
  const [doctor] = await db.select({ name: schema.doctors.name }).from(schema.doctors).where(eq(schema.doctors.id, visit.doctorId));
  const props: SummaryDocumentProps = {
    summary,
    firstName: patient.firstName,
    visitDate: visitDateLabel(visit, lang),
    doctorName: doctor?.name ?? "",
  };
  // SummaryDocument returns a <Document>, which is what renderToBuffer expects.
  return renderToBuffer(createElement(SummaryDocument, props) as Parameters<typeof renderToBuffer>[0]);
}

const longDate = (d: Date) => d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
const dateTime = (d: Date) => d.toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Clinician-facing visit report: the (possibly edited) narrative plus live chart data. */
export async function renderReportPdf(visit: VisitRow, patient: PatientRow): Promise<Buffer> {
  const current = currentReport(visit, patient);
  if (!current) throw new ApiError(404, "No signed note to build a report from");
  const context = await loadReportContext(visit, patient);
  const visitDate = visit.startedAt ?? visit.signedAt ?? new Date();
  const props: ReportDocumentProps = {
    report: current.report,
    context,
    patient: {
      name: `${patient.firstName} ${patient.lastName}`,
      dob: longDate(new Date(`${patient.dob}T12:00:00`)),
      ageSex: `${ageFromDob(patient.dob, visitDate)} / ${sexLabel(patient.sex)}`,
    },
    visit: {
      date: longDate(visitDate),
      type: VISIT_TYPE_LABELS[visit.visitType] ?? visit.visitType,
      signedAt: visit.signedAt ? dateTime(visit.signedAt) : "Not signed",
      status: visit.status === "sent" ? "Signed · summary sent to patient" : visit.status === "signed" ? "Signed" : "Draft",
      editedAt: current.report.editedAt ? dateTime(new Date(current.report.editedAt)) : null,
    },
  };
  return renderToBuffer(createElement(ReportDocument, props) as Parameters<typeof renderToBuffer>[0]);
}
