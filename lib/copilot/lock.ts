// Serializes read-modify-write of visits.copilot per visit (check vs dismiss vs stop), so concurrent
// requests can't overwrite each other. On globalThis so dev hot-reloads keep one chain per visit.
const g = globalThis as unknown as { __copilotLocks?: Map<string, Promise<unknown>> };
const locks = (g.__copilotLocks ??= new Map());

export async function withCopilotLock<T>(visitId: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(visitId) ?? Promise.resolve();
  const run = prev.catch(() => {}).then(fn);
  const tail = run.catch(() => {});
  locks.set(visitId, tail);
  try {
    return await run;
  } finally {
    if (locks.get(visitId) === tail) locks.delete(visitId);
  }
}
