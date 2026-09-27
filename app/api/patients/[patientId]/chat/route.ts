import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, readJson, route } from "@/lib/api";
import { loadPatient } from "@/lib/access";
import { requireDoctorApi } from "@/lib/auth/current";
import { cortexChat, snowflakeEnabled } from "@/lib/llm/snowflake";
import { chartContextText, loadChartContext } from "@/lib/memory/chart";

export const runtime = "nodejs";

const Body = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(2000) })).min(1).max(12),
});

const SYSTEM = `You are an assistant for a doctor, answering questions about ONE patient using only the chart below.
- Answer only from the chart. If the answer isn't in it, say "That isn't in the chart." Never guess or invent.
- Be brief: 1-4 sentences or a short list. Mention dates and doses exactly as written.
- Don't make diagnoses or treatment decisions; the doctor decides.`;

/** "Ask about this patient": Snowflake Cortex answers from this patient's chart only. */
export const POST = route(async (req: Request, ctx: RouteContext<"/api/patients/[patientId]/chat">) => {
  const { patientId } = await ctx.params;
  const session = await requireDoctorApi();
  if (!snowflakeEnabled()) throw new ApiError(503, "The Snowflake chat isn't configured");
  const { messages } = await readJson(req, Body.parse);
  const patient = await loadPatient(patientId, session.doctorId);
  const chart = chartContextText(patient, await loadChartContext(patient));
  const conditions = patient.conditions.length ? `\nKnown conditions: ${patient.conditions.join(", ")}.` : "";
  const reply = await cortexChat([
    { role: "system", content: `${SYSTEM}\n\nCHART:\n${chart}${conditions}` },
    ...messages,
  ]);
  return NextResponse.json({ reply });
});
