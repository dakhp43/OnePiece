"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CloudOff, PenLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Sentence } from "@/lib/contracts";
import { reviewProgress } from "@/lib/metrics";
import { FLAG_THRESHOLD, sentenceScoreMap } from "@/lib/scoring/confidence";
import { VISIT_TYPE_LABELS } from "@/lib/utils";
import type { VisitView } from "@/lib/visits";
import { GapsPanel } from "./GapsPanel";
import { NotePanel } from "./NotePanel";
import { SignDialog } from "./SignDialog";
import { TranscriptPanel } from "./TranscriptPanel";

export type Mutate = (url: string, body: unknown, method?: string) => Promise<boolean>;

export function Review({ initial }: { initial: VisitView }) {
  const router = useRouter();
  const [visit, setVisit] = useState(initial);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signOpen, setSignOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const note = visit.note!;
  const utterances = useMemo(() => visit.utterances ?? [], [visit.utterances]);
  const scores = useMemo(() => visit.scores ?? [], [visit.scores]);
  const gaps = useMemo(() => visit.gaps ?? [], [visit.gaps]);
  const scoreById = useMemo(() => sentenceScoreMap(scores), [scores]);
  const progress = useMemo(() => reviewProgress(note, visit.audit, utterances, gaps), [note, visit.audit, utterances, gaps]);
  const offline = visit.metrics?.offlineSteps ?? [];

  const mutate: Mutate = useCallback(async (url, body, method = "POST") => {
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

  const playFrom = useCallback((utteranceId: string | undefined) => {
    const u = utterances.find((x) => x.id === utteranceId);
    const audio = audioRef.current;
    if (!u || !audio) return;
    audio.currentTime = u.start;
    void audio.play().catch(() => {});
  }, [utterances]);

  const selectSentence = useCallback((s: Sentence, play = true) => {
    setSelectedId(s.id);
    setHighlight(s.sourceUtteranceIds);
    if (play) playFrom(s.sourceUtteranceIds[0]);
  }, [playFrom]);

  const showEvidence = useCallback((ids: string[]) => {
    setSelectedId(null);
    setHighlight(ids);
    playFrom(ids[0]);
  }, [playFrom]);

  const sentencePatch = useCallback(
    (id: string, body: unknown) => mutate(`/api/visits/${visit.id}/sentences/${id}`, body, "PATCH"),
    [mutate, visit.id],
  );

  // Keyboard: n = next flagged sentence, a = accept, e = edit
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "n") {
        const order = orderedSentences(note, scores);
        const pending = order.filter((s) => s.review === "unreviewed" && (scoreById.get(s.id)?.score ?? 1) < FLAG_THRESHOLD);
        if (pending.length === 0) return;
        const idx = pending.findIndex((s) => s.id === selectedId);
        const next = pending[(idx + 1) % pending.length];
        selectSentence(next);
        document.getElementById(`sentence-${next.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
      } else if (e.key === "a" && selectedId) {
        void sentencePatch(selectedId, { action: "accept" });
      } else if (e.key === "e" && selectedId) {
        e.preventDefault();
        setEditingId(selectedId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [note, scores, scoreById, selectedId, selectSentence, sentencePatch]);

  return (
    <div className="flex h-[calc(100vh-3.5rem-2.25rem)] flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <div>
          <Link href={`/app/patients/${visit.patient.id}`} className="text-sm text-slate-500 hover:text-accent">
            ← {visit.patient.firstName} {visit.patient.lastName}
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-slate-900">Review note</h1>
            <span className="text-sm text-slate-600">
              {VISIT_TYPE_LABELS[visit.visitType]} · {progress.totalSentences} sentences ·{" "}
              <span className={progress.needReview ? "font-medium text-amber-700" : "text-emerald-700"}>
                {progress.needReview} need review
              </span>
            </span>
            {offline.length > 0 && (
              <Badge tone="slate" title={`Cached results used for: ${offline.join(", ")}`}>
                <CloudOff className="h-3 w-3" /> offline mode
              </Badge>
            )}
          </div>
        </div>
        <p className="hidden text-xs text-slate-500 xl:block">
          Keys: <kbd className="rounded border px-1">n</kbd> next flagged · <kbd className="rounded border px-1">a</kbd> accept ·{" "}
          <kbd className="rounded border px-1">e</kbd> edit
        </p>
      </div>

      {error && (
        <div className="border-b border-red-200 bg-red-50 px-6 py-2 text-sm text-red-700">
          {error} <button className="ml-2 underline" onClick={() => setError(null)}>dismiss</button>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-[2fr_1fr_1fr]">
        <NotePanel
          visitId={visit.id}
          note={note}
          scores={scores}
          scoreById={scoreById}
          selectedId={selectedId}
          editingId={editingId}
          setEditingId={setEditingId}
          onSelect={selectSentence}
          onPatch={sentencePatch}
          mutate={mutate}
        />
        <TranscriptPanel
          visitId={visit.id}
          hasAudio={visit.hasAudio}
          utterances={utterances}
          highlight={highlight}
          audioRef={audioRef}
          onUtteranceClick={(id) => showEvidence([id])}
        />
        <GapsPanel visitId={visit.id} gaps={gaps} problems={note.problems} mutate={mutate} onEvidence={showEvidence} />
      </div>

      <div className="flex items-center justify-between border-t border-slate-200 bg-white px-6 py-3 shadow-[0_-2px_6px_rgba(15,23,42,0.04)]">
        <p className="text-sm text-slate-600">
          Reviewed <span className="font-semibold text-slate-900">{progress.reviewedFlagged} of {progress.flagged}</span> flagged ·{" "}
          <span className={progress.gapsOpen ? "font-semibold text-amber-700" : "font-semibold text-emerald-700"}>
            {progress.gapsOpen} gap{progress.gapsOpen === 1 ? "" : "s"} open
          </span>
        </p>
        <Button size="lg" onClick={() => setSignOpen(true)}>
          <PenLine className="h-4 w-4" /> Sign note
        </Button>
      </div>

      <SignDialog
        open={signOpen}
        onClose={() => setSignOpen(false)}
        visitId={visit.id}
        gaps={gaps}
        onSigned={() => router.push(`/app/visits/${visit.id}/followthrough`)}
      />
    </div>
  );
}

/** Sentences in on-screen order: problems sorted by score ascending, then S/O/A/P. */
export function orderedSentences(note: NonNullable<VisitView["note"]>, scores: NonNullable<VisitView["scores"]>) {
  const problemScore = new Map(scores.map((p) => [p.problemId, p.score]));
  const sectionOrder = { S: 0, O: 1, A: 2, P: 3 };
  return [...note.sentences]
    .filter((s) => s.review !== "deleted")
    .sort((a, b) =>
      (problemScore.get(a.problemId) ?? 1) - (problemScore.get(b.problemId) ?? 1) ||
      a.problemId.localeCompare(b.problemId) ||
      sectionOrder[a.section] - sectionOrder[b.section]);
}
