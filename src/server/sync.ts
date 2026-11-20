export type SyncEvent = {
  type: string;
  id?: string;
  jobId?: string;
  resourceId?: string;
  resourceType?: string;
  stage?: string;
  error?: string;
  count?: number;
  progress?: number;
  data?: unknown;
  timestamp: number;
};

type SyncListener = (event: SyncEvent) => void;
const listeners = new Set<SyncListener>();
let latestEvent: SyncEvent = { type: "INIT", timestamp: Date.now() };

export function subscribeSync(listener: SyncListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifySync(event: Omit<SyncEvent, "timestamp">) {
  latestEvent = { ...event, timestamp: Date.now() };
  for (const listener of listeners) {
    try {
      listener(latestEvent);
    } catch {
      // safe guard
    }
  }
}

export function getLatestSyncEvent(): SyncEvent {
  return latestEvent;
}
