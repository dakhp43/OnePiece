import { and, asc, eq } from "drizzle-orm";
import type { Medication, SignoffOverride, Task } from "@/lib/contracts";
import { getDb, schema } from "@/lib/db";
import type { PatientRow, VisitRow } from "@/lib/db/schema";

export interface ReportContext {
  doctorName: string;
  vitals: { systolic: number | null; diastolic: number | null; heartRate: number | null; tempF: number | null; spo2: number | null; weightLb: number | null } | null;
  /** Medications after this visit (from follow-through), or the chart's current list when none was recorded. */
  medications: { list: { med: Medication; change: "new" | "changed" | "stopped" | "continue" }[]; reconciled: boolean };
  allergies: string[];
  tasks: Task[] | null;
  overrides: SignoffOverride[];
  deferred: string[];
}

/** Live chart data shown around the narrative. Read at view/export time so it always matches the record. */
export async function loadReportContext(visit: VisitRow, patient: PatientRow): Promise<ReportContext> {
  const db = await getDb();
  const [doctor] = await db.select({ name: schema.doctors.name }).from(schema.doctors).where(eq(schema.doctors.id, visit.doctorId));
  const [vitals] = await db.select().from(schema.vitals)
    .where(and(eq(schema.vitals.patientId, patient.id), eq(schema.vitals.visitId, visit.id)))
    .orderBy(asc(schema.vitals.time)).limit(1);

  const ft = visit.followthrough;
  const key = (m: Medication) => m.name.toLowerCase();
  const fmt = (m: Medication) => `${m.dose} ${m.frequency}`.trim();
  let medications: ReportContext["medications"];
  if (ft?.currentMedications) {
    const before = new Map((ft.previousMedications ?? []).map((m) => [key(m), m]));
    const after = new Set(ft.currentMedications.map(key));
    medications = {
      reconciled: true,
      list: [
        ...ft.currentMedications.map((m) => {
          const old = before.get(key(m));
          return { med: m, change: !old ? ("new" as const) : fmt(old) !== fmt(m) ? ("changed" as const) : ("continue" as const) };
        }),
        ...(ft.previousMedications ?? []).filter((m) => !after.has(key(m))).map((m) => ({ med: m, change: "stopped" as const })),
      ],
    };
  } else {
    medications = { reconciled: false, list: patient.knownMedications.map((m) => ({ med: m, change: "continue" as const })) };
  }

  return {
    doctorName: doctor?.name ?? "",
    vitals: vitals
      ? { systolic: vitals.systolic, diastolic: vitals.diastolic, heartRate: vitals.heartRate, tempF: vitals.tempF, spo2: vitals.spo2, weightLb: vitals.weightLb }
      : null,
    medications,
    allergies: patient.knownAllergies,
    tasks: ft?.tasks ?? null,
    overrides: visit.signoffOverrides ?? [],
    deferred: (visit.gaps ?? []).filter((g) => g.resolution?.type === "deferred").map((g) => g.label),
  };
}
