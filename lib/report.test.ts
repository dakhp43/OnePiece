import { describe, expect, it } from "vitest";
import type { Note, Sentence } from "@/lib/contracts";
import { buildReport, changedFields } from "./report";

const s = (id: string, problemId: string, section: Sentence["section"], text: string, review: Sentence["review"] = "accepted"): Sentence => ({
  id, problemId, section, text, sourceUtteranceIds: ["u1"], kind: "other", origin: "ai", review,
});

const note: Note = {
  chiefComplaint: "Hypertension follow-up and cough",
  speakerRoles: {},
  problems: [
    { id: "p1", title: "Hypertension", status: "established" },
    { id: "p2", title: "Cough", status: "new" },
  ],
  sentences: [
    s("s1", "p1", "S", "Reports taking lisinopril every morning"),
    s("s2", "p1", "S", "Reports uncertain dose of lisinopril as 20 mg or 40 mg.", "edited"),
    s("s3", "p1", "O", "Blood pressure is 138/88."),
    s("s4", "p1", "A", "Hypertension, improving."),
    s("s5", "p1", "P", "Stop lisinopril."),
    s("s6", "p1", "P", "Start losartan 50 mg once a day."),
    s("s7", "p2", "S", "Dry cough for 3 weeks."),
    s("s8", "p2", "S", "This sentence was removed.", "deleted"),
    s("s9", "p2", "A", "Likely ACE-inhibitor cough."),
  ],
};
const rosa = { firstName: "Rosa", lastName: "Martinez", dob: "1968-01-02", sex: "F" };

describe("buildReport", () => {
  const r = buildReport(note, rosa, new Date("2026-09-26T12:00:00"));

  it("opens the history with demographics and the chief complaint", () => {
    expect(r.hpi.split("\n\n")[0]).toBe("Rosa Martinez is a 58-year-old female seen for hypertension follow-up and cough.");
  });

  it("groups subjective sentences by problem and leaves deleted ones out", () => {
    expect(r.hpi).toContain("Hypertension: Reports taking lisinopril every morning. Reports uncertain dose");
    expect(r.hpi).toContain("Cough: Dry cough for 3 weeks.");
    expect(r.hpi).not.toContain("removed");
  });

  it("puts objective findings in the examination and A/P per problem", () => {
    expect(r.examination).toBe("Blood pressure is 138/88.");
    expect(r.problems).toEqual([
      { problemId: "p1", title: "Hypertension", assessment: "Hypertension, improving.", plan: "Stop lisinopril.\nStart losartan 50 mg once a day." },
      { problemId: "p2", title: "Cough", assessment: "Likely ACE-inhibitor cough.", plan: "" },
    ]);
  });

  it("keeps acronyms when lower-casing the chief complaint", () => {
    const bp = buildReport({ ...note, chiefComplaint: "BP check" }, rosa, new Date("2026-09-26"));
    expect(bp.hpi.startsWith("Rosa Martinez is a 58-year-old female seen for BP check.")).toBe(true);
  });
});

describe("changedFields", () => {
  it("lists only the narrative fields the clinician changed", () => {
    const a = buildReport(note, rosa, new Date("2026-09-26"));
    const b = { ...a, examination: "BP 138/88, lungs clear.", problems: a.problems.map((p) => (p.problemId === "p2" ? { ...p, plan: "Chest x-ray if not better in 2 weeks." } : p)) };
    expect(changedFields(a, b)).toEqual(["examination", "p2.plan"]);
  });
});
