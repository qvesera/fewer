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
  hiddenChildrenOf,
  indexHiddenTreeChildren,
  type HiddenTreeNode,
  type HiddenGroup,
} from "@/lib/fewer/hiddenGroups";
import { RenameInput } from ".";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useActiveLeaf } from "@/hooks/use-active-leaf";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { plural } from "@/lib/fewer/plural";
import { useSectionOpen } from "./CollapsibleSection";

/**
 * A row's children, loaded on demand. The panel only renders a hidden tree's
 * roots by default, so materialising every hidden node up front (15k on a 30k
 * graph) built rows nobody could see. Search overrides this with the
 * (pruned) built tree, because a deep match has to show its ancestor path.
 */
type GetChildren = (nodeId: string) => HiddenTreeNode[];

const NO_CHILDREN: HiddenTreeNode[] = [];
const EMPTY_IDS: string[] = [];
const EMPTY_GROUPS: HiddenGroup[] = [];

function HiddenGroupRow({ group, getChildren }: { group: HiddenGroup; getChildren: GetChildren }) {
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
          <HiddenNodeRow key={root.node.id} tree={root} depth={0} getChildren={getChildren} />
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
            <HiddenNodeRow key={root.node.id} tree={root} depth={1} getChildren={getChildren} />
          ))}
        </div>
      )}
    </div>
  );
}
function HiddenNodeRow({ tree, depth = 0, getChildren }: { tree: HiddenTreeNode; depth?: number; getChildren: GetChildren }) {
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

  // Children arrive on expand. A closed row still needs to know whether to draw
  // the disclosure chevron, which is one map read over that folder's own edges.
  const hasChildren = useMemo(() => getChildren(tree.node.id).length > 0, [getChildren, tree.node.id]);
  const children = useMemo(
    () => (open ? getChildren(tree.node.id) : NO_CHILDREN),
    [open, getChildren, tree.node.id],
  );

  const ringIds = useMemo(() => buildRingIds(tree.node.id, edges), [tree.node.id, edges]);

  const unreveal = (id: string) => {
    // Pointer is still inside this row when the eye button clicks, so onMouseLeave
    // won't fire; and once the node is revealed the row unmounts, which also never
    // fires mouseleave. Clear the canvas ring explicitly or it lingers on the
    // just-revealed nodes.
    setHoverHighlight([]);
    const store = useGraphStore.getState();
    // Reveal in the active view's layers (removes from individual/subtrees/bulk-exempt)
    if (store.activeLeafId) {
      store.eyeRevealForLeaf(store.activeLeafId, id);
    }
    if (isFolder) {
      // Also reveal subtree globally when it was globally hidden (existing behavior)
      store.revealSubtree(id);
      toast({ title: "Subtree shown", description: tree.node.data.label });
    } else {
      // Also reveal globally when globally hidden (existing behavior)
      store.showAncestors(id);
      toast({ title: "Card shown", description: tree.node.data.label });
    }
    // Auto-select the just-revealed node so it's ringed on the canvas and
    // arrow-key navigation can act on it immediately.
    setSelectedNodeIds([id]);
    setFocusedNodeId(id);
  };
  
  const node = tree.node;

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
          {children.map((child) => (
            <HiddenNodeRow key={child.node.id} tree={child} depth={depth + 1} getChildren={getChildren} />
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
  const showAll = useGraphStore((s) => s.showAll);
  const activeLeaf = useActiveLeaf();
  const setHoverHighlight = useGraphStore((s) => s.setHoverHighlight);
  const { toast } = useToast();

  const [hiddenSearch, setHiddenSearch] = useState("");

  // Folded sections keep their children mounted (the collapse is a CSS
  // grid-rows transition), so without this the panel would rebuild its whole
  // hidden list on every graph edit while nobody could see it.
  const sectionOpen = useSectionOpen();

  // Effective hidden list for the active view: resolved from the leaf's
  // hide layers (individual + subtrees + bulk files) merged with global hiddenIds.
  const effectiveHidden = useMemo(
    () => activeLeaf?.resolved.hiddenIds ?? EMPTY_IDS,
    [activeLeaf],
  );
  const viewFiltersFiles = activeLeaf ? !activeLeaf.resolved.showFiles : false;
  const activeLeafId = activeLeaf?.leafId ?? null;

  // Search needs the full nested tree (a deep match must keep its ancestor
  // path); with no query the panel renders roots only and rows expand lazily.
  const searching = hiddenSearch.trim().length > 0;

  const hiddenGroups = useMemo(
    () => (sectionOpen
      ? getHiddenLayerGroups(nodes, edges, effectiveHidden, searching ? "all" : "roots")
      : EMPTY_GROUPS),
    [sectionOpen, nodes, edges, effectiveHidden, searching],
  );

  const filteredHiddenGroups = useMemo(
    () => filterHiddenGroups(hiddenGroups, hiddenSearch),
    [hiddenGroups, hiddenSearch],
  );

  const hiddenSet = useMemo(() => new Set(effectiveHidden), [effectiveHidden]);

  const getChildren = useMemo<GetChildren>(() => {
    if (searching) {
      // From the built (and pruned) tree, so a search only ever expands into
      // rows that actually match.
      const byParent = indexHiddenTreeChildren(filteredHiddenGroups);
      return (nodeId) => byParent.get(nodeId) ?? NO_CHILDREN;
    }
    return (nodeId) => hiddenChildrenOf(nodeId, nodes, edges, hiddenSet);
  }, [searching, filteredHiddenGroups, nodes, edges, hiddenSet]);

  if (effectiveHidden.length === 0) return null;

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-2 w-full min-w-0">
      <div className="relative w-full min-w-0 shrink-0">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60 pointer-events-none" />
        <Input
          value={hiddenSearch}
          onChange={(e) => setHiddenSearch(e.target.value)}
          placeholder="Search hidden cards..."
          className="h-8 pl-8 text-xs"
        />
      </div>
      {/* Per-row tree with full effective hidden list */}
      {effectiveHidden.length > 0 && (<>
      <Button
        variant="outline"
        size="sm"
        className="w-full gap-2 border-border/60 hover:bg-muted/40 text-xs font-normal min-w-0 shrink-0"
        onClick={() => {
          setHoverHighlight([]);
          const count = effectiveHidden.length;
          // Per-leaf reveal: clear view's hidden set
          if (activeLeafId) {
            useGraphStore.getState().revealAllForLeaf(activeLeafId);
          }
          // Also clear global hiddenIds + global showFiles (affects other views' defaults)
          showAll();
          if (count > 0) toast({ title: "Unhid all cards", description: `${count} card${count === 1 ? "" : "s"} restored` });
        }}
      >
        <Eye className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">Reveal All</span>
      </Button>
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden rounded-lg border border-border/20 bg-muted/10 p-2 gm-scroll w-full min-w-0">
        {filteredHiddenGroups.length > 0 ? (
          filteredHiddenGroups.map((group, i) => (
            <HiddenGroupRow key={group.parentNode?.id ?? `bare-${i}`} group={group} getChildren={getChildren} />
          ))
        ) : (
          <p className="px-1 py-2 text-[11px] text-muted-foreground/70">
            No hidden cards match “{hiddenSearch.trim()}”.
          </p>
        )}
      </div>
      </>)}
    </div>
  );
}

