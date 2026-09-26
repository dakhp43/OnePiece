"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { Utterance } from "@/lib/contracts";
import { cn, formatClock } from "@/lib/utils";

const ROLE_LABEL = { clinician: "Clinician", patient: "Patient", other: "Other", unknown: "Speaker" } as const;

interface Props {
  visitId: string;
  hasAudio: boolean;
  utterances: Utterance[];
  highlight: string[];
  audioRef: RefObject<HTMLAudioElement | null>;
  onUtteranceClick: (id: string) => void;
}

export function TranscriptPanel({ visitId, hasAudio, utterances, highlight, audioRef, onUtteranceClick }: Props) {
  const listRef = useRef<HTMLOListElement>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  // Auto-scroll to the first highlighted utterance.
  useEffect(() => {
    if (!highlight.length) return;
    listRef.current?.querySelector(`[data-uid="${highlight[0]}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlight]);

  // Track which utterance is currently audible.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => {
      const t = audio.currentTime;
      setPlayingId(audio.paused ? null : utterances.find((u) => t >= u.start && t <= u.end + 0.3)?.id ?? null);
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("pause", onTime);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("pause", onTime);
    };
  }, [audioRef, utterances]);

  return (
    <section className="flex min-h-0 flex-col border-r border-slate-200 bg-white" aria-label="Transcript">
      <div className="border-b border-slate-100 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Transcript</p>
        {hasAudio ? (
          <audio ref={audioRef} src={`/api/visits/${visitId}/audio`} controls preload="auto" className="h-9 w-full" />
        ) : (
          <p className="text-xs text-slate-500">No audio for this visit.</p>
        )}
      </div>
      <ol ref={listRef} className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
        {utterances.map((u) => {
          const hl = highlight.includes(u.id);
          return (
            <li
              key={u.id}
              data-uid={u.id}
              onClick={() => onUtteranceClick(u.id)}
              className={cn(
                "cursor-pointer rounded-md border-l-2 px-2 py-1.5 text-sm transition-colors",
                hl ? "border-teal-500 bg-teal-50" : "border-transparent hover:bg-slate-50",
                playingId === u.id && !hl && "bg-slate-100",
              )}
            >
              <p className="flex items-center gap-2 text-[11px] text-slate-500">
                <span className={cn("font-semibold uppercase", u.role === "clinician" ? "text-teal-700" : u.role === "patient" ? "text-slate-700" : "")}>
                  {ROLE_LABEL[u.role]}
                </span>
                <span className="font-mono">{formatClock(u.start)}</span>
                <span className="text-slate-300">{u.id}</span>
              </p>
              <p className="text-slate-800">{u.text}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
