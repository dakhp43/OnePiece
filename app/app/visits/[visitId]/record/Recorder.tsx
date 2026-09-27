"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CircleAlert, FileAudio, Loader2, Mic, ShieldCheck, Square } from "lucide-react";
import { VisitSteps } from "@/components/VisitSteps";
import { Button } from "@/components/ui/button";
import { useCopilot } from "@/lib/copilot/client/useCopilot";
import { cn, formatClock } from "@/lib/utils";
import { CopilotChipView, CoverageMeter, SuggestionCard } from "./CopilotPanel";

interface Props {
  visitId: string;
  patientId: string;
  patientName: string;
  visitTypeLabel: string;
  demoEnabled: boolean;
  /** Recording auto-stops here to protect the free transcription quota. */
  maxSeconds: number;
  /** Live copilot (suggested questions while recording) is configured on the server. */
  copilotEnabled: boolean;
}

type Phase = "idle" | "recording" | "uploading";

const now = () => Date.now();

function pickMimeType() {
  const options = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  return options.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) ?? "";
}

export function Recorder({ visitId, patientId, patientName, visitTypeLabel, demoEnabled, maxSeconds, copilotEnabled }: Props) {
  const router = useRouter();
  const [consent, setConsent] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const stopRef = useRef<(() => void) | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const copilotCtx = useRef<AudioContext | null>(null);
  const copilot = useCopilot(visitId, copilotEnabled);

  useEffect(() => {
    if (phase !== "recording") return;
    const t = setInterval(() => {
      const s = (now() - startedAt.current) / 1000;
      setElapsed(s);
      if (s >= maxSeconds) stopRef.current?.();
    }, 250);
    return () => clearInterval(t);
  }, [phase, maxSeconds]);

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
      startedAt.current = now();
      setElapsed(0);
      setPhase("recording");
      void fetch(`/api/visits/${visitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start_recording" }),
      });
      startCopilot(stream);
    } catch (err) {
      setError(
        (err as Error).name === "NotAllowedError"
          ? "Microphone access was blocked. Allow the mic in the browser address bar and try again."
          : `Could not start recording: ${(err as Error).message}`,
      );
    }
  }

  // Live copilot listens to the same mic stream. Created inside the Start click so its chime may play.
  // Never awaited: if it fails, the chip says so and recording carries on exactly as before.
  function startCopilot(stream: MediaStream) {
    if (!copilotEnabled) return;
    try {
      const ctx = new AudioContext();
      copilotCtx.current = ctx;
      const clock = () => (now() - startedAt.current) / 1000;
      void copilot.start({ ctx, source: ctx.createMediaStreamSource(stream), mode: "live", clock });
    } catch (err) {
      console.warn("[copilot] could not start", (err as Error).message);
    }
  }

  function stopCopilot() {
    copilot.stop();
    void copilotCtx.current?.close().catch(() => {});
    copilotCtx.current = null;
  }

  async function stop() {
    const rec = recorder.current;
    if (!rec || rec.state === "inactive") return;
    stopCopilot();
    setPhase("uploading");
    const blob = await new Promise<Blob>((resolve) => {
      rec.onstop = () => resolve(new Blob(chunks.current, { type: rec.mimeType || "audio/webm" }));
      rec.stop();
    });
    rec.stream.getTracks().forEach((t) => t.stop());
    const seconds = String(Math.round(elapsed));
    await upload(`/api/visits/${visitId}/audio`, { method: "POST", headers: { "Content-Type": blob.type, "X-Recording-Seconds": seconds }, body: blob });
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

  // Lets the timer effect call the latest stop() when the length cap is reached.
  useEffect(() => {
    stopRef.current = () => void stop();
  });

  // Display only: draws the live mic signal while recording. It taps the same stream the
  // MediaRecorder uses through a Web Audio analyser and never touches the recording itself.
  useEffect(() => {
    if (phase !== "recording") return;
    const stream = recorder.current?.stream;
    const canvas = canvasRef.current;
    const g = canvas?.getContext("2d");
    if (!stream || !canvas || !g) return;
    let ctx: AudioContext;
    try {
      ctx = new AudioContext();
    } catch {
      return;
    }
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    const color = getComputedStyle(canvas).color;
    let raf = 0;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth * dpr;
      const h = canvas.clientHeight * dpr;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      g.clearRect(0, 0, w, h);
      g.lineWidth = 1.5 * dpr;
      g.strokeStyle = color;
      g.beginPath();
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
        const x = (i / (data.length - 1)) * w;
        const y = h / 2 + v * h * 0.9;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
      canvas.parentElement?.style.setProperty("--level", Math.min(1, Math.sqrt(sum / data.length) * 4).toFixed(3));
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(raf);
      source.disconnect();
      void ctx.close();
    };
  }, [phase]);

  const progress = Math.min(1, elapsed / maxSeconds);
  return (
    <div className="flex flex-1 flex-col px-4 py-6 sm:px-6">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={`/app/patients/${patientId}`} className="group inline-flex items-center gap-1.5 text-sm text-ink-3 transition-colors hover:text-accent-ink">
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" /> Back to {patientName}
          </Link>
          <VisitSteps at="record" />
        </div>

        <div className="rise bg-monitor-grid relative mt-5 overflow-hidden rounded-[28px] border border-monitor-line text-monitor-ink shadow-pop">
          {/* Header strip */}
          <div className="flex items-center justify-between border-b border-monitor-line/80 px-6 py-4 sm:px-8">
            <div>
              <p className="font-sub text-sm font-semibold text-monitor-dim">{visitTypeLabel}</p>
              <h1 className="mt-0.5 font-display text-2xl font-semibold leading-tight tracking-[-0.01em] sm:text-3xl">{patientName}</h1>
            </div>
            <span
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider",
                phase === "recording" && "border-monitor-alert/50 bg-monitor-alert/10 text-monitor-alert",
                phase === "idle" && "border-monitor-line text-monitor-dim",
                phase === "uploading" && "border-monitor-trace/40 bg-monitor-trace/10 text-monitor-trace",
              )}
            >
              <span className={cn("h-2 w-2 rounded-full", phase === "recording" ? "halo bg-monitor-alert text-monitor-alert" : phase === "uploading" ? "animate-pulse bg-monitor-trace" : "bg-monitor-dim")} />
              {phase === "recording" ? "Rec" : phase === "uploading" ? "Uploading" : "Standby"}
            </span>
          </div>
          {phase === "recording" && copilot.chip !== "off" && (
            <div className="flex justify-end border-b border-monitor-line/60 px-6 py-2 sm:px-8">
              <CopilotChipView chip={copilot.chip} />
            </div>
          )}

          {/* Timer + signal */}
          <div className="px-6 pb-6 pt-8 sm:px-8">
            <div className="flex items-center justify-center gap-4">
              <span
                className={phase === "recording" ? "pulse-dot h-4 w-4 rounded-full bg-monitor-alert" : "h-4 w-4 rounded-full bg-monitor-line"}
                aria-hidden
              />
              <span
                className={cn(
                  "font-mono text-7xl font-light tabular-nums tracking-tight transition-colors sm:text-8xl",
                  phase === "recording" ? "text-white" : "text-monitor-ink/80",
                )}
                aria-live="polite"
              >
                {formatClock(elapsed)}
              </span>
            </div>

            <div className="relative mt-6 h-28 overflow-hidden rounded-2xl border border-monitor-line/70 bg-monitor/60">
              {phase === "recording" ? (
                <canvas ref={canvasRef} className="absolute inset-0 h-full w-full text-monitor-trace" aria-label="Live microphone signal" />
              ) : phase === "uploading" ? (
                <div className="absolute inset-0 flex items-center justify-center gap-1.5" aria-hidden>
                  {Array.from({ length: 28 }, (_, i) => (
                    <span key={i} className="eq-bar w-1.5 rounded-full bg-monitor-trace/80" style={{ height: `${30 + ((i * 37) % 60)}%`, animationDelay: `${(i % 7) * 0.09}s` }} />
                  ))}
                </div>
              ) : (
                <>
                  <span className="absolute inset-x-0 top-1/2 h-px bg-monitor-trace/40" aria-hidden />
                  <span className="standby-blip absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-monitor-trace" aria-hidden />
                  <p className="absolute bottom-2 right-3 text-xs text-monitor-dim">Mic idle</p>
                </>
              )}
            </div>

            {/* Length cap rail */}
            <div className="mt-3 flex items-center gap-3 font-mono text-[11px] text-monitor-dim">
              <span>00:00</span>
              <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-monitor-line">
                <div className={cn("absolute inset-y-0 left-0 rounded-full transition-[width,background-color] duration-300", progress > 0.85 ? "bg-monitor-alert" : "bg-monitor-trace")} style={{ width: `${progress * 100}%` }} />
              </div>
              <span>Auto-stops at {formatClock(maxSeconds)}</span>
            </div>

            {phase === "recording" && (
              <>
                <SuggestionCard copilot={copilot.copilot} onDismiss={copilot.dismiss} />
                <CoverageMeter copilot={copilot.copilot} />
              </>
            )}
          </div>

          {/* Controls */}
          <div className="flex flex-col items-center gap-4 border-t border-monitor-line/80 bg-monitor-2/60 px-6 py-6">
            {phase === "idle" && (
              <>
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-2.5 text-sm transition-colors",
                    consent ? "border-monitor-trace/50 bg-monitor-trace/10 text-monitor-ink" : "border-monitor-line text-monitor-ink/80 hover:border-monitor-dim",
                  )}
                >
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="h-4 w-4 accent-teal-400" />
                  <ShieldCheck className={cn("h-4 w-4", consent ? "text-monitor-trace" : "text-monitor-dim")} />
                  Patient consent to record confirmed
                </label>
                <Button size="lg" variant="record" onClick={start} disabled={!consent} className="h-14 w-64 rounded-full text-base bg-monitor-alert disabled:bg-monitor-line disabled:text-monitor-dim">
                  <Mic className="h-5 w-5" /> Start recording
                </Button>
              </>
            )}
            {phase === "recording" && (
              <Button size="lg" variant="danger" onClick={stop} className="group h-14 w-64 rounded-full bg-monitor-alert text-base">
                <Square className="h-4 w-4 fill-current transition-transform group-hover:scale-90" /> End visit
              </Button>
            )}
            {phase === "uploading" && (
              <p className="flex items-center gap-2 text-sm text-monitor-ink/90">
                <Loader2 className="h-4 w-4 animate-spin text-monitor-trace" /> Uploading recording…
              </p>
            )}
            {error && (
              <p role="alert" className="flex max-w-lg items-start gap-2 rounded-xl border border-monitor-alert/40 bg-monitor-alert/10 px-3 py-2 text-sm text-monitor-ink">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {error}
              </p>
            )}
          </div>
        </div>

        {demoEnabled && phase === "idle" && (
          <button
            onClick={loadDemo}
            className="mx-auto mt-5 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs text-ink-4 transition-colors hover:bg-surface-3 hover:text-ink-2"
            title="Uses the committed demo recording instead of the mic"
          >
            <FileAudio className="h-3.5 w-3.5" /> Load demo visit
          </button>
        )}
      </div>
    </div>
  );
}
