import { Droplet, HeartPulse, Stethoscope, Wind, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Flat, muted tones (white initials stay above 4.5:1 on each).
const AVATAR_TONES = ["bg-[#2f6f68]", "bg-[#3a638a]", "bg-[#8a6329]", "bg-[#4a7550]", "bg-[#87505e]"];

/** Initials in a solid disc; the color is stable per name. */
export function PatientAvatar({ first, last, size = "md", className }: { first: string; last: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const tone = AVATAR_TONES[[...(first + last)].reduce((n, c) => n + c.charCodeAt(0), 0) % AVATAR_TONES.length];
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        tone,
        size === "sm" && "h-8 w-8 text-xs",
        size === "md" && "h-10 w-10 text-sm",
        size === "lg" && "h-16 w-16 text-xl",
        className,
      )}
    >
      {first[0]}
      {last[0]}
    </span>
  );
}

export const VISIT_TYPE_ICON: Record<string, LucideIcon> = {
  htn_followup: HeartPulse,
  t2dm_followup: Droplet,
  acute_respiratory: Wind,
};

export function VisitTypeIcon({ type, className }: { type: string | null | undefined; className?: string }) {
  const Icon = (type && VISIT_TYPE_ICON[type]) || Stethoscope;
  return <Icon className={className} aria-hidden />;
}
