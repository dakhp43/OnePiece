"use client";

import { useState } from "react";
import { CalendarCheck, ListChecks, MessagesSquare, Pill, Plus, Siren, X, type LucideIcon } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/form";
import type { PatientSummary } from "@/lib/contracts";
import { fleschKincaidGrade, summaryText } from "@/lib/scoring/readability";

type Change = PatientSummary["medicationChanges"][number]["change"];
const CHANGE_TONE: Record<Change, BadgeTone> = { new: "teal", changed: "amber", stopped: "red", continue: "slate" };
const HEADINGS = {
  en: { discussed: "What we talked about", meds: "Your medicines", next: "What to do next", help: "When to get help", follow: "Your next visit" },
  es: { discussed: "De qué hablamos", meds: "Sus medicinas", next: "Qué hacer ahora", help: "Cuándo pedir ayuda", follow: "Su próxima visita" },
};

export function SummaryEditor({ summary: initial, onSave }: { summary: PatientSummary; onSave: (s: PatientSummary) => Promise<boolean> }) {
  const [s, setS] = useState(initial);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(s) !== JSON.stringify(initial);
  const h = HEADINGS[s.language];
  const grade = s.language === "en" ? fleschKincaidGrade(summaryText(s)) : null;
  const set = <K extends keyof PatientSummary>(k: K, v: PatientSummary[K]) => setS((prev) => ({ ...prev, [k]: v }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {grade !== null ? (
          <div className="flex items-center gap-3">
            <Badge tone={grade <= 6.5 ? "green" : grade <= 8 ? "amber" : "red"}>Reading level: grade {grade.toFixed(1)}</Badge>
            <ReadingMeter grade={grade} />
          </div>
        ) : <span />}
        {dirty && (
          <div className="fade-in flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs text-warn-ink"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-warn" /> Unsaved edits</span>
            <Button size="sm" variant="ghost" onClick={() => setS(initial)}>Discard</Button>
            <Button size="sm" disabled={busy} onClick={async () => { setBusy(true); await onSave(s); setBusy(false); }}>Save changes</Button>
          </div>
        )}
      </div>

      <Textarea rows={2} value={s.greeting} onChange={(e) => set("greeting", e.target.value)} className="text-xl font-medium leading-snug" aria-label="Greeting" />

      <Section title={h.discussed} icon={MessagesSquare}>
        {s.whatWeDiscussed.map((d, i) => (
          <div key={i} className="space-y-1">
            <Input value={d.topic} className="font-medium" aria-label="Topic"
              onChange={(e) => set("whatWeDiscussed", s.whatWeDiscussed.map((x, j) => (j === i ? { ...x, topic: e.target.value } : x)))} />
            <Textarea rows={2} value={d.explanation} aria-label="Explanation"
              onChange={(e) => set("whatWeDiscussed", s.whatWeDiscussed.map((x, j) => (j === i ? { ...x, explanation: e.target.value } : x)))} />
          </div>
        ))}
      </Section>

      <Section title={h.meds} icon={Pill}>
        {s.medicationChanges.length === 0 && <p className="text-sm text-ink-3">No medication changes.</p>}
        {s.medicationChanges.map((m, i) => (
          <div key={i} className="flex items-start gap-2">
            <Select value={m.change} className="h-10 w-32"
              onChange={(e) => set("medicationChanges", s.medicationChanges.map((x, j) => (j === i ? { ...x, change: e.target.value as Change } : x)))}>
              {(["new", "changed", "stopped", "continue"] as const).map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <Input value={m.name} className="font-medium" aria-label="Medicine"
                  onChange={(e) => set("medicationChanges", s.medicationChanges.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <Badge tone={CHANGE_TONE[m.change]}>{m.change}</Badge>
              </div>
              <Input value={m.instructions} aria-label="Instructions"
                onChange={(e) => set("medicationChanges", s.medicationChanges.map((x, j) => (j === i ? { ...x, instructions: e.target.value } : x)))} />
            </div>
          </div>
        ))}
      </Section>

      <Section title={h.next} icon={ListChecks}>
        {s.nextSteps.map((n, i) => (
          <div key={i} className="flex gap-2">
            <Input value={n.text} aria-label="Next step"
              onChange={(e) => set("nextSteps", s.nextSteps.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
            <Input value={n.when ?? ""} placeholder="when" className="w-40" aria-label="When"
              onChange={(e) => set("nextSteps", s.nextSteps.map((x, j) => (j === i ? { ...x, when: e.target.value || null } : x)))} />
            <RemoveButton onClick={() => set("nextSteps", s.nextSteps.filter((_, j) => j !== i))} />
          </div>
        ))}
        <AddButton onClick={() => set("nextSteps", [...s.nextSteps, { text: "", when: null }])} />
      </Section>

      <Section title={h.help} icon={Siren}>
        {s.whenToGetHelp.length === 0 && (
          <p className="rounded-lg bg-warn-soft px-2.5 py-1.5 text-xs text-warn-ink">No warning signs were in the signed note, so none are listed. Add any you gave the patient.</p>
        )}
        {s.whenToGetHelp.map((w, i) => (
          <div key={i} className="flex gap-2">
            <Input value={w} aria-label="Warning sign" onChange={(e) => set("whenToGetHelp", s.whenToGetHelp.map((x, j) => (j === i ? e.target.value : x)))} />
            <RemoveButton onClick={() => set("whenToGetHelp", s.whenToGetHelp.filter((_, j) => j !== i))} />
          </div>
        ))}
        <AddButton onClick={() => set("whenToGetHelp", [...s.whenToGetHelp, ""])} />
      </Section>

      <Section title={h.follow} icon={CalendarCheck}>
        <Input value={s.followUp ?? ""} onChange={(e) => set("followUp", e.target.value || null)} aria-label="Next visit" />
      </Section>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface-2/60 p-4">
      <h3 className="mb-3 flex items-center gap-2 font-sub text-sm font-semibold text-accent-ink">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent-soft"><Icon className="h-3.5 w-3.5" /></span>
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

/** Where the grade sits on a 0-14 scale; the marker slides as the text is edited. Target is grade 6 or lower. */
function ReadingMeter({ grade }: { grade: number }) {
  const pos = Math.min(100, Math.max(0, (grade / 14) * 100));
  return (
    <span className="relative hidden h-2 w-36 sm:flex" title="Flesch-Kincaid grade (target ≤ 6.5)">
      {/* Bands match the badge thresholds: ≤ 6.5 green, ≤ 8 amber, above that red (scale 0-14). */}
      <span className="h-full rounded-l-full bg-ok" style={{ width: `${(6.5 / 14) * 100}%` }} />
      <span className="h-full bg-warn" style={{ width: `${(1.5 / 14) * 100}%` }} />
      <span className="h-full flex-1 rounded-r-full bg-danger" />
      <span className="absolute -top-1 h-4 w-1.5 -translate-x-1/2 rounded-full border-2 border-surface bg-ink transition-[left] duration-500 ease-out" style={{ left: `${pos}%` }} />
    </span>
  );
}

function AddButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-ink-3 transition-colors hover:bg-accent-soft hover:text-accent-ink">
      <Plus className="h-3 w-3" /> Add
    </button>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label="Remove" title="Remove" className="rounded-md p-2 text-ink-4 transition-colors hover:bg-danger-soft hover:text-danger">
      <X className="h-4 w-4" />
    </button>
  );
}
