import type { CopilotState, Suggestion } from "@/lib/contracts";

/** For the review screen: the live prompt made for each checklist item, if any. */
export function liveMarks(copilot: CopilotState | null | undefined): Map<string, Suggestion> {
  return new Map((copilot?.suggestions ?? []).filter((s) => s.itemId !== null).map((s) => [s.itemId!, s]));
}

/** Prompts the doctor acted on: the question was suggested live and the conversation then covered it. */
export function gapsCaughtLive(copilot: CopilotState | null | undefined) {
  return (copilot?.suggestions ?? []).filter((s) => s.status === "captured").length;
}
