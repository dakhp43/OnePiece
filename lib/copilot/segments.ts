import type { LiveSegment } from "@/lib/contracts";
import { COPILOT } from "./config";

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** Adds one committed chunk of live transcript. Ignores blanks and an exact repeat of the last chunk. */
export function appendCommitted(segs: LiveSegment[], text: string, atSecond: number): LiveSegment[] {
  const t = text.trim();
  if (!t || segs.at(-1)?.text === t) return segs;
  return [...segs, { id: `s${segs.length + 1}`, text: t, atSecond: Math.max(0, Math.round(atSecond)) }];
}

export function wordCount(segs: LiveSegment[], partial = "") {
  return segs.reduce((n, s) => n + words(s.text), 0) + words(partial);
}

const clock = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Prompt block for the model: one "[mm:ss] text" line per committed chunk, plus what is still being said. */
export function transcriptText(segs: LiveSegment[], partial = "") {
  const lines = segs.map((s) => `[${clock(s.atSecond)}] ${s.text}`);
  if (partial.trim()) lines.push(`[now, still speaking] ${partial.trim()}`);
  return lines.join("\n") || "(nothing said yet)";
}

/** Whether the client should ask for a check now. The server enforces the per-visit cap again. */
export function shouldCheck(a: {
  elapsed: number; lastCheckSecond: number; words: number; lastWordCount: number; inFlight: boolean; checks: number;
}) {
  return (
    !a.inFlight &&
    a.checks < COPILOT.MAX_CHECKS_PER_VISIT &&
    a.elapsed - a.lastCheckSecond >= COPILOT.MIN_CHECK_INTERVAL_S &&
    a.words - a.lastWordCount >= COPILOT.MIN_NEW_WORDS
  );
}
