const DAY = 86_400_000;

const utcDay = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
const parse = (dueDate: string) => {
  const [y, m, d] = dueDate.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

/** Whole days from today to a due date ("YYYY-MM-DD"): negative when overdue, null without a due date. */
export function daysUntilDue(dueDate: string | null, today = new Date()): number | null {
  return dueDate ? Math.round((parse(dueDate) - utcDay(today)) / DAY) : null;
}

export const isOverdue = (dueDate: string | null, today = new Date()) => (daysUntilDue(dueDate, today) ?? 0) < 0;

/** "Overdue by 3 days", "Due today", "Due in 5 days" or "Due Nov 12"; null when the item has no due date. */
export function dueLabel(dueDate: string | null, today = new Date()): { text: string; overdue: boolean } | null {
  const days = daysUntilDue(dueDate, today);
  if (days === null) return null;
  const count = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
  if (days < 0) return { text: `Overdue by ${count(-days)}`, overdue: true };
  if (days === 0) return { text: "Due today", overdue: false };
  if (days <= 14) return { text: `Due in ${count(days)}`, overdue: false };
  const date = new Date(parse(dueDate!)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return { text: `Due ${date}`, overdue: false };
}
