"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ListChecks, MessageCircleQuestion, Sparkles, X } from "lucide-react";
import type { CopilotState, CoverageStatus, Suggestion } from "@/lib/contracts";
import type { CopilotChip } from "@/lib/copilot/client/useCopilot";
import { meterCounts } from "@/lib/copilot/coverage";
import { cn } from "@/lib/utils";

const SOURCE_LABEL: Record<Suggestion["source"], string> = { checklist: "Checklist", open_item: "From last visit", clinical: "Clinical" };
const CAPTURED_MS = 4000;

/** Small status pill for the recorder header. */
export function CopilotChipView({ chip }: { chip: CopilotChip }) {
  if (chip === "off") return null;
  const label = chip === "connecting" ? "Copilot starting" : chip === "listening" ? "Copilot listening" : "Copilot off";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider",
        chip === "listening" && "border-monitor-trace/40 text-monitor-trace",
        chip === "connecting" && "border-monitor-line text-monitor-dim",
        chip === "error" && "border-monitor-line text-monitor-dim",
      )}
      title={chip === "error" ? "Live suggestions are unavailable. Recording continues normally." : undefined}
    >
      <Sparkles className={cn("h-3 w-3", chip === "connecting" && "animate-pulse")} />
      {label}
    </span>
  );
}

/**
 * The one "Consider asking" card. Shows the current suggestion; when the conversation covers it the card
 * turns "Captured" for a few seconds and leaves. Dismissed and expired cards just disappear.
 */
export function SuggestionCard({ copilot, onDismiss }: { copilot: CopilotState | null; onDismiss: (id: string) => void }) {
  const shown = copilot?.suggestions.find((s) => s.status === "shown") ?? null;
  const [captured, setCaptured] = useState<Suggestion | null>(null);
  const seen = useRef(new Set<string>());

  useEffect(() => {
    const fresh = copilot?.suggestions.find((s) => s.status === "captured" && !seen.current.has(s.id));
    for (const s of copilot?.suggestions ?? []) if (s.status === "captured") seen.current.add(s.id);
    if (!fresh) return;
    setCaptured(fresh);
    const t = setTimeout(() => setCaptured(null), CAPTURED_MS);
    return () => clearTimeout(t);
  }, [copilot]);

  const card = shown ?? captured;
  if (!card) return null;
  const done = card.status === "captured";
  return (
    <div
      key={card.id}
      role="status"
      aria-live="polite"
      className={cn(
        "rise mt-5 flex items-start gap-3 rounded-2xl border px-4 py-3.5 transition-colors duration-500",
        done ? "border-monitor-trace/50 bg-monitor-trace/10" : "border-monitor-warn/50 bg-monitor-warn/10",
      )}
    >
      <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl", done ? "pop bg-monitor-trace text-black" : "bg-monitor-warn/20 text-monitor-warn")}>
        {done ? <Check className="h-4 w-4" strokeWidth={3} /> : <MessageCircleQuestion className="h-4 w-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wider", done ? "text-monitor-trace" : "text-monitor-warn")}>
          {done ? "Captured" : "Consider asking"}
          <span className="rounded-full border border-monitor-line px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal text-monitor-dim">
            {SOURCE_LABEL[card.source]}{card.label ? ` · ${card.label.replace(/^Follow up: /, "")}` : ""}
          </span>
        </p>
        <p className={cn("mt-1 text-lg leading-snug", done ? "text-monitor-ink/70" : "text-white")}>“{card.question}”</p>
      </div>
      {!done && (
        <button
          onClick={() => onDismiss(card.id)}
          className="rounded-full p-1.5 text-monitor-dim transition-colors hover:bg-monitor-line hover:text-monitor-ink"
          aria-label="Dismiss suggestion"
          title="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

const DOT: Record<CoverageStatus, string> = {
  covered: "bg-monitor-trace",
  partial: "bg-monitor-warn/70",
  missing: "bg-monitor-dim/60",
  unknown: "border border-monitor-dim/60",
  not_applicable: "border border-dashed border-monitor-line",
};
const STATUS_LABEL: Record<CoverageStatus, string> = {
  covered: "covered", partial: "partly", missing: "not yet", unknown: "listening", not_applicable: "n/a",
};
const ORDER: CoverageStatus[] = ["missing", "partial", "unknown", "covered", "not_applicable"];

/** "Checklist 7/13 covered", expandable to what the copilot has heard per item. No transcript is shown. */
export function CoverageMeter({ copilot }: { copilot: CopilotState | null }) {
  const [open, setOpen] = useState(false);
  if (!copilot) return null;
  const { covered, partial, total } = meterCounts(copilot.coverage);
  const items = [...copilot.coverage].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));
  return (
    <div className="mt-4 rounded-2xl border border-monitor-line/70 bg-monitor/40">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left" aria-expanded={open}>
        <ListChecks className="h-4 w-4 shrink-0 text-monitor-trace" />
        <span className="text-sm text-monitor-ink">
          Checklist <span className="font-mono tabular-nums">{covered}/{total}</span> covered
          {partial > 0 && <span className="text-monitor-dim"> · {partial} partly</span>}
        </span>
        <span className="relative h-1 flex-1 overflow-hidden rounded-full bg-monitor-line">
          <span className="absolute inset-y-0 left-0 rounded-full bg-monitor-trace transition-[width] duration-700" style={{ width: `${total ? (covered / total) * 100 : 0}%` }} />
        </span>
        <ChevronDown className={cn("h-4 w-4 text-monitor-dim transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ul className="grid gap-x-6 gap-y-1.5 border-t border-monitor-line/70 px-4 py-3 text-xs sm:grid-cols-2">
          {items.map((c) => (
            <li key={c.itemId} className="flex items-center gap-2" title={c.evidenceQuote ?? undefined}>
              <span className={cn("h-2 w-2 shrink-0 rounded-full", DOT[c.status])} />
              <span className={cn("min-w-0 flex-1 truncate", c.status === "covered" ? "text-monitor-ink/70" : "text-monitor-ink")}>{c.label}</span>
              <span className="shrink-0 text-monitor-dim">{STATUS_LABEL[c.status]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
