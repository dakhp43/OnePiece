import type { PatientRow } from "@/lib/db/schema";
import { withTimeout } from "@/lib/http";
import { previsitBrief } from "@/lib/llm/prompts/previsitBrief";
import { backboardBrief, backboardEnabled } from "./backboard";
import { chartBrief, chartContextText, loadChartContext } from "./chart";

export interface Brief {
  bullets: string[];
  source: "backboard" | "gemini" | "chart";
}

// The key changes whenever the chart does, so a long TTL only saves repeat Gemini calls.
const TTL_MS = 12 * 60 * 60_000;
const g = globalThis as unknown as { __briefCache?: Map<string, { at: number; brief: Brief }> };
const cache = (g.__briefCache ??= new Map());

/** Short, stable fingerprint of the medications and allergies on file, so an edit changes the cache key. */
function chartFingerprint(patient: PatientRow) {
  const text = JSON.stringify([patient.knownMedications, patient.knownAllergies]);
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * Pre-visit brief: Backboard memory → Gemini from the DB (Call F) → deterministic chart summary.
 * Cached per patient until the chart changes (new signed visit, open items, or edited medications/allergies)
 * or 12 hours pass. A new patient with no history gets the chart summary straight away: there is nothing
 * for an AI to summarize, so no Backboard assistant is created and no call is made.
 */
export async function getBrief(patient: PatientRow): Promise<Brief> {
  const ctx = await loadChartContext(patient);
  if (ctx.signed.length === 0 && ctx.openItems.length === 0 && ctx.vitals.length === 0) {
    return { bullets: chartBrief(patient, ctx), source: "chart" };
  }
  const key = `${patient.id}:${ctx.signed[0]?.id ?? "none"}:${ctx.openItems.map((o) => o.id).join(",")}:${chartFingerprint(patient)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.brief;

  const text = chartContextText(patient, ctx);
  let brief: Brief | null = null;
  if (backboardEnabled()) {
    try {
      brief = { bullets: await backboardBrief(patient, text), source: "backboard" };
    } catch (err) {
      console.warn("[brief] backboard failed:", (err as Error).message);
    }
  }
  if (!brief && process.env.GEMINI_API_KEY) {
    try {
      brief = { bullets: await withTimeout("gemini:brief", previsitBrief(text), 12_000), source: "gemini" };
    } catch (err) {
      console.warn("[brief] gemini failed:", (err as Error).message);
    }
  }
  brief ??= { bullets: chartBrief(patient, ctx), source: "chart" };
  if (brief.source !== "chart") cache.set(key, { at: Date.now(), brief });
  return brief;
}
