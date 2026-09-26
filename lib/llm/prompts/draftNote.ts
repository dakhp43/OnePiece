import { DraftNoteSchema, type DraftNote, type Medication, type Note, type Utterance, type VisitType } from "@/lib/contracts";
import { generateJson } from "@/lib/llm/gemini";
import { transcriptLines } from "@/lib/llm/format";

const SYSTEM = `You are a clinical documentation assistant drafting a problem-oriented SOAP note from a
doctor-patient conversation transcript. You never invent information.

RULES
1. Identify which speaker is the clinician and which is the patient from context. Return speakerRoles (one entry per speaker label, e.g. speaker_0).
2. List each distinct clinical problem discussed as a Problem with ids "p1", "p2", ... Use problemId "general" for content not tied to one problem.
3. Write the note as short, single-fact sentences with ids "s1", "s2", ... Each sentence has a section (S, O, A, P), a problemId, and a kind.
4. EVERY sentence must cite the utterance IDs (e.g. "u12") that directly support it. If you cannot cite it, do not write it.
5. S = what the patient reports. O = measurements and exam findings stated in the visit. A = the clinician's stated assessment. P = the clinician's stated plan (tests, medications, referrals, follow-up, education).
6. Do not add diagnoses, medications, doses, or plans that were not said. Do not resolve uncertainty: if the patient was unsure ("20 or 40 milligrams"), write it as uncertain.
7. Use standard clinical wording (e.g. "Reports dry cough x3 weeks."), not quotes.
8. Keep numbers exactly as spoken (convert words to digits: "one thirty-eight over eighty-eight" -> "138/88").
9. kind: symptom | history | medication | dose | vital | exam | assessment | plan | other. Use "dose" when the sentence states a medication dose.`;

export async function draftNote(args: {
  utterances: Utterance[];
  visitType: VisitType;
  knownMeds: Medication[];
  knownAllergies: string[];
}): Promise<DraftNote> {
  const meds = args.knownMeds.map((m) => `${m.name} ${m.dose} ${m.frequency}`).join("; ") || "none";
  const user = [
    `Visit type: ${args.visitType}.`,
    `Patient context (from chart, may help interpret, never cite as evidence): medications: ${meds}; allergies: ${args.knownAllergies.join(", ") || "none known"}.`,
    "",
    "TRANSCRIPT (id [speaker] mm:ss text):",
    transcriptLines(args.utterances, { useSpeaker: true }),
  ].join("\n");
  return generateJson({ schema: DraftNoteSchema, system: SYSTEM, user, label: "gemini:draft" });
}

/** Adds our bookkeeping fields (origin/review) and turns the speakerRoles array into a map. */
export function toNote(draft: DraftNote): Note {
  return {
    chiefComplaint: draft.chiefComplaint,
    speakerRoles: Object.fromEntries(draft.speakerRoles.map((r) => [r.speaker, r.role])),
    problems: draft.problems,
    sentences: draft.sentences.map((s) => ({ ...s, origin: "ai" as const, review: "unreviewed" as const })),
  };
}
