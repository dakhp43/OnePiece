"use client";

import { useEffect, useRef } from "react";

const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Counts up to `value` on mount. The server renders the final number (so no-JS and screen readers
 * get it immediately); the animation only rewrites the text while it plays.
 */
export function CountUp({ value, decimals = 0, duration = 1100, suffix = "", className }: {
  value: number; decimals?: number; duration?: number; suffix?: string; className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    // Update React's own text node in place so React's DOM stays consistent.
    const node = ref.current?.firstChild;
    if (!(node instanceof Text) || reducedMotion() || value === 0) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      node.nodeValue = (value * eased).toFixed(decimals) + suffix;
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      node.nodeValue = value.toFixed(decimals) + suffix;
    };
  }, [value, decimals, duration, suffix]);
  return <span ref={ref} className={className}>{value.toFixed(decimals) + suffix}</span>;
}
