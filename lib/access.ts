import { eq } from "drizzle-orm";
import { ApiError } from "@/lib/api";
import { getDb, schema } from "@/lib/db";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Loads a patient, enforcing that it belongs to the signed-in doctor (404 / 403). */
export async function loadPatient(patientId: string, doctorId: string) {
  if (!UUID.test(patientId)) throw new ApiError(404, "Patient not found");
  const db = await getDb();
  const [patient] = await db.select().from(schema.patients).where(eq(schema.patients.id, patientId));
  if (!patient) throw new ApiError(404, "Patient not found");
  if (patient.doctorId !== doctorId) throw new ApiError(403, "This patient is not assigned to you");
  return patient;
}

/** Loads a visit and its patient, enforcing doctor ownership. */
export async function loadVisit(visitId: string, doctorId: string) {
  if (!UUID.test(visitId)) throw new ApiError(404, "Visit not found");
  const db = await getDb();
  const [visit] = await db.select().from(schema.visits).where(eq(schema.visits.id, visitId));
  if (!visit) throw new ApiError(404, "Visit not found");
  if (visit.doctorId !== doctorId) throw new ApiError(403, "This visit is not yours");
  const patient = await loadPatient(visit.patientId, doctorId);
  return { visit, patient };
}
