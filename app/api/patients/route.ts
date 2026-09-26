import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { requireDoctorApi } from "@/lib/auth/current";
import { listPatients } from "@/lib/queries";

export const runtime = "nodejs";

export const GET = route(async () => {
  const session = await requireDoctorApi();
  return NextResponse.json(await listPatients(session.doctorId));
});
