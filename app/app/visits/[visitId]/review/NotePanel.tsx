"use client";

import { useState } from "react";
import { Check, Pencil, Plus, RotateCcw, Stethoscope, Trash2, TriangleAlert } from "lucide-react";
import { ConfidenceRing } from "@/components/ConfidenceRing";
import { stagger } from "@/components/motion";
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
const DOT: Record<ConfidenceLevel, string> = { high: "bg-ok text-ok", medium: "bg-warn text-warn", low: "bg-danger text-danger" };
const SECTION_CHIP: Record<Section, string> = {
  S: "bg-info-soft text-info-ink",
  O: "bg-accent-soft text-accent-ink",
  A: "bg-warn-soft text-warn-ink",
  P: "bg-ok-soft text-ok-ink",
};

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
    <section className="min-h-0 overflow-y-auto border-r border-line p-5" aria-label="Draft note">
      <p className="rise glass mb-4 flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm text-ink-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent-ink"><Stethoscope className="h-4 w-4" /></span>
        <span><span className="font-semibold text-ink">Chief complaint:</span> {note.chiefComplaint}</span>
      </p>
      <div className="space-y-4">
        {groups.map(({ problem, sections }, gi) => {
          const ps = problemScore.get(problem.id);
          const reasons = [...new Set(ps?.sentenceScores.flatMap((s) => s.reasons).filter((r) => r !== "Clinician-verified") ?? [])];
          return (
            <article
              key={problem.id}
              className={cn(
                "rise glass rounded-2xl transition-colors hover:z-10",
                ps?.level === "low" ? "border-danger/35" : ps?.level === "medium" ? "border-warn/40" : undefined,
              )}
              style={stagger(gi + 1)}
            >
              <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
                <div className="flex items-center gap-2">
                  <h2 className="font-sub text-base font-semibold text-ink">{problem.title}</h2>
                  {problem.status === "new" && <Badge tone="blue">new</Badge>}
                </div>
                {ps && (
                  <span className="group relative flex items-center gap-2">
                    <Badge tone={LEVEL_TONE[ps.level]} className="cursor-help">
                      {LEVEL_LABEL[ps.level]} · {Math.round(ps.score * 100)}%
                    </Badge>
                    <ConfidenceRing value={ps.score} level={ps.level} size={34} />
                    {reasons.length > 0 && (
                      <span className="glass-strong pointer-events-none absolute right-0 top-10 z-30 hidden w-72 rounded-xl p-3 text-xs text-ink-2 group-hover:block">
                        <span className="mb-1.5 block font-sub text-xs font-semibold text-ink-3">Why this score</span>
                        {reasons.map((r) => (
                          <span key={r} className="flex items-start gap-1.5 py-0.5">
                            <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0 text-warn" /> {r}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                )}
              </header>
              <div className="space-y-3.5 px-3 py-3">
                {sections.filter((s) => s.sentences.length).map(({ section, sentences }) => (
                  <div key={section}>
                    <p className="flex items-center gap-2 px-1 font-sub text-xs font-semibold text-ink-3">
                      <span className={cn("flex h-5 w-5 items-center justify-center rounded-md text-[11px] font-bold", SECTION_CHIP[section])}>{section}</span>
                      {SECTION_LABELS[section]}
                    </p>
                    <ul className="mt-1.5 space-y-0.5">
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
  const pending = flagged && !deleted && s.review === "unreviewed";
  if (editingId === s.id) return <SentenceEditor sentence={s} onPatch={onPatch} onDone={() => setEditingId(null)} />;

  return (
    <li
      id={`sentence-${s.id}`}
      className={cn(
        "group relative flex cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-1.5 text-[15px] transition-all duration-200",
        selected
          ? "bg-accent-soft ring-1 ring-accent/60"
          : pending
            ? cn("hover:translate-x-0.5", level === "low" ? "bg-danger-soft/70 hover:bg-danger-soft" : "bg-warn-soft/70 hover:bg-warn-soft")
            : "hover:translate-x-0.5 hover:bg-surface-2",
        deleted && "opacity-60",
      )}
      onClick={() => !deleted && onSelect(s)}
    >
      <span
        className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", deleted ? "bg-ink-4" : DOT[level], pending && "halo")}
        title={score?.reasons.join("; ") || "High confidence"}
      />
      <div className="min-w-0 flex-1 pr-24">
        <p className={cn("leading-relaxed text-ink", deleted && "line-through")}>
          {s.text}
          {s.origin === "clinician" && <span className="ml-1.5 inline-block whitespace-nowrap rounded bg-accent-soft px-1.5 py-px text-xs font-medium text-accent-ink">added by you</span>}
          {s.review === "accepted" && s.origin === "ai" && <Check className="pop ml-1 inline h-3.5 w-3.5 text-ok" aria-label="Accepted" />}
        </p>
        {s.review === "edited" && s.originalText && <p className="text-xs text-ink-4 line-through">{s.originalText}</p>}
        {pending && (
          <p className={cn("mt-0.5 flex items-center gap-1 text-xs font-medium", level === "low" ? "text-danger-ink" : "text-warn-ink")}>
            <TriangleAlert className="h-3 w-3" /> {score?.reasons.join(" · ")}
          </p>
        )}
      </div>
      <div className={cn("glass-pill fade-in absolute right-1.5 top-1 hidden gap-0.5 rounded-lg p-0.5 group-hover:flex", selected && "flex")} onClick={(e) => e.stopPropagation()}>
        {deleted ? (
          <IconButton label="Restore" onClick={() => onPatch(s.id, { action: "restore" })}><RotateCcw className="h-3.5 w-3.5" /></IconButton>
        ) : (
          <>
            {s.origin === "ai" && s.review === "unreviewed" && (
              <IconButton label="Accept (a)" onClick={() => onPatch(s.id, { action: "accept" })}><Check className="h-3.5 w-3.5 text-ok" /></IconButton>
            )}
            <IconButton label="Edit (e)" onClick={() => setEditingId(s.id)}><Pencil className="h-3.5 w-3.5" /></IconButton>
            <IconButton label="Delete" onClick={() => onPatch(s.id, { action: "delete" })}><Trash2 className="h-3.5 w-3.5 text-danger" /></IconButton>
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
    <li id={`sentence-${s.id}`} className="fade-in rounded-xl border border-accent/40 bg-accent-soft p-2.5">
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
      <p className="mt-1.5 text-xs text-ink-3 line-through">{s.originalText ?? s.text}</p>
      <div className="mt-2 flex items-center gap-2">
        <Button size="sm" onClick={save}>Save</Button>
        <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
        <span className="ml-auto text-xs text-ink-3">Enter to save · Esc to cancel</span>
      </div>
    </li>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} className="rounded-md p-1.5 text-ink-2 transition-colors hover:bg-surface-3 hover:text-ink">
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
      <button onClick={() => setOpen(true)} className="ml-1 flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-ink-3 transition-colors hover:bg-accent-soft hover:text-accent-ink">
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
    <div className="fade-in flex items-start gap-2">
      <Select value={section} onChange={(e) => setSection(e.target.value as Section)} className="h-9 w-20">
        {SECTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
      </Select>
      <Textarea rows={1} autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Clinician sentence…"
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void save(); } if (e.key === "Escape") setOpen(false); }} />
      <Button size="sm" onClick={save}>Add</Button>
    </div>
  );
}
