"use client";

import { useState } from "react";
import { Loader2, Lock, PenLine, ScrollText, TriangleAlert } from "lucide-react";
import { stagger } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Label, Select } from "@/components/ui/form";
import { DISMISS_REASON_LABELS, DismissReasonSchema, type DismissReason, type GapItem } from "@/lib/contracts";
import { unresolvedRequired } from "@/lib/gaps";

interface Props {
  open: boolean;
  onClose: () => void;
  visitId: string;
  gaps: GapItem[];
  onSigned: () => void;
}

export function SignDialog({ open, onClose, visitId, gaps, onSigned }: Props) {
  const [reason, setReason] = useState<DismissReason | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blockers = unresolvedRequired(gaps);

  async function sign() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/visits/${visitId}/sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ overrideReason: blockers.length ? reason : undefined }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) return onSigned();
    setError(data.error ?? "Could not sign");
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={blockers.length ? `${blockers.length} required item${blockers.length === 1 ? "" : "s"} weren't addressed` : "Sign note"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Back to review</Button>
          <Button onClick={sign} disabled={busy || (blockers.length > 0 && !reason)} variant={blockers.length ? "danger" : "primary"}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
            {busy ? "Signing…" : blockers.length ? "Override and sign" : "Sign note"}
          </Button>
        </>
      }
    >
      {blockers.length > 0 ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-warn/40 bg-warn-soft p-3.5 text-sm text-warn-ink">
            <p className="flex items-center gap-2 font-semibold"><TriangleAlert className="h-4 w-4 shrink-0" /> Still unresolved</p>
            <ul className="mt-2 space-y-1.5">
              {blockers.map((g, i) => (
                <li key={g.itemId} className="rise flex items-start gap-2" style={stagger(i)}>
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warn" /> {g.label}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <Label htmlFor="override">Reason to sign anyway (required, logged)</Label>
            <Select id="override" value={reason} onChange={(e) => setReason(e.target.value as DismissReason)}>
              <option value="" disabled>Choose a reason…</option>
              {DismissReasonSchema.options.map((r) => <option key={r} value={r}>{DISMISS_REASON_LABELS[r]}</option>)}
            </Select>
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-3"><ScrollText className="h-3.5 w-3.5" /> Overrides are recorded in the visit&apos;s audit trail.</p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-2 p-4 text-sm text-ink-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-ink"><Lock className="h-4 w-4" /></span>
          <p>
            Signing freezes the note. Follow-through tasks and the patient summary are generated from the signed note only.
          </p>
        </div>
      )}
      {error && <p role="alert" className="mt-3 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-sm text-danger-ink">{error}</p>}
    </Dialog>
  );
}
