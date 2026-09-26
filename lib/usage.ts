import fs from "node:fs";
import path from "node:path";
import { ExternalError } from "@/lib/http";

/**
 * Daily spend guard for the free tiers. Counts every real API call (including retries) in
 * data/usage/YYYY-MM-DD.json. When a limit is hit, calls throw instead of reaching the API,
 * and the pipeline falls back to the demo fixtures (DEMO_FALLBACK) like any other failure.
 */
const DIR = path.join(process.cwd(), "data", "usage");

interface Usage {
  geminiCalls: number;
  sttSeconds: number;
  sttCalls: number;
  backboardCalls: number;
}

export const LIMITS = {
  geminiCalls: () => Number(process.env.GEMINI_DAILY_CALL_LIMIT || 150),
  sttSeconds: () => Number(process.env.STT_DAILY_AUDIO_MINUTES || 30) * 60,
  maxRecordingSeconds: () => Number(process.env.MAX_RECORDING_MINUTES || 10) * 60,
  backboardCalls: () => Number(process.env.BACKBOARD_DAILY_CALL_LIMIT || 60),
};

const today = () => new Date().toISOString().slice(0, 10);
const file = () => path.join(DIR, `${today()}.json`);

export function readUsage(): Usage {
  try {
    return { geminiCalls: 0, sttSeconds: 0, sttCalls: 0, backboardCalls: 0, ...JSON.parse(fs.readFileSync(file(), "utf8")) };
  } catch {
    return { geminiCalls: 0, sttSeconds: 0, sttCalls: 0, backboardCalls: 0 };
  }
}

function write(u: Usage) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(u, null, 2));
}

/** Call immediately before each Gemini request. */
export function reserveGeminiCall(label: string) {
  const u = readUsage();
  if (u.geminiCalls >= LIMITS.geminiCalls()) {
    throw new ExternalError("usage", null, `${label}: daily Gemini call limit (${LIMITS.geminiCalls()}) reached`);
  }
  write({ ...u, geminiCalls: u.geminiCalls + 1 });
}

/** Call immediately before each Backboard request (memory writes, brief, assistant create/delete). */
export function reserveBackboardCall(path: string) {
  const u = readUsage();
  if (u.backboardCalls >= LIMITS.backboardCalls()) {
    throw new ExternalError("usage", null, `backboard ${path}: daily call limit (${LIMITS.backboardCalls()}) reached`);
  }
  write({ ...u, backboardCalls: u.backboardCalls + 1 });
}

/** Call before sending audio to ElevenLabs; `seconds` is the recording length. */
export function reserveTranscription(seconds: number) {
  const u = readUsage();
  if (seconds > LIMITS.maxRecordingSeconds()) {
    throw new ExternalError("usage", null, `recording is ${Math.round(seconds / 60)} min; limit is ${LIMITS.maxRecordingSeconds() / 60} min`);
  }
  if (u.sttSeconds + seconds > LIMITS.sttSeconds()) {
    throw new ExternalError("usage", null, `daily transcription limit (${LIMITS.sttSeconds() / 60} min of audio) reached`);
  }
  write({ ...u, sttSeconds: Math.round(u.sttSeconds + seconds), sttCalls: u.sttCalls + 1 });
}
