"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CircleCheck, FileDown, History, Loader2, Lock, PenLine, RotateCcw, Save, ShieldAlert } from "lucide-react";
import { Logo } from "@/components/brand";
import { stagger } from "@/components/motion";
import { VisitSteps } from "@/components/VisitSteps";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Report } from "@/lib/contracts";
import { changedFields } from "@/lib/report";
import type { ReportContext } from "@/lib/report-context";
import { cn } from "@/lib/utils";

interface Props {
  visitId: string;
  patientId: string;
  header: { patient: string; dob: string; ageSex: string; visitDate: string; visitType: string; signedAt: string; status: string };
  saved: Report;
  generated: Report;
  context: ReportContext;
}

const CHANGE_TONE = {
  new: "bg-accent-soft text-accent-ink",
  changed: "bg-warn-soft text-warn-ink",
  stopped: "bg-danger-soft text-danger-ink",
  continue: "bg-surface-3 text-ink-2",
} as const;

/** Clinician-facing visit report: narrative sections are editable in place; chart data is read-only. */
export function ReportEditor({ visitId, patientId, header, saved: initialSaved, generated, context }: Props) {
  const [saved, setSaved] = useState(initialSaved);
  const [report, setReport] = useState(initialSaved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = changedFields(saved, report).length > 0;
  const editedFromGenerated = changedFields(generated, report);

  const save = useCallback(async (next: Report = report) => {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/visits/${visitId}/report`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ report: next }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Could not save the report");
      return;
    }
    setSaved(data.report);
    setReport(data.report);
  }, [report, visitId]);

  // Cmd/Ctrl+S saves; leaving with unsaved edits asks first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (dirty && !busy) void save();
      }
    };
    const onLeave = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, [dirty, busy, save]);

  const set = <K extends keyof Report>(k: K, v: Report[K]) => setReport((r) => ({ ...r, [k]: v }));
  const setProblem = (id: string, field: "assessment" | "plan", v: string) =>
    setReport((r) => ({ ...r, problems: r.problems.map((p) => (p.problemId === id ? { ...p, [field]: v } : p)) }));
  const genProblem = (id: string) => generated.problems.find((p) => p.problemId === id);
  const v = context.vitals;

  return (
    <div className="flex-1">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={`/app/patients/${patientId}`} className="group inline-flex items-center gap-1.5 text-sm text-ink-3 transition-colors hover:text-accent-ink">
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" /> {header.patient}
          </Link>
          <VisitSteps at="signed" />
        </div>

        {/* Toolbar */}
        <div className="glass sticky top-[calc(var(--header-h)+0.5rem)] z-30 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-xl font-semibold text-ink">Clinical report</h1>
            {dirty ? (
              <Badge tone="amber"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-warn" /> Unsaved changes</Badge>
            ) : report.editedAt ? (
              <Badge tone="teal"><PenLine className="h-3 w-3" /> Edited · saved {new Date(report.editedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</Badge>
            ) : (
              <Badge tone="slate"><CircleCheck className="h-3 w-3" /> Generated from the signed note</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {editedFromGenerated.length > 0 && !dirty && (
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => void save(generated)} title="Replace every section with the text generated from the signed note">
                <History className="h-4 w-4" /> Revert all
              </Button>
            )}
            {dirty && (
              <Button variant="ghost" size="sm" onClick={() => setReport(saved)}>Discard</Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              title={dirty ? "Save your changes first" : "Open the report as a PDF"}
              onClick={() => {
                if (dirty) setError("Save your changes before downloading the PDF.");
                else window.open(`/api/visits/${visitId}/report/pdf`, "_blank", "noopener");
              }}
            >
              <FileDown className="h-4 w-4" /> Download PDF
            </Button>
            <Button size="sm" disabled={!dirty || busy} onClick={() => void save()} title="Save (⌘S)">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
            </Button>
          </div>
        </div>
        {error && <p role="alert" className="fade-in mt-3 rounded-xl border border-danger/25 bg-danger-soft px-3 py-2 text-sm text-danger-ink">{error}</p>}
        <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-3">
          <Lock className="h-3.5 w-3.5" /> The signed note stays frozen. This report is built from it; edits here are saved separately and logged to the audit trail.
        </p>

        {/* Document */}
        <article className="rise glass-strong mt-4 overflow-hidden rounded-3xl">
          <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line px-8 py-6">
            <div>
              <Logo />
              <h2 className="mt-3 font-display text-3xl font-semibold tracking-[-0.01em] text-ink">Clinical visit report</h2>
            </div>
            <p className="text-right text-xs text-ink-3">
              {header.status === "sent" ? "Signed · summary sent to patient" : "Signed"}
              {header.signedAt && <><br />{header.signedAt}</>}
            </p>
          </header>

          <dl className="grid grid-cols-2 border-b border-line sm:grid-cols-3">
            {[
              ["Patient", header.patient], ["Date of birth", header.dob], ["Age / sex", header.ageSex],
              ["Visit date", header.visitDate], ["Visit type", header.visitType], ["Clinician", context.doctorName],
            ].map(([label, value]) => (
              <div key={label} className="border-b border-r border-line px-6 py-3 last:border-r-0 sm:[&:nth-child(3n)]:border-r-0 sm:[&:nth-child(n+4)]:border-b-0">
                <dt className="font-sub text-xs font-semibold text-ink-3">{label}</dt>
                <dd className="mt-0.5 font-medium text-ink">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="space-y-7 px-8 py-7">
            <Editable i={1} label="Chief complaint" value={report.chiefComplaint} generated={generated.chiefComplaint} onChange={(x) => set("chiefComplaint", x)} singleLine />
            <Editable i={2} label="History of present illness" value={report.hpi} generated={generated.hpi} onChange={(x) => set("hpi", x)} />

            <ChartSection i={3} label="Vital signs">
              {v ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {[
                    ["Blood pressure", v.systolic && v.diastolic ? `${v.systolic}/${v.diastolic}` : "—", "mmHg"],
                    ["Heart rate", v.heartRate ?? "—", "bpm"], ["Temperature", v.tempF ?? "—", "°F"],
                    ["SpO₂", v.spo2 ?? "—", "%"], ["Weight", v.weightLb ?? "—", "lb"],
                  ].map(([label, value, unit]) => (
                    <div key={String(label)} className="rounded-xl border border-line bg-surface-3 px-3 py-2">
                      <p className="font-sub text-xs text-ink-3">{label}</p>
                      <p className="font-mono text-lg font-semibold tabular-nums text-ink">{value}{value !== "—" && <span className="ml-1 text-xs font-normal text-ink-3">{unit}</span>}</p>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-ink-3">No vital signs recorded for this visit.</p>}
            </ChartSection>

            <Editable i={4} label="Examination and findings" value={report.examination} generated={generated.examination} onChange={(x) => set("examination", x)} placeholder="No objective findings in the signed note. Add exam findings here." />

            <ChartSection i={5} label={context.medications.reconciled ? "Medications after this visit" : "Medications on file"}>
              {context.medications.list.length === 0 ? <p className="text-sm text-ink-3">None on file.</p> : (
                <ul className="divide-y divide-line rounded-xl border border-line">
                  {context.medications.list.map(({ med, change }, i) => (
                    <li key={med.name + i} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[15px]">
                      <span className={cn("text-ink", change === "stopped" && "text-ink-3 line-through")}>
                        <span className="font-semibold capitalize">{med.name}</span> <span className="text-ink-2">{`${med.dose} ${med.frequency}`.trim()}</span>
                      </span>
                      {context.medications.reconciled && <span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold capitalize", CHANGE_TONE[change])}>{change}</span>}
                    </li>
                  ))}
                </ul>
              )}
              {!context.medications.reconciled && <p className="mt-2 text-xs text-ink-3">Current chart list; no medication reconciliation was recorded for this visit.</p>}
            </ChartSection>

            <ChartSection i={6} label="Allergies">
              {context.allergies.length
                ? <p className="inline-flex items-center gap-1.5 font-semibold text-danger-ink"><ShieldAlert className="h-4 w-4" /> {context.allergies.join(", ")}</p>
                : <p className="text-[15px] text-ink">No known drug allergies.</p>}
            </ChartSection>

            <section className="rise" style={stagger(7)}>
              <h3 className="font-sub text-base font-semibold text-ink">Assessment and plan</h3>
              <div className="mt-3 space-y-4">
                {report.problems.map((p, n) => {
                  const g = genProblem(p.problemId);
                  return (
                    <div key={p.problemId} className="rounded-2xl border border-line bg-surface-3/60 p-4">
                      <p className="font-sub font-semibold text-ink">{n + 1}. {p.title}</p>
                      <div className="mt-2 space-y-3">
                        <Editable label="Assessment" small value={p.assessment} generated={g?.assessment ?? ""} onChange={(x) => setProblem(p.problemId, "assessment", x)} placeholder="Add an assessment." />
                        <Editable label="Plan (one item per line)" small value={p.plan} generated={g?.plan ?? ""} onChange={(x) => setProblem(p.problemId, "plan", x)} placeholder="Add plan items, one per line." />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <ChartSection i={8} label="Orders and follow-up">
              {context.tasks === null ? <p className="text-sm text-ink-3">No follow-through was generated for this visit.</p>
                : context.tasks.length === 0 ? <p className="text-sm text-ink-3">No orders.</p> : (
                <ul className="space-y-1.5 text-[15px]">
                  {context.tasks.map((t) => (
                    <li key={t.id} className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                      <span className="text-ink">{t.description} <span className="text-sm text-ink-3">({t.category}{t.dueInDays != null ? `, due in ${t.dueInDays} days` : ""})</span></span>
                    </li>
                  ))}
                </ul>
              )}
            </ChartSection>

            {(context.overrides.length > 0 || context.deferred.length > 0) && (
              <ChartSection i={9} label="Items not addressed at this visit">
                <ul className="space-y-1.5 text-[15px]">
                  {context.overrides.map((o) => (
                    <li key={o.itemId} className="text-ink">{o.label} <span className="text-sm text-warn-ink">(signed with override: {o.reason.replace(/_/g, " ")})</span></li>
                  ))}
                  {context.deferred.map((d) => <li key={d} className="text-ink">{d} <span className="text-sm text-ink-3">(deferred to next visit)</span></li>)}
                </ul>
              </ChartSection>
            )}

            <Editable i={10} label="Additional notes" value={report.additionalNotes} generated={generated.additionalNotes} onChange={(x) => set("additionalNotes", x)} placeholder="Optional addendum, e.g. counselling given or care coordination." />

            <footer className="flex flex-wrap items-end justify-between gap-4 border-t border-line pt-5">
              <div>
                <p className="font-sub text-xs font-semibold text-ink-3">Electronically signed</p>
                <p className="font-semibold text-ink">{context.doctorName}</p>
                <p className="text-sm text-ink-3">{header.signedAt}</p>
              </div>
              <p className="max-w-sm text-right text-xs text-ink-3">
                {report.editedAt
                  ? "Built from the clinician-reviewed note, then edited by the clinician."
                  : "Built from the clinician-reviewed note; every line traces to the visit transcript."}
              </p>
            </footer>
          </div>
        </article>
      </div>
    </div>
  );
}

function ChartSection({ i, label, children }: { i: number; label: string; children: React.ReactNode }) {
  return (
    <section className="rise" style={stagger(i)}>
      <h3 className="mb-2 flex items-center gap-2 font-sub text-base font-semibold text-ink">
        {label} <span className="rounded-md bg-surface-3 px-1.5 py-0.5 text-[11px] font-medium text-ink-3">From chart</span>
      </h3>
      {children}
    </section>
  );
}

/** A report section edited in place. Shows "Edited" with a one-click revert when it differs from the generated text. */
function Editable({ i, label, value, generated, onChange, placeholder, singleLine, small }: {
  i?: number; label: string; value: string; generated: string; onChange: (v: string) => void;
  placeholder?: string; singleLine?: boolean; small?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const edited = value !== generated;
  // Grow with the content so the page reads like a document, not a form.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <section className={i ? "rise" : undefined} style={i ? stagger(i) : undefined}>
      <div className="mb-1.5 flex items-center gap-2">
        <h3 className={cn("font-sub font-semibold", small ? "text-sm text-ink-2" : "text-base text-ink")}>{label}</h3>
        {edited && (
          <>
            <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[11px] font-semibold text-accent-ink">Edited</span>
            <button type="button" onClick={() => onChange(generated)} className="inline-flex items-center gap-1 text-xs text-ink-3 transition-colors hover:text-ink" title="Revert to the text generated from the signed note">
              <RotateCcw className="h-3 w-3" /> Revert
            </button>
          </>
        )}
      </div>
      <textarea
        ref={ref}
        aria-label={label}
        rows={singleLine ? 1 : 2}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(singleLine ? e.target.value.replace(/\n/g, " ") : e.target.value)}
        onKeyDown={(e) => { if (singleLine && e.key === "Enter") e.preventDefault(); }}
        className={cn(
          "block w-full resize-none overflow-hidden rounded-xl border border-transparent bg-transparent px-3 py-2 leading-relaxed text-ink transition-[border-color,background-color,box-shadow]",
          "placeholder:text-ink-4 hover:border-line hover:bg-surface-3/50 focus:border-accent focus:bg-surface focus:outline-none focus:ring-4 focus:ring-accent/15",
          small ? "text-[15px]" : "text-base",
          edited && "border-accent/30 bg-accent-soft/30",
        )}
      />
    </section>
  );
}
