import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, readJson, route } from "@/lib/api";
import { loadVisit } from "@/lib/access";
import { requireDoctorApi } from "@/lib/auth/current";
import type { CopilotState } from "@/lib/contracts";
import { initialCoverage } from "@/lib/copilot/coverage";
import { withCopilotLock } from "@/lib/copilot/lock";
import { copilotEnabled } from "@/lib/copilot/server";
import { getOpenItems } from "@/lib/queries";
import { getClient } from "@/lib/stt/elevenlabs";
import { getTemplate } from "@/lib/templates";
import { LIMITS, reserveRealtime, settleRealtime } from "@/lib/usage";
import { assertStatus, updateVisit } from "@/lib/visits";

export const runtime = "nodejs";

const Body = z.object({ mode: z.enum(["live", "replay"]).default("live") });

/**
 * Starts the live copilot for a recording: reserves realtime audio against the daily cap, mints a
 * 15-minute single-use Scribe Realtime token (the browser streams with it, never seeing the API key),
 * and resets the visit's copilot state to "nothing heard yet".
 */
export const POST = route(async (req: Request, ctx: RouteContext<"/api/visits/[visitId]/copilot/token">) => {
  const { visitId } = await ctx.params;
  const session = await requireDoctorApi();
  const { mode } = await readJson(req, Body.parse);
  if (!copilotEnabled()) throw new ApiError(503, "Live copilot is turned off");
  const { visit, patient } = await loadVisit(visitId, session.doctorId);
  assertStatus(visit, ["created", "recording"], "start the live copilot");

  const seconds = LIMITS.maxRecordingSeconds();
  reserveRealtime(seconds);
  let token: string;
  try {
    ({ token } = await getClient().tokens.singleUse.create("realtime_scribe"));
  } catch (err) {
    settleRealtime(seconds, 0);
    throw err;
  }

  const template = getTemplate(visit.visitType);
  const copilot: CopilotState = {
    version: 1, mode, status: "listening", checks: 0, lastCheckSecond: 0, lastWordCount: 0,
    coverage: initialCoverage(template, await getOpenItems(patient.id)),
    suggestions: [], realtimeSecondsReserved: seconds,
  };
  await withCopilotLock(visitId, () => updateVisit(visitId, { copilot }));

  // Keyterms cost extra on ElevenLabs, so they follow the same switch as batch transcription.
  const keyterms = process.env.USE_KEYTERMS === "true"
    ? [...new Set([...template.keyterms, ...patient.knownMedications.map((m) => m.name)])].slice(0, 50)
    : [];
  return NextResponse.json({ token, keyterms, maxSeconds: seconds, copilot });
});
