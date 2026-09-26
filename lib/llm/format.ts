import type { Utterance } from "@/lib/contracts";
import { formatClock } from "@/lib/utils";

/** Compact transcript lines for prompts: `u12 [clinician] 01:23 Your pressure today is 138 over 88.` */
export function transcriptLines(utterances: Utterance[], opts: { useSpeaker?: boolean } = {}) {
  return utterances
    .map((u) => `${u.id} [${opts.useSpeaker || u.role === "unknown" ? u.speaker : u.role}] ${formatClock(u.start)} ${u.text}`)
    .join("\n");
}
