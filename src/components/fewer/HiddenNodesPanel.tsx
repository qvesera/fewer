"use client";

import { useMemo, useState } from "react";
import { useGraphStore } from "@/store/graphStore";
import { Button } from "@/components/ui/button";
import {
  Eye,
  EyeOff,
  ChevronRight,
  Folder,
} from "lucide-react";
import {
  getHiddenLayerGroups,
  filterHiddenGroups,
  buildRingIds,
  type HiddenTreeNode,
  type HiddenGroup,
} from "@/lib/fewer/hiddenGroups";
import { RenameInput } from ".";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { plural } from "@/lib/fewer/plural";

function HiddenGroupRow({ group }: { group: HiddenGroup }) {
  const edges = useGraphStore((s) => s.edges);
  const setHoverHighlight = useGraphStore((s) => s.setHoverHighlight);
  const [open, setOpen] = useState(true);

  // Ring the visible parent folder + its ancestor path, and every hidden id in
  // this group — so the hidden child rows glow inside the folder card on canvas,
  // not just the card border, for coherence between the panel and the graph.
  const ringIds = useMemo(
    () => buildRingIds(group.parentNode?.id, edges, group.roots),
    [group.parentNode, edges, group.roots],
  );

  // No context folder (standalone roots) — render the nested rows directly.
  if (!group.parentNode) {
    return (
      <>
        {group.roots.map((root) => (
          <HiddenNodeRow key={root.node.id} tree={root} depth={0} />
        ))}
      </>
    );
  }

  const p = group.parentNode;

  return (
    <div className="space-y-0.5 w-full min-w-0">
      {/* Folder context header — dimmed, non-revealable, hovers to ring the folder on canvas. */}
      <div
        onMouseEnter={() => setHoverHighlight(ringIds)}
        onMouseLeave={() => setHoverHighlight([])}
        onClick={() => setOpen((o) => !o)}
        title={group.parentPath || p.data.label}
        className="flex items-center gap-1.5 rounded-md py-1 pr-1.5 text-xs cursor-pointer select-none hover:bg-muted/50 w-full min-w-0"
      >
        <ChevronRight
          className={cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-150", open && "rotate-90")}
        />
        <Folder className="h-3.5 w-3.5 shrink-0 text-fewer-folder-icon" />
        <span className="truncate font-medium text-foreground/80 flex-1 min-w-0">{p.data.label}</span>
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/70">
          {group.hiddenCount} hidden
        </span>
      </div>

      {open && (
        <div className="space-y-0.5 w-full min-w-0 pl-3">
          {group.roots.map((root) => (
            <HiddenNodeRow key={root.node.id} tree={root} depth={1} />
          ))}
        </div>
      )}
    </div>
  );
}
function HiddenNodeRow({ tree, depth = 0 }: { tree: HiddenTreeNode; depth?: number }) {
  const renamingId = useGraphStore((s) => s.renamingId);
  const renameNode = useGraphStore((s) => s.renameNode);
  const showAncestors = useGraphStore((s) => s.showAncestors);
  const edges = useGraphStore((s) => s.edges);
  const setHoverHighlight = useGraphStore((s) => s.setHoverHighlight);
  const setSelectedNodeIds = useGraphStore((s) => s.setSelectedNodeIds);
  const setFocusedNodeId = useGraphStore((s) => s.setFocusedNodeId);
  const { toast } = useToast();
  const [open, setOpen] = useState(depth === 0);
  const isFolder = tree.node.data.type === "folder";

  const ringIds = useMemo(() => buildRingIds(tree.node.id, edges), [tree.node.id, edges]);

  const unreveal = (id: string) => {
    // Pointer is still inside this row when the eye button clicks, so onMouseLeave
    // won't fire; and once the node is revealed the row unmounts, which also never
    // fires mouseleave. Clear the canvas ring explicitly or it lingers on the
    // just-revealed nodes.
    setHoverHighlight([]);
    if (isFolder) {
      useGraphStore.getState().revealSubtree(id);
      toast({ title: "Subtree shown", description: tree.node.data.label });
    } else {
      showAncestors(id);
      toast({ title: "Card shown", description: tree.node.data.label });
    }
    // Auto-select the just-revealed node so it's ringed on the canvas and
    // arrow-key navigation can act on it immediately.
    setSelectedNodeIds([id]);
    setFocusedNodeId(id);
  };
  
  const node = tree.node;
  const hasChildren = tree.children.length > 0;

  const handleRename = (v: string) => {
    const ok = renameNode(node.id, v);
    if (!ok) toast({ title: "Rename blocked", description: `"${v.trim()}" already exists in this folder.`, variant: "destructive" });
  };

  return (
    <div className="space-y-0.5 w-full min-w-0">
      <div
        onMouseEnter={() => setHoverHighlight(ringIds)}
        onMouseLeave={() => setHoverHighlight([])}
        className="group flex items-center rounded-md py-1 pr-1.5 text-xs hover:bg-muted/50 w-full min-w-0"
        >
        {/* ── 1. PINNED LEFT EYE ICON (Always at x=0 regardless of depth) ── */}
        <button
          type="button"
          onClick={() => unreveal(node.id)}
          title={isFolder ? "Show folder and its children" : "Show this item"}
          aria-label={isFolder ? "Show subtree" : "Show item"}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/60 hover:text-foreground hover:bg-foreground/10 transition-colors"
        >
          <Eye className="h-3.5 w-3.5" />
        </button>

        {/* ── 2. INDENTED CONTENT (Chevron, Dot, Label) ── */}
        <div 
          className="flex items-center gap-1.5 min-w-0 flex-1"
          style={{ paddingLeft: `${depth * 10}px` }} // Adjust 10px to increase/decrease tree indentation
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              title={open ? "Collapse" : "Expand"}
              aria-label={open ? "Collapse" : "Expand"}
              className="h-4 w-4 shrink-0 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/10"
            >
              <ChevronRight className={cn("h-3 w-3 transition-transform duration-150", open && "rotate-90")} />
            </button>
          ) : (
            <span className="w-4 shrink-0" />
          )}

          <span
            className={cn(
              "h-1.5 w-1.5 shrink-0 rounded-full",
              node.data.type === "folder" ? "bg-fewer-folder-icon" : "bg-fewer-file-icon",
            )}
          />

          {renamingId === node.id ? (
            <RenameInput
              initialValue={node.data.extension ? `${node.data.label}.${node.data.extension}` : node.data.label}
              onCommit={handleRename}
              onCancel={() => useGraphStore.getState().setRenamingId(null)}
            />
          ) : (
            <span className="truncate text-foreground/90 flex-1 min-w-0 text-[11px] leading-tight">
              {node.data.label}
            </span>
          )}
        </div>
      </div>

      {/* ── 3. CHILDREN WRAPPER (NO PADDING HERE) ── */}
      {open && hasChildren && (
        <div className="space-y-0.5 w-full min-w-0">
          {tree.children.map((child) => (
            <HiddenNodeRow key={child.node.id} tree={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Body of the Hidden Cards recovery section: search box, Reveal All action, and
 * the grouped hidden-node tree. Sidebar supplies the CollapsibleSection shell.
 */
export function HiddenNodesPanel() {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const hiddenIds = useGraphStore((s) => s.hiddenIds);
  const showAll = useGraphStore((s) => s.showAll);
  const showFilesGlobal = useGraphStore((s) => s.showFiles);
  const viewSettingsMap = useGraphStore((s) => s.viewSettings);
  const activeLeafId = useGraphStore((s) => s.activeLeafId);
  const setHoverHighlight = useGraphStore((s) => s.setHoverHighlight);
  const { toast } = useToast();

  const [hiddenSearch, setHiddenSearch] = useState("");

  // Resolve active view's showFiles for per-view filtering
  const activeLeafVs = activeLeafId ? viewSettingsMap[activeLeafId] : undefined;
  const activeViewShowFiles = activeLeafVs?.showFiles ?? showFilesGlobal;
  const viewFiltersFiles = !activeViewShowFiles;

  const hiddenGroups = useMemo(
    () => getHiddenLayerGroups(nodes, edges, hiddenIds),
    [nodes, edges, hiddenIds],
  );

  const filteredHiddenGroups = useMemo(
    () => filterHiddenGroups(hiddenGroups, hiddenSearch),
    [hiddenGroups, hiddenSearch],
  );

  const hasGlobalHidden = hiddenIds.length > 0;
  if (!hasGlobalHidden && !viewFiltersFiles) return null;

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-2 w-full min-w-0">
      <div className="relative w-full min-w-0 shrink-0">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60 pointer-events-none" />
        <Input
          value={hiddenSearch}
          onChange={(e) => setHiddenSearch(e.target.value)}
          placeholder="Search hidden nodes…"
          className="h-8 pl-8 text-xs"
        />
      </div>
      {/* View-filter banner */}
      {viewFiltersFiles && (
        <div className="flex items-center justify-between rounded-lg border border-border/20 bg-muted/20 px-3 py-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <EyeOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="text-xs text-muted-foreground truncate">File cards hidden in this view</span>
          </div>
          {activeLeafId && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs shrink-0"
              onClick={() => useGraphStore.getState().setViewSetting(activeLeafId, "showFiles", true)}
            >
              Show Files
            </Button>
          )}
        </div>
      )}
      {hasGlobalHidden && (<>
      <Button
        variant="outline"
        size="sm"
        className="w-full gap-2 border-border/60 hover:bg-muted/40 text-xs font-normal min-w-0 shrink-0"
        onClick={() => {
          setHoverHighlight([]);
          const count = hiddenIds.length;
          // Per-leaf showFiles first, then global showAll
          if (activeLeafId) useGraphStore.getState().setViewSetting(activeLeafId, "showFiles", true);
          else useGraphStore.getState().setShowFiles(true);
          showAll();
          if (count > 0) toast({ title: "Unhid all nodes", description: `${plural(count, "node")} restored` });
        }}
      >
        <Eye className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">Reveal All</span>
      </Button>
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden rounded-lg border border-border/20 bg-muted/10 p-2 gm-scroll w-full min-w-0">
        {filteredHiddenGroups.length > 0 ? (
          filteredHiddenGroups.map((group, i) => (
            <HiddenGroupRow key={group.parentNode?.id ?? `bare-${i}`} group={group} />
          ))
        ) : (
          <p className="px-1 py-2 text-[11px] text-muted-foreground/70">
            No hidden nodes match “{hiddenSearch.trim()}”.
          </p>
        )}
      </div>
      </>)}
    </div>
  );
}

