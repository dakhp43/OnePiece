"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatClock } from "@/lib/utils";

interface Props {
  visitId: string;
  patientId: string;
  patientName: string;
  visitTypeLabel: string;
  demoEnabled: boolean;
}

type Phase = "idle" | "recording" | "uploading";

function pickMimeType() {
  const options = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  return options.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) ?? "";
}

export function Recorder({ visitId, patientId, patientName, visitTypeLabel, demoEnabled }: Props) {
  const router = useRouter();
  const [consent, setConsent] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);

  useEffect(() => {
    if (phase !== "recording") return;
    const t = setInterval(() => setElapsed((Date.now() - startedAt.current) / 1000), 250);
    return () => clearInterval(t);
  }, [phase]);

  // Release the mic if the page unmounts mid-recording.
  useEffect(() => () => recorder.current?.stream.getTracks().forEach((t) => t.stop()), []);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mimeType = pickMimeType();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
      rec.start(1000);
      recorder.current = rec;
      startedAt.current = Date.now();
      setElapsed(0);
      setPhase("recording");
      void fetch(`/api/visits/${visitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start_recording" }),
      });
    } catch (err) {
      setError(
        (err as Error).name === "NotAllowedError"
          ? "Microphone access was blocked. Allow the mic in the browser address bar and try again."
          : `Could not start recording: ${(err as Error).message}`,
      );
    }
  }

  async function stop() {
    const rec = recorder.current;
    if (!rec) return;
    setPhase("uploading");
    const blob = await new Promise<Blob>((resolve) => {
      rec.onstop = () => resolve(new Blob(chunks.current, { type: rec.mimeType || "audio/webm" }));
      rec.stop();
    });
    rec.stream.getTracks().forEach((t) => t.stop());
    await upload(`/api/visits/${visitId}/audio`, { method: "POST", headers: { "Content-Type": blob.type }, body: blob });
  }

  async function loadDemo() {
    setPhase("uploading");
    await upload(`/api/visits/${visitId}/audio?demo=1`, { method: "POST" });
  }

  async function upload(url: string, init: RequestInit) {
    setError(null);
    const res = await fetch(url, init);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Upload failed");
      setPhase("idle");
      return;
    }
    const proc = await fetch(`/api/visits/${visitId}/process`, { method: "POST" });
    if (!proc.ok) {
      const body = await proc.json().catch(() => ({}));
      setError(body.error ?? "Could not start processing");
      setPhase("idle");
      return;
    }
    router.push(`/app/visits/${visitId}/processing`);
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
      <Link href={`/app/patients/${patientId}`} className="mb-6 text-sm text-slate-500 hover:text-accent">
        ← Back to {patientName}
      </Link>
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">{visitTypeLabel}</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">{patientName}</h1>

        <div className="my-10 flex items-center justify-center gap-4">
          <span
            className={phase === "recording" ? "pulse-dot h-4 w-4 rounded-full bg-red-600" : "h-4 w-4 rounded-full bg-slate-300"}
            aria-hidden
          />
          <span className="font-mono text-6xl font-light tabular-nums text-slate-900" aria-live="polite">
            {formatClock(elapsed)}
          </span>
        </div>

        {phase === "idle" && (
          <>
            <label className="mb-6 flex items-center justify-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="h-4 w-4 accent-teal-600" />
              Patient consent to record confirmed
            </label>
            <Button size="lg" variant="record" onClick={start} disabled={!consent} className="w-56">
              <Mic className="h-5 w-5" /> Start recording
            </Button>
          </>
        )}
        {phase === "recording" && (
          <Button size="lg" variant="danger" onClick={stop} className="w-56">
            <Square className="h-4 w-4 fill-current" /> End visit
          </Button>
        )}
        {phase === "uploading" && <p className="text-sm text-slate-600">Uploading recording…</p>}
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      </div>

      {demoEnabled && phase === "idle" && (
        <button onClick={loadDemo} className="mt-6 text-xs text-slate-400 hover:text-slate-600" title="Uses the committed demo recording instead of the mic">
          Load demo visit
        </button>
      )}
    </div>
  );
}
