"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import type { Utterance } from "@/lib/contracts";
import { cn, formatClock } from "@/lib/utils";

const ROLE_LABEL = { clinician: "Clinician", patient: "Patient", other: "Other", unknown: "Speaker" } as const;
const ROLE_AVATAR = {
  clinician: "bg-accent text-white",
  patient: "bg-info text-white",
  other: "bg-ink-4 text-white",
  unknown: "bg-ink-4 text-white",
} as const;
const ROLE_SEGMENT = { clinician: "bg-accent", patient: "bg-info", other: "bg-ink-4", unknown: "bg-ink-4" } as const;
const RATES = [1, 1.25, 1.5, 2];

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
    <section className="glass flex min-h-0 flex-col rounded-none border-y-0 border-l-0 shadow-none" aria-label="Transcript">
      <div className="border-b border-line p-3">
        <p className="mb-2 flex items-center justify-between font-sub text-sm font-semibold text-ink-2">
          Transcript <span className="font-mono text-xs font-normal text-ink-3">{utterances.length} lines</span>
        </p>
        {hasAudio ? (
          <>
            <audio ref={audioRef} src={`/api/visits/${visitId}/audio`} preload="auto" className="hidden" />
            <SpeakerTimeline audioRef={audioRef} utterances={utterances} highlight={highlight} onUtteranceClick={onUtteranceClick} />
          </>
        ) : (
          <p className="text-xs text-ink-3">No audio for this visit.</p>
        )}
      </div>
      <ol ref={listRef} className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
        {utterances.map((u) => {
          const hl = highlight.includes(u.id);
          const playing = playingId === u.id;
          return (
            <li
              key={u.id}
              data-uid={u.id}
              onClick={() => onUtteranceClick(u.id)}
              className={cn(
                "cursor-pointer rounded-xl border px-3 py-2 text-[15px] transition-all duration-300",
                hl ? "evidence-glow border-accent/50 bg-accent-soft" : "border-transparent hover:border-line hover:bg-surface-2",
                playing && !hl && "border-line bg-surface-3",
              )}
            >
              <p className="flex items-center gap-2 text-xs text-ink-3">
                <span className={cn("flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold", ROLE_AVATAR[u.role])} aria-hidden>
                  {ROLE_LABEL[u.role][0]}
                </span>
                <span className={cn("font-semibold", u.role === "clinician" ? "text-accent-ink" : u.role === "patient" ? "text-info-ink" : "")}>
                  {ROLE_LABEL[u.role]}
                </span>
                <span className="font-mono">{formatClock(u.start)}</span>
                <span className="font-mono text-ink-4">{u.id}</span>
                {playing && <Equalizer />}
              </p>
              <p className="mt-0.5 leading-relaxed text-ink">{u.text}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Equalizer() {
  return (
    <span className="ml-auto flex h-3 items-end gap-0.5" aria-label="Playing">
      {[0, 0.2, 0.4].map((d) => <span key={d} className="eq-bar h-full w-0.5 rounded-full bg-accent" style={{ animationDelay: `${d}s` }} />)}
    </span>
  );
}

/** Reads the audio element's playback state (time, duration, paused, rate, muted) as one snapshot. */
function useAudioState(audioRef: RefObject<HTMLAudioElement | null>) {
  const subscribe = useCallback((onChange: () => void) => {
    const a = audioRef.current;
    if (!a) return () => {};
    const events = ["timeupdate", "play", "pause", "loadedmetadata", "durationchange", "ratechange", "volumechange", "seeked", "ended", "emptied"];
    events.forEach((e) => a.addEventListener(e, onChange));
    return () => events.forEach((e) => a.removeEventListener(e, onChange));
  }, [audioRef]);
  const snapshot = useSyncExternalStore(
    subscribe,
    () => {
      const a = audioRef.current;
      return a ? `${a.currentTime}|${Number.isFinite(a.duration) ? a.duration : 0}|${a.paused ? 1 : 0}|${a.playbackRate}|${a.muted ? 1 : 0}` : "0|0|1|1|0";
    },
    () => "0|0|1|1|0",
  );
  const [time, duration, paused, rate, muted] = snapshot.split("|").map(Number);
  return { time, duration, paused: paused === 1, rate, muted: muted === 1 };
}

/**
 * Replaces the native audio controls: play/pause, speed, mute, and a scrubbable timeline where each
 * utterance is a segment colored by speaker. Clicking a segment behaves like clicking that transcript line.
 */
function SpeakerTimeline({ audioRef, utterances, highlight, onUtteranceClick }: {
  audioRef: RefObject<HTMLAudioElement | null>;
  utterances: Utterance[];
  highlight: string[];
  onUtteranceClick: (id: string) => void;
}) {
  const { time, duration, paused, rate, muted } = useAudioState(audioRef);
  const total = duration || utterances.at(-1)?.end || 1;
  const pct = (v: number) => `${Math.min(100, Math.max(0, (v / total) * 100))}%`;

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) void a.play().catch(() => {});
    else a.pause();
  };
  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    if (!a) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = ((e.clientX - r.left) / r.width) * total;
  };
  const cycleRate = () => {
    const a = audioRef.current;
    if (a) a.playbackRate = RATES[(RATES.indexOf(a.playbackRate) + 1) % RATES.length];
  };
  const toggleMute = () => {
    const a = audioRef.current;
    if (a) a.muted = !a.muted;
  };

  return (
    <div className="glass-pill rounded-xl p-2.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          aria-label={paused ? "Play recording" : "Pause recording"}
          className="relative flex h-8 w-8 items-center justify-center rounded-full bg-accent-strong text-on-accent transition-[opacity,transform] hover:opacity-90 active:scale-95"
        >
          {paused ? <Play className="relative ml-0.5 h-3.5 w-3.5 fill-current" /> : <Pause className="relative h-3.5 w-3.5 fill-current" />}
        </button>
        <span className="font-mono text-xs tabular-nums text-ink-2">
          {formatClock(time)} <span className="text-ink-4">/ {formatClock(total)}</span>
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={cycleRate} title="Playback speed" className="rounded-md px-1.5 py-1 font-mono text-[11px] font-semibold text-ink-2 transition-colors hover:bg-surface-3">
            {rate}×
          </button>
          <button type="button" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"} className="rounded-md p-1 text-ink-2 transition-colors hover:bg-surface-3">
            {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      <div className="relative mt-2.5 h-8 cursor-pointer rounded-lg bg-surface-3/70" onClick={seek} title="Click to seek">
        {utterances.map((u) => {
          const hl = highlight.includes(u.id);
          return (
            <button
              key={u.id}
              type="button"
              aria-label={`${ROLE_LABEL[u.role]} at ${formatClock(u.start)} (${u.id})`}
              title={`${u.id} · ${ROLE_LABEL[u.role]} · ${formatClock(u.start)}`}
              onClick={(e) => { e.stopPropagation(); onUtteranceClick(u.id); }}
              className={cn(
                "absolute h-2 rounded-[3px] transition-all duration-300 hover:opacity-100",
                ROLE_SEGMENT[u.role],
                // Two lanes: clinician on top, patient below.
                u.role === "patient" ? "bottom-1.5" : "top-1.5",
                hl ? "top-0.5 bottom-0.5 h-auto opacity-100 ring-2 ring-accent ring-offset-1 ring-offset-surface-2" : highlight.length ? "opacity-35" : "opacity-80",
              )}
              style={{ left: pct(u.start), width: `max(3px, calc(${pct(u.end - u.start)} - 1px))` }}
            />
          );
        })}
        <span className="pointer-events-none absolute -top-1 -bottom-1 w-0.5 rounded-full bg-ink shadow-[0_0_0_2px_var(--surface-2)] transition-[left] duration-200 ease-linear" style={{ left: pct(time) }} aria-hidden />
      </div>
      <p className="mt-1.5 flex items-center gap-3 text-xs text-ink-3">
        <span className="flex items-center gap-1"><span className="h-1.5 w-3 rounded-sm bg-accent" /> Clinician</span>
        <span className="flex items-center gap-1"><span className="h-1.5 w-3 rounded-sm bg-info" /> Patient</span>
        <span className="ml-auto">click a segment to jump</span>
      </p>
    </div>
  );
}
