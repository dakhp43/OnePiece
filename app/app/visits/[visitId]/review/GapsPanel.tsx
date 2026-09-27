"use client";

import { useState } from "react";
import { CalendarClock, ChevronRight, CircleCheck, FilePlus2, Plus, Quote, Undo2, X } from "lucide-react";
import { stagger } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/form";
import { DISMISS_REASON_LABELS, DismissReasonSchema, type DismissReason, type GapItem, type Problem } from "@/lib/contracts";
import { isOpenGap } from "@/lib/gaps";
import { SECTION_LABELS } from "@/lib/note";
import { cn } from "@/lib/utils";
import type { Mutate } from "./Review";

interface Props {
  visitId: string;
  gaps: GapItem[];
  problems: Problem[];
  mutate: Mutate;
  onEvidence: (ids: string[]) => void;
}

const rank = (g: GapItem) => (g.priority === "required" ? 0 : 2) + (g.status === "missing" ? 0 : 1);

const RESOLUTION_ICON = { filled: FilePlus2, dismissed: X, deferred: CalendarClock } as const;

export function GapsPanel({ visitId, gaps, problems, mutate, onEvidence }: Props) {
  const [showCovered, setShowCovered] = useState(false);
  const open = gaps.filter(isOpenGap).sort((a, b) => rank(a) - rank(b));
  const resolved = gaps.filter((g) => g.resolution !== null);
  const covered = gaps.filter((g) => (g.status === "covered" || g.status === "not_applicable") && g.resolution === null);
  const post = (g: GapItem, body: unknown) => mutate(`/api/visits/${visitId}/gaps/${encodeURIComponent(g.itemId)}`, body);
  const done = gaps.length ? (gaps.length - open.length) / gaps.length : 1;

  return (
    <section className="glass min-h-0 overflow-y-auto rounded-none border-0 p-3 shadow-none" aria-label="Missed items">
      <div className="glass-pill mb-3 rounded-xl p-3">
        <p className="flex items-center justify-between font-sub text-sm font-semibold text-ink-2">
          Missed items <Badge tone={open.length ? "amber" : "green"}>{open.length} open</Badge>
        </p>
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out" style={{ width: `${done * 100}%` }} />
          </div>
          <span className="font-mono text-[11px] tabular-nums text-ink-3">{gaps.length - open.length}/{gaps.length}</span>
        </div>
        <p className="mt-1 text-[11px] text-ink-3">Checklist and last visit&apos;s open items, audited against the transcript.</p>
      </div>

      {open.length === 0 && (
        <p className="fade-in flex items-center gap-2 rounded-xl border border-ok/25 bg-ok-soft p-3 text-sm text-ok-ink">
          <CircleCheck className="pop h-5 w-5 shrink-0" /> Nothing missed. Every checklist item is covered or resolved.
        </p>
      )}
      <ul className="space-y-2">
        {open.map((g, i) => <OpenGap key={g.itemId} index={i} gap={g} problems={problems} post={post} onEvidence={onEvidence} />)}
      </ul>

      {resolved.length > 0 && (
        <>
          <p className="mb-2 mt-5 font-sub text-sm font-semibold text-ink-2">Resolved ({resolved.length})</p>
          <ul className="space-y-1.5">
            {resolved.map((g) => {
              const Icon = g.resolution ? RESOLUTION_ICON[g.resolution.type] : CircleCheck;
              return (
                <li key={g.itemId} className="fade-in flex items-start justify-between gap-2 rounded-xl border border-line bg-surface-2 px-2.5 py-2 text-sm">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ok-soft text-ok-ink"><Icon className="h-3 w-3" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-ink">{g.label}</p>
                    <p className="text-xs text-ink-3">
                      {g.resolution?.type === "filled" && "Added to note"}
                      {g.resolution?.type === "dismissed" && `Dismissed: ${DISMISS_REASON_LABELS[g.resolution.reason]}`}
                      {g.resolution?.type === "deferred" && "Deferred to next visit"}
                    </p>
                  </div>
                  <button title="Undo" aria-label="Undo" onClick={() => post(g, { action: "reopen" })} className="rounded-md p-1 text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink">
                    <Undo2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <button
        onClick={() => setShowCovered((v) => !v)}
        className="mt-5 flex w-full items-center gap-1 rounded-md py-1 font-sub text-sm font-semibold text-ink-2 transition-colors hover:text-ink"
      >
        <ChevronRight className={cn("h-3.5 w-3.5 transition-transform duration-300", showCovered && "rotate-90")} /> Covered ({covered.length})
      </button>
      {showCovered && (
        <ul className="mt-2 space-y-1">
          {covered.map((g, i) => (
            <li key={g.itemId} className="rise flex items-start gap-2 rounded-lg px-1.5 py-1 text-sm" style={stagger(i)}>
              <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" />
              <div>
                <p className="text-ink-2">{g.label}{g.status === "not_applicable" && <span className="text-ink-4"> (n/a)</span>}</p>
                {g.evidenceUtteranceIds.length > 0 && (
                  <EvidenceButton ids={g.evidenceUtteranceIds} onEvidence={onEvidence} />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EvidenceButton({ ids, onEvidence }: { ids: string[]; onEvidence: (ids: string[]) => void }) {
  return (
    <button onClick={() => onEvidence(ids)} className="mt-0.5 inline-flex items-center gap-1 rounded-md bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-accent-ink transition-colors hover:bg-accent/20">
      <Quote className="h-3 w-3" /> Evidence: {ids.join(", ")}
    </button>
  );
}

function OpenGap({ index, gap: g, problems, post, onEvidence }: {
  index: number; gap: GapItem; problems: Problem[]; post: (g: GapItem, body: unknown) => Promise<boolean>; onEvidence: (ids: string[]) => void;
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
  const required = g.priority === "required";

  return (
    <li
      className={cn(
        "rise relative overflow-hidden rounded-xl border p-3 pl-4 transition-shadow hover:shadow-lift",
        required ? "border-warn/40 bg-warn-soft/50" : "border-line bg-surface",
      )}
      style={stagger(index)}
    >
      <span className={cn("absolute inset-y-0 left-0 w-1", required ? "bg-warn" : "bg-line-strong")} aria-hidden />
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold leading-snug text-ink">{g.label}</p>
        <Badge tone={required ? "amber" : "slate"}>{g.priority}</Badge>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-ink-2">
        <span className={cn("mr-1 rounded px-1.5 py-px text-[11px] font-semibold", g.status === "missing" ? "bg-danger-soft text-danger-ink" : "bg-warn-soft text-warn-ink")}>
          {g.status === "missing" ? "Missing" : "Partial"}
        </span>
        {g.explanation}
      </p>
      {g.evidenceUtteranceIds.length > 0 && <EvidenceButton ids={g.evidenceUtteranceIds} onEvidence={onEvidence} />}

      {mode === "idle" && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <Button size="sm" variant="secondary" onClick={() => setMode("add")} className="h-7 px-2.5 text-xs"><Plus className="h-3.5 w-3.5" /> Add</Button>
          <Button size="sm" variant="secondary" onClick={() => setMode("dismiss")} className="h-7 px-2.5 text-xs"><X className="h-3.5 w-3.5" /> Dismiss</Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => run({ action: "defer" })} className="h-7 px-2.5 text-xs"><CalendarClock className="h-3.5 w-3.5" /> Defer</Button>
        </div>
      )}
      {mode === "add" && (
        <div className="fade-in mt-2.5 space-y-2">
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
        <div className="fade-in mt-2.5 space-y-2">
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
