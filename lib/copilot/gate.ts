import type { Candidate, CopilotState, CoverageItem, Suggestion, SuggestionSource, SuggestionStatus } from "@/lib/contracts";
import { OPEN_PREFIX } from "@/lib/gaps";
import { COPILOT } from "./config";

export interface Transition {
  suggestion: Suggestion;
  to: SuggestionStatus;
}

/** The source comes from the item id, never from the model, so a card's label can't be wrong. */
export function sourceOf(itemId: string | null): SuggestionSource {
  if (itemId === null) return "clinical";
  return itemId.startsWith(OPEN_PREFIX) ? "open_item" : "checklist";
}

const resolve = (s: Suggestion, to: SuggestionStatus, at: number): Suggestion => ({ ...s, status: to, resolvedAtSecond: Math.round(at) });

/**
 * Moves suggestions on after a check:
 * - shown (or expired) + its item is now covered: captured. A late answer still counts as caught live.
 * - shown clinical question the model says was answered: captured.
 * - shown and older than EXPIRE_S: expired (the card leaves the screen).
 * Dismissed suggestions never change again.
 */
export function applyResolutions(
  state: CopilotState,
  coverage: CoverageItem[],
  resolvedIds: string[],
  elapsed: number,
): { state: CopilotState; transitions: Transition[] } {
  const covered = new Set(coverage.filter((c) => c.status === "covered").map((c) => c.itemId));
  const resolved = new Set(resolvedIds);
  const transitions: Transition[] = [];
  const suggestions = state.suggestions.map((s) => {
    if (s.status !== "shown" && s.status !== "expired") return s;
    const answered = s.itemId !== null ? covered.has(s.itemId) : resolved.has(s.id);
    if (answered) {
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
  return { state: { ...state, coverage, suggestions }, transitions };
}

/** The doctor waved a card away. Returns null when there's nothing to dismiss (unknown id or already resolved). */
export function dismissSuggestion(state: CopilotState, id: string, elapsed: number): { state: CopilotState; suggestion: Suggestion } | null {
  const s = state.suggestions.find((x) => x.id === id);
  if (!s || s.status !== "shown") return null;
  const next = resolve(s, "dismissed", elapsed);
  return { state: { ...state, suggestions: state.suggestions.map((x) => (x.id === id ? next : x)) }, suggestion: next };
}

const norm = (q: string) => q.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
const RANK: Record<string, number> = { required: 0, open_item: 1, recommended: 2, clinical: 3 };

/**
 * Chooses at most one new card, or none. Each rejected candidate comes back with the rule that stopped it,
 * which is logged so thresholds can be tuned from real runs.
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

  const coverage = new Map(state.coverage.map((c) => [c.itemId, c]));
  const askedItems = new Set(all.map((s) => s.itemId).filter(Boolean));
  const askedQuestions = new Set(all.map((s) => norm(s.question)));

  const ok = candidates.filter((c) => {
    const source = sourceOf(c.itemId);
    if (c.confidence < COPILOT.THRESHOLD[source]) return reject(c, `confidence ${c.confidence} below ${COPILOT.THRESHOLD[source]}`);
    if (!c.question.trim().endsWith("?")) return reject(c, "not a question");
    if (c.question.split(/\s+/).filter(Boolean).length > COPILOT.MAX_QUESTION_WORDS) return reject(c, "question too long");
    if (askedQuestions.has(norm(c.question))) return reject(c, "same question already asked");
    if (c.itemId === null) return true;
    const item = coverage.get(c.itemId);
    if (!item) return reject(c, "unknown item id");
    if (askedItems.has(c.itemId)) return reject(c, "item already prompted");
    if (item.status !== "missing") return reject(c, `item is ${item.status}`);
    if (item.condition && item.conditionMet !== true) return reject(c, "condition not met");
    if (!item.condition && elapsed < COPILOT.UNCONDITIONED_MIN_S && !c.aboutCurrentTopic) return reject(c, "too early for an off-topic item");
    return true;
  });

  const rank = (c: Candidate) => {
    const source = sourceOf(c.itemId);
    if (source !== "checklist") return RANK[source];
    return RANK[coverage.get(c.itemId!)!.priority];
  };
  const best = ok.sort((a, b) => rank(a) - rank(b) || b.confidence - a.confidence)[0];
  for (const c of ok) if (c !== best) reject(c, "lower priority than the chosen card");
  if (!best) return { suggestion: null, rejected };

  const item = best.itemId ? coverage.get(best.itemId) : undefined;
  return {
    suggestion: {
      id: `q${all.length + 1}`,
      itemId: best.itemId,
      label: item?.label ?? null,
      source: sourceOf(best.itemId),
      question: best.question.trim(),
      reason: best.reason,
      confidence: best.confidence,
      status: "shown",
      atSecond: Math.round(elapsed),
      resolvedAtSecond: null,
    },
    rejected,
  };
}
