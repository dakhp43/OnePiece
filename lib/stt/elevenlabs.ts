import fs from "node:fs";
import path from "node:path";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import type { Transcript } from "@/lib/contracts";
import { ExternalError, withRetry } from "@/lib/http";

let client: ElevenLabsClient | null = null;
function getClient() {
  if (!process.env.ELEVENLABS_API_KEY) throw new ExternalError("elevenlabs", null, "ELEVENLABS_API_KEY is not set");
  client ??= new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });
  return client;
}

/**
 * Batch transcription with Scribe v2 Medical: word timestamps + diarization (2 speakers).
 * Keyterms are only sent when USE_KEYTERMS=true (they cost extra).
 */
export async function transcribe(audioPath: string, keyterms: string[] = []): Promise<Transcript> {
  const useKeyterms = process.env.USE_KEYTERMS === "true" && keyterms.length > 0;
  const res = await withRetry("elevenlabs", async () => {
    const file = new Blob([fs.readFileSync(audioPath)], { type: mimeFor(audioPath) });
    return getClient().speechToText.convert({
      file,
      modelId: process.env.ELEVENLABS_STT_MODEL || "scribe_v2_medical",
      diarize: true,
      numSpeakers: 2,
      timestampsGranularity: "word",
      tagAudioEvents: false,
      languageCode: "eng",
      ...(useKeyterms ? { keyterms: [...new Set(keyterms)].slice(0, 100) } : {}),
    });
  });
  if (!("words" in res) || !Array.isArray(res.words)) {
    throw new ExternalError("elevenlabs", null, "unexpected response shape (no words)");
  }
  return {
    text: res.text,
    languageCode: res.languageCode,
    words: res.words.map((w) => ({ text: w.text, start: w.start, end: w.end, type: w.type, speakerId: w.speakerId })),
  };
}

function mimeFor(file: string) {
  const ext = path.extname(file).toLowerCase();
  return ext === ".wav" ? "audio/wav" : ext === ".mp3" ? "audio/mpeg" : ext === ".m4a" ? "audio/mp4" : "audio/webm";
}
