import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, readJson, route } from "@/lib/api";
import { loadPatient } from "@/lib/access";
import { requireDoctorApi } from "@/lib/auth/current";
import { generateJson } from "@/lib/llm/gemini";
import { copilotModel } from "@/lib/llm/prompts/liveFollowUp";
import { cortexChat, snowflakeEnabled, type ChatMessage } from "@/lib/llm/snowflake";
import { chartContextText, loadChartContext } from "@/lib/memory/chart";

export const runtime = "nodejs";

const Body = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(2000) })).min(1).max(12),
});

const SYSTEM = `You are an assistant for a doctor, answering questions about ONE patient using only the chart below.
- Answer only from the chart. If the answer isn't in it, say "That isn't in the chart." Never guess or invent.
- Be brief: 1-4 sentences or a short list. Mention dates and doses exactly as written.
- Don't make diagnoses or treatment decisions; the doctor decides.`;

const GeminiReply = z.object({ reply: z.string().min(1).max(4000) });

/** Stand-in when Snowflake can't answer (Cortex is blocked on trial accounts). Lite model, to spare the main one's quota. */
async function geminiChat(messages: ChatMessage[]) {
  const [system, ...turns] = messages;
  const user = turns.map((m) => `${m.role === "user" ? "DOCTOR" : "ASSISTANT"}: ${m.content}`).join("\n\n");
  const { reply } = await generateJson({
    schema: GeminiReply,
    system: `${system.content}\n\nReply to the doctor's last message. Return {"reply": "..."}.`,
    user, temperature: 0.2, retries: 0, model: copilotModel(), label: "gemini:chat",
  });
  return reply;
}

/**
 * "Ask about this patient": answers from this patient's chart only. Snowflake Cortex is tried first; if it
 * refuses or fails, Gemini answers instead. Each reply says which one produced it.
 */
export const POST = route(async (req: Request, ctx: RouteContext<"/api/patients/[patientId]/chat">) => {
  const { patientId } = await ctx.params;
  const session = await requireDoctorApi();
  if (!snowflakeEnabled() && !process.env.GEMINI_API_KEY) throw new ApiError(503, "The chat isn't configured");
  const { messages } = await readJson(req, Body.parse);
  const patient = await loadPatient(patientId, session.doctorId);
  const chart = chartContextText(patient, await loadChartContext(patient));
  const conditions = patient.conditions.length ? `\nKnown conditions: ${patient.conditions.join(", ")}.` : "";
  const convo: ChatMessage[] = [{ role: "system", content: `${SYSTEM}\n\nCHART:\n${chart}${conditions}` }, ...messages];

  if (snowflakeEnabled()) {
    try {
      return NextResponse.json({ reply: await cortexChat(convo), source: "snowflake" });
    } catch (err) {
      console.warn("[chat] Snowflake Cortex unavailable, using Gemini:", (err as Error).message.slice(0, 200));
    }
  }
  return NextResponse.json({ reply: await geminiChat(convo), source: "gemini" });
});
