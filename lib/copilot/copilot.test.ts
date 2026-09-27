import { describe, expect, it } from "vitest";
import type { Candidate, CopilotState, CoverageItem, LiveCoverageResult, Suggestion } from "@/lib/contracts";
import type { OpenItemRow } from "@/lib/db/schema";
import { getTemplate } from "@/lib/templates";
import { initialCoverage, meterCounts, mergeCoverage } from "./coverage";
import { applyResolutions, dismissSuggestion, pickSuggestion, sourceOf } from "./gate";
import { timelineAt } from "./replay";
import { gapsCaughtLive, liveMarks } from "./review";
import { appendCommitted, shouldCheck, transcriptText, wordCount } from "./segments";

const openItems = [
  { id: "bmp", text: "Review basic metabolic panel (kidney function, potassium) after lisinopril start" },
] as OpenItemRow[];

function state(patch: Partial<CopilotState> = {}): CopilotState {
  return {
    version: 1, mode: "live", status: "listening", checks: 0, lastCheckSecond: 0, lastWordCount: 0,
    coverage: initialCoverage(getTemplate("htn_followup"), openItems), suggestions: [], realtimeSecondsReserved: 600,
    ...patch,
  };
}

const withStatus = (cov: CoverageItem[], itemId: string, patch: Partial<CoverageItem>) =>
  cov.map((c) => (c.itemId === itemId ? { ...c, ...patch } : c));

const cand = (patch: Partial<Candidate> = {}): Candidate => ({
  itemId: "adherence", question: "Have you missed any doses lately?", reason: "adherence not discussed",
  confidence: 0.9, aboutCurrentTopic: true, ...patch,
});

const shown = (patch: Partial<Suggestion> = {}): Suggestion => ({
  id: "q1", itemId: "adherence", label: "Adherence", source: "checklist", question: "Missed doses?", reason: "",
  confidence: 0.9, status: "shown", atSecond: 40, resolvedAtSecond: null, ...patch,
});

/** A state where "adherence" is missing, so it's promptable. */
const ready = (patch: Partial<CopilotState> = {}) => {
  const s = state(patch);
  return { ...s, coverage: withStatus(s.coverage, "adherence", { status: "missing" }) };
};

describe("segments", () => {
  it("appends committed text, skipping blanks and exact repeats", () => {
    let segs = appendCommitted([], "Hi Rosa.", 1.4);
    segs = appendCommitted(segs, "   ", 2);
    segs = appendCommitted(segs, "Hi Rosa.", 3);
    segs = appendCommitted(segs, "Any fever?", 9.6);
    expect(segs).toEqual([{ id: "s1", text: "Hi Rosa.", atSecond: 1 }, { id: "s2", text: "Any fever?", atSecond: 10 }]);
  });

  it("counts words including the partial, and renders a transcript", () => {
    const segs = appendCommitted([], "Any fever or chills?", 65);
    expect(wordCount(segs, "no fever")).toBe(6);
    expect(transcriptText(segs, "no fever")).toBe("[01:05] Any fever or chills?\n[now, still speaking] no fever");
    expect(transcriptText([])).toBe("(nothing said yet)");
  });

  it("checks only after the interval, enough new words, nothing in flight, under the cap", () => {
    const base = { elapsed: 45, lastCheckSecond: 20, words: 40, lastWordCount: 20, inFlight: false, checks: 1 };
    expect(shouldCheck(base)).toBe(true);
    expect(shouldCheck({ ...base, elapsed: 39 })).toBe(false);
    expect(shouldCheck({ ...base, words: 31 })).toBe(false);
    expect(shouldCheck({ ...base, inFlight: true })).toBe(false);
    expect(shouldCheck({ ...base, checks: 30 })).toBe(false);
  });
});

describe("coverage", () => {
  const items = (list: [string, LiveCoverageResult["items"][number]["status"], (boolean | null)?][]) =>
    list.map(([itemId, status, conditionMet = null]) => ({ itemId, status, conditionMet, evidenceQuote: `said ${itemId}` }));

  it("starts unknown with template + open items", () => {
    const cov = initialCoverage(getTemplate("htn_followup"), openItems);
    expect(cov.every((c) => c.status === "unknown")).toBe(true);
    expect(cov.find((c) => c.itemId === "open:bmp")).toMatchObject({ priority: "required", source: "open_item" });
  });

  it("only moves forward: covered sticks, partial never drops, missing never goes back to unknown", () => {
    let cov = state().coverage;
    cov = mergeCoverage(cov, items([["adherence", "covered"], ["side_effects", "partial"], ["exercise", "missing"]]), 30);
    cov = mergeCoverage(cov, items([["adherence", "missing"], ["side_effects", "missing"], ["exercise", "unknown"]]), 50);
    const by = new Map(cov.map((c) => [c.itemId, c]));
    expect(by.get("adherence")).toMatchObject({ status: "covered", evidenceQuote: "said adherence", updatedAtSecond: 30 });
    expect(by.get("side_effects")?.status).toBe("partial");
    expect(by.get("exercise")?.status).toBe("missing");
  });

  it("lets a conditioned item flip between not_applicable and missing, and ignores unknown ids", () => {
    let cov = mergeCoverage(state().coverage, items([["allergies_reviewed", "not_applicable", false], ["nope", "covered"]]), 30);
    expect(cov.find((c) => c.itemId === "allergies_reviewed")).toMatchObject({ status: "not_applicable", conditionMet: false });
    cov = mergeCoverage(cov, items([["allergies_reviewed", "missing", true]]), 120);
    expect(cov.find((c) => c.itemId === "allergies_reviewed")).toMatchObject({ status: "missing", conditionMet: true });
    expect(cov.some((c) => c.itemId === "nope")).toBe(false);
  });

  it("meter leaves out items that don't apply", () => {
    const cov = mergeCoverage(state().coverage, items([["adherence", "covered"], ["allergies_reviewed", "not_applicable", false]]), 30);
    expect(meterCounts(cov)).toEqual({ covered: 1, partial: 0, total: state().coverage.length - 1 });
  });
});

describe("pickSuggestion", () => {
  it("shows a confident candidate for a missing item", () => {
    const { suggestion } = pickSuggestion(ready(), [cand()], 70);
    expect(suggestion).toMatchObject({ id: "q1", itemId: "adherence", label: "Medication adherence asked", source: "checklist", status: "shown", atSecond: 70 });
  });

  it("stays quiet in the first 30 s, while a card shows, after 3 prompts, and within the cooldown", () => {
    expect(pickSuggestion(ready(), [cand()], 29).suggestion).toBeNull();
    expect(pickSuggestion(ready({ suggestions: [shown({ itemId: "side_effects" })] }), [cand()], 200).suggestion).toBeNull();
    const three = ["a", "b", "c"].map((id, i) => shown({ id, itemId: id, status: "dismissed", atSecond: i * 10 }));
    expect(pickSuggestion(ready({ suggestions: three }), [cand()], 300).rejected[0].why).toBe("prompt cap reached");
    const recent = [shown({ itemId: "side_effects", status: "captured", atSecond: 100 })];
    expect(pickSuggestion(ready({ suggestions: recent }), [cand()], 144).rejected[0].why).toBe("cooldown");
    expect(pickSuggestion(ready({ suggestions: recent }), [cand()], 145).suggestion?.itemId).toBe("adherence");
  });

  it("applies per-source confidence thresholds", () => {
    expect(pickSuggestion(ready(), [cand({ confidence: 0.7 })], 70).suggestion).toBeNull();
    expect(pickSuggestion(ready(), [cand({ itemId: null, question: "Any rash with the new pill?", confidence: 0.85 })], 70).suggestion).toBeNull();
    expect(pickSuggestion(ready(), [cand({ itemId: null, question: "Any rash with the new pill?", confidence: 0.92 })], 70).suggestion)
      .toMatchObject({ source: "clinical", itemId: null, label: null });
  });

  it("only prompts missing items, never twice, and never with long questions", () => {
    const s = ready();
    const partial = { ...s, coverage: withStatus(s.coverage, "adherence", { status: "partial" }) };
    expect(pickSuggestion(partial, [cand()], 70).rejected[0].why).toBe("item is partial");
    const before = ready({ suggestions: [shown({ status: "expired", atSecond: 0 })] });
    expect(pickSuggestion(before, [cand()], 200).rejected[0].why).toBe("item already prompted");
    const long = cand({ question: "Could you tell me whether you have been taking every single dose of your pills this month?" });
    expect(pickSuggestion(ready(), [long], 70).rejected[0].why).toBe("question too long");
    expect(pickSuggestion(ready(), [cand({ itemId: "made_up" })], 70).rejected[0].why).toBe("unknown item id");
    expect(pickSuggestion(ready(), [cand({ question: "Let's check a kidney panel." })], 70).rejected[0].why).toBe("not a question");
  });

  it("needs the condition met for conditioned items", () => {
    const s = state();
    const cov = withStatus(s.coverage, "allergies_reviewed", { status: "missing", conditionMet: false });
    const c = cand({ itemId: "allergies_reviewed", question: "Any drug allergies?" });
    expect(pickSuggestion({ ...s, coverage: cov }, [c], 130).rejected[0].why).toBe("condition not met");
    const met = withStatus(s.coverage, "allergies_reviewed", { status: "missing", conditionMet: true });
    expect(pickSuggestion({ ...s, coverage: met }, [c], 130).suggestion?.itemId).toBe("allergies_reviewed");
  });

  it("holds off-topic unconditioned items until 60 s", () => {
    expect(pickSuggestion(ready(), [cand({ aboutCurrentTopic: false })], 50).rejected[0].why).toBe("too early for an off-topic item");
    expect(pickSuggestion(ready(), [cand({ aboutCurrentTopic: false })], 61).suggestion).not.toBeNull();
  });

  it("ranks required, then open items, then recommended, then clinical", () => {
    const s = state();
    let cov = withStatus(s.coverage, "exercise", { status: "missing" });
    cov = withStatus(cov, "open:bmp", { status: "missing" });
    cov = withStatus(cov, "adherence", { status: "missing" });
    const cands = [
      cand({ itemId: null, question: "Any rash?", confidence: 0.99 }),
      cand({ itemId: "exercise", question: "Exercising?", confidence: 0.99 }),
      cand({ itemId: "open:bmp", question: "Kidney labs done?", confidence: 0.8 }),
      cand({ itemId: "adherence", question: "Missed doses?", confidence: 0.76 }),
    ];
    const first = pickSuggestion({ ...s, coverage: cov }, cands, 70);
    expect(first.suggestion?.itemId).toBe("adherence");
    expect(first.rejected).toHaveLength(3);
    expect(pickSuggestion({ ...s, coverage: cov }, cands.slice(0, 3), 70).suggestion?.source).toBe("open_item");
    expect(sourceOf("open:x")).toBe("open_item");
  });
});

describe("resolutions", () => {
  it("captures a shown or expired card once its item is covered", () => {
    const s = state({ suggestions: [shown(), shown({ id: "q2", itemId: "side_effects", status: "expired", atSecond: 0 })] });
    let cov = withStatus(s.coverage, "adherence", { status: "covered" });
    cov = withStatus(cov, "side_effects", { status: "covered" });
    const r = applyResolutions(s, cov, [], 60);
    expect(r.state.suggestions.map((x) => [x.status, x.resolvedAtSecond])).toEqual([["captured", 60], ["captured", 60]]);
    expect(r.transitions.map((t) => t.to)).toEqual(["captured", "captured"]);
  });

  it("captures an answered clinical question and expires stale cards", () => {
    const s = state({ suggestions: [shown({ itemId: null, source: "clinical" }), shown({ id: "q2", itemId: "exercise", atSecond: 10 })] });
    const r = applyResolutions(s, s.coverage, ["q1"], 100);
    expect(r.state.suggestions.map((x) => x.status)).toEqual(["captured", "expired"]);
  });

  it("dismisses once and leaves dismissed cards alone", () => {
    const s = state({ suggestions: [shown()] });
    const d = dismissSuggestion(s, "q1", 50);
    expect(d?.suggestion).toMatchObject({ status: "dismissed", resolvedAtSecond: 50 });
    expect(dismissSuggestion(d!.state, "q1", 55)).toBeNull();
    const cov = withStatus(s.coverage, "adherence", { status: "covered" });
    expect(applyResolutions(d!.state, cov, [], 60).state.suggestions[0].status).toBe("dismissed");
  });
});

describe("review + replay", () => {
  it("marks prompted items and counts caught gaps", () => {
    const s = state({ suggestions: [shown({ status: "captured" }), shown({ id: "q2", itemId: "exercise", status: "dismissed" }), shown({ id: "q3", itemId: null })] });
    expect([...liveMarks(s).keys()]).toEqual(["adherence", "exercise"]);
    expect(gapsCaughtLive(s)).toBe(1);
    expect(gapsCaughtLive(null)).toBe(0);
  });

  it("returns the latest saved result at or before a second", () => {
    const r = (n: number) => ({ items: [], candidates: [], resolvedSuggestionIds: [`r${n}`] });
    const timeline = [{ atSecond: 60, result: r(60) }, { atSecond: 20, result: r(20) }];
    expect(timelineAt(timeline, 10)).toBeNull();
    expect(timelineAt(timeline, 20)?.resolvedSuggestionIds).toEqual(["r20"]);
    expect(timelineAt(timeline, 90)?.resolvedSuggestionIds).toEqual(["r60"]);
  });
});
