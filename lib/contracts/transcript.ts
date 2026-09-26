import { z } from "zod";

export const RoleSchema = z.enum(["clinician", "patient", "other", "unknown"]);
export type Role = z.infer<typeof RoleSchema>;

export const UtteranceSchema = z.object({
  id: z.string(),
  speaker: z.string(),
  role: RoleSchema,
  start: z.number(),
  end: z.number(),
  text: z.string(),
});
export type Utterance = z.infer<typeof UtteranceSchema>;

/** Word as returned by the ElevenLabs JS SDK (camelCase) or the raw API (snake_case). */
export const TranscriptWordSchema = z.object({
  text: z.string(),
  start: z.number().optional(),
  end: z.number().optional(),
  type: z.string(),
  speakerId: z.string().optional(),
  speaker_id: z.string().optional(),
});
export type TranscriptWord = z.infer<typeof TranscriptWordSchema>;

export const TranscriptSchema = z.object({
  text: z.string().optional(),
  languageCode: z.string().optional(),
  words: z.array(TranscriptWordSchema),
});
export type Transcript = z.infer<typeof TranscriptSchema>;
