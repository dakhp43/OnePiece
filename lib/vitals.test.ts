import { describe, expect, it } from "vitest";
import type { Note, Sentence } from "@/lib/contracts";
import { vitalsFromNote } from "./vitals";

const s = (text: string, section: Sentence["section"] = "O", review: Sentence["review"] = "unreviewed"): Sentence => ({
  id: text, problemId: "p1", section, text, sourceUtteranceIds: ["u1"], kind: "vital", origin: "ai", review,
});
const note = (sentences: Sentence[]): Note => ({ chiefComplaint: "", speakerRoles: {}, problems: [], sentences });

describe("vitalsFromNote", () => {
  it("reads BP, HR, SpO2, temp, and weight from Objective sentences", () => {
    expect(vitalsFromNote(note([
      s("BP 138/88."), s("HR 72, SpO2 97%."), s("Temperature 100.4 F."), s("Weight 170 lb."),
    ]))).toEqual({ systolic: 138, diastolic: 88, heartRate: 72, spo2: 97, tempF: 100.4, weightLb: 170 });
  });

  it("ignores deleted sentences, subjective home readings, and implausible values", () => {
    expect(vitalsFromNote(note([s("BP 150/95.", "O", "deleted"), s("Home BP 130/80.", "S")].map((x) => ({ ...x, kind: "history" as const }))))).toEqual({});
    expect(vitalsFromNote(note([s("BP 80/120.")]))).toEqual({});
  });
});
