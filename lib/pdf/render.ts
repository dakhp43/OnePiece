import { renderToBuffer } from "@react-pdf/renderer";
import { eq } from "drizzle-orm";
import { createElement } from "react";
import { ApiError } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import type { PatientRow, VisitRow } from "@/lib/db/schema";
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
