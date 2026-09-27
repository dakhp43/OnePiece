"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, CornerDownLeft, HeartPulse, Search, Users, type LucideIcon } from "lucide-react";
import { setTrail, useTrailEnabled } from "@/components/CursorTrail";
import { LiquidGlass } from "@/components/LiquidGlass";
import { PatientAvatar } from "@/components/patient";
import { THEMES, switchTheme, useTheme } from "@/components/theme";
import { VISIT_TYPE_LABELS, ageFromDob, cn } from "@/lib/utils";

interface PatientRow {
  id: string;
  firstName: string;
  lastName: string;
  dob: string;
  sex: string;
  lastVisitType: string | null;
  openItemCount: number;
}

interface Item {
  id: string;
  group: "Go to" | "Patients" | "Actions";
  label: string;
  hint?: string;
  icon?: LucideIcon;
  patient?: PatientRow;
  run: () => void;
}

/** ⌘K / Ctrl+K quick navigation: pages, your patients (loaded on first open), and the theme switch. */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [patients, setPatients] = useState<PatientRow[] | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const trailOn = useTrailEnabled();
  const theme = useTheme();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("carryover:palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("carryover:palette", onOpen);
    };
  }, []);

  // Read-only list of the signed-in doctor's patients, fetched once.
  useEffect(() => {
    if (!open || patients) return;
    let cancelled = false;
    fetch("/api/patients")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: PatientRow[]) => !cancelled && setPatients(rows))
      .catch(() => !cancelled && setPatients([]));
    return () => { cancelled = true; };
  }, [open, patients]);

  const close = () => {
    setOpen(false);
    setQuery("");
    setActive(0);
  };

  const items = useMemo<Item[]>(() => {
    const dismiss = () => { setOpen(false); setQuery(""); setActive(0); };
    const go = (href: string) => () => { dismiss(); router.push(href); };
    const all: Item[] = [
      { id: "patients", group: "Go to", label: "My patients", icon: Users, run: go("/app/patients") },
      { id: "status", group: "Go to", label: "System status", hint: "services and free-tier usage", icon: Activity, run: go("/app/status") },
      ...(patients ?? []).map<Item>((p) => ({
        id: p.id,
        group: "Patients",
        label: `${p.firstName} ${p.lastName}`,
        hint: [`${ageFromDob(p.dob)} ${p.sex}`, p.lastVisitType ? VISIT_TYPE_LABELS[p.lastVisitType] : null, p.openItemCount ? `${p.openItemCount} open` : null].filter(Boolean).join(" · "),
        patient: p,
        run: go(`/app/patients/${p.id}`),
      })),
      ...THEMES.filter((t) => t.id !== theme).map<Item>((t) => ({ id: `theme-${t.id}`, group: "Actions", label: `Use ${t.label.toLowerCase()} theme`, icon: t.icon, run: () => { dismiss(); switchTheme(t.id); } })),
      { id: "trail", group: "Actions", label: trailOn ? "Turn off heartbeat cursor trail" : "Turn on heartbeat cursor trail", icon: HeartPulse, run: () => { dismiss(); setTrail(!trailOn); } },
    ];
    const q = query.trim().toLowerCase();
    return q ? all.filter((i) => `${i.label} ${i.hint ?? ""} ${i.patient?.lastName ?? ""}`.toLowerCase().includes(q)) : all;
  }, [patients, query, router, trailOn, theme]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") close();
    else if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); items[active]?.run(); }
  };

  return (
    <div className="fade-in fixed inset-0 z-[60] flex items-start justify-center bg-black/25 px-4 pt-[14vh] backdrop-blur-[3px]" onMouseDown={close}>
      <LiquidGlass
        role="dialog"
        aria-modal="true"
        aria-label="Quick navigation"
        radius={24}
        blur={22}
        strength={30}
        className="dialog-in w-full max-w-xl overflow-hidden rounded-3xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="h-5 w-5 text-accent" />
          <input
            autoFocus
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={onKeyDown}
            placeholder="Jump to a patient or page…"
            aria-label="Search patients and pages"
            className="h-14 flex-1 bg-transparent text-base text-ink placeholder:text-ink-4 focus:outline-none"
          />
          <kbd className="glass-pill rounded-md px-1.5 py-0.5 font-mono text-[11px] text-ink-3">Esc</kbd>
        </div>
        <ul ref={listRef} className="max-h-[50vh] overflow-y-auto p-2" role="listbox" aria-label="Results">
          {items.map((item, i) => {
            const header = item.group !== items[i - 1]?.group ? item.group : null;
            const Icon = item.icon;
            return (
              <li key={item.id} role="presentation">
                {header && <p className="px-3 pb-1 pt-3 font-sub text-xs font-semibold text-ink-3">{header}</p>}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  data-index={i}
                  onMouseMove={() => setActive(i)}
                  onClick={item.run}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
                    i === active ? "bg-accent-soft text-ink" : "text-ink-2",
                  )}
                >
                  {item.patient ? (
                    <PatientAvatar first={item.patient.firstName} last={item.patient.lastName} size="sm" />
                  ) : Icon ? (
                    <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", i === active ? "bg-accent text-white" : "bg-surface-3 text-ink-3")}>
                      <Icon className="h-4 w-4" />
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{item.label}</span>
                    {item.hint && <span className="block truncate text-xs text-ink-3">{item.hint}</span>}
                  </span>
                  {i === active && <CornerDownLeft className="h-4 w-4 text-accent-ink" />}
                </button>
              </li>
            );
          })}
          {patients === null && <li className="shimmer mx-3 my-2 h-9 rounded-xl" aria-label="Loading patients" />}
          {items.length === 0 && <li className="px-3 py-8 text-center text-sm text-ink-3">No matches for “{query}”.</li>}
        </ul>
        <div className="flex items-center gap-4 border-t border-line bg-surface-3 px-4 py-2 text-[11px] text-ink-3">
          <span><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono">↵</kbd> open</span>
          <span className="ml-auto"><kbd className="font-mono">⌘K</kbd> toggle</span>
        </div>
      </LiquidGlass>
    </div>
  );
}

/** Header button that opens the palette. */
export function CommandPaletteTrigger() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("carryover:palette"))}
      className="glass-pill group hidden items-center gap-2 rounded-full py-1.5 pl-3 pr-1.5 text-sm text-ink-3 transition-colors hover:text-ink-2 lg:flex"
      title="Quick navigation (⌘K)"
    >
      <Search className="h-3.5 w-3.5" />
      <span className="pr-6">Jump to…</span>
      <kbd className="rounded-full border border-line bg-surface-3 px-2 py-0.5 font-mono text-[11px] text-ink-3 group-hover:text-accent-ink">⌘K</kbd>
    </button>
  );
}
