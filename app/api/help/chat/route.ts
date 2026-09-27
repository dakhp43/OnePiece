import { z } from "zod";
import { readJson, route } from "@/lib/api";
import { requireDoctorApi } from "@/lib/auth/current";
import { ttlCache } from "@/lib/help/cache";
import { withDeadline } from "@/lib/help/deadline";
import { geminiHelpStream } from "@/lib/help/gemini";
import { helpMessages, type HelpEvent, type Retrieval, type Writer } from "@/lib/help/prompt";
import { searchArticles, terms } from "@/lib/help/search";
import {
  cortexAnswer, cortexAvailable, cortexSearchEnabled, logHelpQuestion, searchHelp, searchHelpSql, snowflakeConfigured,
  type SearchHit,
} from "@/lib/snowflake";
import { reserveSnowflakeCall } from "@/lib/usage";

export const runtime = "nodejs";

const Turn = z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(2000) });
const Body = z.object({ messages: z.array(Turn).min(1).max(12) }).refine((b) => b.messages.at(-1)!.role === "user", "The last message must be a question");

const NOT_FOUND = "I couldn't find help on that. I can only explain how to use the Carryover website, not medical questions. Try asking another way, for example \"How do I start a visit?\"";

/**
 * A writer that hasn't started within 4.5 s (or stalls for 8 s) is dropped and the retrieved article is shown
 * instead, so an answer never takes much more than 5 s: Gemini's time to first words varies from under a
 * second to over 30 s.
 */
const FIRST_WORDS_MS = 4500;
const STALL_MS = 8000;

type Sources = { id: string; title: string }[];
/** Search results per set of search words (10 min), and whole answers to opening questions (1 h). */
const searchCache = ttlCache<{ hits: SearchHit[]; retrieval: Retrieval }>("search", 10 * 60_000);
const answerCache = ttlCache<{ text: string; sources: Sources; retrieval: Retrieval; writer: Writer }>("answers", 60 * 60_000);

/** Finds the help articles: in Snowflake (SQL API, or Cortex Search when enabled), else in the app. */
async function findArticles(question: string, key: string): Promise<{ hits: SearchHit[]; retrieval: Retrieval }> {
  const cached = searchCache.get(key);
  if (cached) return cached;
  if (snowflakeConfigured()) {
    try {
      reserveSnowflakeCall("help search");
      const found = cortexSearchEnabled()
        ? { hits: await searchHelp(question), retrieval: "cortex-search" as const }
        : { hits: await searchHelpSql(terms(question)), retrieval: "snowflake" as const };
      searchCache.set(key, found);
      return found;
    } catch (err) {
      console.warn("[help] Snowflake search failed, searching in the app:", (err as Error).message);
    }
  }
  return { hits: searchArticles(question).map((a) => ({ id: a.id, title: a.title, content: a.body })), retrieval: "app" };
}

/**
 * POST /api/help/chat — the "Help" assistant, retrieval-augmented. The help articles are found in Snowflake,
 * then the answer is written from them only and streamed: by Snowflake Cortex when the account allows it,
 * otherwise by Gemini, otherwise the best article is shown as is. Repeated opening questions are answered
 * from a short cache. Every question is logged to Snowflake for the Help insights panel. Replies stream as
 * newline-delimited JSON (lib/help/prompt.ts HelpEvent).
 */
export const POST = route(async (req: Request) => {
  await requireDoctorApi();
  const { messages } = await readJson(req, Body.parse);
  const question = messages.at(-1)!.content;
  const history = messages.slice(0, -1);
  const key = terms(question).join(" ") || question.toLowerCase();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: HelpEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
      const started = Date.now();
      const timing: string[] = [];
      let topArticle: string | null = null;
      let writer: Writer = "article";

      const cached = history.length === 0 ? answerCache.get(key) : undefined;
      if (cached) {
        send({ type: "sources", retrieval: cached.retrieval, writer: (writer = cached.writer), sources: cached.sources });
        send({ type: "delta", text: cached.text });
        topArticle = cached.sources[0]?.id ?? null;
        timing.push("cached answer");
      } else {
        const { hits, retrieval } = await findArticles(question, key);
        timing.push(`search ${Date.now() - started} ms (${retrieval})`);
        const sources = hits.map(({ id, title }) => ({ id, title }));
        const prompt = helpMessages(question, history, hits);
        topArticle = hits[0]?.id ?? null;
        let text = "";

        // Stream from Cortex, then Gemini; sources go out just before the first words, so the panel names them
        // at once and a refused writer never claims the answer.
        const writers: [Writer, () => AsyncGenerator<string>][] = [];
        if (hits.length && snowflakeConfigured() && cortexAvailable()) {
          writers.push(["cortex", () => {
            reserveSnowflakeCall("help answer");
            return cortexAnswer(prompt);
          }]);
        }
        if (hits.length && process.env.GEMINI_API_KEY) writers.push(["gemini", () => geminiHelpStream(prompt)]);
        for (const [name, write] of writers) {
          try {
            for await (const piece of withDeadline(write(), { firstMs: FIRST_WORDS_MS, idleMs: STALL_MS })) {
              if (!text) {
                send({ type: "sources", retrieval, writer: (writer = name), sources });
                timing.push(`first words ${Date.now() - started} ms (${name})`);
              }
              text += piece;
              send({ type: "delta", text: piece });
            }
          } catch (err) {
            console.warn(`[help] ${name} unavailable:`, (err as Error).message);
          }
          if (text) break;
        }
        if (!text) {
          const best = hits[0];
          text = best ? best.content : NOT_FOUND;
          send({ type: "sources", retrieval, writer: (writer = "article"), sources: best ? [{ id: best.id, title: best.title }] : [] });
          send({ type: "delta", text });
        }
        if (history.length === 0 && hits.length) answerCache.set(key, { text, sources, retrieval, writer });
      }
      send({ type: "done" });
      controller.close();
      console.log(`[help] ${timing.join(" · ")} · done ${Date.now() - started} ms`);

      if (snowflakeConfigured()) {
        try {
          reserveSnowflakeCall("help log");
          await logHelpQuestion({ question, topArticle, answeredBy: writer });
        } catch (err) {
          console.warn("[help] couldn't log the question to Snowflake:", (err as Error).message);
        }
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
});
