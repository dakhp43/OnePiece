import { z } from "zod";
import type { Medication, VisitType } from "./visit";

/** Registration data for a patient (Add patient / Edit patient). The server trusts only what passes here. */

/** "X" is shown as "Other". */
export const SEX = ["F", "M", "X"] as const;
export type Sex = (typeof SEX)[number];

/** Quick-pick chips on the form; any other condition can be typed. */
export const COMMON_CONDITIONS = [
  "Hypertension", "Type 2 diabetes", "High cholesterol", "Asthma", "COPD",
  "CKD", "Depression", "Hypothyroidism", "Obesity", "GERD",
] as const;

const MAX_AGE = 120;

const text = (max: number) => z.string().trim().min(1).max(max);

/** A real calendar date, YYYY-MM-DD, not in the future and at most 120 years ago. */
const DobSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must be YYYY-MM-DD").superRefine((s, ctx) => {
  const [y, m, d] = s.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    ctx.addIssue({ code: "custom", message: "Date of birth isn't a real date" });
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  if (s > today) ctx.addIssue({ code: "custom", message: "Date of birth can't be in the future" });
  else if (Number(today.slice(0, 4)) - y > MAX_AGE) ctx.addIssue({ code: "custom", message: `Age can't be over ${MAX_AGE}` });
});

const PatientMedicationSchema = z.object({
  name: text(80),
  dose: z.string().trim().max(60),
  frequency: z.string().trim().max(60),
});

export const PatientInputSchema = z.object({
  firstName: text(60),
  lastName: text(60),
  dob: DobSchema,
  sex: z.enum(SEX),
  email: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : typeof v === "string" ? v.trim().toLowerCase() : v),
    z.email("Email doesn't look right").max(200).nullable(),
  ),
  preferredLanguage: z.enum(["en", "es"]),
  knownMedications: z.array(PatientMedicationSchema).max(30),
  knownAllergies: z.array(text(80)).max(30),
  conditions: z.array(text(80)).max(30),
});
export type PatientInput = z.infer<typeof PatientInputSchema>;

export const PatientPatchSchema = PatientInputSchema.partial();
export type PatientPatch = z.infer<typeof PatientPatchSchema>;

const squash = (s: unknown) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim() : s);

function dedupe(list: unknown): unknown {
  if (!Array.isArray(list)) return list;
  const seen = new Set<string>();
  return list.map(squash).filter((x) => {
    if (typeof x !== "string" || !x) return typeof x !== "string";
    const k = x.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Tidies raw form input before validation: trims and collapses spaces, drops fully blank medication rows
 * and repeated medications (same name and dose), and dedupes allergies and conditions ignoring case.
 */
export function normalizePatientInput(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const r = { ...(raw as Record<string, unknown>) };
  for (const k of ["firstName", "lastName", "dob", "sex", "email", "preferredLanguage"]) if (k in r) r[k] = squash(r[k]);
  if (Array.isArray(r.knownMedications)) {
    const seen = new Set<string>();
    r.knownMedications = r.knownMedications
      .map((m) => (m && typeof m === "object" ? Object.fromEntries(Object.entries(m).map(([k, v]) => [k, squash(v)])) : m))
      .filter((m) => {
        if (!m || typeof m !== "object") return true;
        const { name = "", dose = "", frequency = "" } = m as Record<string, string>;
        if (!name && !dose && !frequency) return false;
        const k = `${String(name).toLowerCase()}|${String(dose).toLowerCase()}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
  }
  if ("knownAllergies" in r) r.knownAllergies = dedupe(r.knownAllergies);
  if ("conditions" in r) r.conditions = dedupe(r.conditions);
  return r;
}

const medKey = (m: Medication) => `${m.name}|${m.dose}|${m.frequency}`;

export function medsChanged(a: Medication[], b: Medication[]) {
  return a.length !== b.length || a.some((m, i) => medKey(m) !== medKey(b[i]));
}

/** Start visit's default for a patient with no signed visit yet: diabetes first (more specific), then hypertension. */
export function visitTypeForConditions(conditions: string[], fallback: VisitType): VisitType {
  const has = (name: string) => conditions.some((c) => c.toLowerCase() === name.toLowerCase());
  if (has("Type 2 diabetes")) return "t2dm_followup";
  if (has("Hypertension")) return "htn_followup";
  return fallback;
}
