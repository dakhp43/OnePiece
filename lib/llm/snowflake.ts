import { ExternalError } from "@/lib/http";
import { reserveSnowflakeCall } from "@/lib/usage";

/**
 * Snowflake Cortex through its OpenAI-compatible Chat Completions endpoint, authenticated with a
 * Programmatic Access Token. Server-only: the token never reaches the browser.
 */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export function snowflakeEnabled() {
  return Boolean(process.env.SNOWFLAKE_ACCOUNT && process.env.SNOWFLAKE_PAT);
}

export function snowflakeModel() {
  return process.env.SNOWFLAKE_MODEL || "llama3.1-70b";
}

export async function cortexChat(messages: ChatMessage[], { maxTokens = 600 }: { maxTokens?: number } = {}): Promise<string> {
  const account = process.env.SNOWFLAKE_ACCOUNT;
  const pat = process.env.SNOWFLAKE_PAT;
  if (!account || !pat) throw new ExternalError("snowflake", null, "SNOWFLAKE_ACCOUNT and SNOWFLAKE_PAT are not set");
  reserveSnowflakeCall();
  const res = await fetch(`https://${account}.snowflakecomputing.com/api/v2/cortex/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${pat}`,
      "X-Snowflake-Authorization-Token-Type": "PROGRAMMATIC_ACCESS_TOKEN",
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ model: snowflakeModel(), messages, max_completion_tokens: maxTokens, temperature: 0.2 }),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (!res.ok) throw new ExternalError("snowflake", res.status, text.slice(0, 300) || res.statusText);
  const json = JSON.parse(text) as { choices?: { message?: { content?: string } }[] };
  const reply = json.choices?.[0]?.message?.content?.trim();
  if (!reply) throw new ExternalError("snowflake", null, "empty response");
  return reply;
}
