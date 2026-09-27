import { describe, expect, it } from "vitest";
import { VisitTypeSchema } from "@/lib/contracts";
import { VISIT_TYPE_LABELS } from "@/lib/utils";
import { getTemplate } from "./index";

describe("visit type checklists", () => {
  it.each(VisitTypeSchema.options)("%s has a checklist matching its label", (type) => {
    const t = getTemplate(type);
    expect(t.id).toBe(type);
    expect(t.label).toBe(VISIT_TYPE_LABELS[type]);
    const ids = t.items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(t.items.some((i) => i.priority === "required")).toBe(true);
  });

  it("offers exactly the known visit types, with Regular visit last", () => {
    expect(Object.keys(VISIT_TYPE_LABELS).sort()).toEqual([...VisitTypeSchema.options].sort());
    expect(Object.keys(VISIT_TYPE_LABELS).at(-1)).toBe("general_visit");
  });
});
