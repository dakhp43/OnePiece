"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CircleAlert, CircleCheck, CloudOff, Keyboard, PenLine, TriangleAlert } from "lucide-react";
import { LiquidGlass } from "@/components/LiquidGlass";
import { VisitSteps } from "@/components/VisitSteps";
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
import { SourceLinks } from "./SourceLinks";
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
  const gridRef = useRef<HTMLDivElement>(null);

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

  const reviewedShare = progress.flagged ? progress.reviewedFlagged / progress.flagged : 1;
  const ready = progress.needReview === 0 && progress.gapsOpen === 0;
  return (
    <div className="flex h-[calc(100dvh-var(--header-h)-var(--footer-h))] flex-col">
      <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-none border-x-0 border-t-0 px-6 py-3 shadow-none">
        <div className="min-w-0">
          <Link href={`/app/patients/${visit.patient.id}`} className="group inline-flex items-center gap-1 text-xs text-ink-3 transition-colors hover:text-accent-ink">
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" /> {visit.patient.firstName} {visit.patient.lastName}
          </Link>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="font-display text-2xl font-semibold leading-tight tracking-[-0.01em] text-ink">Review note</h1>
            <span className="text-sm text-ink-3">
              {VISIT_TYPE_LABELS[visit.visitType]} · {progress.totalSentences} sentences ·{" "}
              <span className={progress.needReview ? "font-semibold text-warn-ink" : "font-semibold text-ok-ink"}>
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
        <div className="flex items-center gap-5">
          <p className="hidden items-center gap-1.5 text-xs text-ink-3 2xl:flex">
            <Keyboard className="h-3.5 w-3.5" />
            <Kbd>n</Kbd> next flagged <Kbd>a</Kbd> accept <Kbd>e</Kbd> edit
          </p>
          <VisitSteps at="review" />
        </div>
      </div>

      {error && (
        <div role="alert" className="fade-in flex items-center gap-2 border-b border-danger/25 bg-danger-soft px-6 py-2 text-sm text-danger-ink">
          <CircleAlert className="h-4 w-4" /> {error} <button className="ml-2 underline underline-offset-2" onClick={() => setError(null)}>dismiss</button>
        </div>
      )}

      <div ref={gridRef} className="relative grid min-h-0 flex-1 grid-cols-[2fr_1fr_1fr]">
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
        <SourceLinks containerRef={gridRef} selectedId={selectedId} highlight={highlight} />
      </div>

      <LiquidGlass radius={0} blur={14} strength={20} band={16} className="flex items-center justify-between gap-6 px-6 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-6">
          <div className="w-full max-w-xs">
            <p className="flex items-baseline justify-between text-sm text-ink-2">
              <span>Reviewed <span className="font-semibold text-ink">{progress.reviewedFlagged} of {progress.flagged}</span> flagged</span>
              <span className="font-mono text-xs text-ink-3">{Math.round(reviewedShare * 100)}%</span>
            </p>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out" style={{ width: `${reviewedShare * 100}%` }} />
            </div>
          </div>
          <span className={progress.gapsOpen ? "inline-flex items-center gap-1.5 rounded-full bg-warn-soft px-2.5 py-1 text-sm font-semibold text-warn-ink" : "inline-flex items-center gap-1.5 rounded-full bg-ok-soft px-2.5 py-1 text-sm font-semibold text-ok-ink"}>
            {progress.gapsOpen ? <TriangleAlert className="h-3.5 w-3.5" /> : <CircleCheck className="h-3.5 w-3.5" />}
            {progress.gapsOpen} gap{progress.gapsOpen === 1 ? "" : "s"} open
          </span>
        </div>
        <Button size="lg" onClick={() => setSignOpen(true)}>
          {ready ? <CircleCheck className="h-4 w-4" /> : <PenLine className="h-4 w-4" />} Sign note
        </Button>
      </LiquidGlass>

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

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-line-strong bg-surface-2 px-1 font-mono text-[11px] font-semibold text-ink-2 shadow-[0_1px_0_var(--line-strong)]">{children}</kbd>;
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
