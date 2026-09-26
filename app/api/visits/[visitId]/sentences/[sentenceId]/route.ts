import { z } from "zod";
import { ApiError, readJson, route } from "@/lib/api";
import { requireDoctorApi } from "@/lib/auth/current";
import { logEvent } from "@/lib/events";
import { findSentence, mutateReview } from "@/lib/review";

export const runtime = "nodejs";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept") }),
  z.object({ action: z.literal("edit"), text: z.string().trim().min(1).max(1000) }),
  z.object({ action: z.literal("delete") }),
  z.object({ action: z.literal("restore") }),
]);

export const PATCH = route(async (req: Request, ctx: RouteContext<"/api/visits/[visitId]/sentences/[sentenceId]">) => {
  const { visitId, sentenceId } = await ctx.params;
  const session = await requireDoctorApi();
  const body = await readJson(req, Body.parse);

  return mutateReview(visitId, session.doctorId, async ({ note }) => {
    const s = findSentence(note, sentenceId);
    const before = s.text;
    switch (body.action) {
      case "accept":
        if (s.review === "deleted") throw new ApiError(409, "Restore the sentence before accepting it");
        if (s.review === "unreviewed") s.review = "accepted";
        await logEvent("sentence_accepted", { visitId, doctorId: session.doctorId, payload: { sentenceId, text: s.text } });
        break;
      case "edit":
        if (body.text === s.text) break;
        s.originalText ??= s.text;
        s.text = body.text;
        s.review = "edited";
        await logEvent("sentence_edited", { visitId, doctorId: session.doctorId, payload: { sentenceId, before, after: body.text } });
        break;
      case "delete":
        s.review = "deleted";
        await logEvent("sentence_deleted", { visitId, doctorId: session.doctorId, payload: { sentenceId, text: s.text } });
        break;
      case "restore":
        s.review = s.originalText ? "edited" : "unreviewed";
        break;
    }
  });
});
