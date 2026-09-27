/**
 * Yields from `source`, but gives up (throws) if the first piece takes longer than `firstMs` or a later one
 * longer than `idleMs`. The Help assistant uses it so a slow model never keeps someone waiting: the retrieved
 * article is shown instead.
 */
export async function* withDeadline<T>(source: AsyncGenerator<T>, { firstMs, idleMs }: { firstMs: number; idleMs: number }): AsyncGenerator<T> {
  let first = true;
  try {
    for (;;) {
      const ms = first ? firstMs : idleMs;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`no ${first ? "first words" : "progress"} within ${ms} ms`)), ms);
      });
      const next = await Promise.race([source.next(), late]).finally(() => clearTimeout(timer));
      if (next.done) return;
      first = false;
      yield next.value;
    }
  } finally {
    // Stop the slow request; don't wait for it.
    void source.return(undefined).catch(() => {});
  }
}
