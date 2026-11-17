import { useState, useEffect } from "react";
import { Zap, X, Activity, Server, Clock, HardDrive } from "lucide-react";

interface PerfStats {
  ttfb: number | null;
  fcp: number | null;
  lcp: number | null;
  domReady: number | null;
  pageLoad: number | null;
  resourceCount: number;
  jsHeapSizeMb: number | null;
}

export function PerformanceMonitor() {
  const [stats, setStats] = useState<PerfStats>({
    ttfb: null,
    fcp: null,
    lcp: null,
    domReady: null,
    pageLoad: null,
    resourceCount: 0,
    jsHeapSizeMb: null,
  });
  const [isOpen, setIsOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    // Only run in client browser
    if (typeof window === "undefined" || !window.performance) return;

    const computeMetrics = () => {
      try {
        const navEntries = performance.getEntriesByType("navigation");
        const nav = navEntries[0] as PerformanceNavigationTiming | undefined;

        let ttfb: number | null = null;
        let domReady: number | null = null;
        let pageLoad: number | null = null;

        if (nav) {
          ttfb = Math.round(nav.responseStart - nav.requestStart);
          if (ttfb < 0 || isNaN(ttfb)) {
            ttfb = Math.round(nav.responseStart - nav.startTime);
          }
          domReady = Math.round(nav.domInteractive - nav.startTime);
          pageLoad = Math.round(
            nav.loadEventEnd > 0 ? nav.loadEventEnd - nav.startTime : performance.now(),
          );
        }

        // FCP
        let fcp: number | null = null;
        const paintEntries = performance.getEntriesByType("paint");
        const fcpEntry = paintEntries.find((e) => e.name === "first-contentful-paint");
        if (fcpEntry) {
          fcp = Math.round(fcpEntry.startTime);
        }

        // Resources
        const resources = performance.getEntriesByType("resource");
        const resourceCount = resources.length;

        // JS Heap if available
        let jsHeapSizeMb: number | null = null;
        const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
        if (memory?.usedJSHeapSize) {
          jsHeapSizeMb = Math.round((memory.usedJSHeapSize / (1024 * 1024)) * 10) / 10;
        }

        setStats((prev) => ({
          ...prev,
          ttfb: ttfb && ttfb >= 0 ? ttfb : prev.ttfb,
          fcp: fcp ?? prev.fcp,
          domReady: domReady && domReady > 0 ? domReady : prev.domReady,
          pageLoad: pageLoad && pageLoad > 0 ? pageLoad : prev.pageLoad,
          resourceCount,
          jsHeapSizeMb,
        }));
      } catch {
        // Safe fallback
      }
    };

    // Initial check
    computeMetrics();

    // LCP Observer
    let lcpObserver: PerformanceObserver | null = null;
    try {
      if ("PerformanceObserver" in window) {
        lcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          if (lastEntry) {
            setStats((prev) => ({ ...prev, lcp: Math.round(lastEntry.startTime) }));
          }
        });
        lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
      }
    } catch {
      // Observer unsupported
    }

    // Refresh metrics on full window load
    window.addEventListener("load", computeMetrics);
    const timer = setTimeout(computeMetrics, 1500);

    return () => {
      window.removeEventListener("load", computeMetrics);
      clearTimeout(timer);
      lcpObserver?.disconnect();
    };
  }, []);

  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        title="Open Performance HUD"
        className="fixed bottom-3 left-3 z-50 flex items-center gap-1.5 rounded-full border border-primary/40 bg-[#0c0c10]/95 px-2.5 py-1 text-[11px] font-mono text-primary shadow-lg backdrop-blur-md transition-transform hover:scale-105 active:scale-95"
      >
        <Zap className="h-3 w-3 text-primary animate-pulse" />
        <span>{stats.ttfb ? `${stats.ttfb}ms` : "Fast"}</span>
      </button>
    );
  }

  const badgeColor = (val: number | null, good: number, ok: number) => {
    if (val === null) return "text-muted-foreground";
    if (val <= good) return "text-emerald-400";
    if (val <= ok) return "text-amber-400";
    return "text-rose-400";
  };

  return (
    <div className="fixed bottom-3 left-3 z-50 flex flex-col items-start gap-1 font-mono text-[11px] select-none">
      <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-[#0c0c10]/95 px-3 py-1.5 text-foreground shadow-2xl backdrop-blur-md">
        <div className="flex items-center gap-1.5 font-semibold text-primary">
          <Zap className="h-3.5 w-3.5 fill-primary/30" />
          <span>SPEED</span>
        </div>

        <div className="h-3 w-px bg-border/60" />

        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">TTFB:</span>
          <span className={`font-bold ${badgeColor(stats.ttfb, 120, 300)}`}>
            {stats.ttfb !== null ? `${stats.ttfb}ms` : "--"}
          </span>
        </div>

        <div className="h-3 w-px bg-border/60" />

        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">FCP:</span>
          <span className={`font-bold ${badgeColor(stats.fcp, 300, 800)}`}>
            {stats.fcp !== null ? `${stats.fcp}ms` : "--"}
          </span>
        </div>

        <div className="h-3 w-px bg-border/60" />

        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">LCP:</span>
          <span className={`font-bold ${badgeColor(stats.lcp, 600, 1500)}`}>
            {stats.lcp !== null ? `${stats.lcp}ms` : "--"}
          </span>
        </div>

        <button
          onClick={() => setIsOpen(!isOpen)}
          className="ml-1 text-muted-foreground hover:text-foreground text-[10px] underline underline-offset-2 cursor-pointer"
        >
          {isOpen ? "less" : "details"}
        </button>

        <button
          onClick={() => setMinimized(true)}
          title="Minimize"
          className="ml-1 text-muted-foreground hover:text-foreground p-0.5 rounded cursor-pointer"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {isOpen && (
        <div className="w-72 rounded-xl border border-primary/20 bg-[#0a0a0e]/95 p-3 text-foreground shadow-2xl backdrop-blur-xl animate-in fade-in-50 slide-in-from-bottom-2">
          <div className="flex items-center justify-between pb-2 border-b border-border/50">
            <span className="font-semibold text-primary flex items-center gap-1.5 text-xs">
              <Activity className="h-3.5 w-3.5" />
              Runtime Diagnostics
            </span>
            <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded">
              OPTIMIZED
            </span>
          </div>

          <div className="mt-2.5 space-y-1.5 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-1">
                <Server className="h-3 w-3" /> Server TTFB
              </span>
              <span className={`font-bold ${badgeColor(stats.ttfb, 120, 300)}`}>
                {stats.ttfb ? `${stats.ttfb} ms` : "Calculating..."}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" /> First Paint (FCP)
              </span>
              <span className={`font-bold ${badgeColor(stats.fcp, 300, 800)}`}>
                {stats.fcp ? `${stats.fcp} ms` : "Measuring..."}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" /> Largest Content (LCP)
              </span>
              <span className={`font-bold ${badgeColor(stats.lcp, 600, 1500)}`}>
                {stats.lcp ? `${stats.lcp} ms` : "Calculating..."}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">DOM Interactive</span>
              <span className="font-bold text-foreground">
                {stats.domReady ? `${stats.domReady} ms` : "--"}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-1">
                <HardDrive className="h-3 w-3" /> HTTP Resources
              </span>
              <span className="font-bold text-foreground">{stats.resourceCount} assets</span>
            </div>

            {stats.jsHeapSizeMb && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">JS Heap Memory</span>
                <span className="font-bold text-primary">{stats.jsHeapSizeMb} MB</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
