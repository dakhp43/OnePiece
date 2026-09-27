"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus, Save, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/form";
import { COMMON_CONDITIONS, PatientInputSchema, normalizePatientInput, type Medication, type Sex } from "@/lib/contracts";
import { cn } from "@/lib/utils";

export interface PatientFormValues {
  firstName: string;
  lastName: string;
  dob: string;
  sex: Sex | "";
  email: string;
  preferredLanguage: "en" | "es";
  knownMedications: Medication[];
  knownAllergies: string[];
  conditions: string[];
}

export const EMPTY_PATIENT: PatientFormValues = {
  firstName: "", lastName: "", dob: "", sex: "", email: "", preferredLanguage: "en",
  knownMedications: [{ name: "", dose: "", frequency: "" }], knownAllergies: [], conditions: [],
};

const SEX_OPTIONS: { value: Sex; label: string }[] = [
  { value: "F", label: "Female" },
  { value: "M", label: "Male" },
  { value: "X", label: "Other" },
];

const FIELD_LABEL: Record<string, string> = {
  firstName: "First name", lastName: "Last name", dob: "Date of birth", sex: "Sex", email: "Email",
  preferredLanguage: "Language", knownMedications: "Medications", knownAllergies: "Allergies", conditions: "Conditions",
};

/** "Last name: Too small" style message from the first zod issue, readable for a doctor. */
function issueText(issue: { path: PropertyKey[]; message: string; code?: string }) {
  const field = FIELD_LABEL[String(issue.path[0])] ?? "Form";
  if (issue.path[0] === "sex") return "Choose the patient's sex.";
  if (issue.path[0] === "knownMedications" && issue.path[2] === "name") return `Medication ${Number(issue.path[1]) + 1} needs a name.`;
  if (issue.path[0] === "dob" && issue.code === "invalid_format") return "Enter the date of birth.";
  if (issue.code === "too_small") return `${field} is required.`;
  if (issue.code === "too_big") return `${field} is too long.`;
  // The schema's own messages already name the field ("Date of birth can't be in the future").
  return issue.message.startsWith(field) || issue.message.startsWith("Email") ? `${issue.message}.` : `${field}: ${issue.message}`;
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Add patient / Edit patient dialog. Validates with the same schema as the server, so most mistakes are
 * caught before saving. Create goes to the new patient's page; edit refreshes the current page.
 * Callers remount it (a new `key`) each time it opens, so it always starts from `initial`.
 */
export function PatientForm({ mode, open, onClose, initial, patientId }: {
  mode: "create" | "edit";
  open: boolean;
  onClose: () => void;
  initial?: PatientFormValues;
  patientId?: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState<PatientFormValues>(initial ?? EMPTY_PATIENT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof PatientFormValues>(key: K, value: PatientFormValues[K]) => setValues((v) => ({ ...v, [key]: value }));

  async function save() {
    setError(null);
    const parsed = PatientInputSchema.safeParse(normalizePatientInput(values));
    if (!parsed.success) {
      setError(issueText(parsed.error.issues[0]));
      return;
    }
    let body: Record<string, unknown> = parsed.data;
    if (mode === "edit" && initial) {
      // Send only what changed, so the audit trail records exactly which fields were edited.
      const before = PatientInputSchema.safeParse(normalizePatientInput(initial));
      const old = (before.success ? before.data : {}) as Record<string, unknown>;
      body = Object.fromEntries(Object.entries(parsed.data).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(old[k])));
      if (Object.keys(body).length === 0) {
        onClose();
        return;
      }
    }
    setBusy(true);
    const res = await fetch(mode === "create" ? "/api/patients" : `/api/patients/${patientId}`, {
      method: mode === "create" ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.details?.[0] ? issueText(data.details[0]) : data.error ?? "Could not save the patient");
      setBusy(false);
      return;
    }
    if (mode === "create") {
      router.push(`/app/patients/${data.id}`);
    } else {
      router.refresh();
      onClose();
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={mode === "create" ? "Add patient" : "Edit patient"}
      className="max-w-2xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "create" ? <UserPlus className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {busy ? "Saving…" : mode === "create" ? "Add patient" : "Save changes"}
          </Button>
        </>
      }
    >
      <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="pf-first">First name</Label>
            <Input id="pf-first" autoFocus autoComplete="off" value={values.firstName} onChange={(e) => set("firstName", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="pf-last">Last name</Label>
            <Input id="pf-last" autoComplete="off" value={values.lastName} onChange={(e) => set("lastName", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="pf-dob">Date of birth</Label>
            <Input id="pf-dob" type="date" max={today()} value={values.dob} onChange={(e) => set("dob", e.target.value)} />
          </div>
          <fieldset>
            <legend className="mb-1.5 block text-xs font-medium text-ink-2">Sex</legend>
            <div className="grid grid-cols-3 gap-2">
              {SEX_OPTIONS.map((o) => {
                const selected = values.sex === o.value;
                return (
                  <label
                    key={o.value}
                    className={cn(
                      "flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-lg border text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent",
                      selected ? "border-accent bg-accent-soft font-medium text-ink ring-1 ring-accent" : "border-line-strong text-ink-2 hover:bg-surface-2",
                    )}
                  >
                    <input type="radio" name="pf-sex" value={o.value} checked={selected} onChange={() => set("sex", o.value)} className="sr-only" />
                    {selected && <Check className="h-3.5 w-3.5 text-accent-ink" />}
                    {o.label}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <div>
            <Label htmlFor="pf-lang">Preferred language</Label>
            <Select id="pf-lang" value={values.preferredLanguage} onChange={(e) => set("preferredLanguage", e.target.value as "en" | "es")}>
              <option value="en">English</option>
              <option value="es">Spanish (summary also in Spanish)</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="pf-email">Email <span className="font-normal text-ink-4">(optional, for the visit summary)</span></Label>
            <Input id="pf-email" type="email" autoComplete="off" value={values.email} onChange={(e) => set("email", e.target.value)} />
          </div>
        </div>

        <MedicationRows meds={values.knownMedications} onChange={(m) => set("knownMedications", m)} />
        <ChipInput id="pf-allergies" label="Allergies" placeholder="Type an allergy, press Enter" values={values.knownAllergies} onChange={(v) => set("knownAllergies", v)} tone="danger" />
        <ChipInput id="pf-conditions" label="Known conditions" placeholder="Other condition, press Enter" values={values.conditions} onChange={(v) => set("conditions", v)} suggestions={COMMON_CONDITIONS} />

        {error && <p role="alert" className="rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-sm text-danger-ink">{error}</p>}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}

function MedicationRows({ meds, onChange }: { meds: Medication[]; onChange: (m: Medication[]) => void }) {
  const update = (i: number, patch: Partial<Medication>) => onChange(meds.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  return (
    <fieldset>
      <legend className="mb-1.5 block text-xs font-medium text-ink-2">Current medications</legend>
      <div className="space-y-2">
        {meds.map((m, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2">
            <Input aria-label={`Medication ${i + 1} name`} placeholder="Name, e.g. lisinopril" value={m.name} onChange={(e) => update(i, { name: e.target.value })} />
            <Input aria-label={`Medication ${i + 1} dose`} placeholder="Dose, e.g. 10 mg" value={m.dose} onChange={(e) => update(i, { dose: e.target.value })} />
            <Input aria-label={`Medication ${i + 1} frequency`} placeholder="How often" value={m.frequency} onChange={(e) => update(i, { frequency: e.target.value })} />
            <button
              type="button"
              onClick={() => onChange(meds.filter((_, j) => j !== i))}
              className="rounded-full p-1.5 text-ink-3 transition-colors hover:bg-surface-3 hover:text-danger-ink"
              aria-label={`Remove medication ${i + 1}`}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <Button variant="ghost" size="sm" className="mt-2" onClick={() => onChange([...meds, { name: "", dose: "", frequency: "" }])}>
        <Plus className="h-3.5 w-3.5" /> Add medication
      </Button>
    </fieldset>
  );
}

function ChipInput({ id, label, placeholder, values, onChange, suggestions = [], tone = "accent" }: {
  id: string; label: string; placeholder: string; values: string[]; onChange: (v: string[]) => void;
  suggestions?: readonly string[]; tone?: "accent" | "danger";
}) {
  const [draft, setDraft] = useState("");
  const has = (v: string) => values.some((x) => x.toLowerCase() === v.toLowerCase());
  const add = (raw: string) => {
    const v = raw.replace(/\s+/g, " ").trim();
    if (v && !has(v)) onChange([...values, v]);
    setDraft("");
  };
  const remove = (v: string) => onChange(values.filter((x) => x.toLowerCase() !== v.toLowerCase()));
  const chip = tone === "danger" ? "border-danger/30 bg-danger-soft text-danger-ink" : "border-accent/30 bg-accent-soft text-accent-ink";
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      {suggestions.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {suggestions.map((s) => {
            const on = has(s);
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                onClick={() => (on ? remove(s) : add(s))}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors",
                  on ? chip : "border-line-strong text-ink-2 hover:bg-surface-2",
                )}
              >
                {on && <Check className="h-3 w-3" />} {s}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-2 py-1.5 focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/15">
        {values.filter((v) => !suggestions.some((s) => s.toLowerCase() === v.toLowerCase())).map((v) => (
          <span key={v} className={cn("inline-flex items-center gap-1 rounded-full border py-0.5 pl-2.5 pr-1 text-xs", chip)}>
            {v}
            <button type="button" onClick={() => remove(v)} className="rounded-full p-0.5 hover:bg-black/10" aria-label={`Remove ${v}`}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => (e.target.value.endsWith(",") ? add(e.target.value.slice(0, -1)) : setDraft(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); add(draft); }
            else if (e.key === "Backspace" && !draft && values.length) remove(values[values.length - 1]);
          }}
          onBlur={() => draft && add(draft)}
          className="h-7 min-w-[10rem] flex-1 bg-transparent px-1 text-sm text-ink placeholder:text-ink-4 focus:outline-none"
        />
      </div>
    </div>
  );
}
