import { z } from "zod";

/**
 * Live Copilot: the topics the conversation has opened so far, which of them are only half answered,
 * and the few follow-up questions it chose to suggest. Stored in visits.copilot. It follows the
 * conversation only (plus the chart's medications and allergies); the after-visit audit stays the
 * authoritative record.
 */

/** One topic the conversation opened, e.g. "Cough", with what's been established and what's still open. */
export const ThreadSchema = z.object({
  id: z.string(),
  topic: z.string(),
  /** Short facts already established, e.g. "3 weeks", "worse at night". */
  known: z.array(z.string()),
  /** Details still unanswered that matter for this topic, e.g. "fever". Empty when complete. */
  missing: z.array(z.string()),
  /** Visit second at which the topic last changed. */
  updatedAtSecond: z.number(),
});
export type Thread = z.infer<typeof ThreadSchema>;

/** One committed chunk of the live transcript. */
export const LiveSegmentSchema = z.object({
  id: z.string().max(20),
  text: z.string().max(2000),
  atSecond: z.number().min(0),
});
export type LiveSegment = z.infer<typeof LiveSegmentSchema>;

export const SuggestionStatusSchema = z.enum(["shown", "dismissed", "captured", "expired"]);
export type SuggestionStatus = z.infer<typeof SuggestionStatusSchema>;

export const SuggestionSchema = z.object({
  id: z.string(),
  /** The topic this follows up on. */
  threadId: z.string(),
  topic: z.string(),
  question: z.string(),
  reason: z.string(),
  confidence: z.number(),
  status: SuggestionStatusSchema,
  atSecond: z.number(),
  resolvedAtSecond: z.number().nullable(),
});
export type Suggestion = z.infer<typeof SuggestionSchema>;

export const CopilotStateSchema = z.object({
  version: z.literal(2),
  mode: z.enum(["live", "replay"]),
  status: z.enum(["listening", "ended", "error"]),
  checks: z.number(),
  lastCheckSecond: z.number(),
  lastWordCount: z.number(),
  threads: z.array(ThreadSchema),
  suggestions: z.array(SuggestionSchema),
  /** Realtime audio seconds reserved against the daily cap when the token was minted. */
  realtimeSecondsReserved: z.number(),
  error: z.string().optional(),
});
export type CopilotState = z.infer<typeof CopilotStateSchema>;

/** What the model returns for one live check (Gemini call "copilot"). */
export const LiveCheckResultSchema = z.object({
  /** Every topic so far. Reuse the given id for a known topic; id null for a new one. */
  threads: z.array(z.object({
    id: z.string().nullable(),
    topic: z.string(),
    known: z.array(z.string()),
    missing: z.array(z.string()),
  })).max(12),
  candidates: z.array(z.object({
    /** Id of the topic this follows up on, or its exact topic name if the topic is new in this answer. */
    thread: z.string(),
    question: z.string(),
    reason: z.string(),
    confidence: z.number().min(0).max(1),
  })).max(3),
  /** Ids of previously shown suggestions that the conversation has now answered. */
  resolvedSuggestionIds: z.array(z.string()),
});
export type LiveCheckResult = z.infer<typeof LiveCheckResultSchema>;
export type Candidate = LiveCheckResult["candidates"][number];

/** Saved model results by visit second; replays them when Gemini is unavailable during the scripted demo. */
export const CopilotTimelineSchema = z.array(z.object({ atSecond: z.number(), result: LiveCheckResultSchema }));
export type CopilotTimeline = z.infer<typeof CopilotTimelineSchema>;

export const CopilotCheckBodySchema = z.object({
  mode: z.enum(["live", "replay"]),
  elapsedSeconds: z.number().min(0).max(3600),
  segments: z.array(LiveSegmentSchema).max(400),
  /** Uncommitted text still being spoken, if any. */
  partial: z.string().max(2000).optional(),
});
export type CopilotCheckBody = z.infer<typeof CopilotCheckBodySchema>;
