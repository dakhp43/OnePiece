"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CloudOff, FileText, Loader2, Mail, Plus, Send, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { TaskCategorySchema, type Task } from "@/lib/contracts";
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

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-6">
      <div className="flex items-start justify-between">
        <div>
          <Link href={`/app/patients/${visit.patient.id}`} className="text-sm text-slate-500 hover:text-accent">
            ← {visit.patient.firstName} {visit.patient.lastName}
          </Link>
          <h1 className="mt-1 flex items-center gap-3 text-2xl font-semibold text-slate-900">
            Follow-through
            <Badge tone={visit.status === "sent" ? "teal" : "green"}>{visit.status === "sent" ? `Sent ${formatDate(visit.sentAt)}` : "Signed"}</Badge>
            {offline.length > 0 && <Badge tone="slate" title={`Cached results used for: ${offline.join(", ")}`}><CloudOff className="h-3 w-3" /> offline mode</Badge>}
          </h1>
          <Link href={`/app/visits/${visit.id}/note`} className="text-sm text-accent hover:underline">View signed note</Link>
        </div>
        {m?.totalSentences !== undefined && (
          <Card className="min-w-[22rem]">
            <CardHeader className="py-2"><CardTitle>Review stats</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-4 gap-3 py-3 text-center">
              <Stat value={`${m.secondsProcessing ?? 0}s`} label="processing" />
              <Stat value={`${m.flaggedSentences}/${m.totalSentences}`} label="flagged" />
              <Stat value={String((m.editedSentences ?? 0) + (m.deletedSentences ?? 0) + (m.clinicianAddedSentences ?? 0))} label="edits" />
              <Stat value={String(m.gapsFound ?? 0)} label="gaps caught" />
            </CardContent>
          </Card>
        )}
      </div>

      {error && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {generating || !ft ? (
        <div className="mt-10 flex flex-col items-center gap-3 text-slate-600">
          {generating ? <Loader2 className="h-6 w-6 animate-spin text-accent" /> : null}
          <p>{generating ? "Generating tasks and the patient summary from the signed note…" : "Follow-through isn't available."}</p>
          {!generating && (
            <Button onClick={() => { setGenerating(true); void call(`/api/visits/${visit.id}/followthrough`, { action: "generate" }).finally(() => setGenerating(false)); }}>
              Retry
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <TaskList key={JSON.stringify(ft.tasks)} tasks={ft.tasks} onSave={(tasks) => call(`/api/visits/${visit.id}/summary`, { tasks }, "PATCH")} />
          </div>
          <div className="lg:col-span-3">
            <Card>
              <CardHeader>
                <div className="flex gap-1 rounded-md bg-slate-100 p-1" role="tablist">
                  {(["en", "es"] as const).map((l) => (
                    <button key={l} role="tab" aria-selected={lang === l} onClick={() => setLang(l)}
                      className={cn("rounded px-3 py-1 text-sm font-medium", lang === l ? "bg-white text-slate-900 shadow-sm" : "text-slate-600")}>
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
              <CardContent>
                {lang === "es" && !ft.summaries.es ? (
                  <div className="py-8 text-center">
                    <p className="text-sm text-slate-600">No Spanish summary yet.</p>
                    <GenerateSpanish onClick={() => call(`/api/visits/${visit.id}/followthrough`, { action: "translate" })} />
                  </div>
                ) : (
                  <>
                    {lang === "es" && (
                      <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                        <p className="font-medium">Machine-translated. Review before sending.</p>
                        <label className="mt-2 flex items-center gap-2">
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
                  </>
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
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-xl font-semibold tabular-nums text-slate-900">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

function GenerateSpanish({ onClick }: { onClick: () => Promise<boolean> }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button className="mt-3" disabled={busy} onClick={async () => { setBusy(true); await onClick(); setBusy(false); }}>
      {busy ? "Translating…" : "Generate Spanish summary"}
    </Button>
  );
}

const CATEGORY_LABEL: Record<Task["category"], string> = {
  lab: "Lab", imaging: "Imaging", referral: "Referral", medication: "Medication", followup: "Follow-up", education: "Education",
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
        <p className="text-xs text-slate-500">Each task is carried to the next visit as an open item.</p>
        {tasks.map((t, i) => (
          <div key={t.id} className="rounded-md border border-slate-200 p-2.5">
            <div className="flex items-center gap-2">
              <Select value={t.category} onChange={(e) => update(i, { category: e.target.value as Task["category"] })} className="h-8 w-32 text-xs">
                {TaskCategorySchema.options.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
              </Select>
              <Input type="number" min={0} value={t.dueInDays ?? ""} placeholder="due (days)"
                onChange={(e) => update(i, { dueInDays: e.target.value === "" ? null : Number(e.target.value) })} className="h-8 w-28 text-xs" />
              <button aria-label="Remove task" title="Remove task" onClick={() => setTasks((ts) => ts.filter((_, j) => j !== i))} className="ml-auto rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <Textarea rows={2} value={t.description} onChange={(e) => update(i, { description: e.target.value })} className="mt-2" aria-label="Task description" />
            {t.sourceSentenceIds.length > 0 && <p className="mt-1 text-[11px] text-slate-400">From note: {t.sourceSentenceIds.join(", ")}</p>}
          </div>
        ))}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => setTasks((ts) => [...ts, { id: `t${Date.now()}`, category: "followup", description: "", dueInDays: null, sourceSentenceIds: [] }])}>
            <Plus className="h-4 w-4" /> Add task
          </Button>
          {dirty && (
            <Button size="sm" disabled={busy || tasks.some((t) => !t.description.trim())}
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
            <Mail className="h-4 w-4" /> {busy ? "Sending…" : "Send PDF"}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-slate-700">
        You approve the {language === "es" ? "Spanish" : "English"} summary. A PDF is attached and emailed to:
      </p>
      <Label htmlFor="send-email">Email address</Label>
      <Input id="send-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <p className="mt-2 text-xs text-slate-500">Synthetic patient. You can send to any inbox for the demo.</p>
    </Dialog>
  );
}
