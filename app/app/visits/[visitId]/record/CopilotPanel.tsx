"use client";

import { useEffect, useRef, useState } from "react";
import { Check, MessageCircleQuestion, Sparkles, X } from "lucide-react";
import type { CopilotState, Suggestion } from "@/lib/contracts";
import type { CopilotChip } from "@/lib/copilot/client/useCopilot";
import { openThreads } from "@/lib/copilot/threads";
import { cn } from "@/lib/utils";

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
            {card.topic}
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

const SHOW_TOPICS = 3;

/**
 * The topics the conversation left half answered, e.g. "Cough: 3 weeks ✓ · worse at night ✓ · fever ?".
 * Most recent first, at most three. Nothing is shown while nothing is missing.
 */
export function OpenTopics({ copilot }: { copilot: CopilotState | null }) {
  const open = openThreads(copilot?.threads ?? []).slice(0, SHOW_TOPICS);
  if (!open.length) return null;
  return (
    <div className="mt-4 rounded-2xl border border-monitor-line/70 bg-monitor/40 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-monitor-dim">Still open in this conversation</p>
      <ul className="mt-2 space-y-1.5 text-sm">
        {open.map((t) => (
          <li key={t.id} className="fade-in flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="font-medium text-monitor-ink">{t.topic}</span>
            {t.known.map((k) => (
              <span key={k} className="text-xs text-monitor-dim">
                {k} <Check className="inline h-3 w-3 text-monitor-trace" strokeWidth={3} />
              </span>
            ))}
            {t.missing.map((m) => (
              <span key={m} className="text-xs text-monitor-warn">{m} ?</span>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
