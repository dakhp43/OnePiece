import { NextResponse } from "next/server";
import { readJson, route } from "@/lib/api";
import { requireDoctorApi } from "@/lib/auth/current";
import { PatientInputSchema, normalizePatientInput } from "@/lib/contracts";
import { getDb, schema } from "@/lib/db";
import { logEvent } from "@/lib/events";
import { listPatients } from "@/lib/queries";

export const runtime = "nodejs";

export const GET = route(async () => {
  const session = await requireDoctorApi();
  return NextResponse.json(await listPatients(session.doctorId));
});

/** Add patient: registers a new patient for the signed-in doctor (the doctor comes from the session, never the body). */
export const POST = route(async (req: Request) => {
  const session = await requireDoctorApi();
  const body = await readJson(req, (v) => PatientInputSchema.parse(normalizePatientInput(v)));
  const db = await getDb();
  const [patient] = await db.insert(schema.patients).values({ ...body, doctorId: session.doctorId }).returning({ id: schema.patients.id });
  await logEvent("patient_created", { doctorId: session.doctorId, payload: { patientId: patient.id } });
  return NextResponse.json({ id: patient.id }, { status: 201 });
});
