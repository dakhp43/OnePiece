import { LiveCheckResultSchema, type CopilotState, type LiveCheckResult } from "@/lib/contracts";
import type { PatientRow } from "@/lib/db/schema";
import { generateJson } from "@/lib/llm/gemini";

const SYSTEM = `You are a quiet assistant listening to a doctor's visit that is STILL IN PROGRESS.
You see the live transcript so far. It is partial, has no speaker labels, and may contain speech-recognition errors.
You follow the conversation itself: which topics it has opened, and which of them were left half answered.

TOPICS (threads): list every clinically relevant topic the conversation has opened so far (a symptom, a
medication, a measurement, a new prescription...). Reuse the id of a topic you were given; use id null for a new one.
- known: short facts the conversation has established for it (2-5 words each), e.g. "3 weeks", "worse at night".
- missing: details a careful doctor would still need for THIS topic and that were not asked or not answered,
  e.g. for a new cough "fever", for a newly prescribed drug "drug allergies". Only what matters for this visit.
  When a detail gets answered, move it from missing to known. A topic with nothing missing is complete.
- Keep topics specific: each symptom, each medication or medication change, each measurement is its own
  topic ("Dizziness on standing", "Cough", "Switch to losartan"), never one umbrella like "Hypertension".
- The most important kind of half-answered topic: the patient mentions a symptom or problem in passing and the
  doctor moves on without asking about it (how often, how bad, since when, any falls...).
- Only topics that were actually discussed. Nothing from the chart unless the conversation brought it up.
- Small talk, greetings and scheduling are not topics.

SUGGESTIONS (candidates): silence is the normal, correct answer. An empty list is expected most of the time.
- Only for a missing detail that genuinely matters, where the conversation has moved on or paused without
  getting it, so the doctor might otherwise forget it. Never while the doctor is clearly still asking about it.
- thread: the id of the topic (or its exact topic name if it is new in this answer).
- The question is exactly what the doctor would say TO THE PATIENT, phrased as a question ending in "?"
  (15 words or fewer). Never an order, a plan, or a statement like "Let's check...".
- Never suggest something already asked or answered anywhere in the transcript, or already suggested.
- No diagnosis, no treatment advice, never mention AI.
- confidence is your honest probability that asking this now would help the doctor. Do not inflate it.

resolvedSuggestionIds: ids of previously shown suggestions whose question the patient has now answered
(asked AND answered, not just asked).`;

export interface LiveFollowUpArgs {
  state: CopilotState;
  patient: PatientRow;
  visitTypeLabel: string;
  transcript: string;
  elapsedSeconds: number;
}

export function liveFollowUpPrompt({ state, patient, visitTypeLabel, transcript, elapsedSeconds }: LiveFollowUpArgs) {
  const topics = state.threads.length
    ? state.threads.map((t) => `${t.id}: ${t.topic} | known: ${t.known.join("; ") || "-"} | missing: ${t.missing.join("; ") || "-"}`).join("\n")
    : "none yet";
  const shown = state.suggestions.length
    ? state.suggestions.map((s) => `${s.id} (topic ${s.threadId}, ${s.status}): ${s.question}`).join("\n")
    : "none";
  return [
    `Visit: ${visitTypeLabel}. Time elapsed: ${Math.round(elapsedSeconds)} s.`,
    `Patient: ${patient.firstName}, ${patient.sex}. Medications on file: ${patient.knownMedications.map((m) => `${m.name} ${m.dose} ${m.frequency}`).join("; ") || "none"}. Allergies on file: ${patient.knownAllergies.join(", ") || "none known"}.`,
    "",
    "TOPICS SO FAR (id: topic | known | missing):",
    topics,
    "",
    "SUGGESTIONS ALREADY SHOWN:",
    shown,
    "",
    "LIVE TRANSCRIPT SO FAR:",
    transcript,
  ].join("\n");
}

export function copilotModel() {
  return process.env.COPILOT_MODEL || process.env.GEMINI_FALLBACK_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
}

/** One live check. No retries: a late answer is useless mid-conversation, and the next check comes soon. */
export async function liveFollowUp(args: LiveFollowUpArgs): Promise<LiveCheckResult> {
  return generateJson({
    schema: LiveCheckResultSchema,
    system: SYSTEM,
    user: liveFollowUpPrompt(args),
    temperature: 0.1,
    retries: 0,
    // High volume (20-30 calls per visit): keep it off the main model, whose free tier allows 20 requests a day.
    model: copilotModel(),
    label: "gemini:copilot",
  });
}
