/** Error carrying an HTTP status so the retry wrapper can decide whether to retry. */
export class ExternalError extends Error {
  constructor(public service: string, public status: number | null, message: string) {
    super(`[${service}] ${message}`);
  }
}

/** Pulls an HTTP status from the error shapes the SDKs throw. */
export function statusOf(err: unknown): number | null {
  if (err instanceof ExternalError) return err.status;
  const e = err as { status?: unknown; statusCode?: unknown; code?: unknown; response?: { status?: unknown } };
  for (const v of [e?.status, e?.statusCode, e?.response?.status, e?.code]) {
    if (typeof v === "number" && v >= 100 && v < 600) return v;
  }
  return null;
}

export function isRetryable(err: unknown) {
  const status = statusOf(err);
  if (status === null) {
    // Network-level failures (fetch failed, ECONNRESET, timeouts) are worth retrying.
    const msg = String((err as Error)?.message ?? "");
    return /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket|network|timeout/i.test(msg);
  }
  return status === 429 || status >= 500;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Every external call goes through here: retries 429/5xx/network errors with
 * exponential backoff (1 s, 2 s, 4 s by default).
 */
export async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  { retries = 3, baseMs = 1000 }: { retries?: number; baseMs?: number } = {},
): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries || !isRetryable(err)) throw err;
      const wait = baseMs * 2 ** attempt;
      console.warn(`[${label}] attempt ${attempt + 1} failed (${statusOf(err) ?? (err as Error).message}); retrying in ${wait}ms`);
      await sleep(wait);
      attempt++;
    }
  }
}

/** Rejects if `promise` doesn't settle within `ms`. */
export function withTimeout<T>(label: string, promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new ExternalError(label, null, `timed out after ${ms / 1000}s`)), ms);
    }),
  ]);
}
