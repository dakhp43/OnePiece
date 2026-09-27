import { route } from "@/lib/api";
import { requireDoctorApi } from "@/lib/auth/current";
import { snowflakeEnabled, warmWarehouse } from "@/lib/llm/snowflake";
import { reserveSnowflakeCall } from "@/lib/usage";

export const runtime = "nodejs";

/** POST /api/help/warm — sent when the Help panel opens, so the Snowflake warehouse is awake before the first question. */
export const POST = route(async () => {
  await requireDoctorApi();
  if (snowflakeEnabled()) {
    try {
      reserveSnowflakeCall("help warm-up");
      await warmWarehouse();
    } catch (err) {
      console.warn("[help] warm-up failed:", (err as Error).message);
    }
  }
  return new Response(null, { status: 204 });
});
