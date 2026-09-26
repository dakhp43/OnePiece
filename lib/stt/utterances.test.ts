import { describe, expect, it } from "vitest";
import transcript from "@/data/fixtures/demo/transcript.json";
import type { Transcript } from "@/lib/contracts";
import { applySpeakerRoles, buildUtterances } from "./utterances";

const w = (text: string, start: number, end: number, speakerId = "speaker_0") =>
  ({ text, start, end, type: "word", speakerId });

describe("buildUtterances", () => {
  it("splits on speaker change and numbers utterances in order", () => {
    const u = buildUtterances({
      words: [w("Hello", 0, 0.4), { text: " ", type: "spacing" }, w("there.", 0.5, 0.9), w("Hi.", 1.2, 1.5, "speaker_1")],
    });
    expect(u.map((x) => [x.id, x.speaker, x.text])).toEqual([
      ["u1", "speaker_0", "Hello there."],
      ["u2", "speaker_1", "Hi."],
    ]);
    expect(u[0]).toMatchObject({ start: 0, end: 0.9, role: "unknown" });
  });

  it("splits on a pause longer than 1.2 s", () => {
    const u = buildUtterances({ words: [w("One.", 0, 0.5), w("Two.", 1.8, 2.2)] });
    expect(u).toHaveLength(2);
    const v = buildUtterances({ words: [w("One.", 0, 0.5), w("Two.", 1.6, 2.2)] });
    expect(v).toHaveLength(1);
  });

  it("splits long utterances only at sentence ends", () => {
    const words = Array.from({ length: 30 }, (_, i) => w(i === 27 ? "end." : "word", i * 0.3, i * 0.3 + 0.2));
    const u = buildUtterances({ words });
    expect(u).toHaveLength(2);
    expect(u[0].text.endsWith("end.")).toBe(true);
  });

  it("ignores audio events and supports snake_case speaker ids", () => {
    const u = buildUtterances({
      words: [
        { text: "(cough)", start: 0, end: 0.3, type: "audio_event", speaker_id: "speaker_1" },
        { text: "Yes.", start: 0.4, end: 0.6, type: "word", speaker_id: "speaker_1" },
      ],
    });
    expect(u).toEqual([{ id: "u1", speaker: "speaker_1", role: "unknown", start: 0.4, end: 0.6, text: "Yes." }]);
  });

  it("builds two-speaker utterances with increasing timestamps from the demo fixture", () => {
    const u = buildUtterances(transcript as Transcript);
    expect(new Set(u.map((x) => x.speaker))).toEqual(new Set(["speaker_0", "speaker_1"]));
    for (let i = 1; i < u.length; i++) expect(u[i].start).toBeGreaterThanOrEqual(u[i - 1].end);
    expect(u.find((x) => x.text.includes("maybe 40"))?.speaker).toBe("speaker_1");
  });
});

describe("applySpeakerRoles", () => {
  it("maps speakers to roles and leaves unknown speakers unknown", () => {
    const u = buildUtterances({ words: [w("Hi.", 0, 1), w("Hello.", 1.1, 2, "speaker_1"), w("Hey.", 2.1, 3, "speaker_2")] });
    const roles = applySpeakerRoles(u, { speaker_0: "clinician", speaker_1: "patient" }).map((x) => x.role);
    expect(roles).toEqual(["clinician", "patient", "unknown"]);
  });
});
