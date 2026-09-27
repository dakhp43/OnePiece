"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CopilotState, LiveSegment } from "@/lib/contracts";
import { appendCommitted, shouldCheck, wordCount } from "@/lib/copilot/segments";
import { playChime } from "./chime";
import { tapPcm } from "./pcmTap";
import { connectRealtime, type RealtimeSession } from "./realtimeStt";

export type CopilotChip = "off" | "connecting" | "listening" | "error";

interface StartArgs {
  ctx: AudioContext;
  source: AudioNode;
  mode: "live" | "replay";
  /** Seconds since recording started. */
  clock: () => number;
}

const TICK_MS = 5000;
// After asking Scribe to close the current segment, give its committed text a moment to arrive.
const COMMIT_SETTLE_MS = 400;

async function post(url: string, body: unknown, keepalive = false) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
  return res.json();
}

/**
 * Live copilot for the recording screen. Streams audio to Scribe Realtime, asks the server for a
 * coverage check every ~20 s of new speech, and exposes the resulting state. Every failure ends in the
 * "error" chip: nothing here can throw into the recorder or delay the upload.
 */
export function useCopilot(visitId: string, enabled: boolean) {
  const [chip, setChip] = useState<CopilotChip>("off");
  const [copilot, setCopilot] = useState<CopilotState | null>(null);
  const state = useRef<CopilotState | null>(null);
  const segments = useRef<LiveSegment[]>([]);
  const partial = useRef("");
  const session = useRef<RealtimeSession | null>(null);
  const untap = useRef<(() => void) | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlight = useRef(false);
  const running = useRef(false);
  const args = useRef<StartArgs | null>(null);

  const apply = useCallback((next: CopilotState) => {
    const before = new Set((state.current?.suggestions ?? []).map((s) => s.id));
    const fresh = next.suggestions.find((s) => s.status === "shown" && !before.has(s.id));
    state.current = next;
    setCopilot(next);
    if (fresh) playChime(args.current?.ctx ?? null);
  }, []);

  const teardown = useCallback((reason?: string) => {
    if (!running.current) return;
    running.current = false;
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    untap.current?.();
    untap.current = null;
    session.current?.close();
    session.current = null;
    const seconds = args.current?.clock() ?? 0;
    // Fire-and-forget: refunds unused realtime seconds. Never awaited, so it can't hold up the upload.
    void post(`/api/visits/${visitId}/copilot/stop`, { realtimeSeconds: seconds, ...(reason ? { error: reason.slice(0, 200) } : {}) }, true).catch(() => {});
  }, [visitId]);

  const fail = useCallback((reason: string) => {
    console.warn("[copilot]", reason);
    teardown(reason);
    setChip("error");
  }, [teardown]);

  const check = useCallback(async () => {
    const a = args.current;
    const s = state.current;
    if (!a || !s || !running.current) return;
    const elapsed = a.clock();
    const go = shouldCheck({
      elapsed, lastCheckSecond: s.lastCheckSecond, words: wordCount(segments.current, partial.current),
      lastWordCount: s.lastWordCount, inFlight: inFlight.current, checks: s.checks,
    });
    if (!go) return;
    inFlight.current = true;
    try {
      session.current?.commit();
      await new Promise((r) => setTimeout(r, COMMIT_SETTLE_MS));
      const res = await post(`/api/visits/${visitId}/copilot/check`, {
        mode: s.mode, elapsedSeconds: a.clock(), segments: segments.current.slice(-400), partial: partial.current || undefined,
      });
      if (running.current) apply(res.copilot);
    } catch (err) {
      console.warn("[copilot] check failed", (err as Error).message);
    } finally {
      inFlight.current = false;
    }
  }, [visitId, apply]);

  /** Adds transcript text directly (the replay's fallback when live transcription isn't available). */
  const feedText = useCallback((text: string) => {
    if (!running.current || !args.current) return;
    segments.current = appendCommitted(segments.current, text, args.current.clock());
  }, []);

  const start = useCallback(async (a: StartArgs) => {
    if (!enabled || running.current) return;
    running.current = true;
    args.current = a;
    segments.current = [];
    partial.current = "";
    state.current = null;
    setCopilot(null);
    setChip("connecting");
    try {
      const res = await post(`/api/visits/${visitId}/copilot/token`, { mode: a.mode });
      if (!running.current) return;
      apply(res.copilot);
      session.current = connectRealtime(res.token, res.keyterms ?? [], {
        onOpen: () => running.current && setChip("listening"),
        onCommitted: (text) => { segments.current = appendCommitted(segments.current, text, a.clock()); },
        onPartial: (text) => { partial.current = text; },
        onError: (code) => fail(`live transcription stopped (${code})`),
      });
      untap.current = await tapPcm(a.ctx, a.source, (pcm) => session.current?.sendPcm(pcm));
      timer.current = setInterval(() => void check(), TICK_MS);
    } catch (err) {
      fail((err as Error).message);
    }
  }, [enabled, visitId, apply, check, fail]);

  const stop = useCallback(() => {
    teardown();
    setChip("off");
  }, [teardown]);

  const dismiss = useCallback((id: string) => {
    const s = state.current;
    const elapsed = args.current?.clock() ?? 0;
    if (s) {
      const next = { ...s, suggestions: s.suggestions.map((x) => (x.id === id && x.status === "shown" ? { ...x, status: "dismissed" as const, resolvedAtSecond: Math.round(elapsed) } : x)) };
      state.current = next;
      setCopilot(next);
    }
    void post(`/api/visits/${visitId}/copilot/suggestions/${id}`, { action: "dismiss", elapsedSeconds: elapsed }).catch(() => {});
  }, [visitId]);

  // Leaving the page mid-recording ends the realtime session too.
  useEffect(() => () => teardown(), [teardown]);

  return { chip, copilot, start, stop, dismiss, feedText };
}
