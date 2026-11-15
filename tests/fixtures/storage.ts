/** In-memory Storage for tests, with optional write failures (quota / blocked). */
export function memoryStorage(seed: Record<string, string> = {}, opts: { failWith?: string } = {}): Storage {
  const data = new Map(Object.entries(seed));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => {
      if (opts.failWith) throw new DOMException("full", opts.failWith);
      data.set(k, v);
    },
  };
}
