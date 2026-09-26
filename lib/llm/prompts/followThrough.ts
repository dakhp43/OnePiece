import { FollowThroughDraftSchema, type FollowThroughDraft, type Medication, type Note } from "@/lib/contracts";
import { generateJson } from "@/lib/llm/gemini";
import { liveSentences } from "@/lib/note";

const SYSTEM = `You turn a signed clinical note into (1) a task list for the doctor's office and (2) a
plain-language after-visit summary for the patient.
RULES
- Use ONLY information in the signed note. If something is not in the note, leave it out.
- Tasks: every lab, imaging, referral, medication change, follow-up appointment, and education item
  in the Plan. Task ids are "t1", "t2", ... Cite sourceSentenceIds. dueInDays only if a timeframe was stated, else null.
- Summary: write for a 6th-grade reading level. Short sentences. No medical jargon without
  a plain explanation. Address the patient by first name in the greeting. language is "en".
- medicationChanges must match the note exactly (names, doses, frequency).
- nextSteps: concrete actions for the patient, with "when" if a timeframe was stated, else null.
- whenToGetHelp: only warning signs stated in the note. If none are in the note, return an empty list.
- followUp: the next visit timing if stated in the note, else null.`;

/** Call D. Input is only the signed note (never the raw transcript), so fixed errors can't leak to the patient. */
export async function followThrough(args: { note: Note; firstName: string; knownMeds: Medication[] }): Promise<FollowThroughDraft> {
  const problems = args.note.problems.map((p) => `${p.id}: ${p.title}`).join("\n");
  const sentences = liveSentences(args.note)
    .map((s) => `${s.id} [${s.problemId} ${s.section}] ${s.text}`)
    .join("\n");
  const user = [
    `Patient first name: ${args.firstName}`,
    `Medications on file before this visit: ${args.knownMeds.map((m) => `${m.name} ${m.dose} ${m.frequency}`).join("; ") || "none"}`,
    "",
    "PROBLEMS:",
    problems,
    "",
    "SIGNED NOTE SENTENCES (id [problem section] text):",
    sentences,
  ].join("\n");
  return generateJson({ schema: FollowThroughDraftSchema, system: SYSTEM, user, label: "gemini:followthrough" });
}
