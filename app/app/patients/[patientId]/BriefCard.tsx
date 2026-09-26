"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

  return (
    <Card className="border-teal-200">
      <CardHeader className="bg-teal-50/60">
        <CardTitle className="flex items-center gap-2 text-teal-800"><Sparkles className="h-4 w-4" /> Pre-visit brief</CardTitle>
        {brief && <Badge tone="slate">{SOURCE_LABEL[brief.source]}</Badge>}
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-slate-500">Brief unavailable right now. Open items and history are below.</p>}
        {!error && !brief && (
          <div className="space-y-2" aria-label="Loading brief">
            {[90, 75, 82].map((w) => <div key={w} className="h-4 animate-pulse rounded bg-slate-100" style={{ width: `${w}%` }} />)}
          </div>
        )}
        {brief && (
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-800">
            {brief.bullets.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
