import fs from "node:fs";
import path from "node:path";
import {
  AuditResultSchema, DraftNoteSchema, TranscriptSchema, UtteranceSchema,
  type AuditResult, type Note, type ProcessingStep, type Transcript, type Utterance,
} from "@/lib/contracts";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { logEvent } from "@/lib/events";
import { DEMO_AUDIO, demoFallbackEnabled, loadDemoFixture, saveLastGood } from "@/lib/fixtures";
import { buildChecklist, buildGaps, portableAudit, remapFixtureOpenItems } from "@/lib/gaps";
import { ExternalError, isRetryable, statusOf, withTimeout } from "@/lib/http";
import { auditNote } from "@/lib/llm/prompts/auditNote";
import { draftNote, toNote } from "@/lib/llm/prompts/draftNote";
import { getOpenItems } from "@/lib/queries";
import { scoreNote } from "@/lib/scoring/confidence";
import { transcribe } from "@/lib/stt/elevenlabs";
import { applySpeakerRoles, buildUtterances } from "@/lib/stt/utterances";
import { getTemplate } from "@/lib/templates";
import { AUDIO_DIR, updateVisit } from "@/lib/visits";

const DEMO_STEP_TIMEOUT_MS = 30_000;
const STEP_TIMEOUT_MS = 180_000;

class DemoUnavailable extends Error {}

/**
 * Runs transcribe → draft → audit → score for a visit, updating processing_step as it goes.
 * With DEMO_FALLBACK=true, any failing or slow (> 30 s) external step switches the visit onto the
 * committed demo fixtures from that point back (transcript, audio, note, audit) and marks it offline.
 */
export async function runPipeline(visitId: string) {
  const db = await getDb();
  const [visit] = await db.select().from(schema.visits).where(eq(schema.visits.id, visitId));
  if (!visit) throw new Error(`visit ${visitId} not found`);
  const [patient] = await db.select().from(schema.patients).where(eq(schema.patients.id, visit.patientId));
  const template = getTemplate(visit.visitType);
  const demoMode = demoFallbackEnabled();
  const timeout = demoMode ? DEMO_STEP_TIMEOUT_MS : STEP_TIMEOUT_MS;
  const offline = new Set<string>();

  let transcript: Transcript | null = visit.transcript ?? null;
  let utterances: Utterance[] = [];
  let note: Note | null = null;
  let audit: AuditResult | null = null;
  let audioPath = visit.audioPath;

  // After a network-level failure in demo mode, skip remaining live calls instead of retrying each one.
  let networkDown = false;
  const live = <T,>(label: string, run: () => Promise<T>) => {
    if (networkDown) return Promise.reject(new ExternalError(label, null, "skipped: network unavailable"));
    return withTimeout(label, run(), timeout);
  };

  const setStep = (step: ProcessingStep) => updateVisit(visitId, { processingStep: step });

  /** Replace everything up to `upTo` with the demo fixtures. */
  const switchToDemo = (upTo: "transcript" | "note" | "audit", err: unknown) => {
    if (!demoMode) throw err;
    if (statusOf(err) === null && isRetryable(err)) networkDown = true;
    console.warn(`[pipeline] ${upTo} failed (${(err as Error).message}); using demo fixtures`);
    const t = loadDemoFixture("transcript", TranscriptSchema);
    const u = loadDemoFixture("utterances", UtteranceSchema.array());
    if (!t || !u) throw new DemoUnavailable("demo transcript fixture missing");
    if (!offline.has("transcribing")) {
      transcript = t;
      utterances = u;
      offline.add("transcribing");
      // Keep click-to-source aligned with the fixture's timestamps.
      const demoCopy = path.join(AUDIO_DIR, `${visitId}.demo${path.extname(DEMO_AUDIO)}`);
      fs.mkdirSync(AUDIO_DIR, { recursive: true });
      fs.copyFileSync(DEMO_AUDIO, demoCopy);
      audioPath = demoCopy;
    }
    if (upTo === "note" || upTo === "audit") {
      const n = loadDemoFixture("note", DraftNoteSchema);
      if (!n) throw new DemoUnavailable("demo note fixture missing");
      note = toNote(n);
      utterances = applySpeakerRoles(utterances, note.speakerRoles);
      offline.add("drafting");
    }
    if (upTo === "audit") {
      const a = loadDemoFixture("audit", AuditResultSchema);
      if (!a) throw new DemoUnavailable("demo audit fixture missing");
      audit = a;
      offline.add("auditing");
    }
  };

  try {
    // 1. Transcribe (reuses a saved transcript on retry to save quota)
    await setStep("transcribing");
    if (!transcript) {
      try {
        if (!audioPath || !fs.existsSync(audioPath)) throw new Error("No audio recorded for this visit");
        const keyterms = [...template.keyterms, ...patient.knownMedications.map((m) => m.name)];
        transcript = await live("elevenlabs", () => transcribe(audioPath!, keyterms));
        saveLastGood("transcript", transcript);
      } catch (err) {
        switchToDemo("transcript", err);
      }
    }
    if (utterances.length === 0) utterances = buildUtterances(transcript!);
    if (utterances.length === 0) throw new Error("No speech was detected in the recording");
    saveLastGood("utterances", utterances);
    await updateVisit(visitId, { transcript, utterances, audioPath });

    // 2. Draft note (Call A)
    await setStep("drafting");
    try {
      const draft = await live("gemini:draft", () => draftNote({
        utterances, visitType: visit.visitType,
        knownMeds: patient.knownMedications, knownAllergies: patient.knownAllergies,
      }));
      saveLastGood("note", draft);
      note = toNote(draft);
      utterances = applySpeakerRoles(utterances, note.speakerRoles);
    } catch (err) {
      switchToDemo("note", err);
    }
    await updateVisit(visitId, { transcript, utterances, audioPath, note });
    await logEvent("note_drafted", {
      visitId, doctorId: visit.doctorId,
      payload: { sentences: note!.sentences.length, problems: note!.problems.length, offline: offline.has("drafting") },
    });

    // 3. Audit (Call B) — separate call so the model checks work it didn't just write
    await setStep("auditing");
    const openItems = await getOpenItems(patient.id);
    const checklist = buildChecklist(template, openItems);
    if (!audit) {
      try {
        audit = await live("gemini:audit", () => auditNote({ utterances, note: note!, checklist }));
        saveLastGood("audit", portableAudit(audit, openItems));
      } catch (err) {
        switchToDemo("audit", err);
      }
    }

    if (offline.has("auditing")) audit = remapFixtureOpenItems(audit!, openItems);

    // 4. Score (deterministic) + gaps
    await setStep("scoring");
    const scores = scoreNote(note!, audit!.sentenceVerdicts, utterances);
    const gaps = buildGaps(template, openItems, audit!);

    const readyAt = new Date();
    const endedAt = visit.endedAt ?? readyAt;
    const [fresh] = await db.select({ metrics: schema.visits.metrics }).from(schema.visits).where(eq(schema.visits.id, visitId));
    await updateVisit(visitId, {
      transcript, utterances, audioPath, note, audit, scores, gaps,
      status: "review",
      processingStep: null,
      metrics: {
        ...(fresh?.metrics ?? {}),
        reviewReadyAt: readyAt.toISOString(),
        secondsProcessing: Math.round((readyAt.getTime() - endedAt.getTime()) / 100) / 10,
        offlineSteps: [...offline],
        errorMessage: undefined,
      },
    });
  } catch (err) {
    console.error("[pipeline] failed", err);
    const [fresh] = await db.select({ metrics: schema.visits.metrics }).from(schema.visits).where(eq(schema.visits.id, visitId));
    await updateVisit(visitId, {
      status: "error",
      metrics: { ...(fresh?.metrics ?? {}), errorMessage: (err as Error).message.slice(0, 500) },
    });
  }
}
