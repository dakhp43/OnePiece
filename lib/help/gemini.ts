import { streamText } from "@/lib/llm/gemini";
import type { ChatMessage } from "@/lib/llm/snowflake";

/**
 * Streams the help answer from Gemini, using the same grounded prompt Cortex gets (rules + retrieved articles),
 * for accounts where Snowflake Cortex isn't available. Uses the faster fallback model when one is set.
 */
export function geminiHelpStream(messages: ChatMessage[]): AsyncGenerator<string> {
  const [system, ...turns] = messages;
  const user = turns.map((t) => `${t.role === "assistant" ? "Your earlier answer" : "Question"}: ${t.content}`).join("\n\n");
  return streamText({ system: system.content, user, label: "gemini:help", model: process.env.GEMINI_FALLBACK_MODEL || undefined });
}
