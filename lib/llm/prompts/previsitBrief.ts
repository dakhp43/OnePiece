import { z } from "zod";
import { generateJson } from "@/lib/llm/gemini";

const SYSTEM = `You prepare a pre-visit brief for a primary-care doctor from a synthetic patient's chart.
In at most 5 short bullets, list what the doctor should know before today's visit: active problems,
current medications and recent changes, outstanding items, and trends (e.g. blood pressure).
Use only facts in the chart. Each bullet is one sentence, 25 words or fewer.`;

const BriefSchema = z.object({ bullets: z.array(z.string()).min(1).max(5) });

/** Call F: brief from the database when Backboard is disabled or unavailable. */
export async function previsitBrief(chartText: string): Promise<string[]> {
  const res = await generateJson({ schema: BriefSchema, system: SYSTEM, user: `CHART\n${chartText}`, label: "gemini:brief" });
  return res.bullets;
}
