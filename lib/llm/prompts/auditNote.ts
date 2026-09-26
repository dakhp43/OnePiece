import { AuditResultSchema, type AuditResult, type Note, type Utterance } from "@/lib/contracts";
import { generateJson } from "@/lib/llm/gemini";
import { transcriptLines } from "@/lib/llm/format";

const SYSTEM = `You are auditing an AI-drafted clinical note against its source transcript. Be strict.
For each sentence: is it supported by its cited utterances (supported / partial / unsupported)?
Is the underlying speech hedged or uncertain ("I think", "maybe", "20 or 40")? Does it contradict anything else in the transcript?
Give a one-sentence reason a busy doctor can read in 3 seconds.
For each checklist item: was it covered in the conversation (covered / partial / missing / not_applicable)?
Cite evidence utterances. "not_applicable" only when clearly irrelevant to this visit
(e.g. an item conditional on a new medication when none was prescribed).
Items whose id starts with "open:" are follow-ups carried over from the last visit: "covered" only if the
conversation actually addressed that specific item.
Return exactly one verdict per sentence and one verdict per checklist item, using the given ids.`;

export interface AuditChecklistItem {
  itemId: string;
  label: string;
  condition: string | null;
}

export async function auditNote(args: {
  utterances: Utterance[];
  note: Note;
  checklist: AuditChecklistItem[];
}): Promise<AuditResult> {
  const sentences = args.note.sentences
    .map((s) => `${s.id} (${s.section}, ${s.kind}; cites ${s.sourceUtteranceIds.join(",") || "nothing"}): ${s.text}`)
    .join("\n");
  const checklist = args.checklist
    .map((c) => `${c.itemId}: ${c.label}${c.condition ? ` (condition: ${c.condition})` : ""}`)
    .join("\n");
  const user = [
    "TRANSCRIPT (id [role] mm:ss text):",
    transcriptLines(args.utterances),
    "",
    "DRAFT NOTE SENTENCES:",
    sentences,
    "",
    "CHECKLIST ITEMS:",
    checklist,
  ].join("\n");
  return generateJson({ schema: AuditResultSchema, system: SYSTEM, user, temperature: 0, label: "gemini:audit" });
}
