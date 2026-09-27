import { describe, expect, it } from "vitest";
import type { Candidate, CopilotState, Suggestion, Thread } from "@/lib/contracts";
import { applyResolutions, dismissSuggestion, pickSuggestion } from "./gate";
import { timelineAt } from "./replay";
import { appendCommitted, shouldCheck, transcriptText, wordCount } from "./segments";
import { findThread, mergeThreads, openThreads } from "./threads";

const cough: Thread = { id: "t1", topic: "Cough", known: ["3 weeks", "worse at night"], missing: ["fever"], updatedAtSecond: 20 };
const losartan: Thread = { id: "t2", topic: "New losartan", known: ["50 mg daily"], missing: ["drug allergies"], updatedAtSecond: 90 };

function state(patch: Partial<CopilotState> = {}): CopilotState {
  return {
    version: 2, mode: "live", status: "listening", checks: 0, lastCheckSecond: 0, lastWordCount: 0,
    threads: [cough, losartan], suggestions: [], realtimeSecondsReserved: 600, ...patch,
  };
}

const cand = (patch: Partial<Candidate> = {}): Candidate => ({
  thread: "t1", question: "Have you had any fever with the cough?", reason: "fever not asked", confidence: 0.9, ...patch,
});

const shown = (patch: Partial<Suggestion> = {}): Suggestion => ({
  id: "q1", threadId: "t1", topic: "Cough", question: "Any fever?", reason: "", confidence: 0.9,
  status: "shown", atSecond: 40, resolvedAtSecond: null, ...patch,
});

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

describe("threads", () => {
  it("adds new topics with fresh ids and keeps known ids", () => {
    const next = mergeThreads([cough], [
      { id: "t1", topic: "Cough", known: ["3 weeks", "worse at night", "no fever"], missing: [] },
      { id: null, topic: "Dizziness", known: [], missing: ["when it happens"] },
    ], 60);
    expect(next.map((t) => [t.id, t.topic, t.missing, t.updatedAtSecond])).toEqual([
      ["t1", "Cough", [], 60],
      ["t2", "Dizziness", ["when it happens"], 60],
    ]);
  });

  it("matches a topic by name when the model forgets its id, and keeps topics it left out", () => {
    const next = mergeThreads([cough, losartan], [{ id: null, topic: "cough", known: ["3 weeks"], missing: ["fever"] }], 70);
    expect(next).toHaveLength(2);
    expect(next[0]).toMatchObject({ id: "t1", known: ["3 weeks"], updatedAtSecond: 70 });
    expect(next[1]).toBe(losartan);
  });

  it("dedupes facts, drops a missing detail that is now known, and leaves unchanged topics alone", () => {
    const next = mergeThreads([cough], [{ id: "t1", topic: "Cough", known: ["3 weeks", "3 weeks ", "fever"], missing: ["fever", ""] }], 80);
    expect(next[0]).toMatchObject({ known: ["3 weeks", "fever"], missing: [] });
    expect(mergeThreads([cough], [{ id: "t1", topic: "Cough", known: cough.known, missing: cough.missing }], 99)[0]).toBe(cough);
  });

  it("lists only half-answered topics, newest first, and finds topics by id or name", () => {
    const done: Thread = { ...cough, id: "t3", topic: "Salt", missing: [] };
    expect(openThreads([cough, losartan, done]).map((t) => t.id)).toEqual(["t2", "t1"]);
    expect(findThread([cough, losartan], "New Losartan")?.id).toBe("t2");
    expect(findThread([cough], "t9")).toBeUndefined();
  });
});

describe("pickSuggestion", () => {
  it("shows a confident follow-up for a half-answered topic", () => {
    const { suggestion } = pickSuggestion(state(), [cand()], 70);
    expect(suggestion).toMatchObject({ id: "q1", threadId: "t1", topic: "Cough", status: "shown", atSecond: 70 });
  });

  it("stays quiet in the first 30 s, while a card shows, after 3 prompts, and within the cooldown", () => {
    expect(pickSuggestion(state(), [cand()], 29).suggestion).toBeNull();
    expect(pickSuggestion(state({ suggestions: [shown({ threadId: "t2" })] }), [cand()], 200).suggestion).toBeNull();
    const three = ["a", "b", "c"].map((id, i) => shown({ id, threadId: id, question: id, status: "dismissed", atSecond: i * 10 }));
    expect(pickSuggestion(state({ suggestions: three }), [cand()], 300).rejected[0].why).toBe("prompt cap reached");
    const recent = [shown({ threadId: "t2", question: "Allergies?", status: "captured", atSecond: 100 })];
    expect(pickSuggestion(state({ suggestions: recent }), [cand()], 144).rejected[0].why).toBe("cooldown");
    expect(pickSuggestion(state({ suggestions: recent }), [cand()], 145).suggestion?.threadId).toBe("t1");
  });

  it("rejects low confidence, statements, long questions and repeats", () => {
    const why = (c: Candidate, s = state()) => pickSuggestion(s, [c], 70).rejected[0]?.why;
    expect(why(cand({ confidence: 0.7 }))).toBe("confidence 0.7 below 0.8");
    expect(why(cand({ question: "Let's check for fever." }))).toBe("not a question");
    expect(why(cand({ question: "Could you tell me whether you have noticed any fever or chills at all in the evenings lately?" }))).toBe("question too long");
    const asked = state({ suggestions: [shown({ threadId: "t2", question: "Have you had any fever with the cough?", status: "dismissed", atSecond: 0 })] });
    expect(why(cand(), asked)).toBe("same question already asked");
  });

  it("needs a known, still-open topic that wasn't prompted before", () => {
    const why = (c: Candidate, s = state()) => pickSuggestion(s, [c], 70).rejected[0]?.why;
    expect(why(cand({ thread: "t9" }))).toBe("unknown topic");
    expect(why(cand(), state({ threads: [{ ...cough, missing: [] }] }))).toBe("topic already complete");
    expect(why(cand(), state({ suggestions: [shown({ question: "Other?", status: "expired", atSecond: 0 })] }))).toBe("topic already prompted");
    expect(pickSuggestion(state(), [cand({ thread: "cough" })], 70).suggestion?.threadId).toBe("t1");
  });

  it("picks the most confident of several", () => {
    const r = pickSuggestion(state(), [cand({ confidence: 0.82 }), cand({ thread: "t2", question: "Any drug allergies?", confidence: 0.95 })], 120);
    expect(r.suggestion?.threadId).toBe("t2");
    expect(r.rejected).toEqual([{ question: "Have you had any fever with the cough?", why: "lower confidence than the chosen card" }]);
  });
});

describe("resolutions", () => {
  it("captures a card when its topic is complete or the model says it was answered, even after expiry", () => {
    const s = state({ suggestions: [shown(), shown({ id: "q2", threadId: "t2", status: "expired", atSecond: 0 })] });
    const threads = [{ ...cough, missing: [] }, losartan];
    const r = applyResolutions(s, threads, ["q2"], 60);
    expect(r.state.suggestions.map((x) => [x.status, x.resolvedAtSecond])).toEqual([["captured", 60], ["captured", 60]]);
    expect(r.transitions.map((t) => t.to)).toEqual(["captured", "captured"]);
    expect(r.state.threads).toBe(threads);
  });

  it("expires unanswered cards after 90 s", () => {
    const s = state({ suggestions: [shown({ atSecond: 10 })] });
    expect(applyResolutions(s, s.threads, [], 99).state.suggestions[0].status).toBe("shown");
    expect(applyResolutions(s, s.threads, [], 100).state.suggestions[0].status).toBe("expired");
  });

  it("dismisses once and leaves dismissed cards alone", () => {
    const s = state({ suggestions: [shown()] });
    const d = dismissSuggestion(s, "q1", 50);
    expect(d?.suggestion).toMatchObject({ status: "dismissed", resolvedAtSecond: 50 });
    expect(dismissSuggestion(d!.state, "q1", 55)).toBeNull();
    expect(applyResolutions(d!.state, [{ ...cough, missing: [] }], ["q1"], 60).state.suggestions[0].status).toBe("dismissed");
  });
});

describe("replay", () => {
  it("returns the latest saved result at or before a second", () => {
    const r = (n: number) => ({ threads: [], candidates: [], resolvedSuggestionIds: [`r${n}`] });
    const timeline = [{ atSecond: 60, result: r(60) }, { atSecond: 20, result: r(20) }];
    expect(timelineAt(timeline, 10)).toBeNull();
    expect(timelineAt(timeline, 20)?.resolvedSuggestionIds).toEqual(["r20"]);
    expect(timelineAt(timeline, 90)?.resolvedSuggestionIds).toEqual(["r60"]);
  });
});
