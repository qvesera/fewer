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

  // react-flow change handling (drag/select/remove)
  applyNodeChanges: (changes: NodeChange[]) => void;
  applyEdgeChanges: (changes: EdgeChange[]) => void;
  /** Snapshot current nodes/edges into the undo stack */
  commitHistory: () => void;

  // mutations
  deleteNodes: (ids: string[]) => void;
  renameNode: (id: string, newLabel: string) => void;
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
  nodeWidth: 200,
  nodeHeight: 56,
  searchQuery: "",
  selectedNodeIds: [],
  hiddenIds: [],
  themeMode: "dark",
  customTheme: { ...DEFAULT_CUSTOM_THEME },
  clipboard: null,
  focusedNodeId: null,
  past: [],
  future: [],
  searchOpen: false,
  exportOpen: false,
  sidebarOpen: true,
  advancedOpen: false,
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
    const styledNodes = nodes.map((n) => ({
      ...n,
      style: {
        ...n.style,
        width: state.nodeWidth,
        height: n.data.type === "folder" ? state.nodeHeight : undefined,
        minHeight: n.data.type === "file" ? state.nodeHeight : undefined,
      },
    }));
    const laid = layoutGraph(styledNodes, edges, state.direction);
    const searched = applySearch(laid, edges, state.searchQuery);
    set({ nodes: searched, edges, hiddenIds: [] });
  },

  setDirection: (direction) => {
    set({ direction });
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
    // Use `height` (not minHeight) so dagre gets the actual rendered height
    // and positions nodes with correct vertical spacing.
    const updatedNodes = nodes.map((n) => ({
      ...n,
      style: {
        ...n.style,
        width: newW,
        // For folder nodes, height controls the child list area.
        // For file nodes, height is the card height.
        height: n.data.type === "folder" ? newH : undefined,
        minHeight: n.data.type === "file" ? newH : undefined,
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

  addNode: (parentId, label, type) => {
    const { nodes, edges, past, nodeWidth, nodeHeight } = get();
    const parent = nodes.find((n) => n.id === parentId);
    const newPath = parent ? `${parent.data.path}/${label}` : label;
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
        extension: type === "file" ? label.split(".").pop() ?? "" : "",
        category: undefined,
        size: 0,
        depth: parent ? (parent.data.depth ?? 0) + 1 : 0,
        isRoot: parentId === null,
      },
      style: {
        width: nodeWidth,
        height: type === "folder" ? nodeHeight : undefined,
        minHeight: type === "file" ? nodeHeight : undefined,
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
    const newNode: GraphirNode = {
      id: `n-${uuid().slice(0, 8)}`,
      type,
      position,
      data: {
        label: trimmed,
        path: trimmed,
        type,
        extension: type === "file" ? trimmed.split(".").pop() ?? "" : "",
        category: undefined,
        size: 0,
        depth: 0,
        isRoot: true,
      },
      style: {
        width: nodeWidth,
        height: type === "folder" ? nodeHeight : undefined,
        minHeight: type === "file" ? nodeHeight : undefined,
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
 * This overrides the values from globals.css for the 12 themeable variables.
 */
function applyCustomThemeToDOM(theme: CustomTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const meta of THEME_COLOR_META) {
    root.style.setProperty(meta.cssVar, theme[meta.key]);
  }
  // Also set the body background directly
  root.style.setProperty("--background", theme.background);
}

/**
 * Remove all custom theme overrides so the default light/dark palette applies.
 */
function clearCustomThemeFromDOM() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const meta of THEME_COLOR_META) {
    root.style.removeProperty(meta.cssVar);
  }
  root.style.removeProperty("--background");
}
