// Dry run of the live copilot on the scripted demo conversation (data/fixtures/copilot/script.lines.json):
// real prompt + real gate, estimated speaking times, no audio and no database writes.
// Costs about 9 Gemini calls on COPILOT_MODEL. Usage: npm run copilot:probe
import "./load-env";
import fs from "node:fs";
import { and, eq } from "drizzle-orm";
import type { CopilotState, LiveSegment } from "@/lib/contracts";
const { getDb, schema } = await import("@/lib/db");
const { getOpenItems } = await import("@/lib/queries");
const { getTemplate } = await import("@/lib/templates");
const { initialCoverage, mergeCoverage, meterCounts } = await import("@/lib/copilot/coverage");
const { applyResolutions, pickSuggestion } = await import("@/lib/copilot/gate");
const { appendCommitted, shouldCheck, transcriptText, wordCount } = await import("@/lib/copilot/segments");
const { liveCoverage } = await import("@/lib/llm/prompts/liveCoverage");
const { chartContextText, loadChartContext } = await import("@/lib/memory/chart");
const db = await getDb();
const [rosa] = await db.select().from(schema.patients).where(and(eq(schema.patients.firstName, "Rosa"), eq(schema.patients.lastName, "Martinez")));
if (!rosa) throw new Error("Rosa Martinez not found");
const chartText = chartContextText(rosa, await loadChartContext(rosa));
const lines: [string, string][] = JSON.parse(fs.readFileSync("data/fixtures/copilot/script.lines.json", "utf8"));
let t = 0.4;
const timed = lines.map(([who, text]) => { t += text.split(/\s+/).length / 2.6; const end = t; t += 0.55; return { who, text, end }; });
let state: CopilotState = { version: 1, mode: "replay", status: "listening", checks: 0, lastCheckSecond: 0, lastWordCount: 0,
  coverage: initialCoverage(getTemplate("htn_followup"), await getOpenItems(rosa.id)), suggestions: [], realtimeSecondsReserved: 600 };
for (let now = 5; now <= t + 10; now += 5) {
  let segs: LiveSegment[] = [];
  for (const l of timed) if (l.end <= now) segs = appendCommitted(segs, l.text, l.end);
  const words = wordCount(segs);
  if (!shouldCheck({ elapsed: now, lastCheckSecond: state.lastCheckSecond, words, lastWordCount: state.lastWordCount, inFlight: false, checks: state.checks })) continue;
  const t0 = Date.now();
  const r = await liveCoverage({ state, chartText, transcript: transcriptText(segs), elapsedSeconds: now });
  const ms = Date.now() - t0;
  const merged = mergeCoverage(state.coverage, r.items, now);
  const { state: s2, transitions } = applyResolutions(state, merged, r.resolvedSuggestionIds, now);
  const pick = pickSuggestion(s2, r.candidates, now);
  state = { ...s2, suggestions: pick.suggestion ? [...s2.suggestions, pick.suggestion] : s2.suggestions, checks: state.checks + 1, lastCheckSecond: now, lastWordCount: words };
  const m = meterCounts(state.coverage);
  const last = segs.at(-1)?.text.slice(0, 50);
  console.log(`\n@${now}s (${ms} ms) meter ${m.covered}/${m.total} | last: "${last}" | missing: ${state.coverage.filter((c) => c.status === "missing").map((c) => c.itemId.slice(0, 14)).join(", ") || "-"}`);
  for (const tr of transitions) console.log(`   → ${tr.suggestion.id} ${tr.to}`);
  if (pick.suggestion) console.log(`   ★ SHOW [${pick.suggestion.source}:${pick.suggestion.itemId?.slice(0, 14)}] "${pick.suggestion.question}" (${pick.suggestion.confidence})`);
  for (const rj of pick.rejected) console.log(`   · held: "${rj.question}" — ${rj.why}`);
}
console.log("\nfinal:", state.suggestions.map((s) => `${s.id} ${s.itemId?.slice(0, 14)} ${s.status} @${s.atSecond}→${s.resolvedAtSecond}`));
process.exit(0);
