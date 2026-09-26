import { PatientSummarySchema, type PatientSummary } from "@/lib/contracts";
import { generateJson } from "@/lib/llm/gemini";

const SYSTEM = `You translate a patient's after-visit summary from English to Spanish.
RULES
- Translate faithfully. Do not add, remove, or soften any information.
- Keep drug names and doses exactly unchanged (e.g. "losartan 50 mg").
- Plain Latin-American Spanish at a 6th-grade reading level. Use "usted".
- Keep the same JSON structure and the same "change" enum values; set language to "es".`;

/** Call E. */
export async function translateSummary(summary: PatientSummary): Promise<PatientSummary> {
  const es = await generateJson({
    schema: PatientSummarySchema,
    system: SYSTEM,
    user: JSON.stringify(summary, null, 2),
    temperature: 0.1,
    label: "gemini:translate",
  });
  return { ...es, language: "es" };
}
