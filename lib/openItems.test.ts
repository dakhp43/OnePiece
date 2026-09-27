import { describe, expect, it } from "vitest";
import { daysUntilDue, dueLabel, isOverdue } from "./openItems";

const today = new Date(2026, 8, 27, 15, 30); // Sep 27, 2026, mid-afternoon local time

describe("open item due dates", () => {
  it("counts whole calendar days, whatever the time of day", () => {
    expect(daysUntilDue("2026-09-27", today)).toBe(0);
    expect(daysUntilDue("2026-09-28", today)).toBe(1);
    expect(daysUntilDue("2026-09-20", today)).toBe(-7);
    expect(daysUntilDue(null, today)).toBeNull();
  });

  it("labels overdue, today, soon and later due dates", () => {
    expect(dueLabel("2026-09-26", today)).toEqual({ text: "Overdue by 1 day", overdue: true });
    expect(dueLabel("2026-09-20", today)).toEqual({ text: "Overdue by 7 days", overdue: true });
    expect(dueLabel("2026-09-27", today)).toEqual({ text: "Due today", overdue: false });
    expect(dueLabel("2026-10-05", today)).toEqual({ text: "Due in 8 days", overdue: false });
    expect(dueLabel("2026-11-12", today)).toEqual({ text: "Due Nov 12", overdue: false });
    expect(dueLabel(null, today)).toBeNull();
  });

  it("is overdue only after the due date has passed", () => {
    expect(isOverdue("2026-09-26", today)).toBe(true);
    expect(isOverdue("2026-09-27", today)).toBe(false);
    expect(isOverdue(null, today)).toBe(false);
  });
});
