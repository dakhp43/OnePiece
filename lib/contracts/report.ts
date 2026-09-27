import { z } from "zod";

const Text = z.string().max(10_000);

export const ReportProblemSchema = z.object({
  problemId: z.string(),
  title: z.string().max(300),
  assessment: Text,
  plan: Text,
});
export type ReportProblem = z.infer<typeof ReportProblemSchema>;

/**
 * The clinician-facing visit report's narrative: generated from the signed note, then editable.
 * Chart data (vitals, medications, allergies, orders, overrides) is not stored here; it is read
 * live from the chart when the report is shown or exported, so it can't drift from the record.
 */
export const ReportSchema = z.object({
  chiefComplaint: z.string().max(500),
  hpi: Text,
  examination: Text,
  problems: z.array(ReportProblemSchema).max(50),
  additionalNotes: Text,
  /** ISO time of the clinician's last saved edit. */
  editedAt: z.string().optional(),
});
export type Report = z.infer<typeof ReportSchema>;
