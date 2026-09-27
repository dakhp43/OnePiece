import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { readJson, route } from "@/lib/api";
import { loadPatient } from "@/lib/access";
import { requireDoctorApi } from "@/lib/auth/current";
import { PatientPatchSchema, medsChanged, normalizePatientInput } from "@/lib/contracts";
import { getDb, schema } from "@/lib/db";
import { logEvent } from "@/lib/events";
import { getOpenItems, getVisitHistory, getVitals } from "@/lib/queries";

export const runtime = "nodejs";

export const GET = route(async (_req: Request, ctx: RouteContext<"/api/patients/[patientId]">) => {
  const { patientId } = await ctx.params;
  const session = await requireDoctorApi();
  const patient = await loadPatient(patientId, session.doctorId);
  const [openItems, vitals, visits] = await Promise.all([
    getOpenItems(patient.id), getVitals(patient.id), getVisitHistory(patient.id),
  ]);
  return NextResponse.json({ patient, openItems, vitals, visits });
});

/**
 * Edit patient details. Only the fields sent are changed. A medication change is logged like the one made
 * after a visit (before/after), with no visit attached.
 */
export const PATCH = route(async (req: Request, ctx: RouteContext<"/api/patients/[patientId]">) => {
  const { patientId } = await ctx.params;
  const session = await requireDoctorApi();
  const patient = await loadPatient(patientId, session.doctorId);
  const patch = await readJson(req, (v) => PatientPatchSchema.parse(normalizePatientInput(v)));
  const fields = Object.keys(patch);
  if (fields.length === 0) return NextResponse.json({ id: patient.id });

  const db = await getDb();
  await db.update(schema.patients).set(patch).where(eq(schema.patients.id, patient.id));
  if (patch.knownMedications && medsChanged(patient.knownMedications, patch.knownMedications)) {
    await logEvent("medications_updated", {
      visitId: null, doctorId: session.doctorId,
      payload: { patientId: patient.id, before: patient.knownMedications, after: patch.knownMedications },
    });
  }
  await logEvent("patient_updated", { doctorId: session.doctorId, payload: { patientId: patient.id, fields } });
  return NextResponse.json({ id: patient.id });
});
