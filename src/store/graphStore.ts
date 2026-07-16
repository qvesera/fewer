"use client";

import { create } from "zustand";
import type { NodeChange, Connection, EdgeChange } from "@xyflow/react";
import { v4 as uuid } from "uuid";
import type {
  FewerNode,
  FewerEdge,
  LayoutDirection,
  EdgeStyle,
  ExportSettings,
  CustomTheme,
  ThemeMode,
} from "@/lib/fewer/types";
import { DEFAULT_CUSTOM_THEME, THEME_COLOR_META } from "@/lib/fewer/types";
import { layoutGraph } from "@/lib/fewer/layout";
import { validateConnection } from "@/lib/fewer/validation";
import { categorizeByExtension } from "@/lib/fewer/categorize";

interface GraphState {
  nodes: FewerNode[];
  edges: FewerEdge[];
  direction: LayoutDirection;
  edgeStyle: EdgeStyle;
  cornerRadius: number;
  nodeWidth: number;
  nodeHeight: number;
  searchQuery: string;
  selectedNodeIds: string[];
  /** ids of nodes that the user has hidden via the context menu */
  hiddenIds: string[];

  // theme
  themeMode: ThemeMode;
  customTheme: CustomTheme;

  // history
  past: { nodes: FewerNode[]; edges: FewerEdge[] }[];
  future: { nodes: FewerNode[]; edges: FewerEdge[] }[];

  // ui
  searchOpen: boolean;
  exportOpen: boolean;
  sidebarOpen: boolean;
  advancedOpen: boolean;
  bugReportOpen: boolean;
  shortcutsOpen: boolean;
  /** id of the node currently being renamed inline (null = none) */
  renamingId: string | null;
  /** tracks how the current graph was loaded (for tutorial) */
  dataSource: string | null;

  // export settings
  exportSettings: ExportSettings;

  // actions
  setGraph: (
    nodes: FewerNode[],
    edges: FewerEdge[],
    pushHistory?: boolean,
    hiddenFileIds?: string[],
  ) => void;
  setDirection: (direction: LayoutDirection) => void;
  setEdgeStyle: (style: EdgeStyle) => void;
  setCornerRadius: (radius: number) => void;
  setNodeDimensions: (w: number, h: number) => void;
  setAdvancedOpen: (open: boolean) => void;
  setBugReportOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
  relayout: () => void;
  setSearchQuery: (query: string) => void;
  setSearchOpen: (open: boolean) => void;
  setExportOpen: (open: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
  setExportSettings: (settings: Partial<ExportSettings>) => void;
  setSelectedNodeIds: (ids: string[]) => void;
  setRenamingId: (id: string | null) => void;
  setCustomTheme: (theme: Partial<CustomTheme>) => void;
  resetCustomTheme: () => void;
  setThemeMode: (mode: ThemeMode) => void;

  // clipboard (stores subtree data so paste works after cut removes originals)
  clipboard: {
    mode: "copy" | "cut";
    nodeIds: string[];
    /** Snapshot of the subtree nodes at the time of copy/cut */
    subtreeNodes: FewerNode[];
    /** Snapshot of the subtree edges at the time of copy/cut */
    subtreeEdges: FewerEdge[];
  } | null;
  setClipboard: (mode: "copy" | "cut", nodeIds: string[]) => void;
  clearClipboard: () => void;

  // focused node for keyboard navigation
  focusedNodeId: string | null;
  setFocusedNodeId: (id: string | null) => void;

  // zoom-to-node trigger (set by SearchPanel, watched by GraphCanvas)
  zoomToNode: { nodeId: string; timestamp: number } | null;

  /** Position to paste at (set before calling pasteFromClipboard). null = auto-position. */
  /** Last known mouse position in flow coordinates */
  mousePosition: { x: number; y: number } | null;
  setMousePosition: (pos: { x: number; y: number } | null) => void;

  /** Position to paste at (mirrors mousePosition at paste time) */
  pastePosition: { x: number; y: number } | null;
  setPastePosition: (pos: { x: number; y: number } | null) => void;

  // react-flow change handling (drag/select/remove)
  applyNodeChanges: (changes: NodeChange[]) => void;
  applyEdgeChanges: (changes: EdgeChange[]) => void;
  /** Snapshot current nodes/edges into the undo stack */
  commitHistory: () => void;

  /** Helper: create a copy of a node with a "copy" label suffix. */
  _makeCopyNode: (sourceNode: FewerNode, parentId: string | null) => { newNode: FewerNode; newId: string };
  /** Duplicate a node + all descendants (full subtree). */
  _duplicateSubtree: (id: string, parentId: string | null) => { newRoot: FewerNode | null; newNodes: FewerNode[]; newEdges: FewerEdge[] };
  /** Duplicate a node under the same parent (Ctrl+D / context menu "Duplicate"). */
  duplicateNodeUnderParent: (id: string) => void;
  /** Paste a copied node. If parentId is a folder, paste as child; otherwise standalone. */
  pasteNode: (id: string, parentId?: string | null) => void;
  /** Paste from clipboard stored data (works after cut removes originals). */
  pasteFromClipboard: (parentId?: string | null) => void;
  /** Move a cut node: remove original, create standalone copy. */
  moveNode: (id: string) => void;

  // mutations
  deleteNodes: (ids: string[]) => void;
  renameNode: (id: string, newLabel: string) => void;
  duplicateNode: (id: string) => void;
  addNode: (
    parentId: string | null,
    label: string,
    type: "folder" | "file",
  ) => void;
  /** Add a standalone root node at the given canvas position */
  addStandaloneNode: (
    label: string,
    type: "folder" | "file",
    position: { x: number; y: number },
  ) => void;
  /** Validate + create an edge between two existing nodes */
  connectNodes: (connection: Connection) => { ok: boolean; reason?: string };
  /** Remove edges from a specific handle (source or target) on Ctrl+click. */
  removeEdgesFromHandle: (nodeId: string, handleType: "source" | "target") => void;
  hideNode: (id: string) => void;
  hideNodes: (ids: string[]) => void;
  unhideAll: () => void;
  unhideNode: (id: string) => void;

  // loading state for directory import
  loading: boolean;
  setLoading: (loading: boolean) => void;

  // history
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  reset: () => void;
}

const MAX_HISTORY = 50;

function applySearch(
  nodes: FewerNode[],
  edges: FewerEdge[],
  query: string,
): FewerNode[] {
  if (!query.trim()) {
    return nodes.map((n) => ({
      ...n,
      data: { ...n.data, highlighted: false, dimmed: false },
    }));
  }
  const q = query.toLowerCase();
  return nodes.map((n) => {
    const matches =
      n.data.label.toLowerCase().includes(q) ||
      n.data.path.toLowerCase().includes(q) ||
      (n.data.extension ?? "").toLowerCase().includes(q);
    return {
      ...n,
      data: { ...n.data, highlighted: matches, dimmed: !matches },
    };
  });
}

export const useGraphStore = create<GraphState>((set, get) => ({
  nodes: [],
  edges: [],
  direction: "TB",
  edgeStyle: "curved",
  cornerRadius: 8,
  nodeWidth: 240,
  nodeHeight: 200,
  searchQuery: "",
  selectedNodeIds: [],
  hiddenIds: [],
  themeMode: "dark",
  customTheme: { ...DEFAULT_CUSTOM_THEME },
  clipboard: null,
  focusedNodeId: null,
  zoomToNode: null,
  mousePosition: null,
  pastePosition: null,
  past: [],
  future: [],
  searchOpen: false,
  exportOpen: false,
  sidebarOpen: true,
  advancedOpen: false,
  bugReportOpen: false,
  shortcutsOpen: false,
  renamingId: null,
  dataSource: null,
  exportSettings: {
    format: "svg",
    quality: 90,
    transparentBackground: false,
    includeStats: true,
  },

  setGraph: (nodes, edges, pushHistory = true, hiddenFileIds?: string[]) => {
    const state = get();
    if (pushHistory && state.nodes.length > 0) {
      set({
        past: [...state.past, { nodes: state.nodes, edges: state.edges }].slice(
          -MAX_HISTORY,
        ),
        future: [],
      });
    }
    // Set initial style dimensions on every node so the React Flow wrapper
    // has the correct width/height before the first measurement.
    // IMPORTANT: Only folder nodes get style.height — file nodes render at
    // their natural height and must not get height/minHeight applied.
    const styledNodes = nodes.map((n) => ({
      ...n,
      style: {
        ...n.style,
        width: state.nodeWidth,
        height: n.data.type === "folder" ? state.nodeHeight : undefined,
        minHeight: undefined,
      },
    }));
    // Exclude hidden file nodes from layout
    const excludeFromLayout = hiddenFileIds && hiddenFileIds.length > 0 ? new Set(hiddenFileIds) : undefined;
    const laid = layoutGraph(styledNodes, edges, state.direction, { excludeFromLayout });
    const searched = applySearch(laid, edges, state.searchQuery);
    // Set hiddenIds to hide file nodes from canvas view
    const idsToHide = hiddenFileIds ?? [];
    set({ nodes: searched, edges, hiddenIds: idsToHide });
  },

  setDirection: (direction) => {
    set({ direction });
    // Force React Flow to recalculate edge paths by creating new edge objects.
    // Just setting the same type doesn't trigger recalculation, so we
    // regenerate IDs so React Flow treats them as brand-new edges.
    const edgeTypeMap: Record<EdgeStyle, string> = {
      curved: "default",
      angled: "smoothstep",
      straight: "straight",
    };
    const currentStyle = get().edgeStyle;
    set((s) => ({
      edges: s.edges.map((e) => ({
        ...e,
        id: `e-${e.source}-${e.target}-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 7)}`,
        type: edgeTypeMap[currentStyle],
      })),
    }));
    get().relayout();
  },

  setEdgeStyle: (style) => {
    set({ edgeStyle: style });
    // Update ALL existing edges with the new type so the change is visible
    const edgeType = (
      style === "curved"
        ? "default"
        : style === "angled"
          ? "smoothstep"
          : "straight"
    ) as FewerEdge["type"];
    set((s) => ({
      edges: s.edges.map((e) => ({ ...e, type: edgeType })),
    }));
  },

  setCornerRadius: (radius) => {
    const clamped = Math.max(0, Math.min(20, radius));
    set({ cornerRadius: clamped });
    // Force edge re-render by creating new edge objects with updated pathOptions
    set((s) => ({
      edges: s.edges.map((e) => ({
        ...e,
        // smoothstep edges support borderRadius via pathOptions
        pathOptions: { borderRadius: clamped },
      })),
    }));
  },

  setNodeDimensions: (w, h) => {
    const newW = Math.max(120, w);
    const newH = Math.max(40, h);
    const { nodes } = get();
    // Apply the new dimensions to all existing nodes via inline style.
    // IMPORTANT: Node height only affects FOLDER nodes (controls the child
    // list area). File nodes always render at their natural height (~58px)
    // and must NOT get style.height/minHeight — otherwise the wrapper is
    // taller than the card and clicks on empty space below still select
    // the file node.
    const updatedNodes = nodes.map((n) => ({
      ...n,
      style: {
        ...n.style,
        width: newW,
        // Only folders get height — files keep their natural height
        height: n.data.type === "folder" ? newH : undefined,
        minHeight: undefined,
      },
      measured: undefined, // force dagre to use style dimensions
    }));
    set({ nodeWidth: newW, nodeHeight: newH, nodes: updatedNodes });
    // Trigger relayout so dagre uses the new dimensions
    setTimeout(() => {
      get().relayout();
    }, 50);
  },

  setAdvancedOpen: (open) => set({ advancedOpen: open }),
  setBugReportOpen: (open) => set({ bugReportOpen: open }),
  setLoading: (loading) => set({ loading }),
  setShortcutsOpen: (open) => set({ shortcutsOpen: open }),

  setCustomTheme: (partial) => {
    set((s) => ({ customTheme: { ...s.customTheme, ...partial } }));
    // Immediately apply the updated CSS variables to the document root
    applyCustomThemeToDOM(get().customTheme);
  },

  resetCustomTheme: () => {
    set({ customTheme: { ...DEFAULT_CUSTOM_THEME } });
    applyCustomThemeToDOM(DEFAULT_CUSTOM_THEME);
  },

  setThemeMode: (mode) => {
    set({ themeMode: mode });
    if (typeof window !== "undefined") {
      localStorage.setItem("fewer-theme", mode);
    }
    if (mode === "custom") {
      applyCustomThemeToDOM(get().customTheme);
    } else {
      clearCustomThemeFromDOM();
      if (typeof document !== "undefined") {
        document.documentElement.classList.remove("light", "dark");
        document.documentElement.classList.add(mode);
        document.documentElement.style.colorScheme = mode;
      }
    }
  },

  setClipboard: (mode, nodeIds) => {
    const { nodes, edges } = get();
    // Snapshot the subtree for each node ID
    const allIds = new Set<string>();
    for (const id of nodeIds) {
      allIds.add(id);
      const queue = [id];
      while (queue.length) {
        const qid = queue.shift()!;
        for (const e of edges) {
          if (e.source === qid && !allIds.has(e.target)) {
            allIds.add(e.target);
            queue.push(e.target);
          }
        }
      }
    }
    const subtreeNodes = nodes.filter((n) => allIds.has(n.id));
    const subtreeEdges = edges.filter(
      (e) => allIds.has(e.source) && allIds.has(e.target),
    );
    set({ clipboard: { mode, nodeIds: [...nodeIds], subtreeNodes, subtreeEdges } });
  },

  clearClipboard: () => set({ clipboard: null }),
  setMousePosition: (pos) => set({ mousePosition: pos }),
  setPastePosition: (pos) => set({ pastePosition: pos }),
  setFocusedNodeId: (id) => set({ focusedNodeId: id }),

  relayout: () => {
    const { nodes, edges, direction, searchQuery, hiddenIds } = get();
    if (nodes.length === 0) return;
    const excludeFromLayout = hiddenIds.length > 0 ? new Set(hiddenIds) : undefined;
    const laid = layoutGraph(nodes, edges, direction, { excludeFromLayout });
    const searched = applySearch(laid, edges, searchQuery);
    set({ nodes: searched });
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query });
    const { nodes, edges } = get();
    set({ nodes: applySearch(nodes, edges, query) });
  },

  setSearchOpen: (open) => set({ searchOpen: open }),
  setExportOpen: (open) => set({ exportOpen: open }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setExportSettings: (settings) =>
    set((s) => ({ exportSettings: { ...s.exportSettings, ...settings } })),
  setSelectedNodeIds: (ids) => set({ selectedNodeIds: ids }),
  setRenamingId: (id) => set({ renamingId: id }),

  /**
   * Apply React Flow's node change events (drag, select, remove) directly
   * to the store. Position changes during drag do NOT push history — that
   * happens once on drag-stop via commitHistory().
   */
  applyNodeChanges: (changes) => {
    set((state) => {
      let nodes = state.nodes;
      let selectedNodeIds = state.selectedNodeIds;
      let needsRebuild = false;

      for (const change of changes) {
        if (change.type === "position" && change.position) {
          nodes = nodes.map((n) =>
            n.id === change.id
              ? { ...n, position: change.position!, dragging: change.dragging }
              : n,
          );
          needsRebuild = true;
        } else if (change.type === "select") {
          nodes = nodes.map((n) =>
            n.id === change.id ? { ...n, selected: change.selected } : n,
          );
          needsRebuild = true;
          if (change.selected) {
            if (!selectedNodeIds.includes(change.id)) {
              selectedNodeIds = [...selectedNodeIds, change.id];
            }
          } else {
            selectedNodeIds = selectedNodeIds.filter((id) => id !== change.id);
          }
        } else if (change.type === "remove") {
          // Defer to deleteNodes which handles descendants
          continue;
        } else if (change.type === "dimensions" && change.dimensions) {
          nodes = nodes.map((n) =>
            n.id === change.id
              ? {
                  ...n,
                  width: change.dimensions!.width,
                  height: change.dimensions!.height,
                }
              : n,
          );
          needsRebuild = true;
        }
      }

      if (!needsRebuild) return state;
      return { nodes, selectedNodeIds };
    });
  },

  /**
   * Apply React Flow's edge change events (select, remove).
   * Edge removal defers to deleteNodes for descendant cleanup.
   */
  applyEdgeChanges: (changes) => {
    const state = get();
    let edges = state.edges;
    let needsRebuild = false;

    for (const change of changes) {
      if (change.type === "select") {
        edges = edges.map((e) =>
          e.id === change.id ? { ...e, selected: change.selected } : e,
        );
        needsRebuild = true;
      } else if (change.type === "remove") {
        // Find the edge, delete the target node (and its descendants)
        const edge = state.edges.find((e) => e.id === change.id);
        if (edge) {
          // Just remove the edge itself (disconnect), don't delete the node
          edges = edges.filter((e) => e.id !== change.id);
          needsRebuild = true;
        }
      }
    }

    if (needsRebuild) {
      set({ edges });
      get().commitHistory();
    }
  },

  /**
   * Snapshot the current nodes/edges into the undo stack.
   * Called on drag-stop so a full drag is one undo step.
   */
  commitHistory: () => {
    const { nodes, edges, past } = get();
    if (nodes.length === 0) return;
    set({
      past: [...past, { nodes, edges }].slice(-MAX_HISTORY),
      future: [],
    });
  },

  deleteNodes: (ids) => {
    const { nodes, edges, past } = get();
    const idSet = new Set(ids);
    // also remove descendants
    const toRemove = new Set<string>();
    const queue = [...ids];
    while (queue.length) {
      const id = queue.shift()!;
      toRemove.add(id);
      for (const e of edges) {
        if (e.source === id && !toRemove.has(e.target)) {
          queue.push(e.target);
        }
      }
    }
    const newNodes = nodes.filter((n) => !toRemove.has(n.id));
    const newEdges = edges.filter(
      (e) => !toRemove.has(e.source) && !toRemove.has(e.target),
    );
    set({
      past: [...past, { nodes, edges }].slice(-MAX_HISTORY),
      future: [],
      nodes: applySearch(newNodes, newEdges, get().searchQuery),
      edges: newEdges,
      selectedNodeIds: [],
    });
  },

  renameNode: (id, newLabel) => {
    const { nodes, edges, past } = get();
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    const newNodes = nodes.map((n) =>
      n.id === id
        ? {
            ...n,
            data: {
              ...n.data,
              label: trimmed,
              extension:
                n.data.type === "file" ? (trimmed.split(".").pop() ?? "") : "",
              category:
                n.data.type === "file"
                  ? categorizeByExtension(trimmed.split(".").pop() ?? "")
                  : undefined,
            },
          }
        : n,
    );
    set({
      past: [...past, { nodes, edges }].slice(-MAX_HISTORY),
      future: [],
      nodes: applySearch(newNodes, edges, get().searchQuery),
      renamingId: null,
    });
  },

  /** Helper: create a copy of a node with a "copy" label suffix. */
  _makeCopyNode: (sourceNode: FewerNode, parentId: string | null) => {
    const { nodes, edges, nodeWidth, nodeHeight } = get();
    const origLabel = sourceNode.data.label;
    const dot = origLabel.lastIndexOf(".");
    const stem = dot > 0 ? origLabel.slice(0, dot) : origLabel;
    const ext = dot > 0 ? origLabel.slice(dot) : "";

    // Check siblings for existing copy names
    const siblingIds = parentId
      ? edges.filter((e) => e.source === parentId).map((e) => e.target)
      : nodes
          .filter((n) => !edges.some((e) => e.target === n.id))
          .map((n) => n.id);
    const siblingLabels = new Set(
      nodes.filter((n) => siblingIds.includes(n.id)).map((n) => n.data.label),
    );

    let copyLabel = `${stem} copy${ext}`;
    if (siblingLabels.has(copyLabel)) {
      let counter = 2;
      while (siblingLabels.has(`${stem} copy ${counter}${ext}`)) {
        counter++;
      }
      copyLabel = `${stem} copy ${counter}${ext}`;
    }

    const newId = `n-dup-${uuid().slice(0, 8)}`;
    const newPath = parentId
      ? `${sourceNode.data.path.replace(origLabel, copyLabel)}`
      : copyLabel;

    return {
      newNode: {
        id: newId,
        type: sourceNode.type,
        position: {
          x: sourceNode.position.x + 40,
          y: sourceNode.position.y + 40,
        },
        data: {
          ...sourceNode.data,
          label: copyLabel,
          path: newPath,
          isRoot: parentId === null,
          selected: true,
        },
        style: {
          ...sourceNode.style,
          width: nodeWidth,
          height: sourceNode.data.type === "folder" ? nodeHeight : undefined,
        },
      } as FewerNode,
      newId,
    };
  },

  /**
   * Duplicate a node AND all its descendants (full subtree).
   * Returns the new root node, all new child nodes, and all new edges.
   */
  _duplicateSubtree: (id: string, parentId: string | null) => {
    const { nodes, edges } = get();
    const sourceNode = nodes.find((n) => n.id === id);
    if (!sourceNode) return { newRoot: null as FewerNode | null, newNodes: [] as FewerNode[], newEdges: [] as FewerEdge[] };

    // Collect all descendant IDs via BFS
    const allIds = new Set<string>([id]);
    const queue = [id];
    while (queue.length) {
      const qid = queue.shift()!;
      for (const e of edges) {
        if (e.source === qid && !allIds.has(e.target)) {
          allIds.add(e.target);
          queue.push(e.target);
        }
      }
    }

    // Build oldId → newId mapping
    const idMap = new Map<string, string>();
    for (const oid of allIds) {
      idMap.set(oid, `n-dup-${uuid().slice(0, 8)}`);
    }

    const newRootId = idMap.get(id)!;
    const origLabel = sourceNode.data.label;
    const dot = origLabel.lastIndexOf(".");
    const stem = dot > 0 ? origLabel.slice(0, dot) : origLabel;
    const ext = dot > 0 ? origLabel.slice(dot) : "";

    // Check siblings for existing copy names
    const siblingIds = parentId
      ? edges.filter((e) => e.source === parentId).map((e) => e.target)
      : nodes
          .filter((n) => !edges.some((e) => e.target === n.id))
          .map((n) => n.id);
    const siblingLabels = new Set(
      nodes.filter((n) => siblingIds.includes(n.id)).map((n) => n.data.label),
    );

    let copyLabel = `${stem} copy${ext}`;
    if (siblingLabels.has(copyLabel)) {
      let counter = 2;
      while (siblingLabels.has(`${stem} copy ${counter}${ext}`)) {
        counter++;
      }
      copyLabel = `${stem} copy ${counter}${ext}`;
    }

    const { nodeWidth, nodeHeight } = get();

    // Create new nodes
    const newNodes: FewerNode[] = [];
    for (const oid of allIds) {
      const orig = nodes.find((n) => n.id === oid)!;
      const nid = idMap.get(oid)!;
      const isRoot = oid === id;
      const newPath = isRoot
        ? (parentId ? `${sourceNode.data.path.replace(origLabel, copyLabel)}` : copyLabel)
        : orig.data.path; // children keep their relative path
      newNodes.push({
        ...orig,
        id: nid,
        position: isRoot
          ? { x: orig.position.x + 40, y: orig.position.y + 40 }
          : { ...orig.position },
        data: {
          ...orig.data,
          label: isRoot ? copyLabel : orig.data.label,
          path: newPath,
          isRoot: isRoot && parentId === null,
          selected: isRoot,
        },
        style: {
          ...orig.style,
          width: nodeWidth,
          height: orig.data.type === "folder" ? nodeHeight : undefined,
        },
        selected: isRoot,
      });
    }

    // Create new edges (internal subtree edges + parent link)
    const newEdges: FewerEdge[] = [];
    for (const e of edges) {
      if (allIds.has(e.source) && allIds.has(e.target)) {
        newEdges.push({
          ...e,
          id: `e-${idMap.get(e.source)}-${idMap.get(e.target)}-${uuid().slice(0, 6)}`,
          source: idMap.get(e.source)!,
          target: idMap.get(e.target)!,
        });
      }
    }
    if (parentId) {
      newEdges.push({
        id: `e-${parentId}-${newRootId}`,
        source: parentId,
        target: newRootId,
        type: "default",
      });
    }

    return {
      newRoot: newNodes.find((n) => n.id === newRootId)!,
      newNodes,
      newEdges,
    };
  },

  /** Duplicate a node + its children under the same parent (Ctrl+D / context menu "Duplicate"). */
  duplicateNodeUnderParent: (id) => {
    const { nodes, edges, past } = get();
    const parentId = edges.find((e) => e.target === id)?.source ?? null;
    const { newRoot, newNodes, newEdges } = get()._duplicateSubtree(id, parentId);
    if (!newRoot) return;

    const updatedNodes = nodes.map((n) => ({ ...n, selected: false }));
    set({
      past: [...past, { nodes, edges }].slice(-MAX_HISTORY),
      future: [],
      nodes: applySearch([...updatedNodes, ...newNodes], [...edges, ...newEdges], get().searchQuery),
      edges: [...edges, ...newEdges],
      selectedNodeIds: [newRoot.id],
    });
  },

  /**
   * Paste a copied node + its children.
   * If parentFolderId is provided and is a folder node, paste as child.
   * Otherwise paste as standalone (no parent).
   */
  pasteNode: (id, parentFolderId?: string | null) => {
    const { nodes, edges, past } = get();
    let effectiveParentId: string | null = null;
    if (parentFolderId) {
      const parent = nodes.find((n) => n.id === parentFolderId);
      if (parent && parent.data.type === "folder") {
        effectiveParentId = parentFolderId;
      }
    }
    const { newRoot, newNodes, newEdges } = get()._duplicateSubtree(id, effectiveParentId);
    if (!newRoot) return;

    const updatedNodes = nodes.map((n) => ({ ...n, selected: false }));
    set({
      past: [...past, { nodes, edges }].slice(-MAX_HISTORY),
      future: [],
      nodes: applySearch([...updatedNodes, ...newNodes], [...edges, ...newEdges], get().searchQuery),
      edges: [...edges, ...newEdges],
      selectedNodeIds: [newRoot.id],
    });
  },

  /**
   * Paste from clipboard stored subtree data.
   * Uses the snapshot stored in clipboard so it works even after cut removes originals.
   */
  /** Find a position that doesn't overlap existing nodes. */
  _findFreePosition: (baseX: number, baseY: number, nodeWidth: number, nodeHeight: number) => {
    const { nodes } = get();
    const PADDING = 40;
    let x = baseX;
    let y = baseY;
    let attempts = 0;
    const maxAttempts = 50;
    while (attempts < maxAttempts) {
      const overlapping = nodes.some(
        (n) =>
          Math.abs(n.position.x - x) < nodeWidth + PADDING &&
          Math.abs(n.position.y - y) < nodeHeight + PADDING,
      );
      if (!overlapping) break;
      // Shift diagonally in a grid pattern
      x += nodeWidth + PADDING;
      if (x > baseX + nodeWidth * 3) {
        x = baseX;
        y += nodeHeight + PADDING;
      }
      attempts++;
    }
    return { x, y };
  },

  /** Find a free position for a bounding box (subtree) instead of a single node. */
  _findFreePositionForBounds: (baseX: number, baseY: number, boundsWidth: number, boundsHeight: number) => {
    const { nodes, nodeWidth, nodeHeight } = get();
    const PADDING = 40;
    let x = baseX;
    let y = baseY;
    let attempts = 0;
    const maxAttempts = 50;
    while (attempts < maxAttempts) {
      const overlapping = nodes.some((n) => {
        const nw = n.style?.width ?? nodeWidth;
        const nh = n.data.type === "folder" ? (n.style?.height ?? nodeHeight) : 60;
        // Rectangle intersection test
        return !(
          x + boundsWidth + PADDING < n.position.x ||
          x > n.position.x + nw + PADDING ||
          y + boundsHeight + PADDING < n.position.y ||
          y > n.position.y + nh + PADDING
        );
      });
      if (!overlapping) break;
      // Shift diagonally in a grid pattern
      x += boundsWidth + PADDING;
      if (x > baseX + boundsWidth * 3) {
        x = baseX;
        y += boundsHeight + PADDING;
      }
      attempts++;
    }
    return { x, y };
  },

  pasteFromClipboard: (parentFolderId?: string | null) => {
    const clip = get().clipboard;
    if (!clip || clip.nodeIds.length === 0) return;

    // If no explicit pastePosition was set, fall back to the tracked mouse position
    const { pastePosition: explicitPastePos, mousePosition } = get();
    const effectivePastePos = explicitPastePos ?? mousePosition;

    let effectiveParentId: string | null = null;
    if (parentFolderId) {
      const parent = get().nodes.find((n) => n.id === parentFolderId);
      if (parent && parent.data.type === "folder") {
        effectiveParentId = parentFolderId;
      }
    }

    const { past, nodes, edges, nodeWidth, nodeHeight } = get();
    const { subtreeNodes, subtreeEdges } = clip;

    // Find the root node(s) from the stored subtree
    const allIds = new Set(subtreeNodes.map((n) => n.id));
    const rootIds = clip.nodeIds.filter((id) => allIds.has(id));

    // Build oldId → newId mapping
    const idMap = new Map<string, string>();
    for (const oid of allIds) {
      idMap.set(oid, `n-paste-${uuid().slice(0, 8)}`);
    }

    const newNodes: FewerNode[] = [];

    // Compute subtree bounding box and find a free position for the whole block.
    // This prevents the root AND its children from overlapping with existing nodes.
    const rootOrig = subtreeNodes.find((n) => rootIds.includes(n.id));
    const minX = Math.min(...subtreeNodes.map((n) => n.position.x));
    const minY = Math.min(...subtreeNodes.map((n) => n.position.y));
    const maxX = Math.max(...subtreeNodes.map((n) => n.position.x + (n.style?.width ?? nodeWidth)));
    const maxY = Math.max(...subtreeNodes.map((n) => n.position.y + (n.style?.height ?? 60)));
    const boundsW = maxX - minX;
    const boundsH = maxY - minY;

    const defaultBase = rootOrig
      ? { x: rootOrig.position.x + 40, y: rootOrig.position.y + 40 }
      : { x: 0, y: 0 };
    const tryBase = effectivePastePos ? effectivePastePos : defaultBase;
    const rootBase = rootOrig
      ? get()._findFreePositionForBounds(tryBase.x, tryBase.y, boundsW, boundsH)
      : { x: 0, y: 0 };
    const rootDelta = rootOrig
      ? { x: rootBase.x - rootOrig.position.x, y: rootBase.y - rootOrig.position.y }
      : { x: 0, y: 0 };

    for (const orig of subtreeNodes) {
      const nid = idMap.get(orig.id)!;
      const isRoot = rootIds.includes(orig.id);
      // Compute label for each root node
      let copyLabel = orig.data.label;
      if (isRoot) {
        const dot = orig.data.label.lastIndexOf(".");
        const stem = dot > 0 ? orig.data.label.slice(0, dot) : orig.data.label;
        const ext = dot > 0 ? orig.data.label.slice(dot) : "";
        const parentSiblingIds = effectiveParentId
          ? edges.filter((e) => e.source === effectiveParentId).map((e) => e.target)
          : nodes
              .filter((n) => !edges.some((e) => e.target === n.id))
              .map((n) => n.id);
        const parentSiblingLabels = new Set(
          nodes.filter((n) => parentSiblingIds.includes(n.id)).map((n) => n.data.label),
        );
        // Preserve original name unless there's a conflict at the paste destination
        if (parentSiblingLabels.has(orig.data.label)) {
          let cl = `${stem} copy${ext}`;
          if (parentSiblingLabels.has(cl)) {
            let counter = 2;
            while (parentSiblingLabels.has(`${stem} copy ${counter}${ext}`)) {
              counter++;
            }
            cl = `${stem} copy ${counter}${ext}`;
          }
          copyLabel = cl;
        }
        // else no conflict → keep original name
      }
      // Shift root to rootBase; shift children by rootDelta so the subtree layout is preserved
      const pos = isRoot
        ? rootBase
        : { x: orig.position.x + rootDelta.x, y: orig.position.y + rootDelta.y };
      newNodes.push({
        ...orig,
        id: nid,
        position: pos,
        data: {
          ...orig.data,
          label: copyLabel,
          path: isRoot ? copyLabel : orig.data.path,
          isRoot: isRoot && effectiveParentId === null,
          selected: isRoot,
        },
        style: {
          ...orig.style,
          width: nodeWidth,
          height: orig.data.type === "folder" ? nodeHeight : undefined,
        },
        selected: isRoot,
      });
    }

    const newEdges: FewerEdge[] = [];
    for (const e of subtreeEdges) {
      if (allIds.has(e.source) && allIds.has(e.target)) {
        newEdges.push({
          ...e,
          id: `e-${idMap.get(e.source)}-${idMap.get(e.target)}-${uuid().slice(0, 6)}`,
          source: idMap.get(e.source)!,
          target: idMap.get(e.target)!,
        });
      }
    }
    if (effectiveParentId) {
      const firstRootId = idMap.get(rootIds[0])!;
      newEdges.push({
        id: `e-${effectiveParentId}-${firstRootId}`,
        source: effectiveParentId,
        target: firstRootId,
        type: "default",
      });
    }

    const firstRoot = newNodes.find((n) => rootIds.includes(clip.nodeIds[0]) || n.selected);
    const selectId = firstRoot?.id ?? newNodes[0]?.id;

    const updatedNodes = nodes.map((n) => ({ ...n, selected: false }));
    set({
      past: [...past, { nodes, edges }].slice(-MAX_HISTORY),
      future: [],
      nodes: applySearch([...updatedNodes, ...newNodes], [...edges, ...newEdges], get().searchQuery),
      edges: [...edges, ...newEdges],
      selectedNodeIds: selectId ? [selectId] : [],
    });
  },

  /** Alias for backward compat: duplicateNode → duplicateNodeUnderParent. */
  duplicateNode: (id) => { get().duplicateNodeUnderParent(id); },

  /**
   * Cut: removes the node + its subtree immediately, stores info in clipboard
   * so the caller can later paste the subtree elsewhere.
   * Cut mode means: delete original, and on paste the user gets a fresh copy.
   * (No "move" on paste — the original is already removed.)
   */
  moveNode: (id) => {
    const { nodes, edges, past } = get();
    // Remove original subtree immediately
    const toRemove = new Set([id]);
    const queue = [id];
    while (queue.length) {
      const qid = queue.shift()!;
      for (const e of edges) {
        if (e.source === qid && !toRemove.has(e.target)) {
          toRemove.add(e.target);
          queue.push(e.target);
        }
      }
    }
    const filteredNodes = nodes.filter((n) => !toRemove.has(n.id));
    const filteredEdges = edges.filter(
      (e) => !toRemove.has(e.source) && !toRemove.has(e.target),
    );

    const updatedNodes = filteredNodes.map((n) => ({ ...n, selected: false }));
    set({
      past: [...past, { nodes, edges }].slice(-MAX_HISTORY),
      future: [],
      nodes: applySearch(updatedNodes, filteredEdges, get().searchQuery),
      edges: filteredEdges,
      selectedNodeIds: [],
    });
  },

  addNode: (parentId, label, type) => {
    const { nodes, edges, past, nodeWidth, nodeHeight } = get();
    const parent = nodes.find((n) => n.id === parentId);
    const newPath = parent ? `${parent.data.path}/${label}` : label;
    const extension = type === "file" ? (label.split(".").pop() ?? "") : "";
    const newNode: FewerNode = {
      id: `n-new-${Date.now()}`,
      type,
      position: parent
        ? { x: parent.position.x + 30, y: parent.position.y + 80 }
        : { x: 0, y: 0 },
      data: {
        label,
        path: newPath,
        type,
        extension,
        category:
          type === "file" ? categorizeByExtension(extension) : undefined,
        size: 0,
        depth: parent ? (parent.data.depth ?? 0) + 1 : 0,
        isRoot: parentId === null,
      },
      style: {
        width: nodeWidth,
        // Only folders get height — files render at natural height
        height: type === "folder" ? nodeHeight : undefined,
        minHeight: undefined,
      },
    };
    const newEdge: FewerEdge | null = parentId
      ? {
          id: `e-${parentId}-${newNode.id}`,
          source: parentId,
          target: newNode.id,
          type: "default",
        }
      : null;
    const newEdges = newEdge ? [...edges, newEdge] : edges;
    const newNodes = [...nodes, newNode];
    set({
      past: [...past, { nodes, edges }].slice(-MAX_HISTORY),
      future: [],
      nodes: applySearch(newNodes, newEdges, get().searchQuery),
      edges: newEdges,
    });
    get().relayout();
  },

  addStandaloneNode: (label, type, position) => {
    const { nodes, edges, past, nodeWidth, nodeHeight } = get();
    const trimmed =
      label.trim() || (type === "folder" ? "New Folder" : "new-file.txt");
    const extension = type === "file" ? (trimmed.split(".").pop() ?? "") : "";
    const newNode: FewerNode = {
      id: `n-${uuid().slice(0, 8)}`,
      type,
      position,
      data: {
        label: trimmed,
        path: trimmed,
        type,
        extension,
        category:
          type === "file" ? categorizeByExtension(extension) : undefined,
        size: 0,
        depth: 0,
        isRoot: true,
      },
      style: {
        width: nodeWidth,
        // Only folders get height — files render at natural height
        height: type === "folder" ? nodeHeight : undefined,
        minHeight: undefined,
      },
    };
    const newNodes = [...nodes, newNode];
    set({
      past: [...past, { nodes, edges }].slice(-MAX_HISTORY),
      future: [],
      nodes: applySearch(newNodes, edges, get().searchQuery),
    });
  },

  connectNodes: (connection) => {
    const { nodes, edges, past } = get();
    if (!connection.source || !connection.target) {
      return { ok: false, reason: "Missing source or target." };
    }
    const result = validateConnection(
      connection.source,
      connection.target,
      nodes,
      edges,
    );
    if (!result.ok) return result;

    const newEdge: FewerEdge = {
      id: `e-${connection.source}-${connection.target}-${uuid().slice(0, 6)}`,
      source: connection.source,
      target: connection.target,
      type: "default",
    };
    set({
      past: [...past, { nodes, edges }].slice(-MAX_HISTORY),
      future: [],
      edges: [...edges, newEdge],
    });
    return { ok: true };
  },

  hideNode: (id) => {
    const { hiddenIds, selectedNodeIds } = get();
    if (hiddenIds.includes(id)) return;
    set({
      hiddenIds: [...hiddenIds, id],
      selectedNodeIds: selectedNodeIds.filter((sid) => sid !== id),
    });
  },

  hideNodes: (ids) => {
    const { hiddenIds, selectedNodeIds } = get();
    const newHidden = [...new Set([...hiddenIds, ...ids])];
    set({
      hiddenIds: newHidden,
      selectedNodeIds: selectedNodeIds.filter((sid) => !ids.includes(sid)),
    });
  },

  unhideNode: (id) => {
    const { hiddenIds } = get();
    set({ hiddenIds: hiddenIds.filter((h) => h !== id) });
  },

  removeEdgesFromHandle: (nodeId, handleType) => {
    const { nodes, edges, past } = get();
    const filteredEdges = edges.filter((e) => {
      if (handleType === "source") return e.source !== nodeId;
      if (handleType === "target") return e.target !== nodeId;
      return true;
    });
    if (filteredEdges.length === edges.length) return;
    set({
      past: [...past, { nodes, edges }].slice(-MAX_HISTORY),
      future: [],
      edges: filteredEdges,
    });
  },

  unhideAll: () => set({ hiddenIds: [] }),

  undo: () => {
    const { past, future, nodes, edges } = get();
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    set({
      past: past.slice(0, -1),
      future: [{ nodes, edges }, ...future].slice(0, MAX_HISTORY),
      nodes: applySearch(prev.nodes, prev.edges, get().searchQuery),
      edges: prev.edges,
    });
  },

  redo: () => {
    const { past, future, nodes, edges } = get();
    if (future.length === 0) return;
    const next = future[0];
    set({
      future: future.slice(1),
      past: [...past, { nodes, edges }].slice(-MAX_HISTORY),
      nodes: applySearch(next.nodes, next.edges, get().searchQuery),
      edges: next.edges,
    });
  },

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  reset: () =>
    set({
      nodes: [],
      edges: [],
      past: [],
      future: [],
      selectedNodeIds: [],
      searchQuery: "",
      hiddenIds: [],
      renamingId: null,
    }),
}));

/**
 * Apply custom theme colors as inline CSS variables on document.documentElement.
 * These --fewer-* variables are read by CustomNode via inline styles.
 */
function applyCustomThemeToDOM(theme: CustomTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const meta of THEME_COLOR_META) {
    root.style.setProperty(meta.cssVar, theme[meta.key]);
  }
}

/**
 * Remove all custom theme overrides so the default light/dark palette applies.
 * The defaults are set in globals.css under :root and .dark
 */
function clearCustomThemeFromDOM() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const meta of THEME_COLOR_META) {
    root.style.removeProperty(meta.cssVar);
  }
}
