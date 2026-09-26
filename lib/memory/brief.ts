import type { PatientRow } from "@/lib/db/schema";
import { chartBrief, loadChartContext } from "./chart";

export interface Brief {
  bullets: string[];
  source: "backboard" | "gemini" | "chart";
}

/** Pre-visit brief. Phase 7 adds Backboard memory and a Gemini fallback in front of the chart brief. */
export async function getBrief(patient: PatientRow): Promise<Brief> {
  const ctx = await loadChartContext(patient);
  return { bullets: chartBrief(patient, ctx), source: "chart" };
}
