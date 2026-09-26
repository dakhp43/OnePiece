"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, Check, Loader2, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { VisitTypeIcon } from "@/components/patient";
import { Input, Label } from "@/components/ui/form";
import { VISIT_TYPE_LABELS, cn } from "@/lib/utils";

const VITAL_FIELDS = [
  { key: "systolic", label: "Systolic", placeholder: "138" },
  { key: "diastolic", label: "Diastolic", placeholder: "88" },
  { key: "heartRate", label: "Heart rate", placeholder: "72" },
  { key: "tempF", label: "Temp (°F)", placeholder: "98.6" },
  { key: "spo2", label: "SpO₂ (%)", placeholder: "98" },
  { key: "weightLb", label: "Weight (lb)", placeholder: "170" },
] as const;

export function StartVisitButton({ patientId, lastVisitType }: { patientId: string; lastVisitType: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [visitType, setVisitType] = useState(lastVisitType);
  const [vitals, setVitals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    const numeric = Object.fromEntries(
      Object.entries(vitals).filter(([, v]) => v.trim() !== "").map(([k, v]) => [k, Number(v)]),
    );
    const res = await fetch("/api/visits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId, visitType, vitals: numeric }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "Could not start visit");
      setBusy(false);
      return;
    }
    router.push(`/app/visits/${body.id}/record`);
  }

  return (
    <>
      <Button size="lg" onClick={() => setOpen(true)}>
        <Mic className="h-4 w-4" /> Start visit
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Start visit"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={start} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
              {busy ? "Starting…" : "Continue to recording"}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <fieldset>
            <legend className="mb-2 font-sub text-xs font-semibold text-ink-2">Visit type</legend>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(VISIT_TYPE_LABELS).map(([id, label]) => {
                const selected = visitType === id;
                return (
                  <label
                    key={id}
                    className={cn(
                      "relative flex cursor-pointer flex-col gap-2 rounded-xl border p-3 text-sm transition-all has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent",
                      selected ? "border-accent bg-accent-soft text-ink ring-1 ring-accent" : "border-line text-ink-2 hover:border-line-strong hover:bg-surface-2",
                    )}
                  >
                    <input type="radio" name="visitType" value={id} checked={selected} onChange={(e) => setVisitType(e.target.value)} className="sr-only" />
                    <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg transition-colors", selected ? "bg-accent text-white" : "bg-surface-3 text-ink-3")}>
                      <VisitTypeIcon type={id} className="h-4 w-4" />
                    </span>
                    <span className="font-medium leading-tight">{label}</span>
                    {selected && <Check className="pop absolute right-2.5 top-2.5 h-4 w-4 text-accent-ink" />}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <div>
            <p className="mb-2 flex items-center gap-2 font-sub text-xs font-semibold text-ink-2">
              <Activity className="h-3.5 w-3.5 text-accent" /> Vitals <span className="font-normal text-ink-4">(optional)</span>
            </p>
            <div className="grid grid-cols-3 gap-3 rounded-xl border border-line bg-surface-2 p-3">
              {VITAL_FIELDS.map((f) => (
                <div key={f.key}>
                  <Label htmlFor={f.key}>{f.label}</Label>
                  <Input
                    id={f.key}
                    inputMode="decimal"
                    placeholder={f.placeholder}
                    value={vitals[f.key] ?? ""}
                    onChange={(e) => setVitals((v) => ({ ...v, [f.key]: e.target.value }))}
                    className="font-mono tabular-nums"
                  />
                </div>
              ))}
            </div>
          </div>
          {error && <p role="alert" className="rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-sm text-danger-ink">{error}</p>}
        </div>
      </Dialog>
    </>
  );
}
