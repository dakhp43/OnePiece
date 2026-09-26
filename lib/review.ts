import { NextResponse } from "next/server";
import { ApiError } from "@/lib/api";
import { loadVisit } from "@/lib/access";
import type { GapItem, Note } from "@/lib/contracts";
import type { PatientRow, VisitRow } from "@/lib/db/schema";
import { scoreNote } from "@/lib/scoring/confidence";
import { assertStatus, updateVisit, visitView } from "@/lib/visits";

export interface ReviewState {
  visit: VisitRow;
  patient: PatientRow;
  note: Note;
  gaps: GapItem[];
}

/**
 * Loads a visit in review, lets `fn` mutate its note/gaps, rescores, saves, and returns the fresh
 * visit view so the client can re-render problem badges live.
 */
export async function mutateReview(
  visitId: string,
  doctorId: string,
  fn: (state: ReviewState) => Promise<void> | void,
) {
  const { visit, patient } = await loadVisit(visitId, doctorId);
  assertStatus(visit, ["review"], "edit the note");
  if (!visit.note) throw new ApiError(409, "Visit has no note yet");
  const state: ReviewState = {
    visit, patient,
    note: structuredClone(visit.note),
    gaps: structuredClone(visit.gaps ?? []),
  };
  await fn(state);
  const scores = scoreNote(state.note, visit.audit?.sentenceVerdicts ?? [], visit.utterances ?? []);
  const saved = await updateVisit(visit.id, { note: state.note, gaps: state.gaps, scores });
  return NextResponse.json(visitView(saved, patient));
}

export function findSentence(note: Note, sentenceId: string) {
  const s = note.sentences.find((x) => x.id === sentenceId);
  if (!s) throw new ApiError(404, "Sentence not found");
  return s;
}

export function findGap(gaps: GapItem[], itemId: string) {
  const g = gaps.find((x) => x.itemId === itemId);
  if (!g) throw new ApiError(404, "Checklist item not found");
  return g;
}
