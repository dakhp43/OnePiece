"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { stagger } from "@/components/motion";

interface Brief {
  bullets: string[];
  source: "backboard" | "gemini" | "chart";
}

const SOURCE_LABEL = { backboard: "Memory: Backboard", gemini: "Generated from chart", chart: "From chart" };

export function BriefCard({ patientId }: { patientId: string }) {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/patients/${patientId}/brief`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((b: Brief) => !cancelled && setBrief(b))
      .catch(() => !cancelled && setError(true));
    return () => { cancelled = true; };
  }, [patientId]);

  const loading = !error && !brief;
  return (
    <Card className="overflow-hidden border-accent/30">
      <div className="relative h-0.5 overflow-hidden bg-accent/15" aria-hidden>
        <div className={loading ? "absolute inset-y-0 w-1/3 animate-[brief-scan_1.4s_ease-in-out_infinite] bg-accent" : "absolute inset-0 bg-accent"} />
      </div>
      <CardHeader className="border-accent/15 bg-accent-soft/60">
        <CardTitle className="flex items-center gap-2 text-accent-ink">
          <Sparkles className={loading ? "h-4 w-4 animate-pulse" : "h-4 w-4"} /> Pre-visit brief
        </CardTitle>
        {brief && <Badge tone="slate" className="fade-in">{SOURCE_LABEL[brief.source]}</Badge>}
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-ink-3">Brief unavailable right now. Open items and history are below.</p>}
        {loading && (
          <div className="space-y-2.5" aria-label="Loading brief">
            <p className="text-xs text-ink-3">Reading the chart and past visits…</p>
            {[92, 76, 84, 58].map((w) => <div key={w} className="shimmer h-3.5 rounded-full" style={{ width: `${w}%` }} />)}
          </div>
        )}
        {brief && (
          <ul className="space-y-2.5 text-[15px] leading-relaxed text-ink">
            {brief.bullets.map((b, i) => (
              <li key={i} className="rise flex gap-3" style={stagger(i)}>
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
