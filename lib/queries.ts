import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

export async function listPatients(doctorId: string) {
  const db = await getDb();
  const patients = await db.select().from(schema.patients)
    .where(eq(schema.patients.doctorId, doctorId))
    .orderBy(asc(schema.patients.lastName));
  if (patients.length === 0) return [];
  const ids = patients.map((p) => p.id);

  const visits = await db.select({
    patientId: schema.visits.patientId, visitType: schema.visits.visitType,
    signedAt: schema.visits.signedAt, startedAt: schema.visits.startedAt,
  }).from(schema.visits)
    .where(and(inArray(schema.visits.patientId, ids), inArray(schema.visits.status, ["signed", "sent"])))
    .orderBy(desc(schema.visits.startedAt));

  const counts = await db.select({ patientId: schema.openItems.patientId, n: sql<number>`count(*)::int` })
    .from(schema.openItems)
    .where(and(inArray(schema.openItems.patientId, ids), eq(schema.openItems.status, "open")))
    .groupBy(schema.openItems.patientId);

  return patients.map((p) => {
    const last = visits.find((v) => v.patientId === p.id);
    return {
      ...p,
      lastVisitType: last?.visitType ?? null,
      lastVisitDate: last?.startedAt ?? null,
      openItemCount: counts.find((c) => c.patientId === p.id)?.n ?? 0,
    };
  });
}

export async function getOpenItems(patientId: string) {
  const db = await getDb();
  return db.select().from(schema.openItems)
    .where(and(eq(schema.openItems.patientId, patientId), eq(schema.openItems.status, "open")))
    .orderBy(asc(schema.openItems.createdAt));
}

export async function getVitals(patientId: string) {
  const db = await getDb();
  return db.select().from(schema.vitals)
    .where(eq(schema.vitals.patientId, patientId))
    .orderBy(asc(schema.vitals.time));
}

export async function getVisitHistory(patientId: string) {
  const db = await getDb();
  return db.select({
    id: schema.visits.id, visitType: schema.visits.visitType, status: schema.visits.status,
    startedAt: schema.visits.startedAt, signedAt: schema.visits.signedAt, note: schema.visits.note,
  }).from(schema.visits)
    .where(eq(schema.visits.patientId, patientId))
    .orderBy(desc(schema.visits.startedAt));
}
