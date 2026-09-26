import path from "node:path";
import { eq } from "drizzle-orm";
import { ApiError } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import type { PatientRow, VisitRow } from "@/lib/db/schema";
import type { VisitStatus } from "@/lib/contracts";

export const AUDIO_DIR = path.join(process.cwd(), "data", "audio");

export async function updateVisit(id: string, patch: Partial<typeof schema.visits.$inferInsert>) {
  const db = await getDb();
  const [row] = await db.update(schema.visits).set(patch).where(eq(schema.visits.id, id)).returning();
  return row;
}

/** Merges fields into visits.metrics (runtime bookkeeping) without clobbering the rest. */
export async function patchMetrics(visit: VisitRow, patch: NonNullable<VisitRow["metrics"]>) {
  return updateVisit(visit.id, { metrics: { ...(visit.metrics ?? {}), ...patch } });
}

export function assertStatus(visit: VisitRow, allowed: VisitStatus[], action: string) {
  if (!allowed.includes(visit.status)) {
    throw new ApiError(409, `Can't ${action} while the visit is ${visit.status}`);
  }
}

/** Client-facing visit payload (omits the raw word-level transcript). */
export function visitView(visit: VisitRow, patient: PatientRow) {
  const { transcript: _transcript, audioPath, ...rest } = visit;
  void _transcript;
  return {
    ...rest,
    hasAudio: Boolean(audioPath),
    patient: {
      id: patient.id,
      firstName: patient.firstName,
      lastName: patient.lastName,
      email: patient.email,
      preferredLanguage: patient.preferredLanguage,
      knownAllergies: patient.knownAllergies,
      knownMedications: patient.knownMedications,
    },
  };
}
export type VisitView = ReturnType<typeof visitView>;
