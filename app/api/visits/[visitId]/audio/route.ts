import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { ApiError, route } from "@/lib/api";
import { loadVisit } from "@/lib/access";
import { requireDoctorApi } from "@/lib/auth/current";
import { logEvent } from "@/lib/events";
import { DEMO_AUDIO, demoFallbackEnabled } from "@/lib/fixtures";
import { LIMITS } from "@/lib/usage";
import { AUDIO_DIR, assertStatus, updateVisit } from "@/lib/visits";

export const runtime = "nodejs";

type Ctx = RouteContext<"/api/visits/[visitId]/audio">;
const MAX_BYTES = 25 * 1024 * 1024;

/** Duration of a PCM WAV file from its header (used for the demo recording). */
function wavSeconds(file: string) {
  const b = fs.readFileSync(file);
  const dataAt = b.indexOf("data");
  return dataAt > 0 ? b.readUInt32LE(dataAt + 4) / b.readUInt32LE(28) : 0;
}

/** Upload the recording as the raw request body (audio/webm). `?demo=1` uses the committed demo audio instead. */
export const POST = route(async (req: Request, ctx: Ctx) => {
  const { visitId } = await ctx.params;
  const session = await requireDoctorApi();
  const { visit } = await loadVisit(visitId, session.doctorId);
  assertStatus(visit, ["created", "recording", "error"], "upload audio");

  const demo = new URL(req.url).searchParams.get("demo") === "1";
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  let audioPath: string;
  let bytes: number;
  let seconds: number;
  if (demo) {
    if (!demoFallbackEnabled()) throw new ApiError(403, "Demo audio is disabled (DEMO_FALLBACK=false)");
    audioPath = path.join(AUDIO_DIR, `${visit.id}${path.extname(DEMO_AUDIO)}`);
    fs.copyFileSync(DEMO_AUDIO, audioPath);
    bytes = fs.statSync(audioPath).size;
    seconds = DEMO_AUDIO.endsWith(".wav") ? wavSeconds(DEMO_AUDIO) : 120;
  } else {
    seconds = Number(req.headers.get("x-recording-seconds")) || (visit.startedAt ? (Date.now() - visit.startedAt.getTime()) / 1000 : 0);
    if (seconds > LIMITS.maxRecordingSeconds() + 5) throw new ApiError(413, `Recording longer than ${LIMITS.maxRecordingSeconds() / 60} minutes`);
    const type = req.headers.get("content-type") ?? "audio/webm";
    const ext = type.includes("wav") ? ".wav" : type.includes("mp4") ? ".m4a" : type.includes("ogg") ? ".ogg" : ".webm";
    const buf = Buffer.from(await req.arrayBuffer());
    if (buf.length === 0) throw new ApiError(400, "Empty recording");
    if (buf.length > MAX_BYTES) throw new ApiError(413, "Recording too large");
    audioPath = path.join(AUDIO_DIR, `${visit.id}${ext}`);
    fs.writeFileSync(audioPath, buf);
    bytes = buf.length;
  }

  const now = new Date();
  await updateVisit(visit.id, {
    audioPath,
    // A new recording starts processing from scratch: nothing from an earlier attempt may be reused.
    transcript: null, utterances: null, note: null, audit: null, scores: null, gaps: null,
    status: "recording",
    startedAt: visit.startedAt ?? now,
    endedAt: now,
    metrics: { ...(visit.metrics ?? {}), demo, recordingSeconds: Math.round(seconds) },
  });
  await logEvent("recording_ended", { visitId: visit.id, doctorId: session.doctorId, payload: { bytes, demo } });
  return NextResponse.json({ ok: true, bytes });
});

/** Streams the recording with HTTP Range support so the review screen can seek. */
export const GET = route(async (req: Request, ctx: Ctx) => {
  const { visitId } = await ctx.params;
  const session = await requireDoctorApi();
  const { visit } = await loadVisit(visitId, session.doctorId);
  if (!visit.audioPath || !fs.existsSync(visit.audioPath)) throw new ApiError(404, "No audio for this visit");

  const size = fs.statSync(visit.audioPath).size;
  const ext = path.extname(visit.audioPath);
  const type = ext === ".wav" ? "audio/wav" : ext === ".m4a" ? "audio/mp4" : ext === ".ogg" ? "audio/ogg" : "audio/webm";
  const range = req.headers.get("range");
  const base = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600" };

  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m?.[1] ? Number(m[1]) : NaN;
    let end = m?.[2] ? Number(m[2]) : size - 1;
    if (Number.isNaN(start)) { // suffix range: bytes=-N
      start = Math.max(0, size - end);
      end = size - 1;
    }
    end = Math.min(end, size - 1);
    if (start > end || start >= size) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    const stream = Readable.toWeb(fs.createReadStream(visit.audioPath, { start, end })) as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: { ...base, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }
  const stream = Readable.toWeb(fs.createReadStream(visit.audioPath)) as ReadableStream;
  return new Response(stream, { headers: { ...base, "Content-Length": String(size) } });
});
