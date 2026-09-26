import { NextResponse } from "next/server";
import { z } from "zod";
import { readJson, route } from "@/lib/api";
import { loadPatient } from "@/lib/access";
import { requireDoctorApi } from "@/lib/auth/current";
import { VisitTypeSchema, VitalsInputSchema } from "@/lib/contracts";
import { getDb, schema } from "@/lib/db";

export const runtime = "nodejs";

const Body = z.object({
  patientId: z.string(),
  visitType: VisitTypeSchema,
  vitals: VitalsInputSchema.optional(),
});

export const POST = route(async (req: Request) => {
  const session = await requireDoctorApi();
  const body = await readJson(req, Body.parse);
  const patient = await loadPatient(body.patientId, session.doctorId);
  const vitals = body.vitals && Object.keys(body.vitals).length ? body.vitals : undefined;
  const db = await getDb();
  const [visit] = await db.insert(schema.visits).values({
    patientId: patient.id,
    doctorId: session.doctorId,
    visitType: body.visitType,
    status: "created",
    metrics: vitals ? { vitals } : {},
  }).returning();
  return NextResponse.json({ id: visit.id }, { status: 201 });
});
