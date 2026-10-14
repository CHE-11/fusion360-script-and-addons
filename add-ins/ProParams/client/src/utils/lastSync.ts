type Listener = (at: number | null) => void;

let lastSyncAt: number | null = null;
const listeners = new Set<Listener>();

/** Record that the palette just received fresh data from Fusion. */
export function markSynced(at = Date.now()): void {
  lastSyncAt = at;
  listeners.forEach((listener) => listener(at));
}

export function getLastSyncAt(): number | null {
  return lastSyncAt;
}

export function subscribeLastSync(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
