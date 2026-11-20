import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";

export function useDataSync() {
  const queryClient = useQueryClient();
  const authStatus = useAuthStore((s) => s.status);
  const lastSyncTimestampRef = useRef<number>(0);

  useEffect(() => {
    const canSync = authStatus === "authenticated" || authStatus === "guest";
    if (!canSync) {
      return;
    }

    let es: EventSource | null = null;
    let fallbackInterval: ReturnType<typeof setInterval> | null = null;
    let isConnected = false;
    let isDisposed = false;

    const handleSyncEvent = (eventData: { type: string; id?: string; timestamp?: number }) => {
      if (eventData.timestamp && eventData.timestamp <= lastSyncTimestampRef.current) {
        return;
      }
      if (eventData.timestamp) {
        lastSyncTimestampRef.current = eventData.timestamp;
      }

      // Invalidate relevant queries immediately
      queryClient.invalidateQueries({ queryKey: ["dashboardMetrics"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-trends"] });
      queryClient.invalidateQueries({ queryKey: ["lectures"] });
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
      queryClient.invalidateQueries({ queryKey: ["quizzes"] });
      queryClient.invalidateQueries({ queryKey: ["flashcards"] });
      queryClient.invalidateQueries({ queryKey: ["mindmaps"] });
      queryClient.invalidateQueries({ queryKey: ["mindMaps"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["actionItems"] });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["transcript"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["recordingSessions"] });
    };

    // Defer SSE connection to let browser finish initial page load without keeping tab spinner active
    const initSSE = () => {
      if (isDisposed) return;
      try {
        es = new EventSource("/api/v1/sync/events", { withCredentials: true });

        es.onopen = () => {
          isConnected = true;
        };

        es.onmessage = (event) => {
          try {
            if (!event.data || event.data.startsWith(":")) return;
            const parsed = JSON.parse(event.data);
            handleSyncEvent(parsed);
          } catch {
            // ignore malformed message
          }
        };

        es.onerror = () => {
          isConnected = false;
        };
      } catch {
        isConnected = false;
      }
    };

    // Start SSE after 2.5s once initial paint and hydration have fully settled
    const startTimer = setTimeout(() => {
      if (typeof window !== "undefined" && "requestIdleCallback" in window) {
        (window as Window & { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(
          initSSE,
        );
      } else {
        initSSE();
      }
    }, 2500);

    // Resilient Polling Fallback if SSE drops or disconnects (only when active tab is visible)
    fallbackInterval = setInterval(async () => {
      if (isDisposed || isConnected) return;
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const status = await api.getSyncStatus();
        if (status.timestamp && status.timestamp > lastSyncTimestampRef.current) {
          handleSyncEvent(status);
        }
      } catch {
        // network issue or session expired
      }
    }, 6000);

    return () => {
      isDisposed = true;
      clearTimeout(startTimer);
      if (es) es.close();
      if (fallbackInterval) clearInterval(fallbackInterval);
    };
  }, [queryClient, authStatus]);
}
