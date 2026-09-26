import { describe, expect, it } from "vitest";
import { fleschKincaidGrade, syllables } from "./readability";

describe("readability", () => {
  it("counts syllables roughly", () => {
    expect(syllables("cat")).toBe(1);
    expect(syllables("pressure")).toBe(2);
    expect(syllables("medicine")).toBe(3);
    expect(syllables("appointment")).toBe(3);
  });

  it("rates simple text low and dense clinical text high", () => {
    const simple = "Take one pill each day. Drink water. Call us if you feel sick.";
    const dense = "Discontinue angiotensin-converting enzyme inhibitor therapy secondary to persistent nonproductive cough, initiating angiotensin receptor blockade with subsequent laboratory evaluation of renal function.";
    expect(fleschKincaidGrade(simple)).toBeLessThan(4);
    expect(fleschKincaidGrade(dense)).toBeGreaterThan(14);
  });
});
