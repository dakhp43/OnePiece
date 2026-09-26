import type { PatientRow } from "@/lib/db/schema";
import { withTimeout } from "@/lib/http";
import { previsitBrief } from "@/lib/llm/prompts/previsitBrief";
import { backboardBrief, backboardEnabled } from "./backboard";
import { chartBrief, chartContextText, loadChartContext } from "./chart";

export interface Brief {
  bullets: string[];
  source: "backboard" | "gemini" | "chart";
}

const TTL_MS = 10 * 60_000;
const g = globalThis as unknown as { __briefCache?: Map<string, { at: number; brief: Brief }> };
const cache = (g.__briefCache ??= new Map());

/**
 * Pre-visit brief: Backboard memory → Gemini from the DB (Call F) → deterministic chart summary.
 * Cached per patient until the chart changes (new signed visit or open-item change) or 10 minutes pass.
 */
export async function getBrief(patient: PatientRow): Promise<Brief> {
  const ctx = await loadChartContext(patient);
  const key = `${patient.id}:${ctx.signed[0]?.id ?? "none"}:${ctx.openItems.map((o) => o.id).join(",")}`;
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
      brief = { bullets: await withTimeout("gemini:brief", previsitBrief(text), 20_000), source: "gemini" };
    } catch (err) {
      console.warn("[brief] gemini failed:", (err as Error).message);
    }
  }
  brief ??= { bullets: chartBrief(patient, ctx), source: "chart" };
  if (brief.source !== "chart") cache.set(key, { at: Date.now(), brief });
  return brief;
}
