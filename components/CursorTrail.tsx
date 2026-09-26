"use client";

import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { HeartOff, HeartPulse } from "lucide-react";
import { cn } from "@/lib/utils";
import { TRAIL_KEY } from "./theme-script";

type TrailState = "on" | "off";

const root = () => document.documentElement;
export const isTrailOn = () => root().getAttribute("data-trail") !== "off";

function savedTrail(): TrailState | null {
  try {
    const v = localStorage.getItem(TRAIL_KEY);
    return v === "on" || v === "off" ? v : null;
  } catch {
    return null;
  }
}
const defaultTrail = (): TrailState => (matchMedia("(prefers-reduced-motion: reduce)").matches ? "off" : "on");

/** Turns the heartbeat cursor trail on or off and remembers the choice. */
export function setTrail(on: boolean) {
  const v: TrailState = on ? "on" : "off";
  root().setAttribute("data-trail", v);
  try {
    localStorage.setItem(TRAIL_KEY, v);
  } catch {
    // Storage blocked: the switch still applies for this page view.
  }
}

/** Current on/off state, kept in sync with <html data-trail>. */
export function useTrailEnabled() {
  return useSyncExternalStore(
    (onChange) => {
      const mo = new MutationObserver(onChange);
      mo.observe(root(), { attributes: true, attributeFilter: ["data-trail"] });
      return () => mo.disconnect();
    },
    isTrailOn,
    () => true,
  );
}

// ---------------------------------------------------------------------------
// Heartline: a smooth trail with one ECG complex written into it per heartbeat.
// ---------------------------------------------------------------------------

const LIFETIME = 900; // ms a stretch of trail stays visible
const SAMPLE = 2.5; // px between resampled points
const COMPLEX = 52; // px of travel one P-QRS-T complex spans
const AMPLITUDE = 19; // px height of the R wave
const BUCKETS = 18; // fade steps (each is one stroke)
const RING_LIFETIME = 700;
const IDLE_FADE = 700; // ms after the pointer stops before the tip starts fading

/** One P-QRS-T complex over x in [0, 1]. Positive = up. Flat outside the complex. */
function ecg(x: number) {
  if (x < 0 || x > 1) return 0;
  if (x < 0.14) return 0.12 * Math.sin((Math.PI * x) / 0.14); // P
  if (x < 0.22) return 0;
  if (x < 0.26) return (-0.14 * (x - 0.22)) / 0.04; // Q
  if (x < 0.32) return -0.14 + (1.14 * (x - 0.26)) / 0.06; // R
  if (x < 0.38) return 1 - (1.38 * (x - 0.32)) / 0.06; // S
  if (x < 0.43) return -0.38 + (0.38 * (x - 0.38)) / 0.05;
  if (x < 0.55) return 0;
  if (x < 0.85) return 0.24 * Math.sin((Math.PI * (x - 0.55)) / 0.3); // T
  return 0;
}

/** Lub-dub: two quick bumps after a beat (t in ms since the beat). */
function lubDub(t: number) {
  const bump = (a: number, b: number) => (t > a && t < b ? Math.sin((Math.PI * (t - a)) / (b - a)) : 0);
  return 0.9 * bump(0, 150) + 0.5 * bump(190, 320);
}

const catmull = (a: number, b: number, c: number, d: number, u: number) =>
  0.5 * (2 * b + (c - a) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (3 * b - a - 3 * c + d) * u * u * u);

interface Pt { x: number; y: number; d: number; t: number }
interface Beat { d: number; sign: 1 | -1 }
interface Ring { x: number; y: number; t: number }

/**
 * Heartbeat cursor trail. The pointer leaves a smooth line that fades behind it; every heartbeat writes one
 * ECG complex into the line just ahead of the tip, so it is drawn as you move, like a pen on ECG paper.
 * Moving faster raises the heart rate. The tip beats (lub-dub) and a click fires a beat. Mouse/trackpad
 * only; hidden when turned off (see TrailToggle). Purely decorative.
 */
export function CursorTrail() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // React's dev-only remount resets <html> attributes; put the saved choice back before paint.
  useLayoutEffect(() => {
    root().setAttribute("data-trail", savedTrail() ?? defaultTrail());
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const g = canvas?.getContext("2d");
    if (!canvas || !g || !matchMedia("(pointer: fine)").matches) return;

    const pts: Pt[] = [];
    const beats: Beat[] = [];
    const rings: Ring[] = [];
    let color = "";
    let raf = 0;
    let dpr = 1;
    let speed = 0; // px/s, smoothed
    let lastMove = -Infinity;
    let lastBeat = -Infinity;
    let nextBeat = 0;
    let tip: { x: number; y: number; dx: number; dy: number } | null = null;

    const readColor = () => { color = getComputedStyle(root()).getPropertyValue("--trail").trim() || "#0b7a70"; };
    const resize = () => {
      dpr = window.devicePixelRatio || 1;
      canvas.width = innerWidth * dpr;
      canvas.height = innerHeight * dpr;
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(frame); };

    /** Fires a heartbeat now. While moving it also writes an ECG complex into the trail ahead of the tip. */
    const fireBeat = (now: number, withComplex: boolean) => {
      lastBeat = now;
      const bpm = 64 + Math.min(76, speed / 16);
      nextBeat = now + 60000 / bpm;
      if (tip) rings.push({ x: tip.x, y: tip.y, t: now });
      const head = pts[pts.length - 1];
      const prev = beats[beats.length - 1];
      if (withComplex && head && tip && (!prev || head.d - prev.d > COMPLEX * 1.15)) {
        // Spike toward the top of the screen whichever way the pointer travels.
        const ny = tip.dx; // y of the left-hand normal (-dy, dx)
        beats.push({ d: head.d, sign: ny > 0 ? 1 : -1 });
      }
    };

    const frame = (): void => {
      raf = 0;
      const now = performance.now();
      while (pts.length && now - pts[0].t > LIFETIME) pts.shift();
      while (rings.length && now - rings[0].t > RING_LIFETIME) rings.shift();
      while (beats.length && pts.length && beats[0].d + COMPLEX < pts[0].d) beats.shift();
      if (!pts.length) beats.length = 0;

      const moving = now - lastMove < 220;
      if (!moving) speed *= 0.96; // heart rate settles back down at rest
      const tipAlpha = Math.max(0, Math.min(1, 1 - (now - lastMove - IDLE_FADE) / 500));
      if (tip && tipAlpha > 0 && now >= nextBeat) fireBeat(now, moving);

      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, innerWidth, innerHeight);
      g.strokeStyle = color;
      g.fillStyle = color;
      // Butt caps: fade steps share a vertex, and round caps would overlap into visible dots there.
      g.lineCap = "butt";
      g.lineJoin = "round";

      // 1. Smooth the raw points (Catmull-Rom) and resample at even spacing.
      const s: Pt[] = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
        const n = Math.max(1, Math.ceil((p2.d - p1.d) / SAMPLE));
        for (let k = 0; k < n; k++) {
          const u = k / n;
          s.push({
            x: catmull(p0.x, p1.x, p2.x, p3.x, u),
            y: catmull(p0.y, p1.y, p2.y, p3.y, u),
            d: p1.d + (p2.d - p1.d) * u,
            t: p1.t + (p2.t - p1.t) * u,
          });
        }
      }
      if (pts.length) s.push(pts[pts.length - 1]);

      // 2. Offset along a smoothed normal where a beat's complex lies, then stroke in fade buckets.
      if (s.length > 1) {
        const out: { x: number; y: number; b: number }[] = [];
        for (let j = 0; j < s.length; j++) {
          let off = 0;
          for (const b of beats) off += b.sign * ecg((s[j].d - b.d) / COMPLEX);
          let x = s[j].x;
          let y = s[j].y;
          if (off !== 0) {
            const a = s[Math.max(0, j - 4)], c = s[Math.min(s.length - 1, j + 4)];
            const len = Math.hypot(c.x - a.x, c.y - a.y) || 1;
            // Left-hand normal of the direction of travel; sign flips it so R points up the screen.
            x += (-(c.y - a.y) / len) * off * -AMPLITUDE;
            y += ((c.x - a.x) / len) * off * -AMPLITUDE;
          }
          const life = 1 - Math.min(1, (now - s[j].t) / LIFETIME);
          out.push({ x, y, b: Math.min(BUCKETS - 1, Math.floor(life * BUCKETS)) });
        }
        let start = 0;
        for (let j = 1; j <= out.length; j++) {
          if (j < out.length && out[j].b === out[start].b) continue;
          const life = (out[start].b + 1) / BUCKETS;
          g.globalAlpha = 0.9 * Math.pow(life, 1.2);
          g.lineWidth = 0.8 + 1.7 * life;
          g.beginPath();
          g.moveTo(out[Math.max(0, start - 1)].x, out[Math.max(0, start - 1)].y);
          for (let k = start; k < j; k++) g.lineTo(out[k].x, out[k].y);
          g.stroke();
          start = j;
        }
      }

      // 3. The tip: a dot that beats lub-dub, and a thin ring per beat.
      if (tip && tipAlpha > 0) {
        g.globalAlpha = 0.95 * tipAlpha;
        g.beginPath();
        g.arc(tip.x, tip.y, 2.4 * (1 + lubDub(now - lastBeat)), 0, Math.PI * 2);
        g.fill();
      }
      g.lineWidth = 1.2;
      for (const r of rings) {
        const p = (now - r.t) / RING_LIFETIME;
        g.globalAlpha = 0.45 * (1 - p) * (1 - p);
        g.beginPath();
        g.arc(r.x, r.y, 4 + 18 * (1 - (1 - p) * (1 - p)), 0, Math.PI * 2);
        g.stroke();
      }
      g.globalAlpha = 1;

      if (pts.length || rings.length || (tip && tipAlpha > 0)) schedule();
      else tip = null;
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || !isTrailOn()) return;
      const now = performance.now();
      if (!tip) {
        readColor();
        nextBeat = now + 180; // first beat soon after the pointer wakes up
      }
      for (const ev of e.getCoalescedEvents?.() ?? [e]) {
        const last = pts[pts.length - 1];
        const x = ev.clientX, y = ev.clientY;
        // Coalesced events carry their own timestamps (same clock as performance.now()).
        const t = ev.timeStamp > 0 ? Math.min(ev.timeStamp, now) : now;
        if (!last) {
          pts.push({ x, y, d: 0, t });
          continue;
        }
        const step = Math.hypot(x - last.x, y - last.y);
        if (step < 1) continue;
        // A jump (e.g. re-entering the window) starts a fresh line instead of a long straight one.
        if (step > 180) {
          pts.length = 0;
          beats.length = 0;
          pts.push({ x, y, d: 0, t });
          continue;
        }
        const dt = Math.max(4, t - last.t);
        speed = speed * 0.85 + Math.min(4000, (step / dt) * 1000) * 0.15;
        pts.push({ x, y, d: last.d + step, t });
        tip = { x, y, dx: (x - last.x) / step, dy: (y - last.y) / step };
      }
      if (!tip && pts.length) tip = { x: pts[0].x, y: pts[0].y, dx: 1, dy: 0 };
      lastMove = now;
      schedule();
    };

    // A click is a beat.
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || !isTrailOn()) return;
      if (!tip) tip = { x: e.clientX, y: e.clientY, dx: 1, dy: 0 };
      fireBeat(performance.now(), false);
      schedule();
    };

    resize();
    readColor();
    const themeObserver = new MutationObserver(readColor);
    themeObserver.observe(root(), { attributes: true, attributeFilter: ["data-theme"] });
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      themeObserver.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
    };
  }, []);

  return <canvas ref={canvasRef} className="cursor-trail pointer-events-none fixed inset-0 z-[70] h-full w-full" aria-hidden />;
}

/** On/off switch for the heartbeat cursor trail (mouse/trackpad devices only). */
export function TrailToggle({ className }: { className?: string }) {
  const on = useTrailEnabled();
  return (
    <button
      type="button"
      onClick={() => setTrail(!isTrailOn())}
      aria-pressed={on}
      aria-label="Heartbeat cursor trail"
      title={on ? "Heartbeat cursor trail: on (click to turn off)" : "Heartbeat cursor trail: off (click to turn on)"}
      className={cn(
        "glass-pill relative inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-2 transition-colors pointer-coarse:hidden",
        "hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        "trail-off:text-ink-4",
        className,
      )}
    >
      <HeartPulse className="h-4 w-4 trail-off:hidden" />
      <HeartOff className="hidden h-4 w-4 trail-off:block" />
    </button>
  );
}
