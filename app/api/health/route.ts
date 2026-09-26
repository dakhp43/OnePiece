import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { requireDoctorApi } from "@/lib/auth/current";
import { checkHealth } from "@/lib/health";

export const runtime = "nodejs";

/** GET /api/health[?fresh=1] — readiness of DB and every external service. No billable calls. */
export const GET = route(async (req: Request) => {
  await requireDoctorApi();
  const fresh = new URL(req.url).searchParams.get("fresh") === "1";
  return NextResponse.json(await checkHealth({ fresh }));
});
