import type { LiveCheckResult, Thread } from "@/lib/contracts";
import { COPILOT } from "./config";

const clean = (facts: string[]) => [...new Set(facts.map((f) => f.trim()).filter(Boolean))].slice(0, COPILOT.MAX_FACTS);
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const key = (topic: string) => topic.trim().toLowerCase();

/**
 * Folds the model's view of the conversation into the running topic list. Known topics keep their id
 * (matched by id, or by name when the model forgot it); new ones get the next "t<n>". Topics the model
 * left out stay as they were, so a topic never vanishes mid-visit.
 */
export function mergeThreads(prev: Thread[], incoming: LiveCheckResult["threads"], atSecond: number): Thread[] {
  const next = [...prev];
  const at = Math.round(atSecond);
  for (const t of incoming) {
    if (!t.topic.trim()) continue;
    const i = next.findIndex((x) => (t.id !== null && x.id === t.id) || key(x.topic) === key(t.topic));
    const known = clean(t.known);
    const missing = clean(t.missing).filter((m) => !known.includes(m));
    if (i >= 0) {
      const old = next[i];
      if (same(old.known, known) && same(old.missing, missing)) continue;
      next[i] = { ...old, known, missing, updatedAtSecond: at };
    } else if (next.length < COPILOT.MAX_THREADS) {
      next.push({ id: `t${next.length + 1}`, topic: t.topic.trim(), known, missing, updatedAtSecond: at });
    }
  }
  return next;
}

/** A candidate names its topic by id, or by name when the topic is new in the same answer. */
export function findThread(threads: Thread[], ref: string): Thread | undefined {
  return threads.find((t) => t.id === ref) ?? threads.find((t) => key(t.topic) === key(ref));
}

/** Topics still half answered, most recently discussed first: what the recording screen lists. */
export function openThreads(threads: Thread[]): Thread[] {
  return threads.filter((t) => t.missing.length > 0).sort((a, b) => b.updatedAtSecond - a.updatedAtSecond);
}
