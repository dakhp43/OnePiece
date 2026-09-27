import { ExternalError, withRetry } from "@/lib/http";
import { reserveSnowflakeCall } from "@/lib/usage";

/**
 * The one Snowflake client, used by the Help assistant and the patient chat ("Ask about this patient"), through
 * Snowflake's REST APIs with a programmatic access token (PAT). Server-only: the token never reaches the browser.
 * - SQL API (`/api/v2/statements`): the help articles live in Snowflake (`npm run help:sync`), each question
 *   is answered from a ranked keyword search run in Snowflake, and every question is logged there for the
 *   Help insights panel. Works on trial accounts.
 * - Cortex writes the answer when the account allows it: the Cortex REST API (streamed) or SNOWFLAKE.CORTEX.
 *   COMPLETE through the SQL API. Trial accounts without a card get neither; the app then uses Gemini.
 * - Optionally, Cortex Search finds the articles instead (paid accounts, SNOWFLAKE_CORTEX_SEARCH=true).
 * See scripts/snowflake/setup.sql.
 */
export const SNOWFLAKE = {
  database: "CARRYOVER_HELP",
  schema: "APP",
  table: "CARRYOVER_HELP.APP.HELP_ARTICLES",
  questionsTable: "CARRYOVER_HELP.APP.HELP_QUESTIONS",
  searchService: "HELP_SEARCH",
  warehouse: "CARRYOVER_WH",
  role: "CARRYOVER_HELP_ROLE",
} as const;

export const snowflakeModel = () => process.env.SNOWFLAKE_CHAT_MODEL || process.env.SNOWFLAKE_MODEL || "claude-haiku-4-5";
const warehouse = () => process.env.SNOWFLAKE_WAREHOUSE || SNOWFLAKE.warehouse;

/** SNOWFLAKE_ACCOUNT_URL, or just the account identifier in SNOWFLAKE_ACCOUNT. */
function credentials() {
  const account = process.env.SNOWFLAKE_ACCOUNT?.trim();
  const url = process.env.SNOWFLAKE_ACCOUNT_URL?.trim().replace(/\/+$/, "") || (account ? `https://${account}.snowflakecomputing.com` : "");
  const token = process.env.SNOWFLAKE_PAT?.trim();
  return url && token ? { url, token } : null;
}

export const snowflakeEnabled = () => credentials() !== null;

/** Retrieval with Cortex Search (paid accounts, after the optional setup and `npm run help:sync`). */
export const cortexSearchEnabled = () => process.env.SNOWFLAKE_CORTEX_SEARCH === "true";

async function call(path: string, { method = "POST", body, accept = "application/json", timeoutMs = 20_000 }: {
  method?: string; body?: unknown; accept?: string; timeoutMs?: number;
} = {}): Promise<Response> {
  const c = credentials();
  if (!c) throw new ExternalError("snowflake", null, "SNOWFLAKE_ACCOUNT_URL and SNOWFLAKE_PAT are not set");
  const res = await fetch(`${c.url}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${c.token}`,
      "X-Snowflake-Authorization-Token-Type": "PROGRAMMATIC_ACCESS_TOKEN",
      "Content-Type": "application/json",
      Accept: accept,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = text;
    try {
      const j = JSON.parse(text);
      message = j.message ?? j.error?.message ?? text;
    } catch {
      // not JSON
    }
    throw new ExternalError("snowflake", res.status, `${path.split("?")[0]} → ${res.status} ${String(message).slice(0, 200)}`);
  }
  return res;
}

export interface SearchHit { id: string; title: string; content: string }

const lowerKeys = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase(), v]));

/** Cortex Search: the help articles most relevant to `query`. */
export async function searchHelp(query: string, limit = 4): Promise<SearchHit[]> {
  const { database, schema, searchService } = SNOWFLAKE;
  const res = await withRetry("snowflake:search", () => call(
    `/api/v2/databases/${database}/schemas/${schema}/cortex-search-services/${searchService}:query`,
    { body: { query, columns: ["ARTICLE_ID", "TITLE", "CONTENT"], limit } },
  ), { retries: 2 });
  const json = (await res.json()) as { results?: Record<string, unknown>[] };
  return (json.results ?? [])
    .map(lowerKeys)
    .map((r) => ({ id: String(r.article_id ?? ""), title: String(r.title ?? ""), content: String(r.content ?? "") }))
    .filter((hit) => hit.content && hit.id !== "welcome");
}

export interface ChatMessage { role: "system" | "user" | "assistant"; content: string }

/**
 * Splits a server-sent-events buffer into complete events. Returns the text deltas they carry (OpenAI-style
 * `choices[0].delta.content`) and the unfinished remainder to prepend to the next chunk.
 */
export function parseSse(buffer: string): { deltas: string[]; rest: string } {
  const events = buffer.split(/\r?\n\r?\n/);
  const rest = events.pop() ?? "";
  const deltas: string[] = [];
  for (const event of events) {
    for (const line of event.split(/\r?\n/)) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const j = JSON.parse(data);
        const text = j?.choices?.[0]?.delta?.content ?? j?.choices?.[0]?.message?.content;
        if (typeof text === "string" && text) deltas.push(text);
      } catch {
        // keep-alive or partial line: ignore
      }
    }
  }
  return { deltas, rest };
}

/** Cortex chat completions, streamed: yields the answer text as it is written. */
export async function* streamChat(messages: ChatMessage[], { maxTokens = 600 } = {}): AsyncGenerator<string> {
  const res = await withRetry("snowflake:chat", () => call("/api/v2/cortex/v1/chat/completions", {
    body: { model: snowflakeModel(), messages, stream: true, temperature: 0.2, max_completion_tokens: maxTokens },
    accept: "text/event-stream",
    timeoutMs: 60_000,
  }), { retries: 1 });
  if ((res.headers.get("content-type") ?? "").includes("application/json")) {
    // Some deployments answer in one piece even when asked to stream.
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = j.choices?.[0]?.message?.content;
    if (text) yield text;
    return;
  }
  if (!res.body) return;
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    const { deltas, rest } = parseSse(buffer);
    buffer = rest;
    for (const d of deltas) yield d;
  }
  for (const d of parseSse(`${buffer}\n\n`).deltas) yield d;
}

type Binding = { type: "TEXT"; value: string };
const text = (value: string): Binding => ({ type: "TEXT", value });

interface SqlResult { statementHandle?: string; message?: string; data?: (string | null)[][] }

/**
 * Runs one statement through the SQL API as the app's role, waiting (briefly) if Snowflake runs it async.
 * `context` defaults to the help tables' database and schema.
 */
export async function runSql(
  statement: string,
  bindings?: Record<string, Binding>,
  context: { database?: string; schema?: string; warehouse: string; role: string } = { ...SNOWFLAKE, warehouse: warehouse() },
): Promise<SqlResult> {
  const { database, schema, warehouse, role } = context;
  const res = await call("/api/v2/statements", { body: { statement, bindings, database, schema, warehouse, role, timeout: 60 }, timeoutMs: 70_000 });
  let json = (await res.json()) as SqlResult;
  for (let i = 0; res.status === 202 && i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const poll = await call(`/api/v2/statements/${json.statementHandle}`, { method: "GET" });
    json = await poll.json();
    if (poll.status === 200) break;
  }
  return json;
}

/** COMPLETE returns a JSON string ({ choices: [{ messages }] }) when called with options; plain text otherwise. */
export function completeText(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { choices?: { messages?: string }[] };
    const answer = parsed.choices?.[0]?.messages;
    if (typeof answer === "string") return answer;
  } catch {
    // plain text
  }
  return raw;
}

/** SNOWFLAKE.CORTEX.COMPLETE through the SQL API: the same models, for accounts that can't use the Cortex REST API. */
export async function completeViaSql(messages: ChatMessage[], { maxTokens = 600 } = {}): Promise<string> {
  const json = await runSql(
    "SELECT SNOWFLAKE.CORTEX.COMPLETE(?, PARSE_JSON(?), PARSE_JSON(?)) AS ANSWER",
    { "1": text(snowflakeModel()), "2": text(JSON.stringify(messages)), "3": text(JSON.stringify({ temperature: 0.2, max_tokens: maxTokens })) },
    { warehouse: warehouse(), role: SNOWFLAKE.role },
  );
  const raw = json.data?.[0]?.[0];
  if (!raw) throw new ExternalError("snowflake", null, "COMPLETE returned no answer");
  return completeText(raw);
}

const g = globalThis as unknown as { __cortexRestBlocked?: boolean; __cortexOffUntil?: number; __cortexLastError?: string };

/** After Snowflake refuses Cortex (e.g. trial accounts), skip it for an hour instead of paying a failed call per question. */
const CORTEX_RETRY_MS = 60 * 60_000;
/** SNOWFLAKE_CORTEX=off skips Cortex entirely (accounts known not to allow it, such as trials without a card). */
export const cortexEnabled = () => process.env.SNOWFLAKE_CORTEX !== "off";
export const cortexAvailable = () => cortexEnabled() && (!g.__cortexOffUntil || Date.now() > g.__cortexOffUntil);

/** Why Cortex last refused (e.g. "not available for trial accounts"), for the Status page. */
export const lastCortexError = () => g.__cortexLastError;

/**
 * The answer from Cortex: streamed from the Cortex REST API, or in one piece through the SQL API once
 * Snowflake has refused the REST endpoint for this account (403, e.g. trial accounts). Remembered per process.
 */
export async function* cortexAnswer(messages: ChatMessage[], options: { maxTokens?: number } = {}): AsyncGenerator<string> {
  try {
    if (!g.__cortexRestBlocked) {
      try {
        yield* streamChat(messages, options);
        g.__cortexLastError = undefined;
        return;
      } catch (err) {
        if (!(err instanceof ExternalError && err.status === 403)) throw err;
        g.__cortexRestBlocked = true;
        console.warn("[snowflake] Cortex REST API not allowed for this account; answering through the SQL API");
      }
    }
    yield await completeViaSql(messages, options);
    g.__cortexLastError = undefined;
  } catch (err) {
    g.__cortexLastError = (err as Error).message;
    const status = err instanceof ExternalError ? err.status : null;
    if (status === 403 || status === 422) g.__cortexOffUntil = Date.now() + CORTEX_RETRY_MS;
    throw err;
  }
}

/**
 * Ranked keyword search over the help articles, run inside Snowflake: each search word found in the title
 * scores 3, in the body 1. `words` are already normalised (lib/help/search.ts `terms`).
 */
export async function searchHelpSql(words: string[], limit = 3): Promise<SearchHit[]> {
  if (words.length === 0) return [];
  const json = await runSql(
    `WITH Q AS (SELECT DISTINCT VALUE AS TERM FROM TABLE(SPLIT_TO_TABLE(?, ' ')) WHERE VALUE <> '')
     SELECT A.ARTICLE_ID, A.TITLE, A.CONTENT,
            SUM(IFF(CONTAINS(LOWER(A.TITLE), Q.TERM), 3, 0) + IFF(CONTAINS(LOWER(A.CONTENT), Q.TERM), 1, 0)) AS SCORE
     FROM ${SNOWFLAKE.table} A CROSS JOIN Q
     WHERE A.ARTICLE_ID <> 'welcome'
     GROUP BY A.ARTICLE_ID, A.TITLE, A.CONTENT
     HAVING SCORE > 0
     ORDER BY SCORE DESC, A.ARTICLE_ID
     LIMIT ${Math.max(1, Math.min(10, Math.floor(limit)))}`,
    { "1": text(words.slice(0, 12).join(" ")) },
  );
  return (json.data ?? []).map(([id, title, content]) => ({ id: String(id), title: String(title), content: String(content) }));
}

const w = globalThis as unknown as { __warmedAt?: number };

/**
 * Wakes the warehouse when someone opens the Help panel, so their first question doesn't wait for it to
 * resume. Skipped if it was woken in the last 4 minutes. The filter makes the query need the warehouse.
 */
export async function warmWarehouse() {
  if (w.__warmedAt && Date.now() - w.__warmedAt < 4 * 60_000) return false;
  w.__warmedAt = Date.now();
  await runSql(`SELECT COUNT(*) FROM ${SNOWFLAKE.table} WHERE ARTICLE_ID <> ''`);
  return true;
}

/** Logs a help question to Snowflake (no user name or id) for the Help insights panel. */
export async function logHelpQuestion({ question, topArticle, answeredBy }: { question: string; topArticle: string | null; answeredBy: string }) {
  await runSql(
    `INSERT INTO ${SNOWFLAKE.questionsTable} (QUESTION, TOP_ARTICLE, ANSWERED_BY) VALUES (?, NULLIF(?, ''), ?)`,
    { "1": text(question.slice(0, 500)), "2": text(topArticle ?? ""), "3": text(answeredBy) },
  );
}

export interface HelpInsights {
  days: number;
  total: number;
  topics: { articleId: string; count: number }[];
  unanswered: { question: string; askedAt: string }[];
}

/** Turns the two insight queries' rows (SQL API returns every value as a string) into totals and lists. */
export function parseInsights(days: number, topicRows: (string | null)[][], unansweredRows: (string | null)[][]): HelpInsights {
  const counts = topicRows.map(([id, n]) => ({ articleId: id ?? "", count: Number(n) || 0 }));
  return {
    days,
    total: counts.reduce((sum, c) => sum + c.count, 0),
    topics: counts.filter((c) => c.articleId).slice(0, 5),
    unanswered: unansweredRows.map(([question, askedAt]) => ({ question: question ?? "", askedAt: askedAt ?? "" })),
  };
}

/** What people asked the help in the last `days` days: most common topics and questions it couldn't answer. */
export async function helpInsights(days = 7): Promise<HelpInsights> {
  const since = `DATEADD(day, -${Math.floor(days)}, CURRENT_TIMESTAMP())`;
  const [topics, unanswered] = await Promise.all([
    runSql(`SELECT COALESCE(TOP_ARTICLE, '') AS TOPIC, COUNT(*) AS N FROM ${SNOWFLAKE.questionsTable}
            WHERE ASKED_AT >= ${since} GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 20`),
    runSql(`SELECT QUESTION, TO_VARCHAR(ASKED_AT, 'YYYY-MM-DD HH24:MI') FROM ${SNOWFLAKE.questionsTable}
            WHERE ASKED_AT >= ${since} AND TOP_ARTICLE IS NULL ORDER BY ASKED_AT DESC LIMIT 5`),
  ]);
  return parseInsights(days, topics.data ?? [], unanswered.data ?? []);
}

/**
 * One Cortex reply as a single string (the patient chat). Throws when Cortex is off or refuses, so the caller
 * can answer with Gemini instead.
 */
export async function cortexChat(messages: ChatMessage[], { maxTokens = 600 }: { maxTokens?: number } = {}): Promise<string> {
  if (!cortexAvailable()) throw new ExternalError("snowflake", null, lastCortexError() ?? "Cortex is off (SNOWFLAKE_CORTEX=off)");
  reserveSnowflakeCall("patient chat");
  let reply = "";
  for await (const piece of cortexAnswer(messages, { maxTokens })) reply += piece;
  if (!reply.trim()) throw new ExternalError("snowflake", null, "empty response");
  return reply.trim();
}

/** Free readiness check for the Status page: does Snowflake accept the token? (Lists visible databases.) */
export async function snowflakeReachable() {
  await call("/api/v2/databases", { method: "GET", timeoutMs: 6000 });
}
