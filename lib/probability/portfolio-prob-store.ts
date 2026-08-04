type ProbPair = {
  initial: number | null;
  current: number | null;
  /** Mark session date shown in As of Today's Date (DD-MM-YYYY). */
  asOfDate: string | null;
  updatedAt: number;
};

const store = new Map<string, ProbPair>();
const listeners = new Set<() => void>();
/** Monotonic version so useSyncExternalStore re-renders on every write, not only size changes. */
let version = 0;

function bump() {
  version += 1;
  listeners.forEach((l) => l());
}

export function getProbabilityPair(isin: string): ProbPair | null {
  if (!isin) return null;
  return store.get(isin) ?? null;
}

export function setProbabilityPair(
  isin: string,
  initial: number | null,
  current: number | null,
  asOfDate: string | null = null,
): void {
  if (!isin) return;
  store.set(isin, { initial, current, asOfDate, updatedAt: Date.now() });
  bump();
}

export function subscribeProbabilityStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getProbabilityStoreSnapshot(): number {
  return version;
}

export function clearProbabilityStore(): void {
  store.clear();
  bump();
}
