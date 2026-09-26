import type { PatientSummary } from "@/lib/contracts";

/** Heuristic English syllable count (good enough for a reading-level chip). */
export function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const trimmed = w.replace(/(?:[^laeiouy]es|[^laeiouy]ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  const groups = trimmed.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups?.length ?? 1);
}

/** Flesch-Kincaid grade level: 0.39·(words/sentences) + 11.8·(syllables/words) − 15.59. */
export function fleschKincaidGrade(text: string): number {
  const sentences = text.split(/[.!?]+(?:\s|$)|\n+/).map((s) => s.trim()).filter((s) => /[a-z]/i.test(s));
  const words = text.match(/[A-Za-z][A-Za-z'-]*/g) ?? [];
  if (!sentences.length || !words.length) return 0;
  const syl = words.reduce((n, w) => n + syllables(w), 0);
  const grade = 0.39 * (words.length / sentences.length) + 11.8 * (syl / words.length) - 15.59;
  return Math.max(0, Math.round(grade * 10) / 10);
}

/** All patient-facing prose in a summary, one sentence-ish unit per line. */
export function summaryText(s: PatientSummary): string {
  return [
    s.greeting,
    ...s.whatWeDiscussed.flatMap((d) => [d.topic, d.explanation]),
    ...s.medicationChanges.map((m) => m.instructions),
    ...s.nextSteps.map((n) => n.text),
    ...s.whenToGetHelp,
    s.followUp ?? "",
  ].filter(Boolean).map((l) => (/[.!?]$/.test(l.trim()) ? l : `${l}.`)).join("\n");
}
