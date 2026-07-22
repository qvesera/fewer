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
import { categorizeByExtension, getFileExtension } from "@/lib/fewer/categorize";
import { TUTORIAL_STORAGE_KEY, TUTORIAL_BEGINNER_DONE_KEY } from "@/lib/fewer/tutorial";

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
  shareOpen: boolean;
  /** id of the node currently being renamed inline (null = none) */
  renamingId: string | null;
  renameSource: "canvas" | "folder" | null;
  /** tracks how the current graph was loaded (for tutorial) */
  dataSource: string | null;

  // minimap
  showMiniMap: boolean;
  miniMapPosition: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  miniMapSize: number;

  // power user mode
  advancedModeEnabled: boolean;
  setAdvancedMode: (enabled: boolean) => void;
  includeFiles: boolean;

  // export settings
  exportSettings: ExportSettings;

  setShowMiniMap: (show: boolean) => void;
  setMiniMapPosition: (position: "top-left" | "top-right" | "bottom-left" | "bottom-right") => void;
  setMiniMapSize: (size: number) => void;

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
  setShareOpen: (open: boolean) => void;
  relayout: () => void;
  setSearchQuery: (query: string) => void;
  setSearchOpen: (open: boolean) => void;
  setExportOpen: (open: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
  setExportSettings: (settings: Partial<ExportSettings>) => void;
  setSelectedNodeIds: (ids: string[]) => void;
  setRenamingId: (id: string | null, source?: "canvas" | "folder") => void;
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

   // zoom-to-node trigger (set by SearchPanel or ChildEntry double-click, watched by GraphCanvas)
   zoomToNode: { nodeId: string; timestamp: number } | null;
   setZoomToNode: (nodeId: string | null) => void;

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

  _makeCopyNode: (sourceNode: FewerNode, parentId: string | null) => { newNode: FewerNode; newId: string };
  _duplicateSubtree: (id: string, parentId: string | null) => { newRoot: FewerNode | null; newNodes: FewerNode[]; newEdges: FewerEdge[] };
  duplicateNodeUnderParent: (id: string) => void;
  pasteNode: (id: string, parentId?: string | null) => void;
  pasteFromClipboard: (parentId?: string | null) => void;
  moveNode: (id: string) => void;

  _findFreePositionForBounds: (baseX: number, baseY: number, boundsWidth: number, boundsHeight: number) => { x: number; y: number };

  // mutations
  deleteNodes: (ids: string[]) => void;
  renameNode: (id: string, newLabel: string) => void;
  duplicateNode: (id: string) => void;
  addNode: (
    parentId: string | null,
    label: string,
    type: "folder" | "file",
  ) => string;
  addStandaloneNode: (
    label: string,
    type: "folder" | "file",
    position: { x: number; y: number },
  ) => string;
  connectNodes: (connection: Connection) => { ok: boolean; reason?: string };
  removeEdgesFromHandle: (nodeId: string, handleType: "source" | "target") => void;
  deleteEdges: (ids: string[]) => void;
  hideNode: (id: string) => void;
  hideNodes: (ids: string[]) => void;
  unhideAll: () => void;
  unhideNode: (id: string) => void;
  unhideAncestors: (id: string) => void;
  unhideSubtree: (id: string) => void;

  // loading state for directory import
  loading: boolean;
  setLoading: (loading: boolean) => void;

  // history
  _pushPast: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  graphVersion: number;
  hiddenPanelExpandTrigger: number;
  triggerHiddenPanelExpand: () => void;

  // tutorial state
  tutorialBeginnerDone: string[];
  tutorialDismissed: boolean;
  tutorialDemoStep: number;
  rightClickDetected: boolean;
  markTutorialBeginnerStep: (id: string) => void;
  setTutorialDismissed: () => void;
  setTutorialDemoStep: (step: number) => void;
  setRightClickDetected: () => void;
  resetTutorial: () => void;

  reset: () => void;
}

const MAX_HISTORY = 50;

function sortEdges(edges: FewerEdge[], nodes: FewerNode[]): FewerEdge[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  return [...edges].sort((a, b) => {
    const aNode = nodeMap.get(a.target);
    const bNode = nodeMap.get(b.target);
    const aType = aNode?.data.type ?? "file";
    const bType = bNode?.data.type ?? "file";
    const typeDiff = (aType === "folder" ? 1 : 0) - (bType === "folder" ? 1 : 0);
    if (typeDiff !== 0) return typeDiff;
    const aLabel = aNode?.data.label ?? "";
    const bLabel = bNode?.data.label ?? "";
    return bLabel.localeCompare(aLabel);
  });
}

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
  shareOpen: false,
  renamingId: null,
  renameSource: null,
  dataSource: null,
  advancedModeEnabled: false,
  includeFiles: true,
  loading: false,
  exportSettings: {
    format: "svg",
    quality: 90,
    transparentBackground: false,
    includeStats: true,
  },
  showMiniMap: true,
  miniMapPosition: "bottom-right",
  miniMapSize: 160,
  graphVersion: 0,
  hiddenPanelExpandTrigger: 0,

  // tutorial state
  tutorialBeginnerDone: (() => {
    if (typeof window === "undefined") return [];
    try {
      const v = localStorage.getItem(TUTORIAL_BEGINNER_DONE_KEY);
      return v ? JSON.parse(v) : [];
    } catch { return []; }
  })(),
  tutorialDismissed: (() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(TUTORIAL_STORAGE_KEY) === "true";
    } catch { return false; }
  })(),
  tutorialDemoStep: 0,
  rightClickDetected: false,

  _pushPast: () => {
    const { nodes, edges, past } = get();
    if (nodes.length === 0) return;
    if (past.length > 0) {
      const last = past[past.length - 1];
      if (last.nodes.length === nodes.length && last.edges.length === edges.length) {
        const same = last.nodes.every((n, i) => n.id === nodes[i]?.id && n.data.label === nodes[i]?.data.label && n.position.x === nodes[i]?.position.x && n.position.y === nodes[i]?.position.y);
        if (same) {
          set({ future: [] });
          return;
        }
      }
    }
    set({
      past: [...past, { nodes, edges }].slice(-MAX_HISTORY),
      future: [],
    });
  },

  triggerHiddenPanelExpand: () => {
    set((s) => ({ hiddenPanelExpandTrigger: s.hiddenPanelExpandTrigger + 1 }));
  },

  setAdvancedMode: (enabled) => {
    set({ advancedModeEnabled: enabled });
    if (typeof window !== "undefined") {
      localStorage.setItem("fewer-advanced-mode", String(enabled));
    }
  },

  setGraph: (nodes, edges, pushHistory = true, hiddenFileIds?: string[]) => {
    const state = get();
    if (pushHistory && state.nodes.length > 0) {
      set({
        past: [...state.past, { nodes: state.nodes, edges: state.edges }].slice(-MAX_HISTORY),
        future: [],
      });
    }
    const styledNodes = nodes.map((n) => ({
      ...n,
      style: {
        ...n.style,
        width: state.nodeWidth,
        height: n.data.type === "folder" ? state.nodeHeight : undefined,
        minHeight: undefined,
      },
    }));
    const excludeFromLayout = hiddenFileIds && hiddenFileIds.length > 0 ? new Set(hiddenFileIds) : undefined;
    const laid = layoutGraph(styledNodes, edges, state.direction, { excludeFromLayout });
    const searched = applySearch(laid, edges, state.searchQuery);
    const idsToHide = hiddenFileIds ?? [];
    const sortedEdges = sortEdges(edges, styledNodes);
    set({ nodes: searched, edges: sortedEdges, hiddenIds: idsToHide, graphVersion: state.graphVersion + 1 });
  },

  setDirection: (direction) => {
    set({ direction });
    const edgeTypeMap: Record<EdgeStyle, string> = {
      curved: "default",
      angled: "smoothstep",
      straight: "straight",
    };
    const currentStyle = get().edgeStyle;
    set((s) => ({
      edges: s.edges.map((e) => ({
        ...e,
        id: `e-${e.source}-${e.target}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: edgeTypeMap[currentStyle] as FewerEdge["type"],
      })),
    }));
    get().relayout();
  },

  setEdgeStyle: (style) => {
    set({ edgeStyle: style });
    const edgeType = (
      style === "curved" ? "default"
      : style === "angled" ? "smoothstep"
      : "straight"
    ) as FewerEdge["type"];
    set((s) => ({ edges: s.edges.map((e) => ({ ...e, type: edgeType })) }));
  },

  setCornerRadius: (radius) => {
    const clamped = Math.max(0, Math.min(20, radius));
    set({ cornerRadius: clamped });
    set((s) => ({ edges: s.edges.map((e) => ({ ...e, pathOptions: { borderRadius: clamped } })) }));
  },

  setNodeDimensions: (w, h) => {
    const newW = Math.max(120, w);
    const newH = Math.max(40, h);
    const { nodes } = get();
    const updatedNodes = nodes.map((n) => ({
      ...n,
      style: {
        ...n.style,
        width: newW,
        height: n.data.type === "folder" ? newH : undefined,
        minHeight: undefined,
      },
      measured: undefined,
    }));
    set({ nodeWidth: newW, nodeHeight: newH, nodes: updatedNodes });
    setTimeout(() => get().relayout(), 50);
  },

  setAdvancedOpen: (open) => set({ advancedOpen: open }),
  setBugReportOpen: (open) => set({ bugReportOpen: open }),
  setLoading: (loading) => set({ loading }),
  setShortcutsOpen: (open) => set({ shortcutsOpen: open }),
  setShareOpen: (open) => set({ shareOpen: open }),

  setShowMiniMap: (show) => set({ showMiniMap: show }),
  setMiniMapPosition: (position) => set({ miniMapPosition: position }),
  setMiniMapSize: (size) => set({ miniMapSize: size }),

  setCustomTheme: (partial) => {
    set((s) => ({ customTheme: { ...s.customTheme, ...partial } }));
    applyCustomThemeToDOM(get().customTheme);
  },

  resetCustomTheme: () => {
    set({ customTheme: { ...DEFAULT_CUSTOM_THEME } });
    applyCustomThemeToDOM(DEFAULT_CUSTOM_THEME);
  },

  setThemeMode: (mode) => {
    set({ themeMode: mode });
    if (typeof window !== "undefined") localStorage.setItem("fewer-theme", mode);
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
    const allIds = new Set<string>();
    for (const id of nodeIds) {
      allIds.add(id);
      const queue = [id];
      while (queue.length) {
        const qid = queue.shift()!;
        for (const e of edges) { if (e.source === qid && !allIds.has(e.target)) { allIds.add(e.target); queue.push(e.target); } }
      }
    }
    const subtreeNodes = nodes.filter((n) => allIds.has(n.id));
    const subtreeEdges = edges.filter((e) => allIds.has(e.source) && allIds.has(e.target));
    set({ clipboard: { mode, nodeIds: [...nodeIds], subtreeNodes, subtreeEdges } });
  },

  clearClipboard: () => set({ clipboard: null }),
  setMousePosition: (pos) => set({ mousePosition: pos }),
  setPastePosition: (pos) => set({ pastePosition: pos }),
  setFocusedNodeId: (id) => set({ focusedNodeId: id }),
  setZoomToNode: (nodeId) => set({ zoomToNode: nodeId ? { nodeId, timestamp: Date.now() } : null }),

  relayout: () => {
    const { nodes, edges, direction, searchQuery, hiddenIds, graphVersion } = get();
    if (nodes.length === 0) return;
    const excludeFromLayout = hiddenIds.length > 0 ? new Set(hiddenIds) : undefined;
    const laid = layoutGraph(nodes, edges, direction, { excludeFromLayout });
    const searched = applySearch(laid, edges, searchQuery);
    set({ nodes: searched, graphVersion: graphVersion + 1 });
  },

  setSearchQuery: (query) => { set({ searchQuery: query }); const { nodes, edges } = get(); set({ nodes: applySearch(nodes, edges, query) }); },
  setSearchOpen: (open) => set({ searchOpen: open }),
  setExportOpen: (open) => set({ exportOpen: open }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setExportSettings: (settings) => set((s) => ({ exportSettings: { ...s.exportSettings, ...settings } })),
  setSelectedNodeIds: (ids) => set({ selectedNodeIds: ids }),

  setRenamingId: (id, source) => {
    if (id) {
      const { hiddenIds, edges } = get();
      if (hiddenIds.includes(id)) {
        const parentEdge = edges.find((e) => e.target === id);
        if (parentEdge) { set({ renamingId: id, renameSource: source ?? "canvas", zoomToNode: { nodeId: parentEdge.source, timestamp: Date.now() } }); return; }
      }
    }
    set({ renamingId: id, renameSource: id ? (source ?? "canvas") : null, zoomToNode: id ? { nodeId: id, timestamp: Date.now() } : null });
  },

  applyNodeChanges: (changes) => {
    set((state) => {
      let nodes = state.nodes;
      let selectedNodeIds = state.selectedNodeIds;
      let needsRebuild = false;
      for (const change of changes) {
        if (change.type === "position" && change.position) { nodes = nodes.map((n) => n.id === change.id ? { ...n, position: change.position!, dragging: change.dragging } : n); needsRebuild = true; }
        else if (change.type === "select") { nodes = nodes.map((n) => n.id === change.id ? { ...n, selected: change.selected } : n); needsRebuild = true; if (change.selected) { if (!selectedNodeIds.includes(change.id)) selectedNodeIds = [...selectedNodeIds, change.id]; } else selectedNodeIds = selectedNodeIds.filter((id) => id !== change.id); }
        else if (change.type === "remove") continue;
        else if (change.type === "dimensions" && change.dimensions) { nodes = nodes.map((n) => n.id === change.id ? { ...n, width: change.dimensions!.width, height: change.dimensions!.height } : n); needsRebuild = true; }
      }
      if (!needsRebuild) return state;
      return { nodes, selectedNodeIds };
    });
  },

  applyEdgeChanges: (changes) => {
    const state = get();
    let edges = state.edges;
    let needsRebuild = false;
    for (const change of changes) {
      if (change.type === "select") { edges = edges.map((e) => e.id === change.id ? { ...e, selected: change.selected } : e); needsRebuild = true; }
      else if (change.type === "remove") { const edge = state.edges.find((e) => e.id === change.id); if (edge) { edges = edges.filter((e) => e.id !== change.id); needsRebuild = true; } }
    }
    if (needsRebuild) { set({ edges }); get().commitHistory(); }
  },

  commitHistory: () => { get()._pushPast(); },

  deleteNodes: (ids) => {
    const { nodes, edges, past } = get();
    const toRemove = new Set<string>();
    const queue = [...ids];
    while (queue.length) { const id = queue.shift()!; toRemove.add(id); for (const e of edges) { if (e.source === id && !toRemove.has(e.target)) queue.push(e.target); } }
    const newNodes = nodes.filter((n) => !toRemove.has(n.id));
    const newEdges = edges.filter((e) => !toRemove.has(e.source) && !toRemove.has(e.target));
    set({ past: [...past, { nodes, edges }].slice(-MAX_HISTORY), future: [], nodes: applySearch(newNodes, newEdges, get().searchQuery), edges: newEdges, selectedNodeIds: [] });
  },

  renameNode: (id, newLabel) => {
    const { nodes, edges, past } = get();
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    const newNodes = nodes.map((n) => n.id === id ? (() => { const ext = n.data.type === "file" ? getFileExtension(trimmed) : ""; const label = ext ? trimmed.slice(0, -(ext.length + 1)) : trimmed; return { ...n, data: { ...n.data, label, extension: ext, category: ext ? categorizeByExtension(ext) : undefined } }; })() : n);
    set({ past: [...past, { nodes, edges }].slice(-MAX_HISTORY), future: [], nodes: applySearch(newNodes, edges, get().searchQuery), renamingId: null });
  },

  _makeCopyNode: (sourceNode, parentId) => {
    const { nodes, edges, nodeWidth, nodeHeight } = get();
    const siblingIds = parentId ? edges.filter((e) => e.source === parentId).map((e) => e.target) : nodes.filter((n) => !edges.some((e) => e.target === n.id)).map((n) => n.id);
    const siblingLabels = new Set(nodes.filter((n) => siblingIds.includes(n.id)).map((n) => n.data.label));
    let copyLabel = `${sourceNode.data.label} copy`;
    if (siblingLabels.has(copyLabel)) { let counter = 2; while (siblingLabels.has(`${sourceNode.data.label} copy ${counter}`)) counter++; copyLabel = `${sourceNode.data.label} copy ${counter}`; }
    const newId = `n-dup-${uuid().slice(0, 8)}`;
    return { newNode: { id: newId, type: sourceNode.type, position: { x: sourceNode.position.x + 40, y: sourceNode.position.y + 40 }, data: { ...sourceNode.data, label: copyLabel, extension: sourceNode.data.extension || "", path: parentId ? `${sourceNode.data.path.replace(sourceNode.data.label, copyLabel)}` : copyLabel, isRoot: parentId === null, selected: true }, style: { ...sourceNode.style, width: nodeWidth, height: sourceNode.data.type === "folder" ? nodeHeight : undefined } } as FewerNode, newId };
  },

  _duplicateSubtree: (id, parentId) => {
    const { nodes, edges } = get();
    const sourceNode = nodes.find((n) => n.id === id);
    if (!sourceNode) return { newRoot: null as FewerNode | null, newNodes: [] as FewerNode[], newEdges: [] as FewerEdge[] };
    const allIds = new Set<string>([id]); const queue = [id];
    while (queue.length) { const qid = queue.shift()!; for (const e of edges) { if (e.source === qid && !allIds.has(e.target)) { allIds.add(e.target); queue.push(e.target); } } }
    const idMap = new Map<string, string>();
    for (const oid of allIds) idMap.set(oid, `n-dup-${uuid().slice(0, 8)}`);
    const siblingIds = parentId ? edges.filter((e) => e.source === parentId).map((e) => e.target) : nodes.filter((n) => !edges.some((e) => e.target === n.id)).map((n) => n.id);
    const siblingLabels = new Set(nodes.filter((n) => siblingIds.includes(n.id)).map((n) => n.data.label));
    let copyLabel = `${sourceNode.data.label} copy`;
    if (siblingLabels.has(copyLabel)) { let counter = 2; while (siblingLabels.has(`${sourceNode.data.label} copy ${counter}`)) counter++; copyLabel = `${sourceNode.data.label} copy ${counter}`; }
    const { nodeWidth, nodeHeight } = get();
    const newNodes: FewerNode[] = [];
    for (const oid of allIds) {
      const orig = nodes.find((n) => n.id === oid)!;
      const nid = idMap.get(oid)!;
      const isRoot = oid === id;
      newNodes.push({ ...orig, id: nid, position: isRoot ? { x: orig.position.x + 40, y: orig.position.y + 40 } : { ...orig.position }, data: { ...orig.data, label: isRoot ? copyLabel : orig.data.label, path: isRoot ? (parentId ? `${sourceNode.data.path.replace(sourceNode.data.label, copyLabel)}` : copyLabel) : orig.data.path, isRoot: isRoot && parentId === null, selected: isRoot }, style: { ...orig.style, width: nodeWidth, height: orig.data.type === "folder" ? nodeHeight : undefined }, selected: isRoot });
    }
    const newEdges: FewerEdge[] = [];
    for (const e of edges) { if (allIds.has(e.source) && allIds.has(e.target)) { newEdges.push({ ...e, id: `e-${idMap.get(e.source)}-${idMap.get(e.target)}-${uuid().slice(0, 6)}`, source: idMap.get(e.source)!, target: idMap.get(e.target)! }); } }
    if (parentId) newEdges.push({ id: `e-${parentId}-${idMap.get(id)}`, source: parentId, target: idMap.get(id)!, type: "default" });
    return { newRoot: newNodes.find((n) => n.id === idMap.get(id))!, newNodes, newEdges };
  },

  duplicateNodeUnderParent: (id) => {
    const { nodes, edges, past } = get();
    const parentId = edges.find((e) => e.target === id)?.source ?? null;
    const { newRoot, newNodes, newEdges } = get()._duplicateSubtree(id, parentId);
    if (!newRoot) return;
    const updatedNodes = nodes.map((n) => ({ ...n, selected: false }));
    const mergedEdges = sortEdges([...edges, ...newEdges], [...updatedNodes, ...newNodes]);
    set({ past: [...past, { nodes, edges }].slice(-MAX_HISTORY), future: [], nodes: applySearch([...updatedNodes, ...newNodes], mergedEdges, get().searchQuery), edges: mergedEdges, selectedNodeIds: [newRoot.id] });
  },

  pasteNode: (id, parentFolderId?) => {
    const { nodes, edges, past } = get();
    let effectiveParentId: string | null = null;
    if (parentFolderId) { const parent = nodes.find((n) => n.id === parentFolderId); if (parent && parent.data.type === "folder") effectiveParentId = parentFolderId; }
    const { newRoot, newNodes, newEdges } = get()._duplicateSubtree(id, effectiveParentId);
    if (!newRoot) return;
    const updatedNodes = nodes.map((n) => ({ ...n, selected: false }));
    const mergedEdges = sortEdges([...edges, ...newEdges], [...updatedNodes, ...newNodes]);
    set({ past: [...past, { nodes, edges }].slice(-MAX_HISTORY), future: [], nodes: applySearch([...updatedNodes, ...newNodes], mergedEdges, get().searchQuery), edges: mergedEdges, selectedNodeIds: [newRoot.id] });
  },

  _findFreePosition: (baseX, baseY, nodeWidth, nodeHeight) => {
    const { nodes } = get(); const PADDING = 40; let x = baseX; let y = baseY; let attempts = 0;
    while (attempts < 50) { const overlapping = nodes.some((n) => Math.abs(n.position.x - x) < nodeWidth + PADDING && Math.abs(n.position.y - y) < nodeHeight + PADDING); if (!overlapping) break; x += nodeWidth + PADDING; if (x > baseX + nodeWidth * 3) { x = baseX; y += nodeHeight + PADDING; } attempts++; }
    return { x, y };
  },

  _findFreePositionForBounds: (baseX, baseY, boundsWidth, boundsHeight) => {
    const { nodes, nodeWidth, nodeHeight } = get(); const PADDING = 40; let x = baseX; let y = baseY; let attempts = 0;
    while (attempts < 50) {
      const overlapping = nodes.some((n) => { const nw = n.style?.width ?? nodeWidth; const nh = n.data.type === "folder" ? (n.style?.height ?? nodeHeight) : 60; return !(x + boundsWidth + PADDING < n.position.x || x > n.position.x + Number(nw) + PADDING || y + boundsHeight + PADDING < n.position.y || y > n.position.y + Number(nh) + PADDING); });
      if (!overlapping) break; x += boundsWidth + PADDING; if (x > baseX + boundsWidth * 3) { x = baseX; y += boundsHeight + PADDING; } attempts++;
    }
    return { x, y };
  },

  pasteFromClipboard: (parentFolderId?) => {
    const clip = get().clipboard;
    if (!clip || clip.nodeIds.length === 0) return;
    const { pastePosition: explicitPastePos, mousePosition } = get();
    const effectivePastePos = explicitPastePos ?? mousePosition;
    let effectiveParentId: string | null = null;
    if (parentFolderId) { const parent = get().nodes.find((n) => n.id === parentFolderId); if (parent && parent.data.type === "folder") effectiveParentId = parentFolderId; }
    const { past, nodes, edges, nodeWidth, nodeHeight } = get();
    const { subtreeNodes, subtreeEdges } = clip;
    const allIds = new Set(subtreeNodes.map((n) => n.id));
    const rootIds = clip.nodeIds.filter((id) => allIds.has(id));
    const idMap = new Map<string, string>();
    for (const oid of allIds) idMap.set(oid, `n-paste-${uuid().slice(0, 8)}`);
    const newNodes: FewerNode[] = [];
    const rootOrig = subtreeNodes.find((n) => rootIds.includes(n.id));
    const minX = Math.min(...subtreeNodes.map((n) => n.position.x));
    const minY = Math.min(...subtreeNodes.map((n) => n.position.y));
    const maxX = Math.max(...subtreeNodes.map((n) => n.position.x + Number(n.style?.width ?? nodeWidth)));
    const maxY = Math.max(...subtreeNodes.map((n) => n.position.y + Number(n.style?.height ?? 60)));
    const boundsW = maxX - minX; const boundsH = maxY - minY;
    const defaultBase = rootOrig ? { x: rootOrig.position.x + 40, y: rootOrig.position.y + 40 } : { x: 0, y: 0 };
    const tryBase = effectivePastePos ? effectivePastePos : defaultBase;
    const rootBase = rootOrig ? get()._findFreePositionForBounds(tryBase.x, tryBase.y, boundsW, boundsH) : { x: 0, y: 0 };
    const rootDelta = rootOrig ? { x: rootBase.x - rootOrig.position.x, y: rootBase.y - rootOrig.position.y } : { x: 0, y: 0 };
    for (const orig of subtreeNodes) {
      const nid = idMap.get(orig.id)!;
      const isRoot = rootIds.includes(orig.id);
      let copyLabel = orig.data.label;
      if (isRoot) {
        const stem = orig.data.label;
        const parentSiblingIds = effectiveParentId ? edges.filter((e) => e.source === effectiveParentId).map((e) => e.target) : nodes.filter((n) => !edges.some((e) => e.target === n.id)).map((n) => n.id);
        const parentSiblingLabels = new Set(nodes.filter((n) => parentSiblingIds.includes(n.id)).map((n) => n.data.label));
        if (parentSiblingLabels.has(orig.data.label)) { let cl = `${stem} copy`; if (parentSiblingLabels.has(cl)) { let counter = 2; while (parentSiblingLabels.has(`${stem} copy ${counter}`)) counter++; cl = `${stem} copy ${counter}`; } copyLabel = cl; }
      }
      const pos = isRoot ? rootBase : { x: orig.position.x + rootDelta.x, y: orig.position.y + rootDelta.y };
      newNodes.push({ ...orig, id: nid, position: pos, data: { ...orig.data, label: copyLabel, path: isRoot ? copyLabel : orig.data.path, isRoot: isRoot && effectiveParentId === null, selected: isRoot }, style: { ...orig.style, width: nodeWidth, height: orig.data.type === "folder" ? nodeHeight : undefined }, selected: isRoot });
    }
    const newEdges: FewerEdge[] = [];
    for (const e of subtreeEdges) { if (allIds.has(e.source) && allIds.has(e.target)) { newEdges.push({ ...e, id: `e-${idMap.get(e.source)}-${idMap.get(e.target)}-${uuid().slice(0, 6)}`, source: idMap.get(e.source)!, target: idMap.get(e.target)! }); } }
    if (effectiveParentId) newEdges.push({ id: `e-${effectiveParentId}-${idMap.get(rootIds[0])}`, source: effectiveParentId, target: idMap.get(rootIds[0])!, type: "default" });
    const firstRoot = newNodes.find((n) => rootIds.includes((clip.nodeIds[0])) || n.selected);
    const selectId = firstRoot?.id ?? newNodes[0]?.id;
    const updatedNodes = nodes.map((n) => ({ ...n, selected: false }));
    const mergedEdges = sortEdges([...edges, ...newEdges], [...updatedNodes, ...newNodes]);
    set({ past: [...past, { nodes, edges }].slice(-MAX_HISTORY), future: [], nodes: applySearch([...updatedNodes, ...newNodes], mergedEdges, get().searchQuery), edges: mergedEdges, selectedNodeIds: selectId ? [selectId] : [] });
  },

  duplicateNode: (id) => { get().duplicateNodeUnderParent(id); },

  moveNode: (id) => {
    const { nodes, edges, past } = get();
    const toRemove = new Set([id]); const queue = [id];
    while (queue.length) { const qid = queue.shift()!; for (const e of edges) { if (e.source === qid && !toRemove.has(e.target)) { toRemove.add(e.target); queue.push(e.target); } } }
    const filteredNodes = nodes.filter((n) => !toRemove.has(n.id));
    const filteredEdges = edges.filter((e) => !toRemove.has(e.source) && !toRemove.has(e.target));
    const updatedNodes = filteredNodes.map((n) => ({ ...n, selected: false }));
    set({ past: [...past, { nodes, edges }].slice(-MAX_HISTORY), future: [], nodes: applySearch(updatedNodes, filteredEdges, get().searchQuery), edges: filteredEdges, selectedNodeIds: [] });
  },

  addNode: (parentId, label, type) => {
    const { nodes, edges, past, nodeWidth, nodeHeight } = get();
    const parent = nodes.find((n) => n.id === parentId);
    const newPath = parent ? `${parent.data.path}/${label}` : label;
    const ext = type === "file" ? getFileExtension(label) : "";
    const displayLabel = ext ? label.slice(0, -(ext.length + 1)) : label;
    // Find unique name under parent by appending (N) counter
    const siblingIds = parentId ? edges.filter((e) => e.source === parentId).map((e) => e.target) : [];
    const siblingLabels = new Set(nodes.filter((n) => siblingIds.includes(n.id)).map((n) => n.data.label));
    let finalLabel = displayLabel;
    let counter = 1;
    while (siblingLabels.has(finalLabel)) {
      finalLabel = `${displayLabel}(${counter})`;
      counter++;
    }
    const newNode: FewerNode = { id: `n-new-${Date.now()}`, type, position: parent ? { x: parent.position.x + 30, y: parent.position.y + 80 } : { x: 0, y: 0 }, data: { label: finalLabel, path: newPath, type, extension: ext, category: type === "file" ? categorizeByExtension(ext) : undefined, size: 0, depth: parent ? (parent.data.depth ?? 0) + 1 : 0, isRoot: parentId === null }, style: { width: nodeWidth, height: type === "folder" ? nodeHeight : undefined, minHeight: undefined } };
    const newEdge = parentId ? { id: `e-${parentId}-${newNode.id}`, source: parentId, target: newNode.id, type: "default" as const } : null;
    const newEdgesUnordered = newEdge ? [...edges, newEdge] : edges;
    const newNodes = [...nodes, newNode];
    const sorted = sortEdges(newEdgesUnordered, newNodes);
    set({ past: [...past, { nodes, edges }].slice(-MAX_HISTORY), future: [], nodes: applySearch(newNodes, sorted, get().searchQuery), edges: sorted });
    get().relayout();
    return newNode.id;
  },

  addStandaloneNode: (label, type, position) => {
    const { nodes, edges, past, nodeWidth, nodeHeight } = get();
    const trimmed = label.trim() || (type === "folder" ? "New Folder" : "new-file.txt");
    const ext = type === "file" ? getFileExtension(trimmed) : "";
    const displayLabel = ext ? trimmed.slice(0, -(ext.length + 1)) : trimmed;
    // Find unique name among root-level nodes by appending (N) counter
    const rootNodeLabels = new Set(nodes.filter((n) => !edges.some((e) => e.target === n.id)).map((n) => n.data.label));
    let finalLabel = displayLabel;
    let counter = 1;
    while (rootNodeLabels.has(finalLabel)) {
      finalLabel = `${displayLabel}(${counter})`;
      counter++;
    }
    const newNode: FewerNode = { id: `n-${uuid().slice(0, 8)}`, type, position, data: { label: finalLabel, path: trimmed, type, extension: ext, category: type === "file" ? categorizeByExtension(ext) : undefined, size: 0, depth: 0, isRoot: true }, style: { width: nodeWidth, height: type === "folder" ? nodeHeight : undefined, minHeight: undefined } };
    const newNodes = [...nodes, newNode];
    set({ past: [...past, { nodes, edges }].slice(-MAX_HISTORY), future: [], nodes: applySearch(newNodes, edges, get().searchQuery) });
    return newNode.id;
  },

  connectNodes: (connection) => {
    const { nodes, edges, past } = get();
    if (!connection.source || !connection.target) return { ok: false, reason: "Missing source or target." };
    const result = validateConnection(connection.source, connection.target, nodes, edges);
    if (!result.ok) return result;
    const newEdge: FewerEdge = { id: `e-${connection.source}-${connection.target}-${uuid().slice(0, 6)}`, source: connection.source, target: connection.target, type: "default" };
    const nextEdges = sortEdges([...edges, newEdge], [...nodes]);
    set({ past: [...past, { nodes, edges }].slice(-MAX_HISTORY), future: [], edges: nextEdges });
    return { ok: true };
  },

  hideNode: (id) => {
    const { hiddenIds, edges, selectedNodeIds } = get();
    if (hiddenIds.includes(id)) return;
    const toHide = new Set([id]); const queue = [id];
    while (queue.length) { const nid = queue.shift()!; for (const e of edges) { if (e.source === nid && !toHide.has(e.target)) { toHide.add(e.target); queue.push(e.target); } } }
    set({ hiddenIds: [...hiddenIds, ...toHide], selectedNodeIds: selectedNodeIds.filter((sid) => !toHide.has(sid)) });
  },

  hideNodes: (ids) => {
    const { hiddenIds, edges, selectedNodeIds } = get();
    const toHide = new Set(ids);
    for (const id of ids) { const queue = [id]; while (queue.length) { const nid = queue.shift()!; for (const e of edges) { if (e.source === nid && !toHide.has(e.target)) { toHide.add(e.target); queue.push(e.target); } } } }
    set({ hiddenIds: [...hiddenIds, ...toHide], selectedNodeIds: selectedNodeIds.filter((sid) => !toHide.has(sid)) });
    setTimeout(() => get().relayout(), 50);
  },

  unhideNode: (id) => { set((s) => ({ hiddenIds: s.hiddenIds.filter((h) => h !== id) })); get().relayout(); },

  unhideAncestors: (id) => {
    const { hiddenIds, edges } = get();
    if (!hiddenIds.includes(id)) return;
    const hiddenSet = new Set(hiddenIds);
    const parentMap = new Map<string, string>();
    for (const e of edges) parentMap.set(e.target, e.source);
    const toUnhide = new Set<string>([id]); let currentId: string | undefined = parentMap.get(id);
    while (currentId && hiddenSet.has(currentId)) { toUnhide.add(currentId); currentId = parentMap.get(currentId); }
    set({ hiddenIds: hiddenIds.filter((h) => !toUnhide.has(h)) }); get().relayout();
  },

  unhideSubtree: (id) => {
    const { hiddenIds, edges } = get();
    const toUnhide = new Set([id]); const queue = [id];
    while (queue.length) { const nid = queue.shift()!; for (const e of edges) { if (e.source === nid && hiddenIds.includes(e.target)) { toUnhide.add(e.target); queue.push(e.target); } } }
    set({ hiddenIds: hiddenIds.filter((h) => !toUnhide.has(h)) }); get().relayout();
  },

  removeEdgesFromHandle: (nodeId, handleType) => {
    const { nodes, edges, past } = get();
    const filteredEdges = edges.filter((e) => { if (handleType === "source") return e.source !== nodeId; if (handleType === "target") return e.target !== nodeId; return true; });
    if (filteredEdges.length === edges.length) return;
    set({ past: [...past, { nodes, edges }].slice(-MAX_HISTORY), future: [], edges: filteredEdges });
  },

  deleteEdges: (ids) => {
    const { nodes, edges, past } = get();
    const idSet = new Set(ids);
    const filtered = edges.filter((e) => !idSet.has(e.id));
    if (filtered.length === edges.length) return;
    set({ past: [...past, { nodes, edges }].slice(-MAX_HISTORY), future: [], edges: filtered });
  },

  unhideAll: () => set({ hiddenIds: [] }),

  undo: () => {
    const { past, future, nodes, edges } = get();
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    set({ past: past.slice(0, -1), future: [{ nodes, edges }, ...future].slice(0, MAX_HISTORY), nodes: applySearch(prev.nodes, prev.edges, get().searchQuery), edges: prev.edges });
  },

  redo: () => {
    const { past, future, nodes, edges } = get();
    if (future.length === 0) return;
    const next = future[0];
    set({ future: future.slice(1), past: [...past, { nodes, edges }].slice(-MAX_HISTORY), nodes: applySearch(next.nodes, next.edges, get().searchQuery), edges: next.edges });
  },

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  // tutorial setters
  markTutorialBeginnerStep: (id) => {
    const done = get().tutorialBeginnerDone;
    if (done.includes(id)) return;
    const next = [...done, id];
    set({ tutorialBeginnerDone: next });
    if (typeof window !== "undefined") { try { localStorage.setItem(TUTORIAL_BEGINNER_DONE_KEY, JSON.stringify(next)); } catch { /* ignore */ } }
  },
  setTutorialDismissed: () => {
    set({ tutorialDismissed: true });
    if (typeof window !== "undefined") { try { localStorage.setItem(TUTORIAL_STORAGE_KEY, "true"); } catch { /* ignore */ } }
  },
  setTutorialDemoStep: (step) => set({ tutorialDemoStep: step }),
  setRightClickDetected: () => set({ rightClickDetected: true }),
  resetTutorial: () => {
    set({ tutorialBeginnerDone: [], tutorialDismissed: false, tutorialDemoStep: 0, rightClickDetected: false });
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(TUTORIAL_STORAGE_KEY);
        localStorage.removeItem(TUTORIAL_BEGINNER_DONE_KEY);
      } catch { /* ignore */ }
    }
  },

  reset: () => set({ nodes: [], edges: [], past: [], future: [], selectedNodeIds: [], searchQuery: "", hiddenIds: [], renamingId: null }),
}));

function applyCustomThemeToDOM(theme: CustomTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const meta of THEME_COLOR_META) root.style.setProperty(meta.cssVar, theme[meta.key]);
}

function clearCustomThemeFromDOM() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const meta of THEME_COLOR_META) root.style.removeProperty(meta.cssVar);
}