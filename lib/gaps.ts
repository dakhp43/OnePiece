import type { AuditResult, GapItem } from "@/lib/contracts";
import type { OpenItemRow } from "@/lib/db/schema";
import type { AuditChecklistItem } from "@/lib/llm/prompts/auditNote";
import type { Template } from "@/lib/templates";

export const OPEN_PREFIX = "open:";

/** Checklist sent to the auditor: template items + one item per open item from earlier visits. */
export function buildChecklist(template: Template, openItems: OpenItemRow[]): AuditChecklistItem[] {
  return [
    ...template.items.map((i) => ({ itemId: i.id, label: i.label, condition: i.condition })),
    ...openItems.map((o) => ({ itemId: `${OPEN_PREFIX}${o.id}`, label: `Follow up: ${o.text}`, condition: null })),
  ];
}

/** Gap state for the review screen, from the template + open items + the audit's checklist verdicts. */
export function buildGaps(template: Template, openItems: OpenItemRow[], audit: AuditResult): GapItem[] {
  const verdicts = new Map(audit.checklist.map((c) => [c.itemId, c]));
  const fromVerdict = (itemId: string) => {
    const v = verdicts.get(itemId);
    return v
      ? { status: v.status, explanation: v.explanation, evidenceUtteranceIds: v.evidenceUtteranceIds }
      : { status: "missing" as const, explanation: "No evidence found in the conversation.", evidenceUtteranceIds: [] };
  };
  return [
    ...template.items.map((i): GapItem => ({
      itemId: i.id, label: i.label, priority: i.priority, source: "template",
      defaultSection: i.defaultSection, resolution: null, ...fromVerdict(i.id),
    })),
    ...openItems.map((o): GapItem => ({
      itemId: `${OPEN_PREFIX}${o.id}`, label: `Follow up: ${o.text}`, priority: "required", source: "open_item",
      defaultSection: o.category === "lab" || o.category === "imaging" ? "O" : "P",
      resolution: null, ...fromVerdict(`${OPEN_PREFIX}${o.id}`),
    })),
  ];
}

export const isOpenGap = (g: GapItem) => (g.status === "missing" || g.status === "partial") && g.resolution === null;
export const unresolvedRequired = (gaps: GapItem[]) => gaps.filter((g) => g.priority === "required" && isOpenGap(g));

const MATCH_PREFIX = `${OPEN_PREFIX}match:`;

/**
 * Demo fixtures can't know this database's open-item ids, so they use "open:match:<keyword>".
 * Rewrites those to the real "open:<id>" of the open item whose text contains the keyword.
 */
export function remapFixtureOpenItems(audit: AuditResult, openItems: OpenItemRow[]): AuditResult {
  return {
    ...audit,
    checklist: audit.checklist.flatMap((c) => {
      if (!c.itemId.startsWith(MATCH_PREFIX)) return [c];
      const keyword = c.itemId.slice(MATCH_PREFIX.length).toLowerCase();
      const item = openItems.find((o) => o.text.toLowerCase().includes(keyword));
      return item ? [{ ...c, itemId: `${OPEN_PREFIX}${item.id}` }] : [];
    }),
  };
}
