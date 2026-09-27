import type { Candidate, CopilotState, Suggestion, SuggestionStatus, Thread } from "@/lib/contracts";
import { COPILOT } from "./config";
import { findThread } from "./threads";

export interface Transition {
  suggestion: Suggestion;
  to: SuggestionStatus;
}

const resolve = (s: Suggestion, to: SuggestionStatus, at: number): Suggestion => ({ ...s, status: to, resolvedAtSecond: Math.round(at) });

/**
 * Moves suggestions on after a check:
 * - shown (or expired) and answered: captured. Answered means the model says so, or the topic it
 *   followed up on has nothing missing any more. A late answer still counts.
 * - shown and older than EXPIRE_S: expired (the card leaves the screen).
 * Dismissed suggestions never change again.
 */
export function applyResolutions(
  state: CopilotState,
  threads: Thread[],
  resolvedIds: string[],
  elapsed: number,
): { state: CopilotState; transitions: Transition[] } {
  const resolved = new Set(resolvedIds);
  const complete = new Set(threads.filter((t) => t.missing.length === 0).map((t) => t.id));
  const transitions: Transition[] = [];
  const suggestions = state.suggestions.map((s) => {
    if (s.status !== "shown" && s.status !== "expired") return s;
    if (resolved.has(s.id) || complete.has(s.threadId)) {
      const next = resolve(s, "captured", elapsed);
      transitions.push({ suggestion: next, to: "captured" });
      return next;
    }
    if (s.status === "shown" && elapsed - s.atSecond >= COPILOT.EXPIRE_S) {
      const next = resolve(s, "expired", elapsed);
      transitions.push({ suggestion: next, to: "expired" });
      return next;
    }
    return s;
  });
  return { state: { ...state, threads, suggestions }, transitions };
}

/** The doctor waved a card away. Returns null when there's nothing to dismiss (unknown id or already resolved). */
export function dismissSuggestion(state: CopilotState, id: string, elapsed: number): { state: CopilotState; suggestion: Suggestion } | null {
  const s = state.suggestions.find((x) => x.id === id);
  if (!s || s.status !== "shown") return null;
  const next = resolve(s, "dismissed", elapsed);
  return { state: { ...state, suggestions: state.suggestions.map((x) => (x.id === id ? next : x)) }, suggestion: next };
}

const norm = (q: string) => q.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

/**
 * Chooses at most one new card, or none. Each rejected candidate comes back with the rule that stopped it,
 * which is logged so thresholds can be tuned from real runs. `state.threads` must already be merged.
 */
export function pickSuggestion(state: CopilotState, candidates: Candidate[], elapsed: number): {
  suggestion: Suggestion | null;
  rejected: { question: string; why: string }[];
} {
  const rejected: { question: string; why: string }[] = [];
  const reject = (c: Candidate, why: string) => {
    rejected.push({ question: c.question, why });
    return false;
  };
  const all = state.suggestions;
  const blocked =
    elapsed < COPILOT.QUIET_START_S ? "quiet start"
    : all.some((s) => s.status === "shown") ? "a card is already showing"
    : all.length >= COPILOT.MAX_PROMPTS ? "prompt cap reached"
    : all.length > 0 && elapsed - Math.max(...all.map((s) => s.atSecond)) < COPILOT.COOLDOWN_S ? "cooldown"
    : null;
  if (blocked) {
    for (const c of candidates) reject(c, blocked);
    return { suggestion: null, rejected };
  }

  const askedThreads = new Set(all.map((s) => s.threadId));
  const askedQuestions = new Set(all.map((s) => norm(s.question)));
  const ok: { c: Candidate; thread: Thread }[] = [];
  for (const c of candidates) {
    const thread = findThread(state.threads, c.thread);
    if (c.confidence < COPILOT.THRESHOLD) reject(c, `confidence ${c.confidence} below ${COPILOT.THRESHOLD}`);
    else if (!c.question.trim().endsWith("?")) reject(c, "not a question");
    else if (c.question.split(/\s+/).filter(Boolean).length > COPILOT.MAX_QUESTION_WORDS) reject(c, "question too long");
    else if (askedQuestions.has(norm(c.question))) reject(c, "same question already asked");
    else if (!thread) reject(c, "unknown topic");
    else if (thread.missing.length === 0) reject(c, "topic already complete");
    else if (askedThreads.has(thread.id)) reject(c, "topic already prompted");
    else ok.push({ c, thread });
  }

  const [best, ...rest] = ok.sort((a, b) => b.c.confidence - a.c.confidence);
  for (const r of rest) reject(r.c, "lower confidence than the chosen card");
  if (!best) return { suggestion: null, rejected };
  return {
    suggestion: {
      id: `q${all.length + 1}`,
      threadId: best.thread.id,
      topic: best.thread.topic,
      question: best.c.question.trim(),
      reason: best.c.reason,
      confidence: best.c.confidence,
      status: "shown",
      atSecond: Math.round(elapsed),
      resolvedAtSecond: null,
    },
    rejected,
  };
}
