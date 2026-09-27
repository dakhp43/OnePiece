import type { ChatMessage } from "@/lib/snowflake";

export interface Turn { role: "user" | "assistant"; content: string }
export interface Source { id: string; title: string; content: string }

/** Where the articles came from, and who wrote the answer. */
export type Retrieval = "snowflake" | "cortex-search" | "app";
export type Writer = "cortex" | "gemini" | "article";

/** One line of the streamed reply from /api/help/chat (newline-delimited JSON). */
export type HelpEvent =
  | { type: "sources"; retrieval: Retrieval; writer: Writer; sources: { id: string; title: string }[] }
  | { type: "delta"; text: string }
  | { type: "done" };

const RULES = `You are the help assistant inside Carryover, a website clinicians use to record patient visits and write notes. Many people who ask are not comfortable with computers.

Answer ONLY from the help articles below.
- Use plain, friendly words and short sentences. No technical jargon.
- For "how do I" questions, give numbered steps and name buttons exactly as the articles do (for example "Start visit").
- Keep answers short: about 8 lines at most.
- If the articles don't answer the question, say you're not sure and suggest the Status page or asking the team. Never guess or invent buttons or features.
- You only help with using the website. If asked for medical advice, a diagnosis or treatment, say you can't help with medical questions and suggest asking a qualified clinician.
- Never ask for or repeat passwords or patient details.`;

/** The messages sent to Cortex: rules and retrieved articles, the last few turns, then the question. */
export function helpMessages(question: string, history: Turn[], sources: Source[]): ChatMessage[] {
  const articles = sources.map((s, i) => `[${i + 1}] ${s.title}\n${s.content}`).join("\n\n");
  return [
    { role: "system", content: `${RULES}\n\nHELP ARTICLES:\n${articles || "(none found)"}` },
    ...history.slice(-6).map((t) => ({ role: t.role, content: t.content.slice(0, 2000) })),
    { role: "user", content: question.slice(0, 2000) },
  ];
}
