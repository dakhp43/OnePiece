import type { Note, Transcript, TranscriptWord, Utterance } from "@/lib/contracts";

const PAUSE_SECONDS = 1.2;
const SOFT_MAX_WORDS = 25;

const speakerOf = (w: TranscriptWord) => w.speakerId ?? w.speaker_id ?? "speaker_0";

/**
 * Groups transcript words into utterances. A new utterance starts when the speaker changes,
 * after a pause > 1.2 s, or once an utterance passes ~25 words and the current word ends a sentence.
 */
export function buildUtterances(transcript: Pick<Transcript, "words">): Utterance[] {
  const words = transcript.words.filter((w) => w.type === "word" && w.text.trim() !== "");
  const out: Utterance[] = [];
  let cur: { speaker: string; start: number; end: number; words: string[] } | null = null;

  const flush = () => {
    if (!cur) return;
    out.push({
      id: `u${out.length + 1}`,
      speaker: cur.speaker,
      role: "unknown",
      start: round(cur.start),
      end: round(cur.end),
      text: cur.words.join(" ").replace(/\s+([,.?!;:])/g, "$1").trim(),
    });
    cur = null;
  };

  for (const w of words) {
    const speaker = speakerOf(w);
    const start: number = w.start ?? cur?.end ?? 0;
    const end: number = w.end ?? start;
    if (cur && (speaker !== cur.speaker || start - cur.end > PAUSE_SECONDS)) flush();
    if (!cur) cur = { speaker, start, end, words: [] };
    cur.words.push(w.text.trim());
    cur.end = end;
    if (cur.words.length >= SOFT_MAX_WORDS && /[.?!]$/.test(w.text.trim())) flush();
  }
  flush();
  return out;
}

/** Applies Call A's speaker→role mapping to utterances. */
export function applySpeakerRoles(utterances: Utterance[], roles: Note["speakerRoles"]): Utterance[] {
  return utterances.map((u) => ({ ...u, role: roles[u.speaker] ?? "unknown" }));
}

const round = (n: number) => Math.round(n * 1000) / 1000;
