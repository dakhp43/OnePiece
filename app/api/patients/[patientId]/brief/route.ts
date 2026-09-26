import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { loadPatient } from "@/lib/access";
import { requireDoctorApi } from "@/lib/auth/current";
import { getBrief } from "@/lib/memory/brief";

export const runtime = "nodejs";

export const GET = route(async (_req: Request, ctx: RouteContext<"/api/patients/[patientId]/brief">) => {
  const { patientId } = await ctx.params;
  const session = await requireDoctorApi();
  const patient = await loadPatient(patientId, session.doctorId);
  return NextResponse.json(await getBrief(patient));
});
