"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import { Contrast, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { THEME_KEY as KEY } from "./theme-script";

export type Theme = "light" | "grey" | "dark";
export const THEMES: { id: Theme; label: string; icon: typeof Sun }[] = [
  { id: "light", label: "Light", icon: Sun },
  { id: "grey", label: "Grey", icon: Contrast },
  { id: "dark", label: "Dark", icon: Moon },
];
const isTheme = (v: unknown): v is Theme => v === "light" || v === "grey" || v === "dark";

function saved(): Theme | null {
  try {
    const t = localStorage.getItem(KEY);
    return isTheme(t) ? t : null;
  } catch {
    return null;
  }
}

/** Black glass is the default look; Light and Grey are a click away in the switch. */
const DEFAULT_THEME: Theme = "dark";
const apply = (t: Theme) => document.documentElement.setAttribute("data-theme", t);
const current = (): Theme => {
  const t = document.documentElement.getAttribute("data-theme");
  return isTheme(t) ? t : "light";
};

/** Re-applies the theme after React's dev-only remount resets <html> attributes (a no-op in production). */
export function ThemeSync() {
  useLayoutEffect(() => {
    apply(saved() ?? DEFAULT_THEME);
    if (navigator.userAgent.includes("Chrome/")) document.documentElement.setAttribute("data-liquid", "1");
  }, []);
  return null;
}

/** The active theme, kept in sync with <html data-theme>. */
export function useTheme() {
  return useSyncExternalStore(
    (onChange) => {
      const mo = new MutationObserver(onChange);
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
      return () => mo.disconnect();
    },
    current,
    (): Theme => "light",
  );
}

/** Switches to `next` and saves the choice. With an origin point, the new theme sweeps out from it. */
export function switchTheme(next: Theme, origin?: { x: number; y: number }) {
  if (next === current()) return;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // Storage blocked: the switch still applies for this page view.
  }
  if (typeof document.startViewTransition !== "function" || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    apply(next);
    return;
  }
  const { x, y } = origin ?? { x: innerWidth / 2, y: innerHeight / 2 };
  const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  document
    .startViewTransition(() => apply(next))
    .ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration: 520, easing: "cubic-bezier(0.4, 0, 0.2, 1)", pseudoElement: "::view-transition-new(root)" },
      );
    })
    .catch(() => {});
}

/**
 * Light · Grey · Dark segmented switch. The sliding indicator is positioned by CSS from <html data-theme>,
 * so it is already in place on first paint (no jump while React hydrates).
 */
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useTheme();
  return (
    <div role="radiogroup" aria-label="Color theme" className={cn("glass-pill relative grid grid-cols-3 rounded-full p-0.5", className)}>
      <span
        aria-hidden
        className="absolute inset-y-0.5 left-0.5 w-[calc((100%-0.25rem)/3)] rounded-full border border-[var(--glass-edge)] bg-surface shadow-[inset_0_1px_0_var(--glass-rim)] transition-transform duration-300 ease-out grey:translate-x-full dark:translate-x-[200%]"
      />
      {THEMES.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={theme === id}
          aria-label={`${label} theme`}
          title={`${label} theme`}
          onClick={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            switchTheme(id, { x: box.left + box.width / 2, y: box.top + box.height / 2 });
          }}
          className={cn(
            "relative z-10 flex h-7 w-8 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
            theme === id ? "text-ink" : "text-ink-3 hover:text-ink-2",
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}
