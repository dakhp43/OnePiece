import { and, eq, ne } from "drizzle-orm";
import {
  FollowThroughDraftSchema, PatientSummarySchema, type FollowThrough, type PatientSummary, type Task,
} from "@/lib/contracts";
import { getDb, schema } from "@/lib/db";
import type { PatientRow, VisitRow } from "@/lib/db/schema";
import { demoFallbackEnabled, loadDemoFixture, saveLastGood } from "@/lib/fixtures";
import { withTimeout } from "@/lib/http";
import { followThrough } from "@/lib/llm/prompts/followThrough";
import { translateSummary } from "@/lib/llm/prompts/translateSummary";

const TIMEOUT = () => (demoFallbackEnabled() ? 30_000 : 120_000);

/** Runs an LLM step; on failure (or > 30 s) with DEMO_FALLBACK, returns the demo fixture instead. */
async function withFixture<T>(label: string, run: () => Promise<T>, fixture: () => T | null, offline: string[]): Promise<T> {
  try {
    return await withTimeout(label, run(), TIMEOUT());
  } catch (err) {
    const fx = demoFallbackEnabled() ? fixture() : null;
    if (!fx) throw err;
    console.warn(`[followthrough] ${label} failed (${(err as Error).message}); using demo fixture`);
    offline.push(label);
    return fx;
  }
}

export async function generateSpanish(en: PatientSummary, offline: string[]) {
  const es = await withFixture("translate", () => translateSummary(en), () => loadDemoFixture("summary_es", PatientSummarySchema), offline);
  saveLastGood("summary_es", es);
  return es;
}

/** Call D (+ Call E when the patient prefers Spanish). Input is only the signed note. */
export async function generateFollowThrough(visit: VisitRow, patient: PatientRow) {
  const offline: string[] = [];
  const draft = await withFixture(
    "followthrough",
    () => followThrough({ note: visit.note!, firstName: patient.firstName, knownMeds: patient.knownMedications }),
    () => loadDemoFixture("followthrough", FollowThroughDraftSchema),
    offline,
  );
  saveLastGood("followthrough", draft);
  const en = { ...draft.summaryEn, language: "en" as const };
  const ft: FollowThrough = {
    tasks: draft.tasks,
    summaries: { en, ...(patient.preferredLanguage === "es" ? { es: await generateSpanish(en, offline) } : {}) },
    approvedLanguage: null,
    translationReviewed: false,
  };
  return { ft, offline };
}

/** Every task becomes an open item so it's checked at the next visit. Re-synced when tasks are edited. */
export async function syncTaskOpenItems(visit: VisitRow, tasks: Task[]) {
  const db = await getDb();
  await db.delete(schema.openItems).where(and(
    eq(schema.openItems.sourceVisitId, visit.id),
    ne(schema.openItems.category, "deferred_gap"),
    eq(schema.openItems.status, "open"),
  ));
  if (!tasks.length) return;
  const base = visit.signedAt ?? new Date();
  await db.insert(schema.openItems).values(tasks.map((t) => ({
    patientId: visit.patientId,
    sourceVisitId: visit.id,
    text: t.description,
    category: t.category,
    dueDate: t.dueInDays != null ? new Date(base.getTime() + t.dueInDays * 86_400_000).toISOString().slice(0, 10) : null,
    status: "open" as const,
  })));
}
