import { z } from "zod";

export const ConfidenceLevelSchema = z.enum(["high", "medium", "low"]);
export type ConfidenceLevel = z.infer<typeof ConfidenceLevelSchema>;

export const SentenceScoreSchema = z.object({
  sentenceId: z.string(),
  score: z.number(),
  reasons: z.array(z.string()),
});
export type SentenceScore = z.infer<typeof SentenceScoreSchema>;

export const ProblemScoreSchema = z.object({
  problemId: z.string(),
  score: z.number(),
  level: ConfidenceLevelSchema,
  sentenceScores: z.array(SentenceScoreSchema),
});
export type ProblemScore = z.infer<typeof ProblemScoreSchema>;
