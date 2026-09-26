import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { ApiError, readJson, route } from "@/lib/api";
import { requireDoctorApi } from "@/lib/auth/current";
import { DismissReasonSchema, SectionSchema } from "@/lib/contracts";
import { getDb, schema } from "@/lib/db";
import { logEvent } from "@/lib/events";
import { OPEN_PREFIX } from "@/lib/gaps";
import { nextSentenceId } from "@/lib/note";
import { findGap, mutateReview } from "@/lib/review";

export const runtime = "nodejs";

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("fill"),
    text: z.string().trim().min(1).max(1000),
    problemId: z.string(),
    section: SectionSchema.optional(),
  }),
  z.object({ action: z.literal("dismiss"), reason: DismissReasonSchema }),
  z.object({ action: z.literal("defer") }),
  z.object({ action: z.literal("reopen") }),
]);

/** Resolve a missed checklist item: fill (adds a clinician sentence), dismiss with a reason, or defer to next visit. */
export const POST = route(async (req: Request, ctx: RouteContext<"/api/visits/[visitId]/gaps/[itemId]">) => {
  const { visitId, itemId: rawItemId } = await ctx.params;
  const itemId = decodeURIComponent(rawItemId);
  const session = await requireDoctorApi();
  const body = await readJson(req, Body.parse);
  const db = await getDb();

  return mutateReview(visitId, session.doctorId, async ({ note, gaps, visit }) => {
    const gap = findGap(gaps, itemId);
    const log = { visitId, doctorId: session.doctorId };

    if (body.action === "reopen") {
      const r = gap.resolution;
      if (r?.type === "filled") note.sentences = note.sentences.filter((s) => s.id !== r.sentenceId);
      if (r?.type === "deferred" && gap.source === "template") {
        await db.delete(schema.openItems).where(and(eq(schema.openItems.id, r.openItemId), eq(schema.openItems.sourceVisitId, visit.id)));
      }
      gap.resolution = null;
      return;
    }
    if (gap.resolution) throw new ApiError(409, "Item already resolved; reopen it first");

    if (body.action === "fill") {
      const id = nextSentenceId(note);
      note.sentences.push({
        id, problemId: body.problemId, section: body.section ?? gap.defaultSection, text: body.text,
        kind: "other", sourceUtteranceIds: [], origin: "clinician", review: "accepted",
      });
      gap.resolution = { type: "filled", sentenceId: id };
      await logEvent("gap_filled", { ...log, payload: { itemId, sentenceId: id, text: body.text } });
    } else if (body.action === "dismiss") {
      gap.resolution = { type: "dismissed", reason: body.reason };
      await logEvent("gap_dismissed", { ...log, payload: { itemId, reason: body.reason } });
    } else {
      let openItemId: string;
      if (gap.source === "open_item") {
        // Already an open item from a previous visit: it simply stays open.
        openItemId = itemId.slice(OPEN_PREFIX.length);
      } else {
        const [row] = await db.insert(schema.openItems).values({
          patientId: visit.patientId, sourceVisitId: visit.id, text: gap.label, category: "deferred_gap", status: "open",
        }).returning();
        openItemId = row.id;
      }
      gap.resolution = { type: "deferred", openItemId };
      await logEvent("gap_deferred", { ...log, payload: { itemId, openItemId } });
    }
  });
});
