import { NextResponse } from "next/server";
import { z } from "zod";
import { readJson, route } from "@/lib/api";
import { loadVisit } from "@/lib/access";
import { requireDoctorApi } from "@/lib/auth/current";
import { logEvent } from "@/lib/events";
import { assertStatus, updateVisit, visitView } from "@/lib/visits";

export const runtime = "nodejs";

type Ctx = RouteContext<"/api/visits/[visitId]">;

export const GET = route(async (_req: Request, ctx: Ctx) => {
  const { visitId } = await ctx.params;
  const session = await requireDoctorApi();
  const { visit, patient } = await loadVisit(visitId, session.doctorId);
  return NextResponse.json(visitView(visit, patient));
});

const Patch = z.object({ action: z.literal("start_recording") });

/** Status transitions that don't carry data. Currently: recording started. */
export const PATCH = route(async (req: Request, ctx: Ctx) => {
  const { visitId } = await ctx.params;
  const session = await requireDoctorApi();
  await readJson(req, Patch.parse);
  const { visit } = await loadVisit(visitId, session.doctorId);
  assertStatus(visit, ["created", "recording"], "start recording");
  await updateVisit(visit.id, { status: "recording", startedAt: new Date() });
  await logEvent("recording_started", { visitId: visit.id, doctorId: session.doctorId });
  return NextResponse.json({ ok: true });
});
