import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Network,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Download,
  Copy,
  Loader2,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { GlassCard } from "@/components/common/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, MindMap, MindMapNode } from "@/lib/api-client";
import { useTranslation } from "@/lib/i18n";
import { toast } from "sonner";

export const Route = createFileRoute("/mind-maps")({
  head: () => ({ meta: [{ title: "Mind Maps · MeetMind AI" }] }),
  component: MindMapsPage,
});

function TreeNode({
  node,
  depth = 0,
  forceExpanded,
}: {
  node: MindMapNode;
  depth?: number;
  forceExpanded?: boolean | null;
}) {
  const [expanded, setExpanded] = useState(true);
  const isCurrentlyExpanded =
    forceExpanded !== null && forceExpanded !== undefined ? forceExpanded : expanded;
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div className="space-y-2">
      <div
        className={`flex items-start gap-2.5 p-3 rounded-xl border transition-all ${
          depth === 0
            ? "border-primary/50 bg-primary/10 shadow-glow"
            : depth === 1
              ? "border-border/80 bg-secondary/50 ml-4 sm:ml-6"
              : "border-border/50 bg-background/50 ml-8 sm:ml-12"
        }`}
      >
        {hasChildren ? (
          <button
            onClick={() => setExpanded(!isCurrentlyExpanded)}
            className="p-1 rounded-md hover:bg-accent/40 text-muted-foreground hover:text-foreground shrink-0 mt-0.5 cursor-pointer"
          >
            {isCurrentlyExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        ) : (
          <div className="h-4 w-4 rounded-full border border-primary/40 bg-primary/20 shrink-0 mt-1 ml-1" />
        )}

        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm text-foreground flex items-center gap-2">
            <span>{node.label}</span>
            {depth === 0 && (
              <Badge variant="outline" className="text-[10px] font-mono">
                Root Concept
              </Badge>
            )}
          </div>
          {node.description && (
            <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              {node.description}
            </div>
          )}
        </div>
      </div>

      {hasChildren && isCurrentlyExpanded && (
        <div className="space-y-2 relative before:absolute before:left-3 before:top-0 before:bottom-3 before:w-px before:bg-border/60">
          {node.children!.map((child) => (
            <TreeNode key={child.id} node={child} depth={depth + 1} forceExpanded={forceExpanded} />
          ))}
        </div>
      )}
    </div>
  );
}

function MindMapsPage() {
  const { t } = useTranslation();
  const { data: mindMaps = [], isLoading } = useQuery<MindMap[]>({
    queryKey: ["mindmaps"],
    queryFn: () => api.getMindMaps(),
  });

  const [selectedMapId, setSelectedMapId] = useState<string>("");
  const [expandAll, setExpandAll] = useState<boolean | null>(null);

  const currentMap = mindMaps.find((m) => m.id === selectedMapId) || mindMaps[0] || null;

  const handleCopyJson = () => {
    if (!currentMap) return;
    navigator.clipboard.writeText(JSON.stringify(currentMap.rootNode, null, 2));
    toast.success("Mind map hierarchy copied to clipboard");
  };

  const handleDownloadJson = () => {
    if (!currentMap) return;
    const blob = new Blob([JSON.stringify(currentMap, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${currentMap.title.replace(/\s+/g, "_")}_mindmap.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Mind map downloaded as JSON");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Knowledge Graphs"
        title={t("mindMapsTitle")}
        description="Structured hierarchical relationships extracted from lecture recordings and discussions."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExpandAll(expandAll === true ? false : true)}
              className="cursor-pointer"
            >
              {expandAll === true ? (
                <>
                  <Minimize2 className="h-4 w-4" /> Collapse All
                </>
              ) : (
                <>
                  <Maximize2 className="h-4 w-4" /> Expand All
                </>
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={handleCopyJson} className="cursor-pointer">
              <Copy className="h-4 w-4" /> Copy JSON
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadJson}
              className="cursor-pointer"
            >
              <Download className="h-4 w-4" /> Export JSON
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : mindMaps.length === 0 ? (
        <EmptyState
          icon={Network}
          title="No mind maps generated yet"
          description="Upload or record a lecture to automatically build a structured concept hierarchy."
        />
      ) : (
        <div className="space-y-6">
          {/* Map Selector */}
          <div className="flex flex-wrap gap-2">
            {mindMaps.map((m) => (
              <Button
                key={m.id}
                variant={currentMap?.id === m.id ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setSelectedMapId(m.id);
                  setExpandAll(null);
                }}
                className={`cursor-pointer ${
                  currentMap?.id === m.id
                    ? "gradient-primary text-primary-foreground shadow-glow"
                    : ""
                }`}
              >
                {m.title}
              </Button>
            ))}
          </div>

          {currentMap && (
            <GlassCard className="p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-4">
                <div>
                  <div className="flex items-center gap-2 text-xs text-primary font-medium">
                    <Sparkles className="h-3.5 w-3.5" /> Verified Concept Graph
                  </div>
                  <h2 className="font-display text-xl font-semibold mt-1">{currentMap.title}</h2>
                </div>
                <div className="text-xs text-muted-foreground">
                  Click arrows to expand and collapse sub-branches
                </div>
              </div>

              {/* Hierarchical Visual Concept Tree */}
              <div className="pt-2">
                <TreeNode node={currentMap.rootNode} depth={0} forceExpanded={expandAll} />
              </div>
            </GlassCard>
          )}
        </div>
      )}
    </div>
  );
}
