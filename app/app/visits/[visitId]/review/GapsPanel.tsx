"use client";

import { useState } from "react";
import { CalendarClock, ChevronDown, ChevronRight, CircleCheck, Plus, Undo2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/form";
import { DISMISS_REASON_LABELS, DismissReasonSchema, type DismissReason, type GapItem, type Problem } from "@/lib/contracts";
import { isOpenGap } from "@/lib/gaps";
import { SECTION_LABELS } from "@/lib/note";
import type { Mutate } from "./Review";

interface Props {
  visitId: string;
  gaps: GapItem[];
  problems: Problem[];
  mutate: Mutate;
  onEvidence: (ids: string[]) => void;
}

const rank = (g: GapItem) => (g.priority === "required" ? 0 : 2) + (g.status === "missing" ? 0 : 1);

export function GapsPanel({ visitId, gaps, problems, mutate, onEvidence }: Props) {
  const [showCovered, setShowCovered] = useState(false);
  const open = gaps.filter(isOpenGap).sort((a, b) => rank(a) - rank(b));
  const resolved = gaps.filter((g) => g.resolution !== null);
  const covered = gaps.filter((g) => (g.status === "covered" || g.status === "not_applicable") && g.resolution === null);
  const post = (g: GapItem, body: unknown) => mutate(`/api/visits/${visitId}/gaps/${encodeURIComponent(g.itemId)}`, body);

  return (
    <section className="min-h-0 overflow-y-auto bg-white p-3" aria-label="Missed items">
      <p className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
        Missed items <Badge tone={open.length ? "amber" : "green"}>{open.length} open</Badge>
      </p>
      {open.length === 0 && <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">Nothing missed. Every checklist item is covered or resolved.</p>}
      <ul className="space-y-2">
        {open.map((g) => <OpenGap key={g.itemId} gap={g} problems={problems} post={post} onEvidence={onEvidence} />)}
      </ul>

      {resolved.length > 0 && (
        <>
          <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">Resolved ({resolved.length})</p>
          <ul className="space-y-1.5">
            {resolved.map((g) => (
              <li key={g.itemId} className="flex items-start justify-between gap-2 rounded-md bg-slate-50 px-2.5 py-2 text-sm">
                <div>
                  <p className="text-slate-800">{g.label}</p>
                  <p className="text-xs text-slate-500">
                    {g.resolution?.type === "filled" && "Added to note"}
                    {g.resolution?.type === "dismissed" && `Dismissed: ${DISMISS_REASON_LABELS[g.resolution.reason]}`}
                    {g.resolution?.type === "deferred" && "Deferred to next visit"}
                  </p>
                </div>
                <button title="Undo" aria-label="Undo" onClick={() => post(g, { action: "reopen" })} className="rounded p-1 text-slate-500 hover:bg-slate-200">
                  <Undo2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <button onClick={() => setShowCovered((v) => !v)} className="mt-5 flex w-full items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-700">
        {showCovered ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />} Covered ({covered.length})
      </button>
      {showCovered && (
        <ul className="mt-2 space-y-1">
          {covered.map((g) => (
            <li key={g.itemId} className="flex items-start gap-2 text-sm">
              <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
              <div>
                <p className="text-slate-700">{g.label}{g.status === "not_applicable" && <span className="text-slate-400"> (n/a)</span>}</p>
                {g.evidenceUtteranceIds.length > 0 && (
                  <button onClick={() => onEvidence(g.evidenceUtteranceIds)} className="text-xs text-accent hover:underline">
                    Evidence: {g.evidenceUtteranceIds.join(", ")}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function OpenGap({ gap: g, problems, post, onEvidence }: {
  gap: GapItem; problems: Problem[]; post: (g: GapItem, body: unknown) => Promise<boolean>; onEvidence: (ids: string[]) => void;
}) {
  const [mode, setMode] = useState<"idle" | "add" | "dismiss">("idle");
  const [text, setText] = useState("");
  const [problemId, setProblemId] = useState(problems[0]?.id ?? "general");
  const [reason, setReason] = useState<DismissReason>("not_applicable");
  const [busy, setBusy] = useState(false);
  const run = async (body: unknown) => {
    setBusy(true);
    const ok = await post(g, body);
    setBusy(false);
    if (ok) setMode("idle");
  };

  return (
    <li className={g.priority === "required" ? "rounded-md border border-amber-300 bg-amber-50/50 p-2.5" : "rounded-md border border-slate-200 p-2.5"}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-slate-900">{g.label}</p>
        <Badge tone={g.priority === "required" ? "amber" : "slate"}>{g.priority}</Badge>
      </div>
      <p className="mt-0.5 text-xs text-slate-600">
        <span className="font-medium">{g.status === "missing" ? "Missing" : "Partial"}:</span> {g.explanation}
      </p>
      {g.evidenceUtteranceIds.length > 0 && (
        <button onClick={() => onEvidence(g.evidenceUtteranceIds)} className="text-xs text-accent hover:underline">
          Evidence: {g.evidenceUtteranceIds.join(", ")}
        </button>
      )}

      {mode === "idle" && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button size="sm" variant="secondary" onClick={() => setMode("add")}><Plus className="h-3.5 w-3.5" /> Add</Button>
          <Button size="sm" variant="secondary" onClick={() => setMode("dismiss")}><X className="h-3.5 w-3.5" /> Dismiss</Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => run({ action: "defer" })}><CalendarClock className="h-3.5 w-3.5" /> Defer</Button>
        </div>
      )}
      {mode === "add" && (
        <div className="mt-2 space-y-2">
          <Textarea rows={2} autoFocus value={text} onChange={(e) => setText(e.target.value)}
            placeholder={`${SECTION_LABELS[g.defaultSection]} sentence, e.g. "Allergies reviewed; sulfa allergy noted."`} />
          <Select value={problemId} onChange={(e) => setProblemId(e.target.value)} className="h-9">
            {problems.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            {!problems.some((p) => p.id === "general") && <option value="general">General</option>}
          </Select>
          <div className="flex gap-2">
            <Button size="sm" disabled={busy || !text.trim()} onClick={() => run({ action: "fill", text, problemId })}>Add to note</Button>
            <Button size="sm" variant="ghost" onClick={() => setMode("idle")}>Cancel</Button>
          </div>
        </div>
      )}
      {mode === "dismiss" && (
        <div className="mt-2 space-y-2">
          <Select value={reason} onChange={(e) => setReason(e.target.value as DismissReason)} className="h-9">
            {DismissReasonSchema.options.map((r) => <option key={r} value={r}>{DISMISS_REASON_LABELS[r]}</option>)}
          </Select>
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => run({ action: "dismiss", reason })}>Dismiss</Button>
            <Button size="sm" variant="ghost" onClick={() => setMode("idle")}>Cancel</Button>
          </div>
        </div>
      )}
    </li>
  );
}
