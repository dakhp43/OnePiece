import { GoogleGenAI } from "@google/genai";
import { z, type ZodType } from "zod";
import { ExternalError, isRetryable, statusOf, withRetry } from "@/lib/http";

let ai: GoogleGenAI | null = null;
function client() {
  if (!process.env.GEMINI_API_KEY) throw new ExternalError("gemini", null, "GEMINI_API_KEY is not set");
  ai ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return ai;
}

/** JSON Schema for Gemini's responseJsonSchema (drops the $schema meta key). */
export function jsonSchemaFor(schema: ZodType): Record<string, unknown> {
  const { $schema: _meta, ...rest } = z.toJSONSchema(schema, { io: "output" }) as Record<string, unknown>;
  void _meta;
  return rest;
}

interface GenerateArgs<T> {
  schema: ZodType<T>;
  system: string;
  user: string;
  temperature?: number;
  label?: string;
}

/**
 * Structured JSON generation validated with Zod.
 * - 429/5xx: exponential backoff (1 s, 2 s, 4 s), then GEMINI_FALLBACK_MODEL.
 * - Zod validation failure: one retry with the validation error appended.
 * - If the API rejects the JSON schema itself (400), retries once with the schema in the prompt instead.
 */
export async function generateJson<T>({ schema, system, user, temperature = 0.2, label = "gemini" }: GenerateArgs<T>): Promise<T> {
  const primary = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const fallback = process.env.GEMINI_FALLBACK_MODEL;
  const jsonSchema = jsonSchemaFor(schema);

  const call = async (model: string, prompt: string, withSchema: boolean) => {
    const res = await client().models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction: withSchema ? system : `${system}\n\nReturn ONLY JSON matching this JSON Schema:\n${JSON.stringify(jsonSchema)}`,
        responseMimeType: "application/json",
        ...(withSchema ? { responseJsonSchema: jsonSchema } : {}),
        temperature,
      },
    });
    const u = res.usageMetadata;
    console.log(`[${label}] ${model} tokens in=${u?.promptTokenCount ?? "?"} out=${u?.candidatesTokenCount ?? "?"}`);
    if (!res.text) throw new ExternalError("gemini", null, "empty response");
    return res.text;
  };

  const callWithFallbacks = async (prompt: string) => {
    let withSchema = true;
    const attempt = async (model: string) => {
      try {
        return await withRetry(label, () => call(model, prompt, withSchema));
      } catch (err) {
        if (withSchema && statusOf(err) === 400) {
          console.warn(`[${label}] 400 with responseJsonSchema (${(err as Error).message.slice(0, 120)}); retrying with schema in prompt`);
          withSchema = false;
          return withRetry(label, () => call(model, prompt, false));
        }
        throw err;
      }
    };
    try {
      return await attempt(primary);
    } catch (err) {
      if (fallback && fallback !== primary && isRetryable(err)) {
        console.warn(`[${label}] ${primary} failed; trying fallback ${fallback}`);
        return attempt(fallback);
      }
      throw err;
    }
  };

  const parse = (text: string) => {
    let json: unknown;
    try {
      json = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
    } catch {
      return { ok: false as const, error: "Response was not valid JSON." };
    }
    const r = schema.safeParse(json);
    return r.success ? { ok: true as const, data: r.data } : { ok: false as const, error: z.prettifyError(r.error) };
  };

  const first = parse(await callWithFallbacks(user));
  if (first.ok) return first.data;
  console.warn(`[${label}] validation failed; retrying once:`, first.error.slice(0, 300));
  const second = parse(await callWithFallbacks(
    `${user}\n\nYour previous response did not match the required schema:\n${first.error}\nReturn corrected JSON only.`,
  ));
  if (second.ok) return second.data;
  throw new ExternalError("gemini", null, `invalid structured output: ${second.error.slice(0, 300)}`);
}
