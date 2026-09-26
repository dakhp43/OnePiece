import { z } from "zod";

export const TaskCategorySchema = z.enum(["lab", "imaging", "referral", "medication", "followup", "education"]);
export type TaskCategory = z.infer<typeof TaskCategorySchema>;

export const TaskSchema = z.object({
  id: z.string(),
  category: TaskCategorySchema,
  description: z.string(),
  dueInDays: z.number().nullable(),
  sourceSentenceIds: z.array(z.string()),
});
export type Task = z.infer<typeof TaskSchema>;

export const PatientSummarySchema = z.object({
  language: z.enum(["en", "es"]),
  greeting: z.string(),
  whatWeDiscussed: z.array(z.object({ topic: z.string(), explanation: z.string() })),
  medicationChanges: z.array(
    z.object({
      name: z.string(),
      change: z.enum(["new", "changed", "stopped", "continue"]),
      instructions: z.string(),
    }),
  ),
  nextSteps: z.array(z.object({ text: z.string(), when: z.string().nullable() })),
  whenToGetHelp: z.array(z.string()),
  followUp: z.string().nullable(),
});
export type PatientSummary = z.infer<typeof PatientSummarySchema>;

export const FollowThroughSchema = z.object({
  tasks: z.array(TaskSchema),
  summaries: z.object({ en: PatientSummarySchema, es: PatientSummarySchema.optional() }),
  approvedLanguage: z.enum(["en", "es"]).nullable(),
  translationReviewed: z.boolean(),
});
export type FollowThrough = z.infer<typeof FollowThroughSchema>;

/** Gemini output for Call D. */
export const FollowThroughDraftSchema = z.object({
  tasks: z.array(TaskSchema),
  summaryEn: PatientSummarySchema,
});
export type FollowThroughDraft = z.infer<typeof FollowThroughDraftSchema>;
