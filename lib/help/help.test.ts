import { describe, expect, it } from "vitest";
import { parseSse } from "@/lib/snowflake";
import { HELP_ARTICLES, SUGGESTED_QUESTIONS } from "./articles";
import { helpMessages } from "./prompt";
import { searchArticles } from "./search";

describe("help articles", () => {
  it("have unique ids and real content", () => {
    expect(new Set(HELP_ARTICLES.map((a) => a.id)).size).toBe(HELP_ARTICLES.length);
    for (const a of HELP_ARTICLES) expect(a.body.length).toBeGreaterThan(150);
  });
});

describe("local help search (used when Snowflake is off)", () => {
  it.each([
    [SUGGESTED_QUESTIONS[0], "start-visit"],
    [SUGGESTED_QUESTIONS[1], "recording"],
    [SUGGESTED_QUESTIONS[2], "review-note"],
    [SUGGESTED_QUESTIONS[3], "follow-through"],
    [SUGGESTED_QUESTIONS[4], "open-items"],
    ["how do i sign out", "sign-in"],
    ["make the text bigger", "appearance"],
  ])("%s -> %s", (question, id) => {
    expect(searchArticles(question)[0]?.id).toBe(id);
  });

  it("finds nothing for unrelated words", () => {
    expect(searchArticles("zebra quantum")).toEqual([]);
    expect(searchArticles("how do I")).toEqual([]);
  });
});

describe("help prompt", () => {
  const sources = [{ id: "start-visit", title: "Starting a visit", content: "Click Start visit." }];

  it("grounds the answer in the retrieved articles and refuses medical advice", () => {
    const [system] = helpMessages("How do I start?", [], sources);
    expect(system.role).toBe("system");
    expect(system.content).toContain("[1] Starting a visit\nClick Start visit.");
    expect(system.content).toMatch(/medical advice/);
  });

  it("keeps the last six turns and ends with the question", () => {
    const history = Array.from({ length: 10 }, (_, i) => ({ role: (i % 2 ? "assistant" : "user") as "user" | "assistant", content: `turn ${i}` }));
    const messages = helpMessages("And then?", history, sources);
    expect(messages).toHaveLength(1 + 6 + 1);
    expect(messages[1].content).toBe("turn 4");
    expect(messages.at(-1)).toEqual({ role: "user", content: "And then?" });
  });
});

describe("Cortex stream parsing", () => {
  const event = (text: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;

  it("reads complete events and keeps a partial one for the next chunk", () => {
    const full = event("Click ") + event("Start visit.");
    const first = parseSse(full.slice(0, full.length - 10));
    expect(first.deltas).toEqual(["Click "]);
    const second = parseSse(first.rest + full.slice(full.length - 10));
    expect(second.deltas).toEqual(["Start visit."]);
    expect(second.rest).toBe("");
  });

  it("ignores [DONE], keep-alives and non-JSON lines", () => {
    expect(parseSse(`: keep-alive\n\n${event("Hi")}data: [DONE]\n\ndata: not json\n\n`).deltas).toEqual(["Hi"]);
  });
});

describe("Cortex COMPLETE result (SQL API path)", () => {
  it("reads choices[0].messages from the JSON COMPLETE returns with options, else keeps plain text", async () => {
    const { completeText } = await import("@/lib/snowflake");
    expect(completeText(JSON.stringify({ choices: [{ messages: "Click Start visit." }], usage: {} }))).toBe("Click Start visit.");
    expect(completeText("Plain answer")).toBe("Plain answer");
    expect(completeText(JSON.stringify({ other: 1 }))).toBe(JSON.stringify({ other: 1 }));
  });
});

describe("Help insights (rows from the Snowflake SQL API)", () => {
  it("totals every question, lists answered topics, keeps unanswered questions", async () => {
    const { parseInsights } = await import("@/lib/snowflake");
    const insights = parseInsights(7, [["start-visit", "3"], ["", "2"], ["review-note", "1"]], [["can you prescribe antibiotics?", "2026-09-27 08:30"]]);
    expect(insights.total).toBe(6);
    expect(insights.topics).toEqual([{ articleId: "start-visit", count: 3 }, { articleId: "review-note", count: 1 }]);
    expect(insights.unanswered).toEqual([{ question: "can you prescribe antibiotics?", askedAt: "2026-09-27 08:30" }]);
  });
});

describe("answer deadline", () => {
  async function* pieces(delays: number[]) {
    for (const [i, ms] of delays.entries()) {
      await new Promise((r) => setTimeout(r, ms));
      yield `p${i}`;
    }
  }
  const collect = async (gen: AsyncGenerator<string>) => {
    const out: string[] = [];
    for await (const x of gen) out.push(x);
    return out;
  };

  it("passes everything through when the writer is quick", async () => {
    const { withDeadline } = await import("./deadline");
    expect(await collect(withDeadline(pieces([5, 5, 5]), { firstMs: 100, idleMs: 100 }))).toEqual(["p0", "p1", "p2"]);
  });

  it("gives up when the first words are late, or the stream stalls", async () => {
    const { withDeadline } = await import("./deadline");
    await expect(collect(withDeadline(pieces([200]), { firstMs: 30, idleMs: 100 }))).rejects.toThrow(/first words/);
    const seen: string[] = [];
    await expect((async () => { for await (const x of withDeadline(pieces([5, 200]), { firstMs: 100, idleMs: 30 })) seen.push(x); })()).rejects.toThrow(/progress/);
    expect(seen).toEqual(["p0"]);
  });
});
