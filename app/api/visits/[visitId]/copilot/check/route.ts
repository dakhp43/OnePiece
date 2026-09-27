import { NextResponse } from "next/server";
import { readJson, route } from "@/lib/api";
import { loadVisit } from "@/lib/access";
import { requireDoctorApi } from "@/lib/auth/current";
import { CopilotCheckBodySchema, type CopilotState, type LiveCoverageResult } from "@/lib/contracts";
import { COPILOT } from "@/lib/copilot/config";
import { mergeCoverage } from "@/lib/copilot/coverage";
import { loadCopilotTimeline, saveTimelineEntry } from "@/lib/copilot/fixtures";
import { applyResolutions, pickSuggestion } from "@/lib/copilot/gate";
import { withCopilotLock } from "@/lib/copilot/lock";
import { timelineAt } from "@/lib/copilot/replay";
import { transcriptText, wordCount } from "@/lib/copilot/segments";
import { logSuggestion, logTransitions, requireCopilot } from "@/lib/copilot/server";
import { demoFallbackEnabled } from "@/lib/fixtures";
import { withTimeout } from "@/lib/http";
import { liveCoverage } from "@/lib/llm/prompts/liveCoverage";
import { chartContextText, loadChartContext } from "@/lib/memory/chart";
import { assertStatus, updateVisit } from "@/lib/visits";

export const runtime = "nodejs";

// One check per visit at a time; a second request while one runs is skipped, not queued.
const g = globalThis as unknown as { __copilotInflight?: Set<string> };
const inflight = (g.__copilotInflight ??= new Set());

/**
 * One live check: the transcript so far goes to Gemini for checklist coverage and candidate questions,
 * then the deterministic gate (lib/copilot/gate.ts) decides whether any card is shown. Returns the new state.
 */
export const POST = route(async (req: Request, ctx: RouteContext<"/api/visits/[visitId]/copilot/check">) => {
  const { visitId } = await ctx.params;
  const session = await requireDoctorApi();
  const body = await readJson(req, CopilotCheckBodySchema.parse);
  const { visit, patient } = await loadVisit(visitId, session.doctorId);
  assertStatus(visit, ["created", "recording"], "run a live copilot check");
  const current = requireCopilot(visit);
  if (inflight.has(visitId)) return NextResponse.json({ copilot: current, skipped: "busy" });
  if (current.checks >= COPILOT.MAX_CHECKS_PER_VISIT) return NextResponse.json({ copilot: current, skipped: "limit" });

  inflight.add(visitId);
  try {
    const elapsed = body.elapsedSeconds;
    let result: LiveCoverageResult | null = null;
    let skipped: "offline" | undefined;
    try {
      const chartText = chartContextText(patient, await loadChartContext(patient));
      result = await withTimeout(
        "gemini:copilot",
        liveCoverage({ state: current, chartText, transcript: transcriptText(body.segments, body.partial), elapsedSeconds: elapsed }),
        COPILOT.CHECK_TIMEOUT_MS,
      );
      saveTimelineEntry(visitId, elapsed, result);
    } catch (err) {
      console.warn(`[copilot] check failed at ${Math.round(elapsed)} s: ${(err as Error).message}`);
      const timeline = body.mode === "replay" && demoFallbackEnabled() ? loadCopilotTimeline() : null;
      result = timeline ? timelineAt(timeline, elapsed) : null;
      if (!result) skipped = "offline";
    }

    // Re-read under the lock: the doctor may have dismissed a card while Gemini was thinking.
    const copilot = await withCopilotLock(visitId, async () => {
      const { visit: fresh } = await loadVisit(visitId, session.doctorId);
      const base = requireCopilot(fresh);
      const coverage = result ? mergeCoverage(base.coverage, result.items, elapsed) : base.coverage;
      const { state, transitions } = applyResolutions(base, coverage, result?.resolvedSuggestionIds ?? [], elapsed);
      const pick = result ? pickSuggestion(state, result.candidates, elapsed) : { suggestion: null, rejected: [] };
      if (pick.rejected.length) console.log(`[copilot] ${Math.round(elapsed)} s held back:`, pick.rejected);
      const next: CopilotState = {
        ...state,
        suggestions: pick.suggestion ? [...state.suggestions, pick.suggestion] : state.suggestions,
        checks: base.checks + 1,
        lastCheckSecond: Math.round(elapsed),
        lastWordCount: wordCount(body.segments, body.partial),
      };
      await updateVisit(visitId, { copilot: next });
      await logTransitions(visitId, session.doctorId, transitions);
      if (pick.suggestion) await logSuggestion(visitId, session.doctorId, pick.suggestion);
      return next;
    });
    return NextResponse.json({ copilot, ...(skipped ? { skipped } : {}) });
  } finally {
    inflight.delete(visitId);
  }
});
