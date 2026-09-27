import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { ApiError, readJson, route } from "@/lib/api";
import { loadPatient } from "@/lib/access";
import { requireDoctorApi } from "@/lib/auth/current";
import { getDb, schema } from "@/lib/db";
import { logEvent } from "@/lib/events";

export const runtime = "nodejs";

const Body = z.object({ action: z.enum(["done", "reopen"]) });

/**
 * POST { action: "done" } closes an open item right away, without waiting for the next visit; "reopen"
 * undoes that. Who and when go to the audit trail. Items closed by a signed visit (closedVisitId set)
 * can't be reopened here.
 */
export const POST = route(async (req: Request, ctx: RouteContext<"/api/patients/[patientId]/open-items/[itemId]">) => {
  const { patientId, itemId } = await ctx.params;
  const session = await requireDoctorApi();
  const patient = await loadPatient(patientId, session.doctorId);
  const { action } = await readJson(req, Body.parse);
  if (!z.uuid().safeParse(itemId).success) throw new ApiError(404, "Open item not found");

  const db = await getDb();
  const match = and(eq(schema.openItems.id, itemId), eq(schema.openItems.patientId, patient.id));
  const [item] = await db.select().from(schema.openItems).where(match);
  if (!item) throw new ApiError(404, "Open item not found");

  const payload = { patientId: patient.id, openItemId: item.id, text: item.text, category: item.category };
  if (action === "done") {
    if (item.status !== "open") throw new ApiError(409, "This item is already closed");
    await db.update(schema.openItems).set({ status: "closed" }).where(and(match, eq(schema.openItems.status, "open")));
    await logEvent("open_item_closed", { visitId: null, doctorId: session.doctorId, payload });
  } else {
    if (item.status !== "closed" || item.closedVisitId) throw new ApiError(409, "Only items marked done on the patient page can be reopened");
    await db.update(schema.openItems).set({ status: "open" }).where(match);
    await logEvent("open_item_reopened", { visitId: null, doctorId: session.doctorId, payload });
  }
  return NextResponse.json({ id: item.id, status: action === "done" ? "closed" : "open" });
});
