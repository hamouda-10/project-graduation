export type SyncEvent = {
  type: string;
  userId?: string;
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
const latestByUser = new Map<string, SyncEvent>();

export function subscribeSync(listener: SyncListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifySync(event: Omit<SyncEvent, "timestamp">) {
  const stamped: SyncEvent = { ...event, timestamp: Date.now() };
  latestEvent = stamped;
  if (stamped.userId) {
    latestByUser.set(stamped.userId, stamped);
  }
  for (const listener of listeners) {
    try {
      listener(stamped);
    } catch {
      // safe guard
    }
  }
}

export function getLatestSyncEvent(): SyncEvent {
  return latestEvent;
}

export function getLatestSyncEventForUser(userId?: string, isAdmin?: boolean): SyncEvent {
  if (isAdmin || !userId) return latestEvent;
  const userEvent = latestByUser.get(userId);
  if (userEvent) return userEvent;
  if (!latestEvent.userId) return latestEvent;
  return { type: "INIT", timestamp: 0 };
}
