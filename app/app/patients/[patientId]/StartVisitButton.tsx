"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/form";
import { VISIT_TYPE_LABELS } from "@/lib/utils";

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
            <Button onClick={start} disabled={busy}>{busy ? "Starting…" : "Continue to recording"}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="visitType">Visit type</Label>
            <Select id="visitType" value={visitType} onChange={(e) => setVisitType(e.target.value)}>
              {Object.entries(VISIT_TYPE_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </Select>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-slate-600">Vitals (optional)</p>
            <div className="grid grid-cols-3 gap-3">
              {VITAL_FIELDS.map((f) => (
                <div key={f.key}>
                  <Label htmlFor={f.key}>{f.label}</Label>
                  <Input
                    id={f.key}
                    inputMode="decimal"
                    placeholder={f.placeholder}
                    value={vitals[f.key] ?? ""}
                    onChange={(e) => setVitals((v) => ({ ...v, [f.key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </Dialog>
    </>
  );
}
