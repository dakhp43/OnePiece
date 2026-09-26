"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, Loader2 } from "lucide-react";
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

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-10">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm text-slate-500">{patientName}</p>
        <div className="flex items-baseline justify-between">
          <h1 className="text-xl font-semibold text-slate-900">{failed ? "Processing stopped" : "Processing visit"}</h1>
          <span className="font-mono text-sm tabular-nums text-slate-500">{elapsed.toFixed(1)}s</span>
        </div>
        <ol className="mt-6 space-y-4">
          {PROCESSING_STEPS.map((step, i) => {
            const done = i < currentIndex;
            const active = i === currentIndex && !failed;
            const errored = i === currentIndex && failed;
            return (
              <li key={step} className="flex items-start gap-3">
                <span
                  className={cn(
                    "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
                    done && "border-teal-600 bg-teal-600 text-white",
                    active && "border-teal-600 text-teal-600",
                    errored && "border-red-600 text-red-600",
                    !done && !active && !errored && "border-slate-300 text-slate-300",
                  )}
                >
                  {done ? <Check className="h-4 w-4" /> : active ? <Loader2 className="h-4 w-4 animate-spin" /> : errored ? <AlertCircle className="h-4 w-4" /> : <span className="text-xs">{i + 1}</span>}
                </span>
                <div>
                  <p className={cn("font-medium", done || active ? "text-slate-900" : "text-slate-400")}>{LABELS[step].title}</p>
                  <p className="text-xs text-slate-500">{LABELS[step].detail}</p>
                </div>
              </li>
            );
          })}
        </ol>
        {failed && (
          <div className="mt-6 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <p>{visit?.metrics?.errorMessage ?? "Something went wrong."}</p>
            <Button className="mt-3" variant="secondary" onClick={retry} disabled={retrying}>
              {retrying ? "Retrying…" : "Retry"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
