"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, AudioLines, Check, FileText, Gauge, Loader2, RotateCw, ShieldCheck } from "lucide-react";
import { EcgTrace } from "@/components/brand";
import { VisitSteps } from "@/components/VisitSteps";
import { Button } from "@/components/ui/button";
import { PROCESSING_STEPS, type ProcessingStep, type VisitStatus } from "@/lib/contracts";
import { cn } from "@/lib/utils";

const LABELS: Record<ProcessingStep, { title: string; detail: string }> = {
  transcribing: { title: "Transcribing", detail: "ElevenLabs Scribe v2 Medical · speakers + word timestamps" },
  drafting: { title: "Drafting note", detail: "Gemini · problem-oriented SOAP, every sentence cites its source" },
  auditing: { title: "Auditing", detail: "Independent Gemini pass · support, hedging, missed checklist items" },
  scoring: { title: "Scoring confidence", detail: "Deterministic checks · sources, numbers, medication details" },
};

interface VisitPoll {
  status: VisitStatus;
  processingStep: ProcessingStep | null;
  metrics: { errorMessage?: string; processingStartedAt?: string } | null;
}

export function Processing({ visitId, patientName }: { visitId: string; patientName: string }) {
  const router = useRouter();
  const [visit, setVisit] = useState<VisitPoll | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    let stop = false;
    async function poll() {
      const res = await fetch(`/api/visits/${visitId}`, { cache: "no-store" }).catch(() => null);
      if (stop) return;
      if (res?.ok) {
        const v: VisitPoll = await res.json();
        setVisit(v);
        if (v.metrics?.processingStartedAt) startedAt.current = Date.parse(v.metrics.processingStartedAt);
        if (v.status === "review") return router.replace(`/app/visits/${visitId}/review`);
        if (v.status === "signed" || v.status === "sent") return router.replace(`/app/visits/${visitId}/note`);
      }
      setTimeout(poll, 1000);
    }
    poll();
    const t = setInterval(() => startedAt.current && setElapsed((Date.now() - startedAt.current) / 1000), 200);
    return () => { stop = true; clearInterval(t); };
  }, [visitId, router]);

  async function retry() {
    setRetrying(true);
    await fetch(`/api/visits/${visitId}/process`, { method: "POST" });
    setRetrying(false);
  }

  const failed = visit?.status === "error";
  const currentIndex = visit?.processingStep ? PROCESSING_STEPS.indexOf(visit.processingStep) : visit?.status === "review" ? 4 : 0;

  const progress = failed ? currentIndex / PROCESSING_STEPS.length : Math.min(1, (currentIndex + 0.5) / PROCESSING_STEPS.length);
  return (
    <div className="flex flex-1 flex-col px-4 py-6 sm:px-6">
      <div className="mx-auto flex w-full max-w-3xl flex-col">
        <VisitSteps at="processing" className="self-end" />

        <div className="rise bg-monitor-grid relative mt-5 overflow-hidden rounded-[28px] border border-monitor-line text-monitor-ink shadow-pop">
          <div className="flex items-end justify-between gap-4 px-6 pt-6 sm:px-8">
            <div>
              <p className="font-sub text-sm font-semibold text-monitor-dim">{patientName}</p>
              <h1 className="mt-1 font-display text-3xl font-semibold leading-tight tracking-[-0.01em]">{failed ? "Processing stopped" : "Processing visit"}</h1>
            </div>
            <div className="text-right">
              <p className="font-sub text-xs font-semibold text-monitor-dim">Elapsed</p>
              <span className="font-mono text-3xl tabular-nums text-white">{elapsed.toFixed(1)}s</span>
            </div>
          </div>

          <EcgTrace
            mode={failed ? "draw" : "sweep"}
            beats={3}
            duration={2.4}
            className={cn("mt-4 h-14 w-full", failed ? "text-monitor-alert/70" : "text-monitor-trace")}
          />

          <div className="mx-6 h-1 overflow-hidden rounded-full bg-monitor-line sm:mx-8">
            <div className={cn("h-full rounded-full transition-[width] duration-700", failed ? "bg-monitor-alert" : "bg-monitor-trace")} style={{ width: `${progress * 100}%` }} />
          </div>

          <ol className="px-6 py-6 sm:px-8">
            {PROCESSING_STEPS.map((step, i) => {
              const done = i < currentIndex;
              const active = i === currentIndex && !failed;
              const errored = i === currentIndex && failed;
              const Icon = STEP_ICON[step];
              return (
                <li key={step} className="relative flex gap-4 pb-6 last:pb-0">
                  {i < PROCESSING_STEPS.length - 1 && (
                    <span className={cn("absolute left-5 top-11 h-[calc(100%-2.75rem)] w-0.5 -translate-x-1/2 rounded-full", done ? "bg-monitor-trace/70" : active ? "flow-line" : "bg-monitor-line")} aria-hidden />
                  )}
                  <span
                    className={cn(
                      "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-all duration-500",
                      done && "border-monitor-trace bg-monitor-trace text-monitor",
                      active && "border-monitor-trace/60 bg-monitor-trace/10 text-monitor-trace",
                      errored && "border-monitor-alert bg-monitor-alert/10 text-monitor-alert",
                      !done && !active && !errored && "border-monitor-line text-monitor-dim",
                    )}
                  >
                    {active && <span className="absolute -inset-1 animate-spin rounded-full border-2 border-transparent border-t-monitor-trace [animation-duration:1.1s]" aria-hidden />}
                    {done ? <Check className="pop h-5 w-5" strokeWidth={3} /> : errored ? <AlertCircle className="h-5 w-5" /> : active ? <Icon className="h-4 w-4" /> : <span className="font-mono text-xs">{i + 1}</span>}
                  </span>
                  <div className="min-w-0 pt-1">
                    <p className={cn("flex items-center gap-2 font-medium", done || active ? "text-white" : errored ? "text-monitor-alert" : "text-monitor-dim")}>
                      {LABELS[step].title}
                      {active && <Loader2 className="h-3.5 w-3.5 animate-spin text-monitor-trace" />}
                      {done && <span className="text-xs font-medium text-monitor-trace">Done</span>}
                    </p>
                    <p className={cn("text-xs", done || active ? "text-monitor-ink/70" : "text-monitor-dim/80")}>{LABELS[step].detail}</p>
                  </div>
                </li>
              );
            })}
          </ol>
          {failed && (
            <div className="mx-6 mb-6 rounded-2xl border border-monitor-alert/40 bg-monitor-alert/10 p-4 text-sm text-monitor-ink sm:mx-8">
              <p className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {visit?.metrics?.errorMessage ?? "Something went wrong."}</p>
              <Button className="mt-3" variant="secondary" onClick={retry} disabled={retrying}>
                <RotateCw className={cn("h-4 w-4", retrying && "animate-spin")} /> {retrying ? "Retrying…" : "Retry"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const STEP_ICON: Record<ProcessingStep, typeof Check> = {
  transcribing: AudioLines,
  drafting: FileText,
  auditing: ShieldCheck,
  scoring: Gauge,
};
