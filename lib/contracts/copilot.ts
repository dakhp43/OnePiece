import { z } from "zod";

/**
 * Live Copilot: what the AI has heard so far during recording, and the few questions it chose to suggest.
 * Stored in visits.copilot. The after-visit audit (visits.gaps) stays the authoritative record.
 */

export const CoverageStatusSchema = z.enum(["covered", "partial", "missing", "unknown", "not_applicable"]);
export type CoverageStatus = z.infer<typeof CoverageStatusSchema>;

export const CoverageItemSchema = z.object({
  itemId: z.string(),
  label: z.string(),
  priority: z.enum(["required", "recommended"]),
  source: z.enum(["template", "open_item"]),
  /** Template condition, e.g. "only if a new medication is prescribed". */
  condition: z.string().nullable(),
  /** Latest model judgement of whether the condition now applies (null for unconditioned items). */
  conditionMet: z.boolean().nullable(),
  status: CoverageStatusSchema,
  evidenceQuote: z.string().nullable(),
  /** Visit second at which the status last changed. */
  updatedAtSecond: z.number(),
});
export type CoverageItem = z.infer<typeof CoverageItemSchema>;

/** One committed chunk of the live transcript. */
export const LiveSegmentSchema = z.object({
  id: z.string().max(20),
  text: z.string().max(2000),
  atSecond: z.number().min(0),
});
export type LiveSegment = z.infer<typeof LiveSegmentSchema>;

export const SuggestionSourceSchema = z.enum(["checklist", "open_item", "clinical"]);
export type SuggestionSource = z.infer<typeof SuggestionSourceSchema>;

export const SuggestionStatusSchema = z.enum(["shown", "dismissed", "captured", "expired"]);
export type SuggestionStatus = z.infer<typeof SuggestionStatusSchema>;

export const SuggestionSchema = z.object({
  id: z.string(),
  /** Checklist or open item this asks about; null for a free-form clinical question. */
  itemId: z.string().nullable(),
  /** The item's label (null for clinical), so review and audit trail can show it without a lookup. */
  label: z.string().nullable(),
  source: SuggestionSourceSchema,
  question: z.string(),
  reason: z.string(),
  confidence: z.number(),
  status: SuggestionStatusSchema,
  atSecond: z.number(),
  resolvedAtSecond: z.number().nullable(),
});
export type Suggestion = z.infer<typeof SuggestionSchema>;

export const CopilotStateSchema = z.object({
  version: z.literal(1),
  mode: z.enum(["live", "replay"]),
  status: z.enum(["listening", "ended", "error"]),
  checks: z.number(),
  lastCheckSecond: z.number(),
  lastWordCount: z.number(),
  coverage: z.array(CoverageItemSchema),
  suggestions: z.array(SuggestionSchema),
  /** Realtime audio seconds reserved against the daily cap when the token was minted. */
  realtimeSecondsReserved: z.number(),
  error: z.string().optional(),
});
export type CopilotState = z.infer<typeof CopilotStateSchema>;

/** What the model returns for one live check (Gemini call "copilot"). */
export const LiveCoverageResultSchema = z.object({
  items: z.array(z.object({
    itemId: z.string(),
    status: CoverageStatusSchema,
    conditionMet: z.boolean().nullable(),
    evidenceQuote: z.string().nullable(),
  })),
  candidates: z.array(z.object({
    itemId: z.string().nullable(),
    question: z.string(),
    reason: z.string(),
    confidence: z.number().min(0).max(1),
    aboutCurrentTopic: z.boolean(),
  })).max(3),
  /** Ids of shown clinical (free-form) suggestions that the conversation has now answered. */
  resolvedSuggestionIds: z.array(z.string()),
});
export type LiveCoverageResult = z.infer<typeof LiveCoverageResultSchema>;
export type Candidate = LiveCoverageResult["candidates"][number];

/** Saved model results by visit second; replays them when Gemini is unavailable during the scripted demo. */
export const CopilotTimelineSchema = z.array(z.object({ atSecond: z.number(), result: LiveCoverageResultSchema }));
export type CopilotTimeline = z.infer<typeof CopilotTimelineSchema>;

export const CopilotCheckBodySchema = z.object({
  mode: z.enum(["live", "replay"]),
  elapsedSeconds: z.number().min(0).max(3600),
  segments: z.array(LiveSegmentSchema).max(400),
  /** Uncommitted text still being spoken, if any. */
  partial: z.string().max(2000).optional(),
});
export type CopilotCheckBody = z.infer<typeof CopilotCheckBodySchema>;
