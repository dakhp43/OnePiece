import { and, eq, inArray } from "drizzle-orm";
import { after, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, readJson, route } from "@/lib/api";
import { loadVisit } from "@/lib/access";
import { requireDoctorApi } from "@/lib/auth/current";
import { DismissReasonSchema, type SignoffOverride } from "@/lib/contracts";
import { getDb, schema } from "@/lib/db";
import { logEvent } from "@/lib/events";
import { OPEN_PREFIX, unresolvedRequired } from "@/lib/gaps";
import { rememberSignedVisit } from "@/lib/memory/backboard";
import { computeReviewMetrics } from "@/lib/metrics";
import { vitalsFromNote } from "@/lib/vitals";
import { assertStatus, updateVisit } from "@/lib/visits";

export const runtime = "nodejs";

const Body = z.object({ overrideReason: DismissReasonSchema.optional() });

/**
 * Signs and freezes the note. 409 with the list if required gaps are unresolved and no override reason
 * was given. Closes addressed carry-forward items, records vitals, computes review metrics.
 */
export const POST = route(async (req: Request, ctx: RouteContext<"/api/visits/[visitId]/sign">) => {
  const { visitId } = await ctx.params;
  const session = await requireDoctorApi();
  const { overrideReason } = await readJson(req, Body.parse);
  const { visit } = await loadVisit(visitId, session.doctorId);
  assertStatus(visit, ["review"], "sign");
  if (!visit.note) throw new ApiError(409, "Nothing to sign");

  const gaps = visit.gaps ?? [];
  const blockers = unresolvedRequired(gaps);
  if (blockers.length && !overrideReason) {
    throw new ApiError(409, `${blockers.length} required items weren't addressed`, blockers.map((g) => ({ itemId: g.itemId, label: g.label })));
  }
  const overrides: SignoffOverride[] = blockers.map((g) => ({ itemId: g.itemId, label: g.label, reason: overrideReason! }));
  for (const o of overrides) {
    await logEvent("signoff_override", { visitId, doctorId: session.doctorId, payload: { ...o } });
  }

  const db = await getDb();
  const signedAt = new Date();

  // Carry-forward items addressed in this visit (covered in conversation, or resolved by the doctor) are closed.
  const closeIds = gaps
    .filter((g) => g.source === "open_item")
    .filter((g) => g.status === "covered" || g.resolution?.type === "filled" || g.resolution?.type === "dismissed")
    .map((g) => g.itemId.slice(OPEN_PREFIX.length));
  if (closeIds.length) {
    await db.update(schema.openItems)
      .set({ status: "closed", closedVisitId: visit.id })
      .where(and(inArray(schema.openItems.id, closeIds), eq(schema.openItems.patientId, visit.patientId)));
  }

  // Vitals typed at visit start win; anything else stated in the signed note fills the gaps.
  const vitals = { ...vitalsFromNote(visit.note), ...(visit.metrics?.vitals ?? {}) };
  if (Object.keys(vitals).length) {
    await db.insert(schema.vitals).values({ time: visit.startedAt ?? signedAt, patientId: visit.patientId, visitId: visit.id, ...vitals });
  }

  const metrics = computeReviewMetrics({
    note: visit.note, audit: visit.audit, utterances: visit.utterances ?? [], gaps,
    secondsProcessing: visit.metrics?.secondsProcessing ?? 0,
    reviewReadyAt: visit.metrics?.reviewReadyAt, signedAt,
  });
  await updateVisit(visit.id, {
    status: "signed",
    signedAt,
    signoffOverrides: overrides,
    metrics: { ...(visit.metrics ?? {}), ...metrics },
  });
  await logEvent("signed", { visitId, doctorId: session.doctorId, payload: { overrides: overrides.length, ...metrics } });

  // Fire-and-forget: longitudinal memory for the next pre-visit brief.
  after(() => rememberSignedVisit(visit.id).catch((err) => console.warn("[backboard] remember failed:", err.message)));
  return NextResponse.json({ ok: true, metrics });
});
