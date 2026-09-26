import { z } from "zod";

export const SentenceVerdictSchema = z.object({
  sentenceId: z.string(),
  support: z.enum(["supported", "partial", "unsupported"]),
  hedged: z.boolean(),
  contradiction: z.boolean(),
  reason: z.string(),
});
export type SentenceVerdict = z.infer<typeof SentenceVerdictSchema>;

export const ChecklistStatusSchema = z.enum(["covered", "partial", "missing", "not_applicable"]);
export type ChecklistStatus = z.infer<typeof ChecklistStatusSchema>;

export const ChecklistVerdictSchema = z.object({
  itemId: z.string(),
  status: ChecklistStatusSchema,
  evidenceUtteranceIds: z.array(z.string()),
  explanation: z.string(),
});
export type ChecklistVerdict = z.infer<typeof ChecklistVerdictSchema>;

export const AuditResultSchema = z.object({
  sentenceVerdicts: z.array(SentenceVerdictSchema),
  checklist: z.array(ChecklistVerdictSchema),
});
export type AuditResult = z.infer<typeof AuditResultSchema>;
