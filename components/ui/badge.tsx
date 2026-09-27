import * as React from "react";
import { cn } from "@/lib/utils";

const tones = {
  slate: "bg-surface-3 text-ink-2 border-line",
  green: "bg-ok-soft text-ok-ink border-ok/25",
  amber: "bg-warn-soft text-warn-ink border-warn/30",
  red: "bg-danger-soft text-danger-ink border-danger/25",
  teal: "bg-accent-soft text-accent-ink border-accent/25",
  blue: "bg-info-soft text-info-ink border-info/25",
} as const;

export type BadgeTone = keyof typeof tones;

export function Badge({ className, tone = "slate", ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-sans text-xs font-medium not-italic tracking-normal whitespace-nowrap transition-colors",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
