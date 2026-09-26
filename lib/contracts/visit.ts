import { z } from "zod";

export const VisitTypeSchema = z.enum(["htn_followup", "t2dm_followup", "acute_respiratory"]);
export type VisitType = z.infer<typeof VisitTypeSchema>;

export const VisitStatusSchema = z.enum(["created", "recording", "processing", "review", "signed", "sent", "error"]);
export type VisitStatus = z.infer<typeof VisitStatusSchema>;

export const ProcessingStepSchema = z.enum(["transcribing", "drafting", "auditing", "scoring"]);
export type ProcessingStep = z.infer<typeof ProcessingStepSchema>;
export const PROCESSING_STEPS = ProcessingStepSchema.options;

export const VitalsInputSchema = z.object({
  systolic: z.number().int().min(50).max(300).optional(),
  diastolic: z.number().int().min(20).max(200).optional(),
  heartRate: z.number().int().min(20).max(250).optional(),
  tempF: z.number().min(85).max(115).optional(),
  spo2: z.number().int().min(50).max(100).optional(),
  weightLb: z.number().min(1).max(1000).optional(),
});
export type VitalsInput = z.infer<typeof VitalsInputSchema>;

export const MedicationSchema = z.object({ name: z.string(), dose: z.string(), frequency: z.string() });
export type Medication = z.infer<typeof MedicationSchema>;

export const OpenItemCategorySchema = z.enum([
  "lab", "imaging", "referral", "medication", "followup", "education", "deferred_gap",
]);
export type OpenItemCategory = z.infer<typeof OpenItemCategorySchema>;

export const SignoffOverrideSchema = z.object({
  itemId: z.string(),
  label: z.string(),
  reason: z.string(),
});
export type SignoffOverride = z.infer<typeof SignoffOverrideSchema>;

/**
 * Bookkeeping stored in visits.metrics while the visit is in progress.
 * Replaced by ReviewMetrics (plus these fields) at sign-off.
 */
export const VisitRuntimeSchema = z.object({
  vitals: VitalsInputSchema.optional(),
  /** Audio came from the demo fixture ("Load demo visit"). */
  demo: z.boolean().optional(),
  /** Length of the uploaded recording, for the daily transcription budget. */
  recordingSeconds: z.number().optional(),
  processingStartedAt: z.string().optional(),
  reviewReadyAt: z.string().optional(),
  secondsProcessing: z.number().optional(),
  offlineSteps: z.array(z.string()).optional(),
  errorMessage: z.string().optional(),
});
export type VisitRuntime = z.infer<typeof VisitRuntimeSchema>;
