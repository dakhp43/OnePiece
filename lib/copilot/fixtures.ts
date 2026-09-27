import fs from "node:fs";
import path from "node:path";
import { CopilotTimelineSchema, type CopilotTimeline, type LiveCheckResult } from "@/lib/contracts";
import { FIXTURES_DIR, LAST_GOOD_DIR } from "@/lib/fixtures";

export const COPILOT_DIR = path.join(FIXTURES_DIR, "copilot");
const LAST_GOOD = path.join(LAST_GOOD_DIR, "copilot_timeline.json");

/**
 * Keeps every good live check of the current visit, so one good demo run can be promoted to
 * data/fixtures/copilot/timeline.json (the Gemini-offline fallback for the scripted replay).
 */
export function saveTimelineEntry(visitId: string, atSecond: number, result: LiveCheckResult) {
  try {
    let saved: { visitId: string; timeline: CopilotTimeline } = { visitId, timeline: [] };
    if (fs.existsSync(LAST_GOOD)) {
      const prev = JSON.parse(fs.readFileSync(LAST_GOOD, "utf8"));
      if (prev?.visitId === visitId) saved = prev;
    }
    saved.timeline.push({ atSecond: Math.round(atSecond), result });
    fs.mkdirSync(LAST_GOOD_DIR, { recursive: true });
    fs.writeFileSync(LAST_GOOD, JSON.stringify(saved, null, 2));
  } catch (err) {
    console.warn("[copilot] could not save timeline entry", (err as Error).message);
  }
}

/** The committed replay timeline, or null if it hasn't been promoted yet (or doesn't validate). */
export function loadCopilotTimeline(): CopilotTimeline | null {
  const file = path.join(COPILOT_DIR, "timeline.json");
  if (!fs.existsSync(file)) return null;
  const parsed = CopilotTimelineSchema.safeParse(JSON.parse(fs.readFileSync(file, "utf8")));
  return parsed.success ? parsed.data : null;
}
