import type { CoverageItem, CoverageStatus, LiveCoverageResult } from "@/lib/contracts";
import type { OpenItemRow } from "@/lib/db/schema";
import { OPEN_PREFIX } from "@/lib/gaps";
import type { Template } from "@/lib/templates";

/** Everything starts "unknown": the model hasn't heard enough to judge yet. Mirrors buildGaps' item list. */
export function initialCoverage(template: Template, openItems: OpenItemRow[]): CoverageItem[] {
  const base = { conditionMet: null, status: "unknown" as const, evidenceQuote: null, updatedAtSecond: 0 };
  return [
    ...template.items.map((i): CoverageItem => ({
      itemId: i.id, label: i.label, priority: i.priority, source: "template", condition: i.condition, ...base,
    })),
    ...openItems.map((o): CoverageItem => ({
      itemId: `${OPEN_PREFIX}${o.id}`, label: `Follow up: ${o.text}`, priority: "required", source: "open_item",
      condition: null, ...base,
    })),
  ];
}

/**
 * Folds one model verdict into the running coverage. Evidence only accumulates: once covered, an item
 * stays covered, and partial never falls back to missing. Missing doesn't fall back to unknown either.
 * not_applicable can flip to missing (and back) as a condition starts or stops applying.
 */
function nextStatus(prev: CoverageStatus, next: CoverageStatus): CoverageStatus {
  if (prev === "covered") return "covered";
  if (prev === "partial") return next === "covered" ? "covered" : "partial";
  if (prev === "missing") return next === "unknown" ? "missing" : next;
  return next;
}

export function mergeCoverage(prev: CoverageItem[], items: LiveCoverageResult["items"], atSecond: number): CoverageItem[] {
  const verdicts = new Map(items.map((v) => [v.itemId, v]));
  return prev.map((c) => {
    const v = verdicts.get(c.itemId);
    if (!v) return c;
    const status = nextStatus(c.status, v.status);
    const changed = status !== c.status;
    return {
      ...c,
      status,
      conditionMet: c.condition ? v.conditionMet : null,
      evidenceQuote: changed && (status === "covered" || status === "partial") ? v.evidenceQuote : c.evidenceQuote,
      updatedAtSecond: changed ? Math.round(atSecond) : c.updatedAtSecond,
    };
  });
}

/** Meter numbers: items that don't apply to this visit aren't counted at all. */
export function meterCounts(coverage: CoverageItem[]) {
  const applicable = coverage.filter((c) => c.status !== "not_applicable");
  return {
    covered: applicable.filter((c) => c.status === "covered").length,
    partial: applicable.filter((c) => c.status === "partial").length,
    total: applicable.length,
  };
}
