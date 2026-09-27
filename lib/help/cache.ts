/** A small time-limited cache kept on globalThis, so it survives dev hot reloads. Oldest entries go first. */
export function ttlCache<V>(name: string, ttlMs: number, max = 200) {
  const g = globalThis as unknown as Record<string, Map<string, { at: number; value: V }> | undefined>;
  const store = (g[`__help_${name}`] ??= new Map());
  return {
    get(key: string): V | undefined {
      const hit = store.get(key);
      if (!hit) return undefined;
      if (Date.now() - hit.at > ttlMs) {
        store.delete(key);
        return undefined;
      }
      return hit.value;
    },
    set(key: string, value: V) {
      store.delete(key);
      store.set(key, { at: Date.now(), value });
      if (store.size > max) store.delete(store.keys().next().value!);
    },
  };
}
