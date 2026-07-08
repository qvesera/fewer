"use client";

import { create } from "zustand";
import type {
  GraphirNode,
  GraphirEdge,
  LayoutDirection,
  ExportSettings,
} from "@/lib/graphir/types";
import { layoutGraph } from "@/lib/graphir/layout";

interface GraphState {
  nodes: GraphirNode[];
  edges: GraphirEdge[];
  direction: LayoutDirection;
  searchQuery: string;
  selectedNodeIds: string[];

  // history
  past: { nodes: GraphirNode[]; edges: GraphirEdge[] }[];
  future: { nodes: GraphirNode[]; edges: GraphirEdge[] }[];

  // ui
  searchOpen: boolean;
  exportOpen: boolean;
  sidebarOpen: boolean;

  // export settings
  exportSettings: ExportSettings;

  // actions
  setGraph: (nodes: GraphirNode[], edges: GraphirEdge[], pushHistory?: boolean) => void;
  setDirection: (direction: LayoutDirection) => void;
  relayout: () => void;
  setSearchQuery: (query: string) => void;
  setSearchOpen: (open: boolean) => void;
  setExportOpen: (open: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
  setExportSettings: (settings: Partial<ExportSettings>) => void;
  setSelectedNodeIds: (ids: string[]) => void;

  // mutations
  deleteNodes: (ids: string[]) => void;
  renameNode: (id: string, newLabel: string) => void;
  addNode: (parentId: string | null, label: string, type: "folder" | "file") => void;

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
  searchQuery: "",
  selectedNodeIds: [],
  past: [],
  future: [],
  searchOpen: false,
  exportOpen: false,
  sidebarOpen: true,
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
    const laid = layoutGraph(nodes, edges, state.direction);
    const searched = applySearch(laid, edges, state.searchQuery);
    set({ nodes: searched, edges });
  },

  setDirection: (direction) => {
    set({ direction });
    get().relayout();
  },

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
    const newNodes = nodes.map((n) =>
      n.id === id ? { ...n, data: { ...n.data, label: newLabel } } : n
    );
    set({
      past: [...past, { nodes, edges }].slice(-MAX_HISTORY),
      future: [],
      nodes: applySearch(newNodes, edges, get().searchQuery),
    });
  },

  addNode: (parentId, label, type) => {
    const { nodes, edges, past } = get();
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
    }),
}));
