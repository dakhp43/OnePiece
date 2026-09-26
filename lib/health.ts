import { sql } from "drizzle-orm";
import { getDb, usingPglite } from "@/lib/db";
import { demoFallbackEnabled } from "@/lib/fixtures";
import { backboardEnabled } from "@/lib/memory/backboard";
import { LIMITS, readUsage } from "@/lib/usage";

/**
 * Pre-demo readiness check. Makes no billable calls: DB ping, ElevenLabs subscription,
 * Gemini model metadata, Backboard balance, and email config only.
 */
export interface Health {
  checkedAt: string;
  db: { ok: boolean; driver: "tiger" | "pglite"; latencyMs: number | null; hypertables: string[]; error?: string };
  elevenlabs: { configured: boolean; ok: boolean; tier?: string; creditsUsed?: number; creditLimit?: number; model: string; error?: string };
  gemini: { configured: boolean; ok: boolean; model: string; fallbackModel: string | null; fallbackOk?: boolean; error?: string };
  backboard: { enabled: boolean; configured: boolean; ok: boolean; balanceUsd?: number; autoReload?: boolean; error?: string };
  email: { provider: string; configured: boolean };
  usage: { today: ReturnType<typeof readUsage>; limits: { geminiCalls: number; sttMinutes: number; maxRecordingMinutes: number } };
  demoFallback: boolean;
}

const TIMEOUT_MS = 6000;
const errMsg = (e: unknown) => ((e as Error)?.name === "TimeoutError" ? "timed out" : (e as Error)?.message ?? String(e)).slice(0, 200);

async function checkDb(): Promise<Health["db"]> {
  const driver = usingPglite() ? "pglite" : "tiger";
  try {
    const db = await getDb();
    const t = Date.now();
    await db.execute(sql`select 1`);
    const latencyMs = Date.now() - t;
    let hypertables: string[] = [];
    try {
      const r = await db.execute(sql`select hypertable_name from timescaledb_information.hypertables order by 1`);
      hypertables = r.rows.map((row) => String((row as { hypertable_name: string }).hypertable_name));
    } catch {
      // TimescaleDB not installed (PGlite): no hypertables.
    }
    return { ok: true, driver, latencyMs, hypertables };
  } catch (e) {
    return { ok: false, driver, latencyMs: null, hypertables: [], error: errMsg(e) };
  }
}

async function checkElevenLabs(): Promise<Health["elevenlabs"]> {
  const model = process.env.ELEVENLABS_STT_MODEL || "scribe_v2_medical";
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return { configured: false, ok: false, model };
  try {
    const r = await fetch("https://api.elevenlabs.io/v1/user/subscription", {
      headers: { "xi-api-key": key }, signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) return { configured: true, ok: false, model, error: `HTTP ${r.status}` };
    const j = await r.json();
    return { configured: true, ok: true, model, tier: j.tier, creditsUsed: j.character_count, creditLimit: j.character_limit };
  } catch (e) {
    return { configured: true, ok: false, model, error: errMsg(e) };
  }
}

async function geminiModelOk(model: string, key: string) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`, {
    headers: { "x-goog-api-key": key }, signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (r.ok) return { ok: true as const };
  const j = await r.json().catch(() => ({}));
  return { ok: false as const, error: `${model}: HTTP ${r.status} ${j?.error?.message ?? ""}`.trim() };
}

async function checkGemini(): Promise<Health["gemini"]> {
  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const fallbackModel = process.env.GEMINI_FALLBACK_MODEL || null;
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { configured: false, ok: false, model, fallbackModel };
  try {
    const [main, fb] = await Promise.all([geminiModelOk(model, key), fallbackModel ? geminiModelOk(fallbackModel, key) : null]);
    return { configured: true, ok: main.ok, model, fallbackModel, fallbackOk: fb?.ok, error: main.ok ? fb && !fb.ok ? fb.error : undefined : main.error };
  } catch (e) {
    return { configured: true, ok: false, model, fallbackModel, error: errMsg(e) };
  }
}

/** Reads Backboard's balance; field names are matched loosely since only balance_usd is documented. */
export async function backboardBalance(): Promise<{ balanceUsd: number | undefined; autoReload: boolean | undefined }> {
  const r = await fetch("https://app.backboard.io/api/billing/balance", {
    headers: { "X-API-Key": process.env.BACKBOARD_API_KEY! }, signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = (await r.json()) as Record<string, unknown>;
  const autoKey = Object.keys(j).find((k) => /auto.?(re)?load|auto.?top/i.test(k) && typeof j[k] === "boolean");
  return {
    balanceUsd: typeof j.balance_usd === "number" ? j.balance_usd : Number(j.balance_usd ?? NaN) || undefined,
    autoReload: autoKey ? Boolean(j[autoKey]) : undefined,
  };
}

async function checkBackboard(): Promise<Health["backboard"]> {
  const configured = Boolean(process.env.BACKBOARD_API_KEY);
  const enabled = backboardEnabled();
  if (!configured) return { enabled, configured, ok: false };
  try {
    const b = await backboardBalance();
    return { enabled, configured, ok: true, ...b };
  } catch (e) {
    return { enabled, configured, ok: false, error: errMsg(e) };
  }
}

function checkEmail(): Health["email"] {
  const provider = process.env.EMAIL_PROVIDER === "resend" ? "resend" : "gmail";
  const configured = provider === "gmail"
    ? Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD)
    : Boolean(process.env.RESEND_API_KEY);
  return { provider, configured };
}

const g = globalThis as unknown as { __health?: { at: number; value: Health } };

/** Cached 30 s so refreshing the status page doesn't repeat network checks. */
export async function checkHealth({ fresh = false } = {}): Promise<Health> {
  if (!fresh && g.__health && Date.now() - g.__health.at < 30_000) return g.__health.value;
  const [db, elevenlabs, gemini, backboard] = await Promise.all([checkDb(), checkElevenLabs(), checkGemini(), checkBackboard()]);
  const value: Health = {
    checkedAt: new Date().toISOString(),
    db, elevenlabs, gemini, backboard,
    email: checkEmail(),
    usage: {
      today: readUsage(),
      limits: {
        geminiCalls: LIMITS.geminiCalls(),
        sttMinutes: LIMITS.sttSeconds() / 60,
        maxRecordingMinutes: LIMITS.maxRecordingSeconds() / 60,
      },
    },
    demoFallback: demoFallbackEnabled(),
  };
  g.__health = { at: Date.now(), value };
  return value;
}
