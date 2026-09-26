import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, readJson, route } from "@/lib/api";
import { loadVisit } from "@/lib/access";
import { requireDoctorApi } from "@/lib/auth/current";
import { applyMedicationList, generateFollowThrough, generateSpanish, syncTaskOpenItems } from "@/lib/followthrough";
import { assertStatus, updateVisit, visitView } from "@/lib/visits";

export const runtime = "nodejs";
export const maxDuration = 120;

const g = globalThis as unknown as { __ftInflight?: Map<string, Promise<Response>> };
const inflight = (g.__ftInflight ??= new Map());

const Body = z.object({ action: z.enum(["generate", "regenerate", "translate"]).default("generate") });

/** Generates tasks + patient summary from the signed note (idempotent unless action=regenerate), or adds Spanish. */
export const POST = route(async (req: Request, ctx: RouteContext<"/api/visits/[visitId]/followthrough">) => {
  const { visitId } = await ctx.params;
  const session = await requireDoctorApi();
  const { action } = await readJson(req, Body.parse);
  // Collapse concurrent generate calls for the same visit (e.g. React dev double effects).
  const key = `${session.doctorId}:${visitId}:${action}`;
  const running = inflight.get(key);
  if (running) return (await running).clone();
  const p = run(visitId, session.doctorId, action);
  inflight.set(key, p);
  try {
    return (await p).clone();
  } finally {
    inflight.delete(key);
  }
});

async function run(visitId: string, doctorId: string, action: z.infer<typeof Body>["action"]) {
  const { visit, patient } = await loadVisit(visitId, doctorId);
  assertStatus(visit, ["signed", "sent"], "generate follow-through");

  let ft = visit.followthrough;
  const offline = [...(visit.metrics?.offlineSteps ?? [])];
  if (action === "translate") {
    if (!ft) throw new ApiError(409, "Generate the English summary first");
    const extra: string[] = [];
    ft = { ...ft, summaries: { ...ft.summaries, es: await generateSpanish(ft.summaries.en, extra) }, translationReviewed: false };
    offline.push(...extra);
  } else if (!ft || action === "regenerate") {
    const res = await generateFollowThrough(visit, patient);
    ft = res.ft;
    offline.push(...res.offline);
    await syncTaskOpenItems(visit, ft.tasks);
    await applyMedicationList(visit, ft, doctorId);
  }
  const saved = await updateVisit(visit.id, {
    followthrough: ft,
    metrics: { ...(visit.metrics ?? {}), offlineSteps: [...new Set(offline)] },
  });
  return NextResponse.json(visitView(saved, patient));
}
