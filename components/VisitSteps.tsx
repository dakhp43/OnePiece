import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = ["Record", "Process", "Review", "Sign", "Follow-through"] as const;

/** Where the page sits in the visit; everything before it is done. "signed" = the read-only note. */
const POSITION = { record: 0, processing: 1, review: 2, signed: 3, followthrough: 4 } as const;

/** Display-only journey indicator shown on every visit screen. */
export function VisitSteps({ at, tone = "default", className }: { at: keyof typeof POSITION; tone?: "default" | "monitor"; className?: string }) {
  const current = POSITION[at];
  // On the signed note, signing itself is complete.
  const doneThrough = at === "signed" ? current : current - 1;
  const monitor = tone === "monitor";

  return (
    <ol className={cn("flex items-center gap-1 text-[13px] font-medium", className)} aria-label="Visit progress">
      {STEPS.map((label, i) => {
        const done = i <= doneThrough;
        const active = i === current && at !== "signed";
        return (
          <li key={label} className="flex items-center gap-1" aria-current={active ? "step" : undefined}>
            {i > 0 && (
              <span
                className={cn(
                  "h-px w-3 sm:w-6",
                  done || active ? (monitor ? "bg-monitor-trace/70" : "bg-accent") : monitor ? "bg-monitor-line" : "bg-line-strong",
                )}
                aria-hidden
              />
            )}
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2 py-1 transition-colors",
                active && (monitor ? "bg-monitor-trace/15 text-monitor-trace" : "bg-accent-soft text-accent-ink"),
                done && !active && (monitor ? "text-monitor-ink/80" : "text-ink-2"),
                !done && !active && (monitor ? "text-monitor-dim" : "text-ink-4"),
              )}
            >
              <span
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px]",
                  done && (monitor ? "border-monitor-trace bg-monitor-trace text-monitor" : "border-accent bg-accent text-white"),
                  active && (monitor ? "halo border-monitor-trace text-monitor-trace" : "halo border-accent text-accent"),
                  !done && !active && (monitor ? "border-monitor-line" : "border-line-strong"),
                )}
              >
                {done ? <Check className="h-2.5 w-2.5" strokeWidth={3.5} /> : active ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : i + 1}
              </span>
              <span className={cn(!active && "hidden md:inline")}>{label}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
