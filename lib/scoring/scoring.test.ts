import { describe, expect, it } from "vitest";
import type { Note, Sentence, SentenceVerdict, Utterance } from "@/lib/contracts";
import { REASONS, levelFor, scoreNote, scoreSentence } from "./confidence";
import { extractNumbers, missingNumbers, normalizeSource, spelledToDigits } from "./numbers";

describe("numbers", () => {
  it("extracts digits from note sentences", () => {
    expect(extractNumbers("BP 138/88; losartan 50 mg; temp 98.6")).toEqual(["138", "88", "50", "98.6"]);
  });

  it("converts spelled numbers including the BP idiom", () => {
    expect(spelledToDigits("one thirty-eight over eighty-eight")).toBe("138 over 88");
    expect(spelledToDigits("a hundred and ten")).toBe("110");
    expect(spelledToDigits("about three weeks")).toBe("about 3 weeks");
    expect(spelledToDigits("twenty or maybe forty")).toBe("20 or maybe 40");
    expect(spelledToDigits("one twenty over eighty")).toBe("120 over 80");
  });

  it("normalizes decades and 'over'", () => {
    expect(normalizeSource("Mostly in the 130s.")).toContain("130");
    expect(normalizeSource("one thirty-eight over eighty-eight")).toBe("138 / 88");
  });

  it("finds numbers missing from the cited source", () => {
    expect(missingNumbers("BP 138/88.", ["Your blood pressure today is 138 over 88."])).toEqual([]);
    expect(missingNumbers("Dry cough x3 weeks.", ["dry, tickly cough for about three weeks"])).toEqual([]);
    expect(missingNumbers("Losartan 100 mg daily.", ["losartan, 50 milligrams once a day"])).toEqual(["100"]);
  });
});

const utterances: Utterance[] = [
  { id: "u1", speaker: "speaker_1", role: "patient", start: 0, end: 3, text: "I think it's the 20 milligram, or maybe 40?" },
  { id: "u2", speaker: "speaker_0", role: "clinician", start: 3, end: 6, text: "Your blood pressure today is 138 over 88." },
];
const byId = new Map(utterances.map((u) => [u.id, u]));
const sentence = (over: Partial<Sentence>): Sentence => ({
  id: "s1", problemId: "p1", section: "S", text: "x", sourceUtteranceIds: ["u1"], kind: "other",
  origin: "ai", review: "unreviewed", ...over,
});
const verdict = (over: Partial<SentenceVerdict>): SentenceVerdict => ({
  sentenceId: "s1", support: "supported", hedged: false, contradiction: false, reason: "", ...over,
});

describe("scoreSentence", () => {
  it("gives a supported sentence full confidence", () => {
    const s = sentence({ text: "BP 138/88.", sourceUtteranceIds: ["u2"], kind: "vital" });
    expect(scoreSentence(s, verdict({}), byId)).toEqual({ sentenceId: "s1", score: 1, reasons: [] });
  });

  it("flags the uncertain dose as unsure medication detail", () => {
    const s = sentence({ text: "Lisinopril 20 mg or possibly 40 mg daily; unsure of dose.", kind: "dose" });
    const r = scoreSentence(s, verdict({ support: "partial", hedged: true }), byId);
    expect(r.reasons).toEqual([REASONS.partial, REASONS.hedged, REASONS.medication]);
    expect(r.score).toBeCloseTo(0.2);
    expect(levelFor(r.score)).toBe("low");
  });

  it("hedged but supported lands in amber", () => {
    const r = scoreSentence(sentence({ text: "Unsure if lisinopril dose is 20 or 40 mg." }), verdict({ hedged: true }), byId);
    expect(r.score).toBe(0.75);
    expect(levelFor(r.score)).toBe("medium");
  });

  it("penalizes missing and invalid sources", () => {
    expect(scoreSentence(sentence({ sourceUtteranceIds: [] }), verdict({}), byId).score).toBe(0.1);
    const invalid = scoreSentence(sentence({ sourceUtteranceIds: ["u99"] }), verdict({}), byId);
    expect(invalid.score).toBe(0.1);
    expect(invalid.reasons).toContain(REASONS.invalidSource);
  });

  it("caps a sentence whose number isn't in the source", () => {
    const r = scoreSentence(sentence({ text: "BP 148/88.", sourceUtteranceIds: ["u2"] }), verdict({}), byId);
    expect(r.score).toBe(0.3);
    expect(r.reasons).toContain(REASONS.number);
  });

  it("applies unsupported and contradiction penalties and clamps at 0", () => {
    const r = scoreSentence(sentence({}), verdict({ support: "unsupported", contradiction: true }), byId);
    expect(r.score).toBe(0);
  });

  it("treats clinician-verified sentences as 1.0", () => {
    for (const over of [{ review: "accepted" as const }, { review: "edited" as const }, { origin: "clinician" as const, sourceUtteranceIds: [] }]) {
      expect(scoreSentence(sentence(over), verdict({ support: "unsupported" }), byId)).toMatchObject({ score: 1, reasons: [REASONS.verified] });
    }
  });
});

describe("scoreNote", () => {
  it("scores problems as 0.5·min + 0.5·mean and skips deleted sentences", () => {
    const note: Note = {
      chiefComplaint: "", speakerRoles: {},
      problems: [{ id: "p1", title: "HTN", status: "established" }],
      sentences: [
        sentence({ id: "s1", text: "BP 138/88.", sourceUtteranceIds: ["u2"] }),
        sentence({ id: "s2", text: "Unsure of dose." }),
        sentence({ id: "s3", text: "Deleted.", review: "deleted", sourceUtteranceIds: [] }),
      ],
    };
    const [p] = scoreNote(note, [verdict({ sentenceId: "s1" }), verdict({ sentenceId: "s2", hedged: true })], utterances);
    expect(p.sentenceScores.map((s) => s.sentenceId)).toEqual(["s1", "s2"]);
    expect(p.score).toBeCloseTo(0.5 * 0.75 + 0.5 * 0.875);
    expect(p.level).toBe("medium");
  });
});
