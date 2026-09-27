"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, ArrowRight, BookOpen, CalendarClock, Check, CloudOff, FileText, FlaskConical, Languages, Loader2, Mail,
  MailCheck, Pill, Plus, ScanLine, Send, Share2, Trash2, type LucideIcon,
} from "lucide-react";
import { CountUp } from "@/components/fx";
import { stagger } from "@/components/motion";
import { VisitSteps } from "@/components/VisitSteps";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { TaskCategorySchema, type Medication, type Task } from "@/lib/contracts";
import { cn, formatDate } from "@/lib/utils";
import type { VisitView } from "@/lib/visits";
import { SummaryEditor } from "./SummaryEditor";

export function FollowThroughView({ initial }: { initial: VisitView }) {
  const [visit, setVisit] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(!initial.followthrough);
  const [lang, setLang] = useState<"en" | "es">(initial.patient.preferredLanguage === "es" ? "es" : "en");
  const [sendOpen, setSendOpen] = useState(false);
  const ft = visit.followthrough;

  const call = useCallback(async (url: string, body: unknown, method = "POST") => {
    setError(null);
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Something went wrong");
      return false;
    }
    setVisit(data);
    return true;
  }, []);

  useEffect(() => {
    if (initial.followthrough) return;
    let cancelled = false;
    fetch(`/api/visits/${initial.id}/followthrough`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "generate" }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) setVisit(data);
        else setError(data.error ?? "Could not generate follow-through");
      })
      .finally(() => !cancelled && setGenerating(false));
    return () => { cancelled = true; };
  }, [initial.id, initial.followthrough]);

  const m = visit.metrics;
  const offline = m?.offlineSteps ?? [];
  const sent = visit.status === "sent";

  return (
    <div className="flex-1">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={`/app/patients/${visit.patient.id}`} className="group inline-flex items-center gap-1.5 text-sm text-ink-3 transition-colors hover:text-accent-ink">
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" /> {visit.patient.firstName} {visit.patient.lastName}
          </Link>
          <VisitSteps at="followthrough" />
        </div>

        <div className="mt-4 flex flex-wrap items-stretch justify-between gap-4">
          <div className="rise flex items-center gap-4">
            <span className={cn("pop flex h-14 w-14 items-center justify-center rounded-2xl text-white", sent ? "bg-accent-strong" : "bg-ok")}>
              {sent ? <MailCheck className="h-7 w-7" /> : <Check className="h-7 w-7" strokeWidth={3} />}
            </span>
            <div>
              <h1 className="flex flex-wrap items-center gap-3 font-display text-3xl font-semibold leading-tight tracking-[-0.01em] text-ink sm:text-4xl">
                Follow-through
                <Badge tone={sent ? "teal" : "green"}>{sent ? `Sent ${formatDate(visit.sentAt)}` : "Signed"}</Badge>
                {offline.length > 0 && <Badge tone="slate" title={`Cached results used for: ${offline.join(", ")}`}><CloudOff className="h-3 w-3" /> offline mode</Badge>}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-4">
                <Link href={`/app/visits/${visit.id}/note`} className="group inline-flex items-center gap-1 text-sm font-medium text-accent-ink hover:underline">
                  View signed note <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link href={`/app/visits/${visit.id}/report`} className="group inline-flex items-center gap-1 text-sm font-medium text-accent-ink hover:underline">
                  Clinical report <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
            </div>
          </div>
          {m?.totalSentences !== undefined && (
            <Card className="rise min-w-[22rem]" style={stagger(1)}>
              <CardHeader className="py-2.5"><CardTitle>Review stats</CardTitle><span className="text-[11px] text-ink-3">this visit</span></CardHeader>
              <CardContent className="grid grid-cols-4 gap-3 py-3 text-center">
                <Stat label="processing"><CountUp value={m.secondsProcessing ?? 0} decimals={Number.isInteger(m.secondsProcessing ?? 0) ? 0 : 1} suffix="s" /></Stat>
                <Stat label="flagged"><CountUp value={m.flaggedSentences ?? 0} />/{m.totalSentences}</Stat>
                <Stat label="edits"><CountUp value={(m.editedSentences ?? 0) + (m.deletedSentences ?? 0) + (m.clinicianAddedSentences ?? 0)} /></Stat>
                <Stat label="gaps caught"><CountUp value={m.gapsFound ?? 0} /></Stat>
              </CardContent>
            </Card>
          )}
        </div>

        {error && <p role="alert" className="fade-in mt-4 rounded-xl border border-danger/25 bg-danger-soft px-3 py-2 text-sm text-danger-ink">{error}</p>}

        {generating || !ft ? (
          <div className="mt-10 flex flex-col items-center gap-4 text-ink-2">
            {generating ? (
              <>
                <div className="relative flex h-16 w-16 items-center justify-center">
                  <span className="absolute inset-0 animate-spin rounded-full border-2 border-accent/20 border-t-accent" />
                  <FileText className="h-6 w-6 text-accent" />
                </div>
                <p>Generating tasks and the patient summary from the signed note…</p>
                <div className="mt-2 grid w-full max-w-3xl grid-cols-5 gap-4" aria-hidden>
                  <div className="col-span-2 space-y-3">{[0, 1, 2].map((i) => <div key={i} className="shimmer h-20 rounded-2xl" />)}</div>
                  <div className="col-span-3 space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className="shimmer h-14 rounded-2xl" />)}</div>
                </div>
              </>
            ) : (
              <p>Follow-through isn&apos;t available.</p>
            )}
            {!generating && (
              <Button onClick={() => { setGenerating(true); void call(`/api/visits/${visit.id}/followthrough`, { action: "generate" }).finally(() => setGenerating(false)); }}>
                Retry
              </Button>
            )}
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
            <div className="space-y-6 lg:col-span-2">
              <div className="rise" style={stagger(2)}>
                <MedicationListCard previous={ft.previousMedications} current={ft.currentMedications} />
              </div>
              <div className="rise" style={stagger(3)}>
                <TaskList key={JSON.stringify(ft.tasks)} tasks={ft.tasks} onSave={(tasks) => call(`/api/visits/${visit.id}/summary`, { tasks }, "PATCH")} />
              </div>
            </div>
            <div className="rise lg:col-span-3" style={stagger(3)}>
              <Card className="overflow-hidden">
                <CardHeader className="bg-surface-2">
                  <div className="relative grid grid-cols-2 rounded-full border border-line bg-surface-3 p-1" role="tablist">
                    <span
                      className={cn("absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-surface shadow-card transition-transform duration-300 ease-out", lang === "es" && "translate-x-full")}
                      aria-hidden
                    />
                    {(["en", "es"] as const).map((l) => (
                      <button key={l} role="tab" aria-selected={lang === l} onClick={() => setLang(l)}
                        className={cn("relative z-10 flex items-center justify-center gap-1.5 rounded-full px-4 py-1 text-sm font-medium transition-colors", lang === l ? "text-ink" : "text-ink-3 hover:text-ink-2")}>
                        {l === "en" ? "English" : "Español"}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    {ft.summaries[lang] && (
                      <a href={`/api/visits/${visit.id}/pdf?lang=${lang}`} target="_blank" rel="noreferrer">
                        <Button variant="secondary" size="sm"><FileText className="h-4 w-4" /> Preview PDF</Button>
                      </a>
                    )}
                    <Button size="sm" onClick={() => setSendOpen(true)} disabled={!ft.summaries[lang] || (lang === "es" && !ft.translationReviewed)}>
                      <Send className="h-4 w-4" /> Approve &amp; send
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  {lang === "es" && !ft.summaries.es ? (
                    <div className="py-10 text-center">
                      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-info-soft text-info-ink"><Languages className="h-6 w-6" /></span>
                      <p className="mt-3 text-sm text-ink-2">No Spanish summary yet.</p>
                      <GenerateSpanish onClick={() => call(`/api/visits/${visit.id}/followthrough`, { action: "translate" })} />
                    </div>
                  ) : (
                    <div key={lang} className="fade-in">
                      {lang === "es" && (
                        <div className={cn("mb-5 rounded-xl border p-3.5 text-sm transition-colors", ft.translationReviewed ? "border-ok/30 bg-ok-soft text-ok-ink" : "border-warn/40 bg-warn-soft text-warn-ink")}>
                          <p className="flex items-center gap-2 font-semibold">
                            <Languages className="h-4 w-4" /> Machine-translated. Review before sending.
                          </p>
                          <label className="mt-2 flex cursor-pointer items-center gap-2">
                            <input type="checkbox" className="h-4 w-4 accent-teal-600" checked={ft.translationReviewed}
                              onChange={(e) => call(`/api/visits/${visit.id}/summary`, { translationReviewed: e.target.checked }, "PATCH")} />
                            I reviewed the Spanish summary
                          </label>
                        </div>
                      )}
                      <SummaryEditor
                        key={`${lang}:${JSON.stringify(ft.summaries[lang])}`}
                        summary={ft.summaries[lang]!}
                        onSave={(summary) => call(`/api/visits/${visit.id}/summary`, { summary }, "PATCH")}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        <SendDialog
          open={sendOpen}
          onClose={() => setSendOpen(false)}
          defaultEmail={visit.patient.email ?? ""}
          language={lang}
          onSend={async (email) => {
            const ok = await call(`/api/visits/${visit.id}/send`, { email, language: lang });
            if (ok) setSendOpen(false);
            return ok;
          }}
        />
      </div>
    </div>
  );
}

const CHANGE_STYLE = {
  new: "border-accent/30 bg-accent-soft/60",
  changed: "border-warn/35 bg-warn-soft/60",
  continue: "border-line bg-surface-2",
} as const;

/** Shows how the chart's medication list changed; the new list was written from the signed note. */
function MedicationListCard({ previous, current }: { previous?: Medication[]; current?: Medication[] }) {
  if (!current) return null;
  const key = (m: Medication) => m.name.toLowerCase();
  const before = new Map((previous ?? []).map((m) => [key(m), m]));
  const after = new Set(current.map(key));
  const stopped = (previous ?? []).filter((m) => !after.has(key(m)));
  const fmt = (m: Medication) => `${m.name} ${m.dose} ${m.frequency}`.trim();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Pill className="h-4 w-4" /> Medication list</CardTitle>
        <Badge tone="teal"><Check className="h-3 w-3" /> updated in chart</Badge>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm">
          {current.map((m, i) => {
            const old = before.get(key(m));
            const status = !old ? "new" : fmt(old) !== fmt(m) ? "changed" : "continue";
            return (
              <li key={key(m)} className={cn("rise flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5", CHANGE_STYLE[status])} style={stagger(i)}>
                <span className="min-w-0 text-ink">
                  <span className="font-medium">{fmt(m)}</span>
                  {status === "changed" && <span className="ml-1.5 text-xs text-ink-4 line-through">{fmt(old!)}</span>}
                </span>
                <Badge tone={status === "new" ? "teal" : status === "changed" ? "amber" : "slate"}>{status}</Badge>
              </li>
            );
          })}
          {stopped.map((m, i) => (
            <li key={key(m)} className="rise flex items-center justify-between gap-2 rounded-xl border border-danger/25 bg-danger-soft/50 px-3 py-2.5" style={stagger(current.length + i)}>
              <span className="text-ink-3 line-through">{fmt(m)}</span>
              <Badge tone="red">stopped</Badge>
            </li>
          ))}
          {current.length === 0 && stopped.length === 0 && <li className="text-ink-3">No medications.</li>}
        </ul>
      </CardContent>
    </Card>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-mono text-xl font-semibold tabular-nums text-ink">{children}</p>
      <p className="text-[11px] text-ink-3">{label}</p>
    </div>
  );
}

function GenerateSpanish({ onClick }: { onClick: () => Promise<boolean> }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button className="mt-4" disabled={busy} onClick={async () => { setBusy(true); await onClick(); setBusy(false); }}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Languages className="h-4 w-4" />}
      {busy ? "Translating…" : "Generate Spanish summary"}
    </Button>
  );
}

const CATEGORY_LABEL: Record<Task["category"], string> = {
  lab: "Lab", imaging: "Imaging", referral: "Referral", medication: "Medication", followup: "Follow-up", education: "Education",
};

const CATEGORY_ICON: Record<Task["category"], LucideIcon> = {
  lab: FlaskConical, imaging: ScanLine, referral: Share2, medication: Pill, followup: CalendarClock, education: BookOpen,
};

function TaskList({ tasks: initialTasks, onSave }: { tasks: Task[]; onSave: (tasks: Task[]) => Promise<boolean> }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(tasks) !== JSON.stringify(initialTasks);
  const update = (i: number, patch: Partial<Task>) => setTasks((ts) => ts.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tasks for the office</CardTitle>
        <Badge tone="slate">{tasks.length}</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-ink-3">Each task is carried to the next visit as an open item.</p>
        {tasks.map((t, i) => {
          const Icon = CATEGORY_ICON[t.category];
          return (
            <div key={t.id} className="rise group rounded-xl border border-line bg-surface-2 p-3 transition-shadow hover:shadow-lift" style={stagger(i)}>
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-ink"><Icon className="h-4 w-4" /></span>
                <Select value={t.category} onChange={(e) => update(i, { category: e.target.value as Task["category"] })} className="h-8 w-32 text-xs">
                  {TaskCategorySchema.options.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
                </Select>
                <Input type="number" min={0} value={t.dueInDays ?? ""} placeholder="due (days)"
                  onChange={(e) => update(i, { dueInDays: e.target.value === "" ? null : Number(e.target.value) })} className="h-8 w-28 text-xs" />
                <button aria-label="Remove task" title="Remove task" onClick={() => setTasks((ts) => ts.filter((_, j) => j !== i))} className="ml-auto rounded-md p-1.5 text-ink-4 transition-colors hover:bg-danger-soft hover:text-danger">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <Textarea rows={2} value={t.description} onChange={(e) => update(i, { description: e.target.value })} className="mt-2" aria-label="Task description" />
              {t.sourceSentenceIds.length > 0 && <p className="mt-1.5 font-mono text-xs text-ink-3">From note: {t.sourceSentenceIds.join(", ")}</p>}
            </div>
          );
        })}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => setTasks((ts) => [...ts, { id: `t${Date.now()}`, category: "followup", description: "", dueInDays: null, sourceSentenceIds: [] }])}>
            <Plus className="h-4 w-4" /> Add task
          </Button>
          {dirty && (
            <Button size="sm" className="fade-in" disabled={busy || tasks.some((t) => !t.description.trim())}
              onClick={async () => { setBusy(true); await onSave(tasks); setBusy(false); }}>
              Save tasks
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SendDialog({ open, onClose, defaultEmail, language, onSend }: {
  open: boolean; onClose: () => void; defaultEmail: string; language: "en" | "es"; onSend: (email: string) => Promise<boolean>;
}) {
  const [email, setEmail] = useState(defaultEmail);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Approve & email summary"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !email.includes("@")} onClick={async () => { setBusy(true); await onSend(email); setBusy(false); }}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} {busy ? "Sending…" : "Send PDF"}
          </Button>
        </>
      }
    >
      <div className="mb-4 flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent-ink"><FileText className="h-5 w-5" /></span>
        <div className="text-sm">
          <p className="font-medium text-ink">{language === "es" ? "resumen-de-visita.pdf" : "visit-summary.pdf"}</p>
          <p className="text-xs text-ink-3">{language === "es" ? "Spanish" : "English"} patient summary · attached</p>
        </div>
      </div>
      <p className="mb-3 text-sm text-ink-2">
        You approve the {language === "es" ? "Spanish" : "English"} summary. A PDF is attached and emailed to:
      </p>
      <Label htmlFor="send-email">Email address</Label>
      <Input id="send-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <p className="mt-2 text-xs text-ink-3">Synthetic patient. You can send to any inbox for the demo.</p>
    </Dialog>
  );
}
