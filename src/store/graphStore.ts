"use client";

import { create } from "zustand";
import type { NodeChange, Connection, EdgeChange } from "@xyflow/react";
import { v4 as uuid } from "uuid";
import type {
  GraphirNode,
  GraphirEdge,
  LayoutDirection,
  EdgeStyle,
  ExportSettings,
  CustomTheme,
  ThemeMode,
} from "@/lib/graphir/types";
import { DEFAULT_CUSTOM_THEME, THEME_COLOR_META } from "@/lib/graphir/types";
import { layoutGraph } from "@/lib/graphir/layout";
import { validateConnection } from "@/lib/graphir/validation";
import { categorizeByExtension } from "@/lib/graphir/categorize";

interface GraphState {
  nodes: GraphirNode[];
  edges: GraphirEdge[];
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
  past: { nodes: GraphirNode[]; edges: GraphirEdge[] }[];
  future: { nodes: GraphirNode[]; edges: GraphirEdge[] }[];

  // ui
  searchOpen: boolean;
  exportOpen: boolean;
  sidebarOpen: boolean;
  advancedOpen: boolean;
  bugReportOpen: boolean;
  shortcutsOpen: boolean;
  /** id of the node currently being renamed inline (null = none) */
  renamingId: string | null;

  // export settings
  exportSettings: ExportSettings;

  // actions
  setGraph: (nodes: GraphirNode[], edges: GraphirEdge[], pushHistory?: boolean) => void;
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

  // clipboard (copy/cut file handles for paste)
  clipboard: {
    mode: "copy" | "cut";
    nodeIds: string[];
  } | null;
  setClipboard: (mode: "copy" | "cut", nodeIds: string[]) => void;
  clearClipboard: () => void;

  // focused node for keyboard navigation
  focusedNodeId: string | null;
  setFocusedNodeId: (id: string | null) => void;

  // zoom-to-node trigger (set by SearchPanel, watched by GraphCanvas)
  zoomToNode: { nodeId: string; timestamp: number } | null;

  // react-flow change handling (drag/select/remove)
  applyNodeChanges: (changes: NodeChange[]) => void;
  applyEdgeChanges: (changes: EdgeChange[]) => void;
  /** Snapshot current nodes/edges into the undo stack */
  commitHistory: () => void;

  // mutations
  deleteNodes: (ids: string[]) => void;
  renameNode: (id: string, newLabel: string) => void;
  duplicateNode: (id: string) => void;
  addNode: (parentId: string | null, label: string, type: "folder" | "file") => void;
  /** Add a standalone root node at the given canvas position */
  addStandaloneNode: (label: string, type: "folder" | "file", position: { x: number; y: number }) => void;
  /** Validate + create an edge between two existing nodes */
  connectNodes: (connection: Connection) => { ok: boolean; reason?: string };
  hideNode: (id: string) => void;
  hideNodes: (ids: string[]) => void;
  unhideAll: () => void;
  unhideNode: (id: string) => void;

  // history
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  reset: () => void;
}

const MAX_HISTORY = 50;

function applySearch(
  nodes: GraphirNode[],
  edges: GraphirEdge[],
  query: string
): GraphirNode[] {
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
  past: [],
  future: [],
  searchOpen: false,
  exportOpen: false,
  sidebarOpen: true,
  advancedOpen: false,
  bugReportOpen: false,
  shortcutsOpen: false,
  renamingId: null,
  exportSettings: {
    format: "svg",
    quality: 90,
    transparentBackground: false,
    includeStats: true,
  },

  setGraph: (nodes, edges, pushHistory = true) => {
    const state = get();
    if (pushHistory && state.nodes.length > 0) {
      set({
        past: [
          ...state.past,
          { nodes: state.nodes, edges: state.edges },
        ].slice(-MAX_HISTORY),
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
    const laid = layoutGraph(styledNodes, edges, state.direction);
    const searched = applySearch(laid, edges, state.searchQuery);
    set({ nodes: searched, edges, hiddenIds: [] });
  },

  setDirection: (direction) => {
    set({ direction });
    // Force edge re-creation so React Flow recalculates edge paths
    // based on the new handle positions. Without this, edges keep
    // their old paths even though handles have moved.
    set((s) => ({
      edges: s.edges.map((e) => ({ ...e, type: e.type ?? "default" })),
    }));
    get().relayout();
  },

  setEdgeStyle: (style) => {
    set({ edgeStyle: style });
    // Update ALL existing edges with the new type so the change is visible
    const edgeType = (style === "curved" ? "default" : style === "angled" ? "smoothstep" : "straight") as GraphirEdge["type"];
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
    if (mode === "custom") {
      applyCustomThemeToDOM(get().customTheme);
    } else {
      clearCustomThemeFromDOM();
      // Sync with next-themes by setting the class on <html>
      if (typeof document !== "undefined") {
        document.documentElement.classList.remove("light", "dark");
        document.documentElement.classList.add(mode);
        document.documentElement.style.colorScheme = mode;
      }
    }
  },

  setClipboard: (mode, nodeIds) =>
    set({ clipboard: { mode, nodeIds: [...nodeIds] } }),

  clearClipboard: () => set({ clipboard: null }),

  setFocusedNodeId: (id) => set({ focusedNodeId: id }),

  relayout: () => {
    const { nodes, edges, direction, searchQuery } = get();
    if (nodes.length === 0) return;
    const laid = layoutGraph(nodes, edges, direction);
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
              : n
          );
          needsRebuild = true;
        } else if (change.type === "select") {
          nodes = nodes.map((n) =>
            n.id === change.id ? { ...n, selected: change.selected } : n
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
              ? { ...n, width: change.dimensions!.width, height: change.dimensions!.height }
              : n
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
          e.id === change.id ? { ...e, selected: change.selected } : e
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
      (e) => !toRemove.has(e.source) && !toRemove.has(e.target)
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
                n.data.type === "file" ? trimmed.split(".").pop() ?? "" : "",
              category:
                n.data.type === "file"
                  ? categorizeByExtension(trimmed.split(".").pop() ?? "")
                  : undefined,
            },
          }
        : n
    );
    set({
      past: [...past, { nodes, edges }].slice(-MAX_HISTORY),
      future: [],
      nodes: applySearch(newNodes, edges, get().searchQuery),
      renamingId: null,
    });
  },

  duplicateNode: (id) => {
    const { nodes, edges, past, nodeWidth, nodeHeight } = get();
    const sourceNode = nodes.find((n) => n.id === id);
    if (!sourceNode) return;

    // Generate a copy name: "file.ts" → "file copy.ts", "file copy.ts" → "file copy 2.ts"
    const origLabel = sourceNode.data.label;
    const dot = origLabel.lastIndexOf(".");
    const stem = dot > 0 ? origLabel.slice(0, dot) : origLabel;
    const ext = dot > 0 ? origLabel.slice(dot) : "";

    // Check siblings for existing copy names
    const parentId = edges.find((e) => e.target === id)?.source ?? null;
    const siblingIds = parentId
      ? edges.filter((e) => e.source === parentId).map((e) => e.target)
      : nodes.filter((n) => !edges.some((e) => e.target === n.id)).map((n) => n.id);
    const siblingLabels = new Set(
      nodes.filter((n) => siblingIds.includes(n.id)).map((n) => n.data.label)
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

    // Create the duplicate node, offset slightly from the original
    const newNode: GraphirNode = {
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
    };

    // If the original has a parent, link the duplicate to the same parent
    const newEdges: GraphirEdge[] = [];
    if (parentId) {
      newEdges.push({
        id: `e-${parentId}-${newId}`,
        source: parentId,
        target: newId,
        type: "default",
      });
    }

    // Deselect the original
    const updatedNodes = nodes.map((n) => ({ ...n, selected: false }));

    set({
      past: [...past, { nodes, edges }].slice(-MAX_HISTORY),
      future: [],
      nodes: applySearch([...updatedNodes, newNode], [...edges, ...newEdges], get().searchQuery),
      edges: [...edges, ...newEdges],
      selectedNodeIds: [newId],
    });
  },

  addNode: (parentId, label, type) => {
    const { nodes, edges, past, nodeWidth, nodeHeight } = get();
    const parent = nodes.find((n) => n.id === parentId);
    const newPath = parent ? `${parent.data.path}/${label}` : label;
    const extension = type === "file" ? label.split(".").pop() ?? "" : "";
    const newNode: GraphirNode = {
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
        category: type === "file" ? categorizeByExtension(extension) : undefined,
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
    const newEdge: GraphirEdge | null = parentId
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
    const trimmed = label.trim() || (type === "folder" ? "New Folder" : "new-file.txt");
    const extension = type === "file" ? trimmed.split(".").pop() ?? "" : "";
    const newNode: GraphirNode = {
      id: `n-${uuid().slice(0, 8)}`,
      type,
      position,
      data: {
        label: trimmed,
        path: trimmed,
        type,
        extension,
        category: type === "file" ? categorizeByExtension(extension) : undefined,
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
    const result = validateConnection(connection.source, connection.target, nodes, edges);
    if (!result.ok) return result;

    const newEdge: GraphirEdge = {
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
 * These --graphir-* variables are read by CustomNode via inline styles.
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
