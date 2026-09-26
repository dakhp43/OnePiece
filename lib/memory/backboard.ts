import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { PatientRow, VisitRow } from "@/lib/db/schema";
import { ExternalError, withRetry, withTimeout } from "@/lib/http";
import { SECTION_LABELS, liveSentences } from "@/lib/note";
import { VISIT_TYPE_LABELS, formatDate } from "@/lib/utils";

const BASE = "https://app.backboard.io/api";
const SYSTEM_PROMPT =
  "You maintain the longitudinal memory of a synthetic patient's clinic visits for their doctor. Be factual and brief.";

export function backboardEnabled() {
  return process.env.BACKBOARD_ENABLED !== "false" && Boolean(process.env.BACKBOARD_API_KEY);
}

async function bb<T>(path: string, body: unknown): Promise<T> {
  return withRetry("backboard", async () => {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "X-API-Key": process.env.BACKBOARD_API_KEY!, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new ExternalError("backboard", res.status, `${path} → ${res.status} ${(await res.text()).slice(0, 200)}`);
    return res.json() as Promise<T>;
  });
}

/** Plain-text memory of one signed visit: problems, key facts, plan, tasks, deferred items. */
export function visitMemoryText(visit: VisitRow, patient: PatientRow) {
  const note = visit.note;
  if (!note) return "";
  const lines = [
    `Signed visit on ${formatDate(visit.startedAt)} for ${patient.firstName} ${patient.lastName} (${VISIT_TYPE_LABELS[visit.visitType]}).`,
    `Chief complaint: ${note.chiefComplaint}.`,
    `Problems: ${note.problems.map((p) => p.title).join("; ")}.`,
  ];
  for (const p of note.problems) {
    const facts = liveSentences(note).filter((s) => s.problemId === p.id);
    if (!facts.length) continue;
    lines.push(`${p.title}:`);
    for (const s of facts) lines.push(`- ${SECTION_LABELS[s.section]}: ${s.text}`);
  }
  const tasks = visit.followthrough?.tasks ?? [];
  if (tasks.length) lines.push(`Tasks: ${tasks.map((t) => t.description).join("; ")}.`);
  const deferred = (visit.gaps ?? []).filter((g) => g.resolution?.type === "deferred").map((g) => g.label);
  if (deferred.length) lines.push(`Deferred to next visit: ${deferred.join("; ")}.`);
  return lines.join("\n");
}

async function addMemory(assistantId: string, visit: VisitRow, patient: PatientRow) {
  const content = visitMemoryText(visit, patient);
  if (!content) return;
  await bb(`/assistants/${assistantId}/memories`, {
    content,
    metadata: { visit_id: visit.id, visit_date: visit.startedAt?.toISOString() ?? null, synthetic: true },
  });
}

/**
 * One Backboard assistant per patient, created lazily. On creation, back-fills memories from every
 * signed visit already in the database (this is how the seeded history reaches Backboard).
 */
export async function ensureAssistant(patient: PatientRow): Promise<{ id: string; created: boolean }> {
  if (patient.backboardAssistantId) return { id: patient.backboardAssistantId, created: false };
  const res = await bb<{ assistant_id: string }>("/assistants", {
    name: `Patient memory: ${patient.firstName} ${patient.lastName} (synthetic)`,
    system_prompt: SYSTEM_PROMPT,
  });
  const db = await getDb();
  await db.update(schema.patients).set({ backboardAssistantId: res.assistant_id }).where(eq(schema.patients.id, patient.id));
  const signed = await db.select().from(schema.visits)
    .where(and(eq(schema.visits.patientId, patient.id), inArray(schema.visits.status, ["signed", "sent"])))
    .orderBy(asc(schema.visits.startedAt));
  for (const v of signed) await addMemory(res.assistant_id, v, patient);
  return { id: res.assistant_id, created: true };
}

/** Called fire-and-forget on sign-off. */
export async function rememberSignedVisit(visitId: string) {
  if (!backboardEnabled()) return;
  const db = await getDb();
  const [visit] = await db.select().from(schema.visits).where(eq(schema.visits.id, visitId));
  if (!visit) return;
  const [patient] = await db.select().from(schema.patients).where(eq(schema.patients.id, visit.patientId));
  const { id, created } = await ensureAssistant(patient);
  if (!created) await addMemory(id, visit, patient); // a fresh assistant was already back-filled with this visit
}

export const BRIEF_QUESTION =
  "Before today's visit, list in at most 5 bullets what the doctor should know: active problems, current medications and recent changes, outstanding items, and trends. Reply with bullets only, one per line, starting with \"- \".";

/** Asks the patient's assistant for the pre-visit brief using read-only memory. */
export async function backboardBrief(patient: PatientRow, context: string): Promise<string[]> {
  const { id } = await ensureAssistant(patient);
  const res = await withTimeout("backboard", bb<{ content?: string | null }>("/threads/messages", {
    assistant_id: id,
    content: `${BRIEF_QUESTION}\n\nCurrent chart snapshot (for trends and open items):\n${context}`,
    memory: "Readonly",
    stream: false,
  }), 25_000);
  const bullets = parseBullets(res.content ?? "");
  if (!bullets.length) throw new ExternalError("backboard", null, "empty brief");
  return bullets;
}

export function parseBullets(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").replace(/\*\*/g, "").trim())
    .filter((l) => l.length > 3)
    .slice(0, 5);
}
