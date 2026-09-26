import { z } from "zod";
import { ChecklistStatusSchema } from "./audit";

export const DismissReasonSchema = z.enum([
  "not_applicable", "addressed_elsewhere", "patient_declined", "other",
]);
export type DismissReason = z.infer<typeof DismissReasonSchema>;

export const DISMISS_REASON_LABELS: Record<DismissReason, string> = {
  not_applicable: "Not applicable",
  addressed_elsewhere: "Addressed elsewhere",
  patient_declined: "Patient declined",
  other: "Other",
};

export const GapResolutionSchema = z.union([
  z.object({ type: z.literal("filled"), sentenceId: z.string() }),
  z.object({ type: z.literal("dismissed"), reason: DismissReasonSchema }),
  z.object({ type: z.literal("deferred"), openItemId: z.string() }),
]);
export type GapResolution = z.infer<typeof GapResolutionSchema>;

export const GapItemSchema = z.object({
  itemId: z.string(),
  label: z.string(),
  priority: z.enum(["required", "recommended"]),
  source: z.enum(["template", "open_item"]),
  status: ChecklistStatusSchema,
  explanation: z.string(),
  evidenceUtteranceIds: z.array(z.string()),
  defaultSection: z.enum(["S", "O", "A", "P"]),
  resolution: GapResolutionSchema.nullable(),
});
export type GapItem = z.infer<typeof GapItemSchema>;
