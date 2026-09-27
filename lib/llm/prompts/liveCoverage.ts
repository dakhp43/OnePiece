import { LiveCoverageResultSchema, type CopilotState, type LiveCoverageResult } from "@/lib/contracts";
import { generateJson } from "@/lib/llm/gemini";

const SYSTEM = `You are a quiet assistant listening to a doctor's visit that is STILL IN PROGRESS.
You see the live transcript so far. It is partial, has no speaker labels, and may contain speech-recognition errors.
Your two jobs: (1) judge which checklist items the conversation has covered so far; (2) rarely, suggest ONE question
the doctor could ask now, while the patient is still in the room, for something important that is still missing.

CHECKLIST VERDICTS (one per checklist item, using the given ids):
- "covered": the conversation specifically addressed this item.
- "partial": touched on but incomplete.
- "missing": not addressed so far.
- "unknown": you can't tell (garbled or ambiguous speech), or the visit is under 30 seconds old.
- "not_applicable": the item's condition doesn't apply (yet). Set conditionMet=false. Example: "only if a new
  medication is prescribed" before any new medication has been mentioned. When the condition starts to apply
  (a new medication is now being prescribed), set conditionMet=true and judge the item normally.
- For items without a condition, conditionMet is null.
- Ids starting with "open:" are follow-ups carried over from the last visit: "covered" only if that specific
  follow-up (e.g. that lab result) was discussed, not just the general topic.
- Facts from the chart are background only. Something known from the chart is NOT covered unless it was discussed.
- evidenceQuote: a short quote from the transcript for covered/partial, else null.

SUGGESTIONS (candidates): silence is the normal, correct answer. An empty list is expected most of the time.
- Only for an item that is "missing" and genuinely worth interrupting for now. If you suggest a question for an
  item, that item's verdict MUST be "missing".
- Always use the matching checklist itemId when a checklist item fits (an allergy question uses the allergies
  item; a pending lab from the last visit uses its "open:" item).
- Items that naturally close a visit (follow-up interval, return precautions, when to seek care) are never
  suggested before the doctor has started discussing the plan.
- The best moment to suggest is a lull or small talk, when a required item or a follow-up carried over from the
  last visit ("open:") is still missing after the first minute. Those are the most valuable items to recover.
- The question is exactly what the doctor would say TO THE PATIENT, phrased as a question ending in "?"
  (15 words or fewer). Never an order, a plan, or a statement like "Let's check...".
- Never suggest something already asked or answered anywhere in the transcript, or already suggested.
- No diagnosis, no treatment advice, never mention AI.
- aboutCurrentTopic: true only if the question fits what is being discussed right now.
- itemId null only when NO checklist item fits: a clear, specific safety question tied to what was just said
  (for example a drug interaction with a medication being newly prescribed). Confidence 0.9 or more, or leave it out.
- confidence is your honest probability that asking this now would help the doctor. Do not inflate it.

resolvedSuggestionIds: ids of previously shown suggestions with itemId null that the conversation has now answered.`;

export function copilotModel() {
  return process.env.COPILOT_MODEL || process.env.GEMINI_FALLBACK_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
}

export interface LiveCoverageArgs {
  state: CopilotState;
  chartText: string;
  transcript: string;
  elapsedSeconds: number;
}

export function liveCoveragePrompt({ state, chartText, transcript, elapsedSeconds }: LiveCoverageArgs) {
  const checklist = state.coverage
    .map((c) => `${c.itemId}: ${c.label}${c.condition ? ` (condition: ${c.condition})` : ""} [so far: ${c.status}]`)
    .join("\n");
  const shown = state.suggestions.length
    ? state.suggestions.map((s) => `${s.id} (${s.itemId ?? "free-form"}, ${s.status}): ${s.question}`).join("\n")
    : "none";
  return [
    `Visit time elapsed: ${Math.round(elapsedSeconds)} s.`,
    "",
    "CHART CONTEXT (background only):",
    chartText,
    "",
    "CHECKLIST ITEMS (id: label (condition) [current status]):",
    checklist,
    "",
    "SUGGESTIONS ALREADY SHOWN:",
    shown,
    "",
    "LIVE TRANSCRIPT SO FAR:",
    transcript,
  ].join("\n");
}

/** One live check. No retries: a late answer is useless mid-conversation, and the next check comes soon. */
export async function liveCoverage(args: LiveCoverageArgs): Promise<LiveCoverageResult> {
  return generateJson({
    schema: LiveCoverageResultSchema,
    system: SYSTEM,
    user: liveCoveragePrompt(args),
    temperature: 0.1,
    retries: 0,
    // High volume (20-30 calls per visit): keep it off the main model, whose free tier allows 20 requests a day.
    model: copilotModel(),
    label: "gemini:copilot",
  });
}
