import type {
  ConfidenceLevel, Note, ProblemScore, Sentence, SentenceScore, SentenceVerdict, Utterance,
} from "@/lib/contracts";
import { missingNumbers } from "./numbers";

/** Sentences scoring below this are "flagged" for review. */
export const FLAG_THRESHOLD = 0.85;
export const MEDIUM_THRESHOLD = 0.6;

export const REASONS = {
  verified: "Clinician-verified",
  noSource: "No source in transcript",
  invalidSource: "Invalid source",
  unsupported: "Not supported by transcript",
  partial: "Only partly supported",
  hedged: "Speaker sounded unsure",
  contradiction: "Conflicts with something else said",
  number: "Number not found in source",
  medication: "Medication detail — double-check",
  notAudited: "Not checked by the auditor",
} as const;

export function levelFor(score: number): ConfidenceLevel {
  return score >= FLAG_THRESHOLD ? "high" : score >= MEDIUM_THRESHOLD ? "medium" : "low";
}

const clamp = (n: number) => Math.min(1, Math.max(0, Math.round(n * 1000) / 1000));

/** Deterministic per-sentence confidence (BUILD_PLAN §7.6). */
export function scoreSentence(
  sentence: Sentence,
  verdict: SentenceVerdict | undefined,
  utterancesById: Map<string, Utterance>,
): SentenceScore {
  if (sentence.origin === "clinician" || sentence.review === "accepted" || sentence.review === "edited") {
    return { sentenceId: sentence.id, score: 1, reasons: [REASONS.verified] };
  }
  let score = 1;
  const reasons: string[] = [];
  const add = (r: string) => !reasons.includes(r) && reasons.push(r);

  const ids = sentence.sourceUtteranceIds;
  if (ids.length === 0) {
    score = 0.1;
    add(REASONS.noSource);
  } else if (ids.some((id) => !utterancesById.has(id))) {
    score = 0.1;
    add(REASONS.invalidSource);
  }

  if (!verdict) {
    score = Math.min(score, 0.7);
    add(REASONS.notAudited);
  } else {
    if (verdict.support === "unsupported") {
      score = Math.min(score, 0.2);
      add(REASONS.unsupported);
    } else if (verdict.support === "partial") {
      score = Math.min(score, 0.6);
      add(REASONS.partial);
    }
    if (verdict.hedged) {
      score -= 0.25;
      add(REASONS.hedged);
    }
    if (verdict.contradiction) {
      score -= 0.4;
      add(REASONS.contradiction);
    }
  }

  const sources = ids.map((id) => utterancesById.get(id)?.text).filter((t): t is string => Boolean(t));
  if (sources.length > 0 && missingNumbers(sentence.text, sources).length > 0) {
    score = Math.min(score, 0.3);
    add(REASONS.number);
  }

  if ((sentence.kind === "dose" || sentence.kind === "medication") && verdict?.support !== "supported") {
    score -= 0.15;
    add(REASONS.medication);
  }

  return { sentenceId: sentence.id, score: clamp(score), reasons };
}

/** Per-problem score = 0.5 × min + 0.5 × mean of its live (non-deleted) sentence scores. */
export function scoreNote(note: Note, verdicts: SentenceVerdict[], utterances: Utterance[]): ProblemScore[] {
  const byId = new Map(utterances.map((u) => [u.id, u]));
  const verdictFor = new Map(verdicts.map((v) => [v.sentenceId, v]));
  const live = note.sentences.filter((s) => s.review !== "deleted");
  const problemIds = [...new Set([...note.problems.map((p) => p.id), ...live.map((s) => s.problemId)])];

  return problemIds.flatMap((problemId) => {
    const sentences = live.filter((s) => s.problemId === problemId);
    if (sentences.length === 0) return [];
    const sentenceScores = sentences.map((s) => scoreSentence(s, verdictFor.get(s.id), byId));
    const values = sentenceScores.map((s) => s.score);
    const score = clamp(0.5 * Math.min(...values) + 0.5 * (values.reduce((a, b) => a + b, 0) / values.length));
    return [{ problemId, score, level: levelFor(score), sentenceScores }];
  });
}

export function sentenceScoreMap(scores: ProblemScore[]) {
  return new Map(scores.flatMap((p) => p.sentenceScores).map((s) => [s.sentenceId, s]));
}
