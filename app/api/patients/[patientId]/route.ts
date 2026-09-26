import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { loadPatient } from "@/lib/access";
import { requireDoctorApi } from "@/lib/auth/current";
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
