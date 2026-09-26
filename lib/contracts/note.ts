import { z } from "zod";

export const ProblemSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(["new", "established", "general"]),
});
export type Problem = z.infer<typeof ProblemSchema>;

export const SectionSchema = z.enum(["S", "O", "A", "P"]);
export type Section = z.infer<typeof SectionSchema>;

export const SentenceKindSchema = z.enum([
  "symptom", "history", "medication", "dose", "vital", "exam", "assessment", "plan", "other",
]);
export type SentenceKind = z.infer<typeof SentenceKindSchema>;

export const SentenceSchema = z.object({
  id: z.string(),
  problemId: z.string(),
  section: SectionSchema,
  text: z.string(),
  sourceUtteranceIds: z.array(z.string()),
  kind: SentenceKindSchema,
  origin: z.enum(["ai", "clinician"]),
  review: z.enum(["unreviewed", "accepted", "edited", "deleted"]),
  originalText: z.string().optional(),
});
export type Sentence = z.infer<typeof SentenceSchema>;

export const SpeakerRoleSchema = z.enum(["clinician", "patient", "other"]);

export const NoteSchema = z.object({
  chiefComplaint: z.string(),
  speakerRoles: z.record(z.string(), SpeakerRoleSchema),
  problems: z.array(ProblemSchema),
  sentences: z.array(SentenceSchema),
});
export type Note = z.infer<typeof NoteSchema>;

/**
 * What Gemini returns for Call A. speakerRoles is an array (not a map) because
 * structured-output schemas handle fixed-shape arrays more reliably than open maps.
 */
export const DraftNoteSchema = z.object({
  chiefComplaint: z.string(),
  speakerRoles: z.array(z.object({ speaker: z.string(), role: SpeakerRoleSchema })),
  problems: z.array(ProblemSchema),
  sentences: z.array(
    SentenceSchema.pick({
      id: true, problemId: true, section: true, text: true, sourceUtteranceIds: true, kind: true,
    }),
  ),
});
export type DraftNote = z.infer<typeof DraftNoteSchema>;
