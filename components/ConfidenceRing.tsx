import { cn } from "@/lib/utils";

const COLOR = { high: "var(--ok)", medium: "var(--warn)", low: "var(--danger)" } as const;

/** Circular meter that fills on mount and eases to new values (e.g. after an edit rescored the problem). */
export function ConfidenceRing({ value, level, size = 38, className }: {
  value: number; level: keyof typeof COLOR; size?: number; className?: string;
}) {
  const stroke = 3.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.round(value * 100);
  return (
    <span className={cn("relative inline-flex shrink-0 items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={COLOR[level]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          className="ring-fill transition-[stroke-dashoffset,stroke] duration-700 ease-out"
          style={{ strokeDashoffset: c * (1 - value), "--ring-circ": c } as React.CSSProperties}
        />
      </svg>
      <span className="absolute font-mono text-[11px] font-semibold tabular-nums text-ink">{pct}</span>
    </span>
  );
}
