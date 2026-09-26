"use client";

import { useState } from "react";
import { Check, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/form";
import type { ConfidenceLevel, Note, ProblemScore, Section, Sentence, SentenceScore } from "@/lib/contracts";
import { SECTIONS, SECTION_LABELS, groupNote } from "@/lib/note";
import { FLAG_THRESHOLD, levelFor } from "@/lib/scoring/confidence";
import { cn } from "@/lib/utils";
import type { Mutate } from "./Review";

const LEVEL_TONE: Record<ConfidenceLevel, BadgeTone> = { high: "green", medium: "amber", low: "red" };
const LEVEL_LABEL: Record<ConfidenceLevel, string> = { high: "High confidence", medium: "Medium confidence", low: "Low confidence" };
const DOT: Record<ConfidenceLevel, string> = { high: "bg-emerald-500", medium: "bg-amber-500", low: "bg-red-600" };

interface Props {
  visitId: string;
  note: Note;
  scores: ProblemScore[];
  scoreById: Map<string, SentenceScore>;
  selectedId: string | null;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  onSelect: (s: Sentence) => void;
  onPatch: (id: string, body: unknown) => Promise<boolean>;
  mutate: Mutate;
}

export function NotePanel(props: Props) {
  const { note, scores } = props;
  const problemScore = new Map(scores.map((p) => [p.problemId, p]));
  const groups = groupNote(note, { includeDeleted: true }).sort(
    (a, b) => (problemScore.get(a.problem.id)?.score ?? 1) - (problemScore.get(b.problem.id)?.score ?? 1),
  );

  return (
    <section className="min-h-0 overflow-y-auto border-r border-slate-200 bg-slate-50 p-5" aria-label="Draft note">
      <p className="mb-4 text-sm text-slate-700">
        <span className="font-medium">Chief complaint:</span> {note.chiefComplaint}
      </p>
      <div className="space-y-4">
        {groups.map(({ problem, sections }) => {
          const ps = problemScore.get(problem.id);
          const reasons = [...new Set(ps?.sentenceScores.flatMap((s) => s.reasons).filter((r) => r !== "Clinician-verified") ?? [])];
          return (
            <article key={problem.id} className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-slate-900">{problem.title}</h2>
                  {problem.status === "new" && <Badge tone="blue">new</Badge>}
                </div>
                {ps && (
                  <span className="group relative">
                    <Badge tone={LEVEL_TONE[ps.level]} className="cursor-help">
                      {LEVEL_LABEL[ps.level]} · {Math.round(ps.score * 100)}%
                    </Badge>
                    {reasons.length > 0 && (
                      <span className="pointer-events-none absolute right-0 top-7 z-20 hidden w-64 rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-700 shadow-lg group-hover:block">
                        {reasons.map((r) => <span key={r} className="block">• {r}</span>)}
                      </span>
                    )}
                  </span>
                )}
              </header>
              <div className="space-y-3 px-4 py-3">
                {sections.filter((s) => s.sentences.length).map(({ section, sentences }) => (
                  <div key={section}>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{SECTION_LABELS[section]}</p>
                    <ul className="mt-1 space-y-0.5">
                      {sentences.map((s) => <SentenceRow key={s.id} sentence={s} {...props} />)}
                    </ul>
                  </div>
                ))}
                <AddSentence visitId={props.visitId} problemId={problem.id} mutate={props.mutate} />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function SentenceRow({ sentence: s, scoreById, selectedId, editingId, setEditingId, onSelect, onPatch }: Props & { sentence: Sentence }) {
  const score = scoreById.get(s.id);
  const level = levelFor(score?.score ?? 1);
  const flagged = (score?.score ?? 1) < FLAG_THRESHOLD;
  const selected = selectedId === s.id;
  const deleted = s.review === "deleted";
  if (editingId === s.id) return <SentenceEditor sentence={s} onPatch={onPatch} onDone={() => setEditingId(null)} />;

  return (
    <li
      id={`sentence-${s.id}`}
      className={cn(
        "group relative flex cursor-pointer items-start gap-2 rounded-md px-2 py-1 text-sm transition-colors",
        selected ? "bg-teal-50 ring-1 ring-teal-300" : "hover:bg-slate-50",
        deleted && "opacity-60",
      )}
      onClick={() => !deleted && onSelect(s)}
    >
      <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", deleted ? "bg-slate-300" : DOT[level])} title={score?.reasons.join("; ") || "High confidence"} />
      <div className="min-w-0 flex-1 pr-20">
        <p className={cn("text-slate-800", deleted && "line-through")}>
          {s.text}
          {s.origin === "clinician" && <span className="ml-1.5 text-xs text-teal-700">(added by you)</span>}
          {s.review === "accepted" && s.origin === "ai" && <Check className="ml-1 inline h-3.5 w-3.5 text-emerald-600" aria-label="Accepted" />}
        </p>
        {s.review === "edited" && s.originalText && <p className="text-xs text-slate-400 line-through">{s.originalText}</p>}
        {flagged && !deleted && s.review === "unreviewed" && (
          <p className={cn("text-xs", level === "low" ? "text-red-700" : "text-amber-700")}>{score?.reasons.join(" · ")}</p>
        )}
      </div>
      <div className={cn("absolute right-1 top-0.5 hidden gap-0.5 group-hover:flex", selected && "flex")} onClick={(e) => e.stopPropagation()}>
        {deleted ? (
          <IconButton label="Restore" onClick={() => onPatch(s.id, { action: "restore" })}><RotateCcw className="h-3.5 w-3.5" /></IconButton>
        ) : (
          <>
            {s.origin === "ai" && s.review === "unreviewed" && (
              <IconButton label="Accept (a)" onClick={() => onPatch(s.id, { action: "accept" })}><Check className="h-3.5 w-3.5 text-emerald-700" /></IconButton>
            )}
            <IconButton label="Edit (e)" onClick={() => setEditingId(s.id)}><Pencil className="h-3.5 w-3.5" /></IconButton>
            <IconButton label="Delete" onClick={() => onPatch(s.id, { action: "delete" })}><Trash2 className="h-3.5 w-3.5 text-red-600" /></IconButton>
          </>
        )}
      </div>
    </li>
  );
}

function SentenceEditor({ sentence: s, onPatch, onDone }: { sentence: Sentence; onPatch: Props["onPatch"]; onDone: () => void }) {
  const [draft, setDraft] = useState(s.text);
  const save = () => onPatch(s.id, { action: "edit", text: draft }).then((ok) => ok && onDone());
  return (
    <li id={`sentence-${s.id}`} className="rounded-md bg-teal-50 p-2">
      <Textarea
        autoFocus
        rows={2}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void save(); }
          else if (e.key === "Escape") onDone();
        }}
      />
      <p className="mt-1 text-xs text-slate-500 line-through">{s.originalText ?? s.text}</p>
      <div className="mt-2 flex gap-2">
        <Button size="sm" onClick={save}>Save</Button>
        <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </li>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} className="rounded border border-slate-200 bg-white p-1 text-slate-600 shadow-sm hover:bg-slate-100">
      {children}
    </button>
  );
}

function AddSentence({ visitId, problemId, mutate }: { visitId: string; problemId: string; mutate: Mutate }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [section, setSection] = useState<Section>("P");
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex items-center gap-1 text-xs text-slate-500 hover:text-accent">
        <Plus className="h-3 w-3" /> Add sentence
      </button>
    );
  }
  const save = async () => {
    if (!text.trim()) return;
    const ok = await mutate(`/api/visits/${visitId}/sentences`, { problemId, section, text });
    if (ok) { setText(""); setOpen(false); }
  };
  return (
    <div className="flex items-start gap-2">
      <Select value={section} onChange={(e) => setSection(e.target.value as Section)} className="h-9 w-20">
        {SECTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
      </Select>
      <Textarea rows={1} autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Clinician sentence…"
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void save(); } if (e.key === "Escape") setOpen(false); }} />
      <Button size="sm" onClick={save}>Add</Button>
    </div>
  );
}
