import { cn } from "@/lib/utils";

/** One heartbeat (P wave, QRS spike, T wave) in a 100×40 cell, repeated `beats` times. */
function heartbeat(beats: number) {
  let d = "M0 20";
  for (let i = 0; i < beats; i++) {
    const x = i * 100;
    d += ` L${x + 28} 20 Q${x + 32} 14 ${x + 36} 20 L${x + 42} 20 L${x + 45} 24 L${x + 49} 3 L${x + 53} 36 L${x + 56} 20 L${x + 63} 20 Q${x + 70} 11 ${x + 77} 20 L${x + 100} 20`;
  }
  return d;
}

/**
 * ECG trace. `mode="draw"` draws itself once; `mode="sweep"` scrolls forever like a bedside monitor;
 * `mode="flat"` is a flatline (standby / not found).
 */
export function EcgTrace({
  mode = "draw",
  beats = 3,
  className,
  strokeWidth = 2,
  delay = 0,
  duration,
}: {
  mode?: "draw" | "sweep" | "flat";
  beats?: number;
  className?: string;
  strokeWidth?: number;
  delay?: number;
  duration?: number;
}) {
  if (mode === "sweep") {
    // Two identical halves; sliding by 50% loops seamlessly.
    return (
      <div className={cn("relative overflow-hidden", className)} aria-hidden>
        <svg
          viewBox={`0 0 ${beats * 200} 40`}
          preserveAspectRatio="none"
          className="ecg-sweep h-full w-[200%]"
          style={duration ? ({ "--sweep-duration": `${duration}s` } as React.CSSProperties) : undefined}
        >
          <path d={heartbeat(beats * 2)} fill="none" stroke="currentColor" strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      </div>
    );
  }
  return (
    <svg viewBox={`0 0 ${beats * 100} 40`} preserveAspectRatio="none" className={className} aria-hidden>
      <path
        d={mode === "flat" ? `M0 20 L${beats * 100} 20` : heartbeat(beats)}
        pathLength={1}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
        className="draw"
        style={{ "--delay": `${delay}s` } as React.CSSProperties}
      />
    </svg>
  );
}

/** App mark: a heartbeat in a rounded tile, plus the wordmark. */
export function Logo({ className, size = "md", onDark = false }: { className?: string; size?: "md" | "lg"; onDark?: boolean }) {
  const lg = size === "lg";
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        className={cn(
          "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-accent-strong text-on-accent",
          lg ? "h-11 w-11" : "h-8 w-8",
        )}
      >
        <svg viewBox="0 0 32 32" className={lg ? "h-7 w-7" : "h-5 w-5"} aria-hidden>
          <path
            d="M3 17h6l2.5-5 4 11 3.5-14 3 8h7"
            pathLength={1}
            fill="none"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="draw"
          />
        </svg>
      </span>
      <span className={cn("font-display font-semibold tracking-tight", onDark ? "text-monitor-ink" : "text-ink", lg ? "text-3xl" : "text-lg")}>
        Carry<span className={onDark ? "text-monitor-trace" : "text-accent-ink"}>over</span>
      </span>
    </span>
  );
}
