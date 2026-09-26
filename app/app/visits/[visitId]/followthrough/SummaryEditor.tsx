"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
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
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        {grade !== null ? (
          <Badge tone={grade <= 6.5 ? "green" : grade <= 8 ? "amber" : "red"}>Reading level: grade {grade.toFixed(1)}</Badge>
        ) : <span />}
        {dirty && (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setS(initial)}>Discard</Button>
            <Button size="sm" disabled={busy} onClick={async () => { setBusy(true); await onSave(s); setBusy(false); }}>Save changes</Button>
          </div>
        )}
      </div>

      <Textarea rows={2} value={s.greeting} onChange={(e) => set("greeting", e.target.value)} className="text-base" aria-label="Greeting" />

      <Section title={h.discussed}>
        {s.whatWeDiscussed.map((d, i) => (
          <div key={i} className="space-y-1">
            <Input value={d.topic} className="font-medium" aria-label="Topic"
              onChange={(e) => set("whatWeDiscussed", s.whatWeDiscussed.map((x, j) => (j === i ? { ...x, topic: e.target.value } : x)))} />
            <Textarea rows={2} value={d.explanation} aria-label="Explanation"
              onChange={(e) => set("whatWeDiscussed", s.whatWeDiscussed.map((x, j) => (j === i ? { ...x, explanation: e.target.value } : x)))} />
          </div>
        ))}
      </Section>

      <Section title={h.meds}>
        {s.medicationChanges.length === 0 && <p className="text-sm text-slate-500">No medication changes.</p>}
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

      <Section title={h.next}>
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

      <Section title={h.help}>
        {s.whenToGetHelp.length === 0 && (
          <p className="text-xs text-amber-700">No warning signs were in the signed note, so none are listed. Add any you gave the patient.</p>
        )}
        {s.whenToGetHelp.map((w, i) => (
          <div key={i} className="flex gap-2">
            <Input value={w} aria-label="Warning sign" onChange={(e) => set("whenToGetHelp", s.whenToGetHelp.map((x, j) => (j === i ? e.target.value : x)))} />
            <RemoveButton onClick={() => set("whenToGetHelp", s.whenToGetHelp.filter((_, j) => j !== i))} />
          </div>
        ))}
        <AddButton onClick={() => set("whenToGetHelp", [...s.whenToGetHelp, ""])} />
      </Section>

      <Section title={h.follow}>
        <Input value={s.followUp ?? ""} onChange={(e) => set("followUp", e.target.value || null)} aria-label="Next visit" />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-teal-800">{title}</h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function AddButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 text-xs text-slate-500 hover:text-accent">
      <Plus className="h-3 w-3" /> Add
    </button>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label="Remove" title="Remove" className="rounded p-2 text-slate-400 hover:bg-slate-100 hover:text-red-600">
      <X className="h-4 w-4" />
    </button>
  );
}
