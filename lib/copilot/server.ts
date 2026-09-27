import type { CopilotState, Suggestion } from "@/lib/contracts";
import { ApiError } from "@/lib/api";
import type { EventType, VisitRow } from "@/lib/db/schema";
import { logEvent } from "@/lib/events";
import type { Transition } from "./gate";

export function copilotEnabled() {
  return process.env.COPILOT_ENABLED !== "false" && Boolean(process.env.ELEVENLABS_API_KEY);
}

export function requireCopilot(visit: VisitRow): CopilotState {
  if (!visit.copilot) throw new ApiError(409, "Live copilot was not started for this visit");
  return visit.copilot;
}

const EVENT: Record<Suggestion["status"], EventType> = {
  shown: "copilot_suggested",
  captured: "copilot_captured",
  dismissed: "copilot_dismissed",
  expired: "copilot_expired",
};

/** Audit trail entry for a suggestion changing state (shown, captured, dismissed, expired). */
export async function logSuggestion(visitId: string, doctorId: string, s: Suggestion) {
  await logEvent(EVENT[s.status], {
    visitId, doctorId,
    payload: { suggestionId: s.id, itemId: s.itemId, label: s.label, source: s.source, question: s.question, atSecond: s.resolvedAtSecond ?? s.atSecond },
  });
}

export async function logTransitions(visitId: string, doctorId: string, transitions: Transition[]) {
  for (const t of transitions) await logSuggestion(visitId, doctorId, t.suggestion);
}
