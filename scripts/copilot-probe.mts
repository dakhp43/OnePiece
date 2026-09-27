// Dry run of the live copilot on the scripted demo conversation (data/fixtures/copilot/script.lines.json):
// real prompt + real gate, estimated speaking times, no audio and no database writes.
// Costs about 9 Gemini calls on COPILOT_MODEL. Usage: npm run copilot:probe
import "./load-env";
import fs from "node:fs";
import { and, eq } from "drizzle-orm";
import type { CopilotState, LiveSegment } from "@/lib/contracts";
const { getDb, schema } = await import("@/lib/db");
const { mergeThreads, openThreads } = await import("@/lib/copilot/threads");
const { applyResolutions, pickSuggestion } = await import("@/lib/copilot/gate");
const { appendCommitted, shouldCheck, transcriptText, wordCount } = await import("@/lib/copilot/segments");
const { liveFollowUp } = await import("@/lib/llm/prompts/liveFollowUp");
const db = await getDb();
const [rosa] = await db.select().from(schema.patients).where(and(eq(schema.patients.firstName, "Rosa"), eq(schema.patients.lastName, "Martinez")));
if (!rosa) throw new Error("Rosa Martinez not found");
const lines: [string, string][] = JSON.parse(fs.readFileSync("data/fixtures/copilot/script.lines.json", "utf8"));
let t = 0.4;
const timed = lines.map(([who, text]) => { t += text.split(/\s+/).length / 2.6; const end = t; t += 0.55; return { who, text, end }; });
let state: CopilotState = { version: 2, mode: "replay", status: "listening", checks: 0, lastCheckSecond: 0, lastWordCount: 0,
  threads: [], suggestions: [], realtimeSecondsReserved: 600 };
for (let now = 5; now <= t + 10; now += 5) {
  let segs: LiveSegment[] = [];
  for (const l of timed) if (l.end <= now) segs = appendCommitted(segs, l.text, l.end);
  const words = wordCount(segs);
  if (!shouldCheck({ elapsed: now, lastCheckSecond: state.lastCheckSecond, words, lastWordCount: state.lastWordCount, inFlight: false, checks: state.checks })) continue;
  const t0 = Date.now();
  const r = await liveFollowUp({ state, patient: rosa, visitTypeLabel: "Hypertension follow-up", transcript: transcriptText(segs), elapsedSeconds: now });
  const ms = Date.now() - t0;
  const merged = mergeThreads(state.threads, r.threads, now);
  const { state: s2, transitions } = applyResolutions(state, merged, r.resolvedSuggestionIds, now);
  const pick = pickSuggestion(s2, r.candidates, now);
  state = { ...s2, suggestions: pick.suggestion ? [...s2.suggestions, pick.suggestion] : s2.suggestions, checks: state.checks + 1, lastCheckSecond: now, lastWordCount: words };
  const last = segs.at(-1)?.text.slice(0, 50);
  const open = openThreads(state.threads).map((th) => `${th.topic} [${th.missing.join(", ")}?]`).join(" | ") || "-";
  console.log(`
@${now}s (${ms} ms) | last: "${last}" | open: ${open}`);
  for (const tr of transitions) console.log(`   → ${tr.suggestion.id} ${tr.to}`);
  if (pick.suggestion) console.log(`   ★ SHOW [${pick.suggestion.topic}] "${pick.suggestion.question}" (${pick.suggestion.confidence})`);
  for (const rj of pick.rejected) console.log(`   · held: "${rj.question}" — ${rj.why}`);
}
console.log("\nfinal:", state.suggestions.map((s) => `${s.id} ${s.topic} ${s.status} @${s.atSecond}→${s.resolvedAtSecond}`));
process.exit(0);
