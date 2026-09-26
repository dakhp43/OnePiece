import * as React from "react";
import { cn } from "@/lib/utils";

const tones = {
  slate: "bg-slate-100 text-slate-700 border-slate-200",
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber: "bg-amber-50 text-amber-800 border-amber-200",
  red: "bg-red-50 text-red-700 border-red-200",
  teal: "bg-teal-50 text-teal-700 border-teal-200",
  blue: "bg-sky-50 text-sky-700 border-sky-200",
} as const;

export type BadgeTone = keyof typeof tones;

export function Badge({ className, tone = "slate", ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", tones[tone], className)}
      {...props}
    />
  );
}
