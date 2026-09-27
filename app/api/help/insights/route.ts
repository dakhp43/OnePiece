import { NextResponse } from "next/server";
import { ApiError, route } from "@/lib/api";
import { requireDoctorApi } from "@/lib/auth/current";
import { helpInsights, snowflakeEnabled } from "@/lib/llm/snowflake";
import { reserveSnowflakeCall } from "@/lib/usage";

export const runtime = "nodejs";

/** GET /api/help/insights — what staff asked the Help assistant this week, queried from Snowflake. */
export const GET = route(async () => {
  await requireDoctorApi();
  if (!snowflakeEnabled()) throw new ApiError(404, "Snowflake isn't configured");
  reserveSnowflakeCall("help insights");
  return NextResponse.json(await helpInsights(7));
});
