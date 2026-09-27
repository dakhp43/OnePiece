import { z } from "zod";

export const ReviewMetricsSchema = z.object({
  totalSentences: z.number(),
  flaggedSentences: z.number(),
  reviewedSentences: z.number(),
  editedSentences: z.number(),
  deletedSentences: z.number(),
  clinicianAddedSentences: z.number(),
  gapsFound: z.number(),
  gapsResolved: z.number(),
  /** Checklist gaps the live copilot prompted and the conversation then covered (optional: older visits lack it). */
  gapsCaughtLive: z.number().optional(),
  secondsProcessing: z.number(),
  secondsToSign: z.number(),
});
export type ReviewMetrics = z.infer<typeof ReviewMetricsSchema>;
