"use client";

import { useState } from "react";
import { TriangleAlert } from "lucide-react";
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
            {busy ? "Signing…" : blockers.length ? "Override and sign" : "Sign note"}
          </Button>
        </>
      }
    >
      {blockers.length > 0 ? (
        <div className="space-y-4">
          <div className="flex gap-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
            <TriangleAlert className="h-5 w-5 shrink-0" />
            <ul className="list-disc space-y-1 pl-4">
              {blockers.map((g) => <li key={g.itemId}>{g.label}</li>)}
            </ul>
          </div>
          <div>
            <Label htmlFor="override">Reason to sign anyway (required, logged)</Label>
            <Select id="override" value={reason} onChange={(e) => setReason(e.target.value as DismissReason)}>
              <option value="" disabled>Choose a reason…</option>
              {DismissReasonSchema.options.map((r) => <option key={r} value={r}>{DISMISS_REASON_LABELS[r]}</option>)}
            </Select>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-700">
          Signing freezes the note. Follow-through tasks and the patient summary are generated from the signed note only.
        </p>
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </Dialog>
  );
}
