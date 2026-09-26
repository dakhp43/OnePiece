import type { Note, Problem, Section, Sentence } from "@/lib/contracts";

export const SECTIONS: Section[] = ["S", "O", "A", "P"];
export const SECTION_LABELS: Record<Section, string> = {
  S: "Subjective", O: "Objective", A: "Assessment", P: "Plan",
};

export const GENERAL_PROBLEM: Problem = { id: "general", title: "General", status: "general" };

/** Problems in note order (plus "general" if used), each with its live sentences grouped by section. */
export function groupNote(note: Note, opts: { includeDeleted?: boolean } = {}) {
  const problems = [...note.problems];
  const used = new Set(note.sentences.map((s) => s.problemId));
  if (!problems.some((p) => p.id === "general") && used.has("general")) problems.push(GENERAL_PROBLEM);
  // Sentences pointing at an unknown problem id land in General.
  const known = new Set(problems.map((p) => p.id));
  const problemOf = (s: Sentence) => (known.has(s.problemId) ? s.problemId : "general");
  if (note.sentences.some((s) => !known.has(s.problemId)) && !known.has("general")) problems.push(GENERAL_PROBLEM);

  return problems.map((problem) => {
    const sentences = note.sentences.filter(
      (s) => problemOf(s) === problem.id && (opts.includeDeleted || s.review !== "deleted"),
    );
    return {
      problem,
      sentences,
      sections: SECTIONS.map((section) => ({ section, sentences: sentences.filter((s) => s.section === section) })),
    };
  }).filter((g) => g.sentences.length > 0);
}

export function liveSentences(note: Note) {
  return note.sentences.filter((s) => s.review !== "deleted");
}

export function nextSentenceId(note: Note) {
  const max = note.sentences.reduce((m, s) => Math.max(m, Number(s.id.replace(/\D/g, "")) || 0), 0);
  return `s${max + 1}`;
}
