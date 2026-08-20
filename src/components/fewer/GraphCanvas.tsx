"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  MiniMap,
  PanOnScrollMode,
  useReactFlow,
  useNodesState,
  useEdgesState,
  type NodeTypes,
  type OnSelectionChangeParams,
  type NodeChange,
  type Connection,
  Panel,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { CustomNode, KeyboardShortcuts } from ".";
import { startDashClock, stopDashClock } from "@/lib/fewer/dashClock";
import { useGraphStore } from "@/store/graphStore";
import { ZoomIn, ZoomOut, Maximize2, Crosshair, FolderOpen, Sparkles, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { EdgeStyle, EdgeStrokeStyle, FewerEdge, FewerNode } from "@/lib/fewer/types";
import { edgeDashPattern } from "@/lib/fewer/types";

const nodeTypes: NodeTypes = {
  folder: CustomNode,
  file: CustomNode,
};

function edgeTypeFor(style: EdgeStyle): FewerEdge["type"] {
  switch (style) {
    case "curved": return "default";
    case "angled": return "smoothstep";
    case "straight": return "straight";
  }
}

/**
 * Style the edges on the ancestor path of EVERY selected node — i.e. each edge
 * from a selected node up to its root parent (child edges are NOT highlighted).
 * Each path edge is colored by its target node type (folder vs file) so
 * multi-selection shows every selected node's path, not just the last-picked
 * one. Empty selection → all edges reset to default stroke.
 * Highlighted edges get zIndex 1 (above other edges but below every node,
 * which is locked at zIndex 1000 in visibleNodes).
 * 
 * Animation semantics:
 *   - selectedOnly on → selected-path edges ALWAYS animate (dialog pattern)
 *     and non-selected edges animate only when `animated` (sidebar motion).
 *   - selectedOnly off → `animated` drives all edges (sidebar pattern).
 */
function buildSelectedEdgeHighlight(
  selectedIds: string[],
  edges: FewerEdge[],
  nodes: FewerNode[],
  themeColors: { edge: string; folderIcon: string; fileIcon: string },
  edgeWidth: number,
  edgeAnimation: {
    animated: boolean;
    selectedOnly: boolean;
    animatedStrokeStyle: EdgeStrokeStyle;
    baseStrokeStyle: EdgeStrokeStyle;
  },
): FewerEdge[] {
  const typeByNodeId = new Map<string, "folder" | "file">();
  for (const n of nodes) typeByNodeId.set(n.id, n.data?.type);

  // Tree = at most one parent per node, so each node maps to a single parent
  // edge (the child → source). Walking this map from a selected node up to the
  // root gives exactly the ancestor path edges — child edges are NOT included.
  const parentEdgeOf = new Map<string, FewerEdge>();
  for (const e of edges) {
    if (!parentEdgeOf.has(e.target)) parentEdgeOf.set(e.target, e);
  }

  const highlighted = new Map<string, { stroke: string; width: number }>();
  for (const id of selectedIds) {
    let nodeId = id;
    const visited = new Set<string>();
    while (nodeId && !visited.has(nodeId)) {
      visited.add(nodeId);
      const parentEdge = parentEdgeOf.get(nodeId);
      if (!parentEdge) break;
      const stroke = typeByNodeId.get(parentEdge.target) === "folder" ? themeColors.folderIcon : themeColors.fileIcon;
      highlighted.set(parentEdge.id, { stroke, width: Math.max(edgeWidth, 3) });
      nodeId = parentEdge.source;
    }
  }

  const defaultStroke = themeColors.edge;
  return edges
    .map((e) => {
      const h = highlighted.get(e.id);
      // Per-edge animation: selected-path edges always animate when selectedOnly
      // is on; non-selected edges animate only when the global motion toggle is on.
      const selectedPath = edgeAnimation.selectedOnly && !!h;
      const anim = selectedPath || edgeAnimation.animated;
      // Selected-path edges use the dialog-chosen pattern; everything else uses
      // the sidebar base pattern (so unselected edges stay solid/static when
      // motion is off).
      const dash = anim ? edgeDashPattern(selectedPath ? edgeAnimation.animatedStrokeStyle : edgeAnimation.baseStrokeStyle) : edgeDashPattern(edgeAnimation.baseStrokeStyle);
      return h
        ? {
            ...e,
            zIndex: 1,
            animated: anim,
            style: { ...e.style, stroke: h.stroke, strokeWidth: h.width, ...(dash ? { strokeDasharray: dash } : { strokeDasharray: undefined }) },
          }
        : {
            ...e,
            animated: anim,
            style: { ...e.style, stroke: defaultStroke, strokeWidth: edgeWidth, ...(dash ? { strokeDasharray: dash } : { strokeDasharray: undefined }) },
          };
    })
    .sort((a, b) => (highlighted.has(a.id) ? 1 : 0) - (highlighted.has(b.id) ? 1 : 0));
}

/** Read a CSS variable from :root (falling back to the bare var name). */
function cssVar(name: string, fallback = ""): string {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

interface CanvasMenuPosition {
  x: number;
  y: number;
}

interface CanvasEmptyActionsProps {
  onOpenImport: () => void;
  onLoadSample: () => void;
}

function CanvasInner({ onOpenImport, onLoadSample }: CanvasEmptyActionsProps) {
  const allNodes = useGraphStore((s) => s.nodes);
  const allEdges = useGraphStore((s) => s.edges);
  const showFiles = useGraphStore((s) => s.showFiles);
  const setShowFiles = useGraphStore((s) => s.setShowFiles);
  const hiddenIds = useGraphStore((s) => s.hiddenIds);
  const edgeStyle = useGraphStore((s) => s.edgeStyle);
  const edgeAnimated = useGraphStore((s) => s.edgeAnimated);
  const edgeAnimatedSelectedOnly = useGraphStore((s) => s.edgeAnimatedSelectedOnly);
  const edgeStrokeStyle = useGraphStore((s) => s.edgeStrokeStyle);
  const edgeAnimatedStrokeStyle = useGraphStore((s) => s.edgeAnimatedStrokeStyle);
  const edgeWidth = useGraphStore((s) => s.edgeWidth);
  const cornerRadius = useGraphStore((s) => s.cornerRadius);
  const setSelectedNodeIds = useGraphStore((s) => s.setSelectedNodeIds);
  const deleteNodes = useGraphStore((s) => s.deleteNodes);
  const recordDragMoves = useGraphStore((s) => s.recordDragMoves);
  const recordResize = useGraphStore((s) => s.recordResize);
  const connectNodes = useGraphStore((s) => s.connectNodes);
  const loading = useGraphStore((s) => s.loading);
  const addStandaloneNode = useGraphStore((s) => s.addStandaloneNode);
  const advancedModeEnabled = useGraphStore((s) => s.advancedModeEnabled);
  const setRenamingId = useGraphStore((s) => s.setRenamingId);
  const { toast } = useToast();
  const containerRef = useRef<HTMLDivElement>(null);
  const setCanvasSize = useGraphStore((s) => s.setCanvasSize);
  const themeMode = useGraphStore((s) => s.themeMode);
  const customTheme = useGraphStore((s) => s.customTheme);
  const isDark = themeMode === "dark";

  // Keep the store's canvas dimensions in sync with the viewer so the
  // minimap X/Y sliders in Settings scale to the actual canvas (no hard cap).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setCanvasSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [setCanvasSize]);

  // Resolve theme colors once per theme change so edges, minimap, and the
  // background dots follow light/dark/custom without hard-coded values.
  const themeColors = useMemo(() => {
    const edge = cssVar("--fewer-edge", isDark ? "rgba(173, 181, 189, 0.5)" : "rgba(100, 116, 139, 0.4)");
    const folderBg = cssVar("--fewer-folder-bg", "rgba(253, 126, 20, 0.12)");
    const fileBg = cssVar("--fewer-file-bg", "rgba(190, 75, 219, 0.18)");
    const folderIcon = cssVar("--fewer-folder-icon", "#ffa94d");
    const fileIcon = cssVar("--fewer-file-icon", "#e599f7");
    const bgDot = isDark ? "rgba(173, 181, 189, 0.18)" : "rgba(100, 116, 139, 0.2)";
    return { edge, folderBg, fileBg, folderIcon, fileIcon, bgDot };
  }, [themeMode, isDark, customTheme]);

  const [canvasMenu, setCanvasMenu] = useState<CanvasMenuPosition | null>(null);
  const [lastClickedEdgeId, setLastClickedEdgeId] = useState<string | null>(null);

  const dashArray = useMemo(() => {
    switch (edgeStrokeStyle) {
      case "dashed": return "6 6";
      case "dotted": return "2 6";
      case "solid":
      default: return undefined;
    }
  }, [edgeStrokeStyle]);

  const visibleNodes = useMemo(() => {
    let nodes = hiddenIds.length === 0 ? allNodes : (() => { const hidden = new Set(hiddenIds); return allNodes.filter((n) => !hidden.has(n.id)); })();
    // Guarantee nodes always render above edges (React Flow defaults edges to 0,
    // nodes to 1000; we lock this explicitly so no edge can ever overlap a node).
    return nodes.map((n) => ({ ...n, zIndex: 1000 }));
  }, [allNodes, hiddenIds]);

  const visibleEdges = useMemo(() => {
    if (hiddenIds.length === 0) return allEdges;
    const hidden = new Set(hiddenIds);
    return allEdges.filter((e) => !hidden.has(e.source) && !hidden.has(e.target));
  }, [allEdges, hiddenIds]);

  const hiddenCount = hiddenIds.length;

  // True when any nodes were loaded at all. Distinct from rfNodes.length === 0,
  // which also becomes 0 when every node is hidden (e.g. a graph made only of
  // file nodes with "Show Files" turned off). In that case we must NOT show the
  // "No directory loaded" import/sample actions — a graph exists.
  const graphsExists = allNodes.length > 0;

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(visibleNodes);
  const [rfEdges, setRfEdges] = useEdgesState(visibleEdges);

  const graphVersion = useGraphStore((s) => s.graphVersion);
  const prevGraphVersion = useRef(graphVersion);
  useEffect(() => {
    if (graphVersion !== prevGraphVersion.current) {
      // Rebuild RF nodes from the store. Selection is authoritative in
      // `selectedNodeIds` (kept in sync by onSelectionChange); the per-node
      // `selected` flags on the store are NOT updated for RF-driven clicks, so
      // trusting them here would resurrect a stale selection (e.g. a node that
      // was deselected when clicking an edge comes back as selected after any
      // graph edit). Force `selected` from the canonical id list instead.
      const selectedSet = new Set(useGraphStore.getState().selectedNodeIds);
      setRfNodes(visibleNodes.map((n) => (selectedSet.has(n.id) ? { ...n, selected: true } : { ...n, selected: false })));
      setRfEdges(visibleEdges);
      prevGraphVersion.current = graphVersion;
    }
  }, [graphVersion, visibleNodes, visibleEdges, setRfNodes, setRfEdges]);

  // Run the shared edge-dash clock only while animated edges are enabled.
  // The loop writes --gm-dash-offset (see dashClock.ts) so edge (re)mounts
  // inherit the current phase instead of restarting a CSS animation.
  useEffect(() => {
    if (!(edgeAnimated || edgeAnimatedSelectedOnly)) return;
    startDashClock();
    return stopDashClock;
  }, [edgeAnimated, edgeAnimatedSelectedOnly]);

  const { fitView, zoomIn, zoomOut, getNodes, screenToFlowPosition } = useReactFlow();

  // Fit the view exactly once per loaded graph — when nodes first appear — and
  // never on relayout. React Flow's `fitView` boolean prop only fits at mount
  // (so an import that happens after the canvas mounts would never fit), and a
  // `graphVersion`-driven fitView would zoom/jump the user's viewport on every
  // relayout (parent/unparent, cut/paste, edge-style, beautify, …). Guarding on
  // "nodes went from empty to non-empty" gives a fit on initial load, and
  // resetting the guard when the canvas empties fits again on the next import.
  // The small delay lets the initial dimension-measure → relayout settle so the
  // fit targets real positions, not the raw stacked layout.
  const didInitialFitRef = useRef(false);
  useEffect(() => {
    if (visibleNodes.length === 0) {
      didInitialFitRef.current = false;
      return;
    }
    if (didInitialFitRef.current) return;
    didInitialFitRef.current = true;
    const t = setTimeout(() => fitView({ padding: 0.2, maxZoom: 1.0, minZoom: 0.35 }), 120);
    return () => clearTimeout(t);
  }, [visibleNodes, fitView]);

  const relayout = useGraphStore((s) => s.relayout);
  const hasMeasuredRef = useRef(false);
  const dragStartPositions = useRef<Map<string, { x: number; y: number }>>(new Map());
  const resizeStartDimensions = useRef<Map<string, { w: number; h: number }>>(new Map());
  const resizeTimerRef = useRef<number | null>(null);
  const zoomToNode = useGraphStore((s) => s.zoomToNode);
  const zoomToNodeIds = useGraphStore((s) => s.zoomToNodeIds);

  useEffect(() => {
    if (!zoomToNode) return;
    const { nodeId } = zoomToNode;
    const t = setTimeout(() => {
      fitView({ nodes: [{ id: nodeId }], duration: 600, padding: 0.3, maxZoom: 1.5 });
    }, 150);
    return () => clearTimeout(t);
  }, [zoomToNode, fitView]);

  const zoomToNodeIdsRef = useRef(zoomToNodeIds);
  useEffect(() => { zoomToNodeIdsRef.current = zoomToNodeIds; }, [zoomToNodeIds]);

  useEffect(() => {
    const ids = zoomToNodeIdsRef.current;
    if (ids && ids.length > 0) {
      const t = setTimeout(() => {
        fitView({ nodes: ids.map((id) => ({ id })), duration: 600, padding: 0.3, maxZoom: 1.5 });
        useGraphStore.getState().setZoomToNodeIds(null);
      }, 150);
      return () => clearTimeout(t);
    }
  }, [zoomToNodeIds]);

  // ── Re-apply edge colors + per-edge animation when the graph or its
  // theme/edge settings change ──. `graphVersion` is included so the ancestor
  // path highlight is recomputed against the LIVE structure every time the graph
  // mutates (parent/unparent, delete, cut/paste, …). Without it, a leftover
  // highlighted stroke survives on edges that were on a selected node's path
  // before an edit (e.g. unparenting `utils` leaves the now-irrelevant
  // `fewer→src` edge highlighted), because the old styled edges stay in the
  // store and are pushed to the canvas on the graph rebuild.
  useEffect(() => {
    const { selectedNodeIds, edges, nodes, hiddenIds, edgeAnimated: anim, edgeAnimatedSelectedOnly: animSelectedOnly, edgeAnimatedStrokeStyle, edgeStrokeStyle } = useGraphStore.getState();
    const updatedEdges = buildSelectedEdgeHighlight(selectedNodeIds, edges, nodes, themeColors, edgeWidth, { animated: anim, selectedOnly: animSelectedOnly, animatedStrokeStyle: edgeAnimatedStrokeStyle, baseStrokeStyle: edgeStrokeStyle });
    useGraphStore.setState({ edges: updatedEdges });
    const hidden = new Set(hiddenIds);
    setRfEdges(updatedEdges.filter((e) => !hidden.has(e.source) && !hidden.has(e.target)));
  }, [themeMode, setRfEdges, edgeWidth, themeColors, edgeAnimated, edgeAnimatedSelectedOnly, edgeAnimatedStrokeStyle, graphVersion]);

  // ── Selection: highlight ancestor path for EVERY selected node ──
  const onSelectionChange = useCallback(
    ({ nodes: selected }: OnSelectionChangeParams) => {
      const selectedIds = new Set(selected.map((n) => n.id));
      const prevIds = useGraphStore.getState().selectedNodeIds;
      const kept = prevIds.filter((id) => selectedIds.has(id));
      const added = selected.filter((n) => !prevIds.includes(n.id)).map((n) => n.id);
      const newIds = [...kept, ...added];
      setSelectedNodeIds(newIds);

      const { edges, nodes, hiddenIds, edgeAnimated: anim, edgeAnimatedSelectedOnly: animSelectedOnly, edgeAnimatedStrokeStyle, edgeStrokeStyle } = useGraphStore.getState();
      const updatedEdges = buildSelectedEdgeHighlight(newIds, edges, nodes, themeColors, edgeWidth, { animated: anim, selectedOnly: animSelectedOnly, animatedStrokeStyle: edgeAnimatedStrokeStyle, baseStrokeStyle: edgeStrokeStyle });
      useGraphStore.setState({ edges: updatedEdges });
      const hidden = new Set(hiddenIds);
      setRfEdges(updatedEdges.filter((e) => !hidden.has(e.source) && !hidden.has(e.target)));
    },
    [setSelectedNodeIds, setRfEdges, edgeWidth, themeColors],
  );

  // ── Handle node changes (position/dimension) ──
  const handleNodesChange = useCallback(
    (changes: NodeChange<FewerNode>[]) => {
      onNodesChange(changes);

      const dimensionChanges = changes.filter(
        (c): c is NodeChange<FewerNode> & { id: string; dimensions: { width: number; height: number } } =>
          c.type === "dimensions" && !!c.dimensions,
      );
      const positionChanges = changes.filter(
        (c): c is NodeChange<FewerNode> & { id: string; position: { x: number; y: number } } =>
          c.type === "position" && !!c.position,
      );

      if (positionChanges.length > 0) {
        useGraphStore.setState((s) => ({
          nodes: s.nodes.map((n) => {
            const change = positionChanges.find((c) => c.id === n.id);
            return change ? { ...n, position: change.position } : n;
          }),
        }));
      }

      if (dimensionChanges.length > 0) {
        useGraphStore.setState((s) => ({
          nodes: s.nodes.map((n) => {
            const change = dimensionChanges.find((c) => c.id === n.id);
            if (change) {
              // Record the pre-resize dimensions the first time we see this node resize.
              if (!resizeStartDimensions.current.has(n.id)) {
                const prev = n.style?.width ?? n.measured?.width ?? 0;
                const prevH = n.style?.height ?? n.measured?.height ?? 0;
                resizeStartDimensions.current.set(n.id, { w: prev, h: prevH });
              }
              return {
                ...n,
                style: { ...n.style, width: change.dimensions.width, height: n.data.type === "folder" ? change.dimensions.height : n.style?.height },
                measured: { width: change.dimensions.width, height: change.dimensions.height },
              };
            }
            return n;
          }),
        }));

        if (!hasMeasuredRef.current) {
          hasMeasuredRef.current = true;
          setTimeout(() => {
            // If the graph was just loaded with saved positions, don't re-lay
            // it out (that would scatter them). Skip and consume the flag.
            if (useGraphStore.getState().skipNextAutoLayout) {
              useGraphStore.setState({ skipNextAutoLayout: false });
              return;
            }
            relayout();
          }, 50);
        }

        // Commit a resize op once the resize gesture settles (debounced).
        if (resizeTimerRef.current) window.clearTimeout(resizeTimerRef.current);
        resizeTimerRef.current = window.setTimeout(() => {
          const store = useGraphStore.getState();
          const changes: { nodeId: string; from: { w: number; h: number }; to: { w: number; h: number } }[] = [];
          for (const [id, from] of resizeStartDimensions.current) {
            const node = store.nodes.find((n) => n.id === id);
            if (!node) continue;
            const to = { w: (node.style?.width as number) ?? 0, h: (node.style?.height as number) ?? 0 };
            if (from.w !== to.w || from.h !== to.h) changes.push({ nodeId: id, from, to });
          }
          if (changes.length > 0) recordResize(changes);
          resizeStartDimensions.current.clear();
        }, 300);
      }
    },
    [onNodesChange, relayout, fitView, recordResize],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const result = connectNodes(connection);
      if (!result.ok) {
        toast({ title: "Connection rejected", description: result.reason, variant: "destructive" });
      } else if (connection.source && connection.target) {
        setRfEdges((eds) => [...eds, { id: `e-${connection.source}-${connection.target}-${Date.now()}`, source: connection.source, target: connection.target, type: edgeTypeFor(edgeStyle) }]);
      }
    },
    [connectNodes, toast, setRfEdges, edgeStyle],
  );

  const onConnectEnd = useCallback(
    (_: unknown, connectionState: { isValid: boolean | null; fromNode?: { id: string; data?: { type?: string } } }) => {
      // Dropped on empty canvas from a folder's output handle → open Add Node dialog
      if (!connectionState.isValid && connectionState.fromNode?.data?.type === "folder") {
        const store = useGraphStore.getState();
        store.setSelectedNodeIds([connectionState.fromNode.id]);
        window.dispatchEvent(new CustomEvent("fewer-add-node"));
      }
    },
    [],
  );

  const onDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();
      const payload = event.dataTransfer.getData("application/fewer-child");
      if (!payload) return;
      try {
        const { label, type, parentId } = JSON.parse(payload);
        const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        const { draggedFolderHandle } = await import("./CustomNode");
        const handle = draggedFolderHandle as FileSystemDirectoryHandle | null;
        const { expandFolderNode } = await import("@/lib/fewer/fileOps");
        if (handle && handle.kind === "directory") {
          await expandFolderNode(label, parentId, position, handle, useGraphStore.getState() as any);
          toast({ title: "Folder expanded", description: `"${label}" and its contents loaded from disk` });
        } else {
          addStandaloneNode(label, type, position);
          toast({ title: "Node created", description: `"${label}" dropped onto canvas` });
        }
      } catch { /* ignore */ }
    },
    [screenToFlowPosition, addStandaloneNode, toast],
  );

  const onDragOver = useCallback((event: React.DragEvent) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }, []);
  const onNodeDragStart = useCallback((_e: unknown, node: { id: string; position: { x: number; y: number } }) => {
    dragStartPositions.current.set(node.id, { x: node.position.x, y: node.position.y });
  }, []);
  const onNodeDragStop = useCallback((_e: unknown, node: { id: string; position: { x: number; y: number } }) => {
    const from = dragStartPositions.current.get(node.id);
    const to = { x: node.position.x, y: node.position.y };
    if (from) recordDragMoves([{ nodeId: node.id, from, to }]);
    dragStartPositions.current.delete(node.id);
  }, [recordDragMoves]);
  const onSelectionDragStart = useCallback((_e: unknown, nodes: { id: string; position: { x: number; y: number } }[]) => {
    for (const n of nodes) dragStartPositions.current.set(n.id, { x: n.position.x, y: n.position.y });
  }, []);
  const onSelectionDragStop = useCallback((_e: unknown, nodes: { id: string; position: { x: number; y: number } }[]) => {
    const moves = nodes.map((n) => {
      const from = dragStartPositions.current.get(n.id);
      const to = { x: n.position.x, y: n.position.y };
      return from ? { nodeId: n.id, from, to } : null;
    }).filter((m): m is { nodeId: string; from: { x: number; y: number }; to: { x: number; y: number } } => !!m);
    recordDragMoves(moves);
    for (const n of nodes) dragStartPositions.current.delete(n.id);
  }, [recordDragMoves]);
  /* Resize is delivered as "dimensions" node changes (see handleNodesChange). */

  const fitToSelection = useCallback(() => {
    const selected = useGraphStore.getState().selectedNodeIds;
    if (selected.length === 0) { fitView({ duration: 600, padding: 0.2 }); return; }
    fitView({ nodes: selected.map((id) => ({ id })), duration: 600, padding: 0.3 });
  }, [fitView]);

  const selectAll = useCallback(() => {
    const ids = useGraphStore.getState().nodes.map((n) => n.id);
    useGraphStore.setState((s) => ({ nodes: s.nodes.map((n) => ({ ...n, selected: true })), selectedNodeIds: ids }));
    // Also update React Flow's internal node state so the selection is visible
    setRfNodes((prev) => prev.map((n) => ({ ...n, selected: true })));
  }, [setRfNodes]);

  const showMiniMap = useGraphStore((s) => s.showMiniMap);
  const scrollAction = useGraphStore((s) => s.scrollAction);
  const miniMapPosition = useGraphStore((s) => s.miniMapPosition);
  const miniMapSize = useGraphStore((s) => s.miniMapSize);
  const miniMapX = useGraphStore((s) => s.miniMapX);
  const miniMapY = useGraphStore((s) => s.miniMapY);

  const minimapStyle = useMemo<React.CSSProperties>(() => {
    const base: React.CSSProperties = {
      width: miniMapSize, height: miniMapSize,
      backgroundColor: isDark ? "rgba(15, 23, 42, 0.6)" : "rgba(255, 255, 255, 0.6)",
      borderRadius: "12px",
      border: `1px solid ${isDark ? "rgba(148, 163, 184, 0.2)" : "rgba(15, 23, 42, 0.1)"}`,
    };
    // Custom position: pin the minimap to a free-form x/y. Anchor to the
    // top-left corner and override with explicit offsets + zero margin so the
    // slider-chosen coordinates lock in place (the inline style beats the
    // React Flow panel corner classes).
    if (miniMapPosition === "custom") {
      return { ...base, position: "absolute", top: miniMapY, left: miniMapX, margin: 0 };
    }
    return base;
  }, [isDark, miniMapSize, miniMapPosition, miniMapX, miniMapY]);

  // "custom" isn't a valid React Flow PanelPosition, so fall back to a real
  // corner for the base placement (the inline style above overrides it).
  const rfMiniMapPosition = miniMapPosition === "custom" ? "top-left" : miniMapPosition;

  // Compute a contrasting chip background from the canvas background color
  const hiddenChipStyle = useMemo(() => {
    const bg = cssVar("--fewer-background", "#0b0b13");
    const m = /^#?([0-9a-fA-F]{6})$/.exec(bg.trim());
    if (!m) return {};
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const luminance = (r * 299 + g * 587 + b * 114) / 1000;
    if (luminance > 128) {
      // Light canvas → dark chip with light text
      return { backgroundColor: `rgba(${Math.round(r * 0.25)}, ${Math.round(g * 0.25)}, ${Math.round(b * 0.25)}, 0.8)`, color: "rgba(255, 255, 255, 0.9)" };
    }
    // Dark canvas → light chip with dark text
    return { backgroundColor: `rgba(${Math.min(255, Math.round(r * 0.5 + 128))}, ${Math.min(255, Math.round(g * 0.5 + 128))}, ${Math.min(255, Math.round(b * 0.5 + 128))}, 0.8)`, color: "rgba(0, 0, 0, 0.85)" };
  }, [themeColors]);

  const nodeColor = useCallback(
    (n: FewerNode) => n.data?.type === "folder" ? themeColors.folderBg : themeColors.fileBg,
    [themeColors],
  );
  const nodeStrokeColor = useCallback(
    (n: FewerNode) => n.data?.type === "folder" ? themeColors.folderIcon : themeColors.fileIcon,
    [themeColors],
  );

  return (
    <div ref={containerRef} className="relative h-full w-full select-none" style={{ backgroundColor: "var(--fewer-background)" }} onDrop={onDrop} onDragOver={onDragOver}
      onContextMenu={(e) => e.preventDefault()}>
      <ReactFlow
        nodes={rfNodes} edges={rfEdges} nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange as import("@xyflow/react").OnNodesChange}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd as import("@xyflow/react").OnConnectEnd}
        onPaneClick={() => setRenamingId(null)}
        onNodeDragStart={onNodeDragStart} onNodeDragStop={onNodeDragStop}
        onSelectionDragStart={onSelectionDragStart} onSelectionDragStop={onSelectionDragStop}
        onSelectionChange={onSelectionChange}
        onNodeDoubleClick={(_, node) => {
          useGraphStore.setState((s) => ({ nodes: s.nodes.map((n) => ({ ...n, selected: n.id === node.id })), selectedNodeIds: [node.id] }));
          // Defer so the selection state update processes before the fitView
          // animation starts — avoids React Flow stepping on the viewport change.
          requestAnimationFrame(() => fitView({ nodes: [{ id: node.id }], duration: 600, padding: 0.3, maxZoom: 1.5 }));
        }}
        onDelete={({ nodes: deletedNodes, edges: deletedEdges }) => {
          if (deletedNodes.length > 0) {
            deleteNodes(deletedNodes.map((n) => n.id));
            toast({ title: "Deleted", description: `${deletedNodes.length} item${deletedNodes.length === 1 ? "" : "s"} removed` });
          }
          if (deletedEdges.length > 0) {
            useGraphStore.getState().deleteEdges(deletedEdges.map((e) => e.id));
            toast({ title: "Deleted", description: `${deletedEdges.length} edge${deletedEdges.length === 1 ? "" : "s"} removed` });
          }
        }}
        onNodeContextMenu={(event) => event.preventDefault()}
        onEdgeContextMenu={(event, edge) => { event.preventDefault(); setLastClickedEdgeId(edge.id); setCanvasMenu({ x: event.clientX, y: event.clientY }); }}
        onPaneContextMenu={(e) => { e.preventDefault(); const mouseEvent = e as unknown as MouseEvent; setCanvasMenu({ x: mouseEvent.clientX, y: mouseEvent.clientY }); setLastClickedEdgeId(null); useGraphStore.getState().setRightClickDetected(); }}
        onMouseMove={(e) => { const point = screenToFlowPosition({ x: e.clientX, y: e.clientY }); useGraphStore.getState().setMousePosition({ x: point.x, y: point.y }); }}
        nodesDraggable nodesConnectable elementsSelectable
        onlyRenderVisibleElements
        zoomOnScroll={scrollAction === "zoom"}
        panOnScroll={scrollAction === "pan"}
        panOnScrollMode={PanOnScrollMode.Vertical}
        zoomActivationKeyCode={scrollAction === "pan" ? "Control" : null}
        fitViewOptions={{ padding: 0.2, maxZoom: 1.0, minZoom: 0.35 }}
        minZoom={0.15} maxZoom={3}
        defaultEdgeOptions={{
          type: edgeTypeFor(edgeStyle), animated: edgeAnimated && !edgeAnimatedSelectedOnly,
          style: { stroke: themeColors.edge, strokeWidth: edgeWidth, ...(dashArray ? { strokeDasharray: dashArray } : {}) },
          zIndex: 0,
        }}
        elevateNodesOnSelect
        proOptions={{ hideAttribution: true }}
        className="bg-transparent h-full w-full"
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.5}
          color={themeColors.bgDot}
          className="transition-colors" />
        {showMiniMap && (
          <MiniMap position={rfMiniMapPosition} style={minimapStyle} pannable zoomable
            nodeColor={nodeColor} nodeStrokeColor={nodeStrokeColor} nodeStrokeWidth={2} nodeBorderRadius={4} ariaLabel="Mini map" />
        )}
        <Panel position="bottom-center">
          <div className="gm-float flex items-center gap-1 rounded-2xl p-1">
            <Button variant="ghost" size="icon" className="h-8 w-8 min-hit" onClick={() => zoomIn({ duration: 250 })} title="Zoom in (+)"><ZoomIn className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 min-hit" onClick={() => zoomOut({ duration: 250 })} title="Zoom out (-)"><ZoomOut className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 min-hit" onClick={() => fitView({ duration: 600, padding: 0.2 })} title="Fit view (Space)"><Maximize2 className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 min-hit" onClick={fitToSelection} title="Zoom to selection"><Crosshair className="h-4 w-4" /></Button>
          </div>
        </Panel>
        {loading && (
          <Panel position="top-center" className="!top-[15%]">
            <div className="gm-float flex flex-col items-center gap-4 rounded-2xl px-6 sm:px-8 py-8 sm:py-6 text-center w-[90vw] sm:w-auto">
              <div className="h-12 w-12 animate-pulse rounded-full bg-muted" />
              <div className="h-5 w-48 animate-pulse rounded bg-muted" />
              <div className="h-4 w-64 animate-pulse rounded bg-muted" />
            </div>
          </Panel>
        )}
        {!loading && rfNodes.length === 0 && graphsExists && (
          <Panel position="top-center" className="!top-[15%]">
            <div className="gm-float flex flex-col items-center gap-4 rounded-2xl px-6 sm:px-8 py-8 sm:py-6 text-center w-[90vw] sm:w-auto">
              <EyeOff className="h-12 w-12 text-muted-foreground/60" />
              <div className="text-lg font-semibold">Everything is hidden</div>
              <div className="sm:max-w-xs text-sm text-muted-foreground leading-relaxed">
                {showFiles
                  ? "All nodes on this graph are currently hidden on the canvas."
                  : "This graph is made only of files and \"Show Files\" is off, so nothing is displayed."}
              </div>
              {!showFiles && (
                <Button variant="outline" onClick={() => setShowFiles(true)} data-tutorial="show-files-button">
                  <FolderOpen className="h-4 w-4" />
                  Show Files
                </Button>
              )}
            </div>
          </Panel>
        )}
        {!loading && rfNodes.length === 0 && !graphsExists && (
          <Panel position="top-center" className="!top-[15%]">
            <div className="gm-float flex flex-col items-center gap-4 rounded-2xl px-6 sm:px-8 py-8 sm:py-6 text-center w-[90vw] sm:w-auto">
              <FolderOpen className="h-12 w-12 text-muted-foreground/60" />
              <div className="text-lg font-semibold">No directory loaded</div>
              <div className="sm:max-w-xs text-sm text-muted-foreground leading-relaxed">Use the sidebar to open a directory from your file system, or load one of the sample datasets to explore the visualization.</div>
              <div className="flex flex-col sm:flex-row items-center gap-2">
                <Button onClick={onOpenImport} data-tutorial="sample-button">
                  <FolderOpen className="h-4 w-4" />
                  Import
                </Button>
                <Button variant="outline" onClick={onLoadSample} data-tutorial="sample-button">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Load sample
                </Button>
              </div>
            </div>
          </Panel>
        )}
        {hiddenCount > 0 && (
          <Panel position="top-right">
            <button className="rounded-full px-3 py-1.5 text-xs cursor-pointer transition-colors animate-in fade-in slide-in-from-right-2 duration-200 backdrop-blur-md"
              style={hiddenChipStyle}
              onClick={() => { useGraphStore.getState().setSidebarOpen(true); useGraphStore.getState().triggerHiddenPanelExpand(); }}>
              {hiddenCount} node{hiddenCount === 1 ? "" : "s"} hidden
            </button>
          </Panel>
        )}
      </ReactFlow>

      {canvasMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setCanvasMenu(null)} onContextMenu={(e) => { e.preventDefault(); setCanvasMenu(null); }} />
          <div className="gm-float fixed z-50 min-w-[200px] rounded-2xl p-1.5 animate-in fade-in zoom-in-95 duration-150" style={{ left: canvasMenu.x, top: canvasMenu.y }}>
            <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">Canvas actions</div>
            <div className="my-1 h-px bg-border/40" />
            <button onClick={() => { fitView({ duration: 500, padding: 0.2 }); setCanvasMenu(null); }} className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/60 active:scale-[0.96]">Fit View</button>
            <button onClick={() => { selectAll(); setCanvasMenu(null); }} className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/60 active:scale-[0.96]">Select All</button>
            <button onClick={() => { zoomIn({ duration: 250 }); setCanvasMenu(null); }} className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/60 active:scale-[0.96]">Zoom In</button>
            <button onClick={() => { zoomOut({ duration: 250 }); setCanvasMenu(null); }} className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/60 active:scale-[0.98]">Zoom Out</button>
            {(() => {
              const edgeId = lastClickedEdgeId;
              const edgeExists = edgeId ? useGraphStore.getState().edges.some((e) => e.id === edgeId) : false;
              if (edgeId && edgeExists) return (
                <>
                  <div className="my-1 h-px bg-border/40" />
                  <button onClick={() => { useGraphStore.getState().deleteEdges([edgeId]); toast({ title: "Edge deleted", description: "1 edge removed" }); setCanvasMenu(null); }} className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-red-500 transition-colors hover:bg-muted/60 active:scale-[0.98]">Delete Edge</button>
                </>
              );
              return null;
            })()}
            {(() => {
              const ids = useGraphStore.getState().selectedNodeIds;
              if (ids.length >= 2) {
                const lastNode = useGraphStore.getState().nodes.find((n) => n.id === ids[ids.length - 1]);
                if (lastNode?.data.type === "folder") return (
                  <>
                    <div className="my-1 h-px bg-border/40" />
                    <button onClick={() => {
                      const state = useGraphStore.getState(); const parentId = ids[ids.length - 1]; const childIds = ids.slice(0, -1);
                      let ok = 0, fail = 0;
                      for (const childId of childIds) { const r = state.connectNodes({ source: parentId, target: childId } as Connection); if (r.ok) ok++; else fail++; }
                      toast({ title: "Nodes parented", description: `${ok} node${ok !== 1 ? "s" : ""} parented${fail > 0 ? `, ${fail} skipped` : ""}` });
                      setCanvasMenu(null);
                    }} className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-muted/60 active:scale-[0.98]">Set as Parent</button>
                  </>
                );
              }
              return null;
            })()}
            {advancedModeEnabled && (
              <>
                <div className="my-1 h-px bg-border/40" />
                <button onClick={() => { useGraphStore.getState().showAll(); toast({ title: "Unhid all nodes", description: `${hiddenCount} node${hiddenCount === 1 ? "" : "s"} restored` }); setCanvasMenu(null); }} disabled={hiddenCount === 0} className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-muted/60 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40">Show All Nodes</button>
                <div className="my-1 h-px bg-border/40" />
                <button onClick={() => { const clip = useGraphStore.getState().clipboard; if (clip && clip.nodeIds.length > 0) { useGraphStore.getState().setPastePosition(useGraphStore.getState().mousePosition); useGraphStore.getState().pasteFromClipboard(); toast({ title: "Pasted", description: `${clip.nodeIds.length} item${clip.nodeIds.length === 1 ? "" : "s"} pasted` }); } setCanvasMenu(null); }} disabled={!useGraphStore.getState().clipboard} className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-muted/60 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40">Paste</button>
              </>
            )}
            <div className="my-1 h-px bg-border/40" />
            <button onClick={() => { useGraphStore.getState().reset(); toast({ title: "Canvas cleared", description: `${allNodes.length} node${allNodes.length === 1 ? "" : "s"} removed` }); setCanvasMenu(null); }} disabled={allNodes.length === 0} className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-red-500 transition-colors hover:bg-muted/60 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40">Clear Canvas</button>
          </div>
        </>
      )}
      <KeyboardShortcuts />
    </div>
  );
}

interface GraphCanvasProps {
  onOpenImport: () => void;
  onLoadSample: () => void;
}

export function GraphCanvas({ onOpenImport, onLoadSample }: GraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner onOpenImport={onOpenImport} onLoadSample={onLoadSample} />
    </ReactFlowProvider>
  );
}