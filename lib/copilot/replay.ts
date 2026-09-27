import type { CopilotTimeline, LiveCoverageResult } from "@/lib/contracts";

/** The latest saved model result at or before `elapsed`, standing in for Gemini during an offline replay. */
export function timelineAt(timeline: CopilotTimeline, elapsed: number): LiveCoverageResult | null {
  let hit: LiveCoverageResult | null = null;
  for (const t of [...timeline].sort((a, b) => a.atSecond - b.atSecond)) {
    if (t.atSecond > elapsed) break;
    hit = t.result;
  }
  return hit;
}
