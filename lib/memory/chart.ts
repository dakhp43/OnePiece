import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { PatientRow } from "@/lib/db/schema";
import { getOpenItems, getVitals } from "@/lib/queries";
import { VISIT_TYPE_LABELS, formatDate } from "@/lib/utils";

/** Everything the brief needs from the database: last 3 signed notes, open items, vitals. */
export async function loadChartContext(patient: PatientRow) {
  const db = await getDb();
  const signed = await db.select().from(schema.visits)
    .where(and(eq(schema.visits.patientId, patient.id), inArray(schema.visits.status, ["signed", "sent"])))
    .orderBy(desc(schema.visits.startedAt))
    .limit(3);
  const [openItems, vitals] = await Promise.all([getOpenItems(patient.id), getVitals(patient.id)]);
  return { signed, openItems, vitals };
}
export type ChartContext = Awaited<ReturnType<typeof loadChartContext>>;

/** Renders the chart context as plain text for an LLM prompt or a Backboard memory message. */
export function chartContextText(patient: PatientRow, ctx: ChartContext) {
  const lines: string[] = [
    `Patient: ${patient.firstName} ${patient.lastName}, ${patient.sex}, DOB ${patient.dob}.`,
    `Medications on file: ${patient.knownMedications.map((m) => `${m.name} ${m.dose} ${m.frequency}`).join("; ") || "none"}.`,
    `Allergies: ${patient.knownAllergies.join(", ") || "none known"}.`,
  ];
  for (const v of [...ctx.signed].reverse()) {
    const note = v.note;
    if (!note) continue;
    lines.push(`\nVisit ${formatDate(v.startedAt)} (${VISIT_TYPE_LABELS[v.visitType]}). Chief complaint: ${note.chiefComplaint}.`);
    for (const s of note.sentences.filter((s) => s.review !== "deleted")) lines.push(`- [${s.section}] ${s.text}`);
  }
  lines.push(`\nOpen items: ${ctx.openItems.map((o) => o.text).join("; ") || "none"}.`);
  const bp = ctx.vitals.filter((v) => v.systolic && v.diastolic);
  lines.push(`BP readings: ${bp.map((v) => `${formatDate(v.time)} ${v.systolic}/${v.diastolic}`).join(", ") || "none"}.`);
  return lines.join("\n");
}

/** Deterministic brief when neither Backboard nor Gemini is available. */
export function chartBrief(patient: PatientRow, ctx: ChartContext): string[] {
  const bullets: string[] = [];
  const problems = new Set(ctx.signed.flatMap((v) => v.note?.problems.map((p) => p.title) ?? []));
  if (problems.size) bullets.push(`Active problems: ${[...problems].join(", ")}.`);
  if (patient.knownMedications.length) {
    bullets.push(`Current medications: ${patient.knownMedications.map((m) => `${m.name} ${m.dose} ${m.frequency}`).join(", ")}.`);
  }
  const lastPlan = ctx.signed[0]?.note?.sentences.filter((s) => s.section === "P").map((s) => s.text);
  if (lastPlan?.length) bullets.push(`Last visit plan: ${lastPlan.join(" ")}`);
  if (ctx.openItems.length) bullets.push(`Outstanding: ${ctx.openItems.map((o) => o.text).join("; ")}.`);
  const bp = ctx.vitals.filter((v) => v.systolic && v.diastolic);
  if (bp.length) bullets.push(`BP trend: ${bp.map((v) => `${v.systolic}/${v.diastolic}`).join(" → ")}.`);
  return bullets.slice(0, 5);
}
