import { z } from "zod";
import { readJson, route } from "@/lib/api";
import { requireDoctorApi } from "@/lib/auth/current";
import { SectionSchema, SentenceKindSchema } from "@/lib/contracts";
import { logEvent } from "@/lib/events";
import { nextSentenceId } from "@/lib/note";
import { mutateReview } from "@/lib/review";

export const runtime = "nodejs";

const Body = z.object({
  problemId: z.string(),
  section: SectionSchema,
  text: z.string().trim().min(1).max(1000),
  kind: SentenceKindSchema.optional(),
});

/** Clinician-added sentence (origin "clinician", scored 1.0). */
export const POST = route(async (req: Request, ctx: RouteContext<"/api/visits/[visitId]/sentences">) => {
  const { visitId } = await ctx.params;
  const session = await requireDoctorApi();
  const body = await readJson(req, Body.parse);
  return mutateReview(visitId, session.doctorId, async ({ note }) => {
    const id = nextSentenceId(note);
    note.sentences.push({
      id, problemId: body.problemId, section: body.section, text: body.text, kind: body.kind ?? "other",
      sourceUtteranceIds: [], origin: "clinician", review: "accepted",
    });
    await logEvent("sentence_added", { visitId, doctorId: session.doctorId, payload: { sentenceId: id, text: body.text } });
  });
});
