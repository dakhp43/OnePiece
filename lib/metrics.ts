import type { AuditResult, GapItem, Note, ReviewMetrics, Utterance } from "@/lib/contracts";
import { isOpenGap } from "@/lib/gaps";
import { FLAG_THRESHOLD, scoreSentence } from "@/lib/scoring/confidence";

/** AI sentences that scored below the flag threshold as drafted (before any clinician review). */
export function initiallyFlagged(note: Note, audit: AuditResult | null, utterances: Utterance[]): Set<string> {
  const byId = new Map(utterances.map((u) => [u.id, u]));
  const verdicts = new Map((audit?.sentenceVerdicts ?? []).map((v) => [v.sentenceId, v]));
  return new Set(
    note.sentences
      .filter((s) => s.origin === "ai")
      .filter((s) => scoreSentence({ ...s, review: "unreviewed" }, verdicts.get(s.id), byId).score < FLAG_THRESHOLD)
      .map((s) => s.id),
  );
}

export function reviewProgress(note: Note, audit: AuditResult | null, utterances: Utterance[], gaps: GapItem[]) {
  const flagged = initiallyFlagged(note, audit, utterances);
  const ai = note.sentences.filter((s) => s.origin === "ai");
  const reviewedFlagged = ai.filter((s) => flagged.has(s.id) && s.review !== "unreviewed").length;
  const found = gaps.filter((g) => g.status === "missing" || g.status === "partial");
  return {
    totalSentences: note.sentences.filter((s) => s.review !== "deleted").length,
    flagged: flagged.size,
    flaggedIds: flagged,
    reviewedFlagged,
    needReview: flagged.size - reviewedFlagged,
    gapsFound: found.length,
    gapsResolved: found.filter((g) => g.resolution !== null).length,
    gapsOpen: gaps.filter(isOpenGap).length,
  };
}

export function computeReviewMetrics(args: {
  note: Note; audit: AuditResult | null; utterances: Utterance[]; gaps: GapItem[];
  secondsProcessing: number; reviewReadyAt: string | undefined; signedAt: Date;
}): ReviewMetrics {
  const p = reviewProgress(args.note, args.audit, args.utterances, args.gaps);
  const ai = args.note.sentences.filter((s) => s.origin === "ai");
  const ready = args.reviewReadyAt ? Date.parse(args.reviewReadyAt) : args.signedAt.getTime();
  return {
    totalSentences: ai.length,
    flaggedSentences: p.flagged,
    reviewedSentences: ai.filter((s) => s.review !== "unreviewed").length,
    editedSentences: ai.filter((s) => s.review === "edited").length,
    deletedSentences: ai.filter((s) => s.review === "deleted").length,
    clinicianAddedSentences: args.note.sentences.filter((s) => s.origin === "clinician").length,
    gapsFound: p.gapsFound,
    gapsResolved: p.gapsResolved,
    secondsProcessing: args.secondsProcessing,
    secondsToSign: Math.max(0, Math.round((args.signedAt.getTime() - ready) / 1000)),
  };
}
