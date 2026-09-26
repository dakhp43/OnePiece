import fs from "node:fs";
import path from "node:path";
import type { Transcript, TranscriptWord } from "@/lib/contracts";
import { buildUtterances } from "@/lib/stt/utterances";

// Stitches the SAPI per-line WAVs from make-demo-audio.ps1 into demo.wav and writes an
// ElevenLabs-shaped transcript.json + utterances.json with matching word timestamps.
const DEMO = path.join(process.cwd(), "data", "fixtures", "demo");
const TTS = path.join(DEMO, "tts");
const LEAD_S = 0.4;
const GAP_S = 0.55;

interface LineTiming {
  index: number; speaker: string; text: string; file: string;
  words: { text: string; start: number; charPos: number }[];
}

function readPcm(file: string) {
  const buf = fs.readFileSync(file);
  let off = 12;
  let fmt: Buffer | null = null;
  while (off < buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "fmt ") fmt = buf.subarray(off + 8, off + 8 + size);
    if (id === "data") return { fmt: fmt!, data: buf.subarray(off + 8, off + 8 + size) };
    off += 8 + size + (size % 2);
  }
  throw new Error(`no data chunk in ${file}`);
}

function wavFile(fmt: Buffer, data: Buffer) {
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(4 + 8 + fmt.length + 8 + data.length, 4);
  header.write("WAVE", 8, "ascii");
  const fmtHead = Buffer.alloc(8);
  fmtHead.write("fmt ", 0, "ascii");
  fmtHead.writeUInt32LE(fmt.length, 4);
  const dataHead = Buffer.alloc(8);
  dataHead.write("data", 0, "ascii");
  dataHead.writeUInt32LE(data.length, 4);
  return Buffer.concat([header, fmtHead, fmt, dataHead, data]);
}

const round = (n: number) => Math.round(n * 1000) / 1000;

function main() {
  const timings: LineTiming[] = JSON.parse(fs.readFileSync(path.join(TTS, "timings.json"), "utf8").replace(/^﻿/, ""));
  let fmt: Buffer | null = null;
  const chunks: Buffer[] = [];
  const words: TranscriptWord[] = [];
  let bytesPerSec = 32000;
  let cursor = LEAD_S;

  const silence = (s: number) => Buffer.alloc(Math.round((s * bytesPerSec) / 2) * 2);

  for (const line of timings) {
    const pcm = readPcm(path.join(TTS, line.file));
    fmt ??= pcm.fmt;
    bytesPerSec = fmt.readUInt32LE(8);
    if (chunks.length === 0) chunks.push(silence(LEAD_S));
    const duration = pcm.data.length / bytesPerSec;
    const ws = [...line.words].sort((a, b) => a.charPos - b.charPos);
    ws.forEach((w, i) => {
      const next = ws[i + 1];
      const token = line.text.slice(w.charPos, next ? next.charPos : undefined).trim();
      const start = cursor + w.start;
      const end = next ? cursor + next.start - 0.03 : cursor + Math.min(duration - 0.05, w.start + 0.7);
      if (words.length) words.push({ text: " ", start: words.at(-1)!.end, end: round(start), type: "spacing", speakerId: line.speaker });
      words.push({ text: token, start: round(start), end: round(Math.max(start + 0.05, end)), type: "word", speakerId: line.speaker });
    });
    chunks.push(pcm.data, silence(GAP_S));
    cursor += duration + GAP_S;
  }

  const transcript: Transcript = {
    languageCode: "eng",
    text: timings.map((t) => t.text).join(" "),
    words,
  };
  fs.writeFileSync(path.join(DEMO, "demo.wav"), wavFile(fmt!, Buffer.concat(chunks)));
  fs.writeFileSync(path.join(DEMO, "transcript.json"), JSON.stringify(transcript, null, 2));
  fs.writeFileSync(path.join(DEMO, "utterances.json"), JSON.stringify(buildUtterances(transcript), null, 2));
  fs.rmSync(TTS, { recursive: true, force: true });
  console.log(`demo.wav ${cursor.toFixed(1)}s, ${words.filter((w) => w.type === "word").length} words`);
}

main();
