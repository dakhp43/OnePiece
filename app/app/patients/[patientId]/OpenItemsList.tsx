"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleCheck, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface OpenItemRow {
  id: string;
  text: string;
  category: string;
  /** "since Sep 27", shown when there is no due date. */
  since: string;
  /** Computed on the server so the label matches what was rendered. */
  due: { text: string; overdue: boolean } | null;
}

/**
 * The patient's open items. "Done" closes one right away (it no longer waits for the next visit);
 * items closed here stay listed, struck through, with Undo until the page is left.
 */
export function OpenItemsList({ patientId, items }: { patientId: string; items: OpenItemRow[] }) {
  const router = useRouter();
  const [done, setDone] = useState<OpenItemRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function post(item: OpenItemRow, action: "done" | "reopen") {
    setBusy(item.id);
    setError(null);
    const res = await fetch(`/api/patients/${patientId}/open-items/${item.id}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setError(body.error ?? "Could not update the item");
      return;
    }
    setDone((d) => (action === "done" ? [...d, item] : d.filter((x) => x.id !== item.id)));
    router.refresh(); // updates the counts on this page
  }

  const doneIds = new Set(done.map((d) => d.id));
  const open = items.filter((i) => !doneIds.has(i.id));
  if (open.length === 0 && done.length === 0) return <p className="py-2 text-sm text-ink-3">Nothing outstanding.</p>;

  return (
    <>
      <ul className="divide-y divide-line">
        {open.map((item) => (
          <li key={item.id} className="flex flex-col gap-1.5 py-2.5 text-sm sm:flex-row sm:items-start sm:justify-between sm:gap-3">
            <span className="flex items-start gap-2.5 text-ink">
              <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full border-2", item.due?.overdue ? "border-danger bg-danger" : "border-warn")} aria-hidden />
              {item.text}
            </span>
            {/* On phones the details sit under the text, lined up after the dot. */}
            <span className="flex shrink-0 items-center gap-2 pl-[1.125rem] text-xs text-ink-3 sm:pl-0">
              <span className="rounded-md bg-surface-3 px-1.5 py-0.5 font-medium capitalize text-ink-2">{item.category.replace("_", " ")}</span>
              {item.due
                ? <span className={cn(item.due.overdue && "font-semibold text-danger-ink")} title={item.since}>{item.due.text}</span>
                : item.since}
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto h-7 px-2 text-xs sm:ml-0"
                disabled={busy === item.id}
                onClick={() => void post(item, "done")}
                title="Close this item now instead of at the next visit"
              >
                <Check className="h-3.5 w-3.5" /> Done
              </Button>
            </span>
          </li>
        ))}
        {done.map((item) => (
          <li key={item.id} className="fade-in flex flex-col gap-1.5 py-2.5 text-sm sm:flex-row sm:items-start sm:justify-between sm:gap-3">
            <span className="flex items-start gap-2.5 text-ink-3 line-through">
              <CircleCheck className="pop mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" aria-hidden />
              {item.text}
            </span>
            <span className="flex shrink-0 items-center gap-2 pl-[1.125rem] text-xs sm:pl-0">
              <span className="font-semibold text-ok-ink">Marked done</span>
              <Button size="sm" variant="ghost" className="ml-auto h-7 px-2 text-xs sm:ml-0" disabled={busy === item.id} onClick={() => void post(item, "reopen")}>
                <Undo2 className="h-3.5 w-3.5" /> Undo
              </Button>
            </span>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="mt-2 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-xs text-danger-ink">{error}</p>}
    </>
  );
}
