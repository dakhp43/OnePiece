import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function ageFromDob(dob: string, now = new Date()) {
  const d = new Date(dob + "T00:00:00");
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

/** Patient sex for display: "F", "M", or "Other" (stored as "X"). */
export function sexLabel(sex: string) {
  return sex === "F" || sex === "M" ? sex : "Other";
}

export function formatDate(value: Date | string | null | undefined, opts?: Intl.DateTimeFormatOptions) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("en-US", opts ?? { month: "short", day: "numeric", year: "numeric" });
}

/** "83" -> "01:23" */
export function formatClock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** In the order the Start visit dialog lists them; "Regular visit" stays last as the catch-all. */
export const VISIT_TYPE_LABELS: Record<string, string> = {
  htn_followup: "Hypertension follow-up",
  t2dm_followup: "Diabetes follow-up",
  acute_respiratory: "Acute respiratory",
  asthma_copd: "Asthma / COPD",
  mental_health: "Depression / anxiety",
  annual_physical: "Annual physical",
  back_pain: "Back pain",
  urinary_symptoms: "Urinary symptoms",
  headache: "Headache",
  general_visit: "Regular visit",
};
