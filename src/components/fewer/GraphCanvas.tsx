"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  MiniMap,
  PanOnScrollMode,
  useReactFlow,
  useNodesState,
  useEdgesState,
  useUpdateNodeInternals,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { CustomNode, KeyboardShortcuts } from ".";
import { groupBatchActions } from "@/lib/fewer/menuSections";
import { selectByTag } from "@/lib/fewer/batchSelect";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { edgeTypeFor } from "@/lib/fewer/edgeHighlight";
import { cn } from "@/lib/utils";
import { FolderOpen, Sparkles, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { EdgeStrokeStyle, FewerNode } from "@/lib/fewer/types";
import { useGraphStore } from "@/store/graphStore";
import { useGraphData, useLayoutConfig, useThemeConfig, useUiState, useViewState, useStoreActions } from "@/store/hooks";

// Hooks (Phase C extraction — each is a cohesive, single-concern unit).
import { useCanvasResize } from "@/hooks/use-canvas-resize";
import { useCanvasThemeColors, type CanvasThemeColors } from "@/hooks/use-canvas-theme-colors";
import { useCanvasVisibleGraph } from "@/hooks/use-canvas-visible-graph";
import { useCanvasGraphSync } from "@/hooks/use-canvas-graph-sync";
import { useCanvasDashClock } from "@/hooks/use-canvas-dash-clock";
import { useCanvasDirectionRemeasure } from "@/hooks/use-canvas-direction-remeasure";
import { useCanvasInitialFit } from "@/hooks/use-canvas-initial-fit";
import { withCollapsedPillGeometry, applyViewPositions, deriveViewLayout, stampSelection } from "@/lib/fewer/viewState";
import { makeTagLabelLookup } from "@/lib/fewer/tags";
import { useCanvasZoomToNode } from "@/hooks/use-canvas-zoom-to-node";
import { useCanvasMinimap } from "@/hooks/use-canvas-minimap";
import { useCanvasNodeDrag } from "@/hooks/use-canvas-node-drag";
import { useCanvasNodeChangeHandler } from "@/hooks/use-canvas-node-change-handler";
import { useCanvasBoxSelect } from "@/hooks/use-canvas-box-select";
import { useCanvasDrop } from "@/hooks/use-canvas-drop";
import { can } from "@/lib/fewer/tiers";
import { useCanvasCtrlWheelPan } from "@/hooks/use-canvas-ctrl-wheel-pan";
import { useCanvasEdges } from "@/hooks/use-canvas-edges";
import { useCanvasConnect } from "@/hooks/use-canvas-connect";
import { useCanvasSelection } from "@/hooks/use-canvas-selection";
import { resolveViewSettings } from "@/lib/fewer/viewState";
import type { ResolvedViewSettings } from "@/lib/fewer/viewState";
import { selectionForLeaf } from "@/lib/fewer/canvasSelection";
import { markLoop } from "@/lib/fewer/loopProbe";

import { GraphViewProvider } from "@/hooks/use-graph-view-context";
import { CanvasOverlays } from "./CanvasOverlays";
import { CanvasContextMenu } from "./CanvasContextMenu";
import { CanvasZoomControls } from "./CanvasZoomControls";
import { useCanvasDelete } from "@/hooks/use-canvas-delete";
import { useCanvasInteractionHandlers } from "@/hooks/use-canvas-interaction-handlers";
import { useCanvasDragRecording } from "@/hooks/use-canvas-drag-recording";
import { useCanvasCollapsedInternals } from "@/hooks/use-canvas-collapsed-internals";
import { useCanvasHiddenChip } from "@/hooks/use-canvas-hidden-chip";
import { useStableHiddenIds } from "@/hooks/use-stable-hidden-ids";

const nodeTypes = { folder: CustomNode, file: CustomNode };
const PERF_NODE_LIMIT = 300;

// React Flow's `StoreUpdater` compares tracked props BY IDENTITY and writes its
// store for every field that differs (and re-renders everything reading it), so
// these must not be built inline: a fresh object each render wrote the RF store
// from an effect on every render of the canvas — a commit-phase write per render
// on the very path that chains into "Maximum update depth exceeded" (#281).
const FIT_VIEW_OPTIONS = { padding: 0.2, maxZoom: 1.0, minZoom: 0.35 };
const PRO_OPTIONS = { hideAttribution: true };

interface CanvasMenuPosition { x: number; y: number; }
interface CanvasEmptyActionsProps { onOpenImport: () => void; onLoadSample: () => void; primary?: boolean; leafId?: string; }
type CanvasMenu = CanvasMenuPosition & { kind: "pane" | "edge" | "selection" };
type CanvasToast = ReturnType<typeof useToast>["toast"];

/** Shared edge-animation configuration assembled from store state. */
function useEdgeAnimationOpts(
  edgeMotionEnabled: boolean,
  edgeAnimated: boolean,
  edgeAnimatedSelectedOnly: boolean,
  edgeAnimatedStrokeStyle: EdgeStrokeStyle,
  edgeStrokeStyle: EdgeStrokeStyle,
) {
  return useMemo(
    () => ({
      animated: edgeMotionEnabled && edgeAnimated,
      selectedOnly: edgeMotionEnabled && edgeAnimatedSelectedOnly,
      animatedStrokeStyle: edgeAnimatedStrokeStyle,
      baseStrokeStyle: edgeStrokeStyle,
    }),
    [edgeMotionEnabled, edgeAnimated, edgeAnimatedSelectedOnly, edgeAnimatedStrokeStyle, edgeStrokeStyle],
  );
}

function CanvasInner({ onOpenImport, onLoadSample, primary = true, leafId }: CanvasEmptyActionsProps) {
  const { nodes: allNodes, edges: allEdges, hiddenIds } = useGraphData();
  const { direction, edgeStyle: edgeStyleGlobal, edgeAnimated: edgeAnimatedGlobal, edgeAnimatedSelectedOnly: edgeAnimatedSelectedOnlyGlobal, edgeStrokeStyle: edgeStrokeStyleGlobal, edgeAnimatedStrokeStyle, edgeWidth: edgeWidthGlobal } = useLayoutConfig();
  const { themeMode: themeModeGlobal, customTheme } = useThemeConfig();
  const { selectedNodeIds, loading, showFiles: showFilesGlobal } = useUiState();
  const { activeLeafId, viewSettings: viewSettingsMap, zoomToNode, zoomToNodeIds } = useViewState();
  const leafSelections = useGraphStore((s) => s.leafSelections);
  const selectionVersion = useGraphStore((s) => s.selectionVersion);
  const { setSelectedNodeIds, deleteNodes, recordDragMoves, recordResize, connectNodes, addStandaloneNode, setRenamingId, setCanvasSize, setNodePositionForLeaf, setZoomToNodeIds } = useStoreActions();
  const shynessScale = useGraphStore((s) => s.shynessScale);
  const sortKey = useGraphStore((s) => s.sortKey);
  const sortDir = useGraphStore((s) => s.sortDir);
  const tags = useGraphStore((s) => s.tags);
  const tier = useGraphStore((s) => s.tier);
  const graphVersion = useGraphStore((s) => s.graphVersion);
  const seedNodePositions = useGraphStore((s) => s.seedNodePositions);
  const hoverHighlightIds = useGraphStore((s) => s.hoverHighlightIds);

  const { toast } = useToast();
  const containerRef = useRef<HTMLDivElement>(null);

  // Per-view scope
  const isActive = leafId ? leafId === activeLeafId : true;

    // ── Resolve per-view settings ──
  // Memoized: a fresh array here would change the `vs` memo's deps every render,
  // producing new resolved objects and an infinite setRfEdges loop.
  const fileIds = useMemo(
    () => allNodes.filter((n) => n.data.type === "file").map((n) => n.id),
    [allNodes],
  );
  const vs = useMemo(
    () => resolveViewSettings(viewSettingsMap, leafId, {
      showFiles: showFilesGlobal, minimapHidden: false,
      edgeStyle: edgeStyleGlobal, edgeAnimated: edgeAnimatedGlobal,
      edgeAnimatedSelectedOnly: edgeAnimatedSelectedOnlyGlobal,
      edgeStrokeStyle: edgeStrokeStyleGlobal, edgeWidth: edgeWidthGlobal,
      direction, hiddenIds, collapsedFolderIds: [],
    }, hiddenIds, fileIds),
    [viewSettingsMap, leafId, showFilesGlobal, edgeStyleGlobal, edgeAnimatedGlobal, edgeAnimatedSelectedOnlyGlobal, edgeStrokeStyleGlobal, edgeWidthGlobal, direction, hiddenIds, fileIds],
  );

  const isDark = themeModeGlobal === "dark";

  // ── Hook extractions ──
  useCanvasResize(containerRef, setCanvasSize);
  const themeColors = useCanvasThemeColors(themeModeGlobal, isDark, customTheme);

  // Effective hiddenIds come from resolveViewSettings (which already computed
  // layers + bulk files from allFileIds). No showFiles special-case needed.
  // Content-stable: a drag writes view settings every frame, and a fresh array
  // identity here would re-filter the node set and re-run every card's
  // child-list memo on each of those frames.
  const effectiveHiddenIds = useStableHiddenIds(vs.hiddenIds);

  const { visibleNodes, visibleEdges, hiddenCount } = useCanvasVisibleGraph(allNodes, allEdges, effectiveHiddenIds);

  // This leaf's own copies: folders it has collapsed paint as a compact pill.
  // Stamped before `resolveViewNodes` so the leaf's derived layout reserves a
  // pill-sized slot, and never written back — the shared store node keeps its
  // expanded height for every other view.
  const viewNodes = useMemo(
    () => withCollapsedPillGeometry(visibleNodes, vs.collapsedFolderIds),
    [visibleNodes, vs.collapsedFolderIds],
  );

  // ── Per-view positions: derive the layout once, overlay positions per change ──
  // Same predicate the Organize action uses (viewState.needsLayoutDerivation, via
  // deriveViewLayout) so a view never ends up half-organised — and the exporter
  // runs the identical resolution, so an image export mirrors the active view.
  //
  // The two halves are memoised apart on purpose. A drag rewrites this leaf's
  // `positions` on every frame, so deriving the layout in the same memo re-ran
  // the whole layout engine per frame in any view that diverges (hide layers, a
  // collapsed folder, a direction override): 193ms per frame at 30k nodes. The
  // layout memo therefore keys on the leaf's *fields* the derivation predicate
  // reads — a position write replaces the settings object but keeps those
  // references — and only the position overlay runs per frame.
  const rawLeaf = leafId ? viewSettingsMap[leafId] : undefined;
  const tagLookup = useMemo(() => makeTagLabelLookup(tags), [tags]);
  const layoutOpts = useMemo(
    () => ({ shynessScale, sortKey, sortDir, tagLabelById: tagLookup }),
    [shynessScale, sortKey, sortDir, tagLookup],
  );
  const laidNodes = useMemo(
    () => deriveViewLayout(
      viewNodes, visibleEdges, rawLeaf, vs, { direction, hiddenIds, fileIds }, layoutOpts,
    ),
    [
      viewNodes, visibleEdges,
      rawLeaf?.hideLayers, rawLeaf?.direction, rawLeaf?.collapsedFolderIds,
      vs.direction, direction, hiddenIds, fileIds, layoutOpts,
    ],
  );
  const positionedNodes = useMemo(
    () => applyViewPositions(laidNodes ?? viewNodes, vs.positions),
    [laidNodes, viewNodes, vs.positions],
  );

  // ── Selection: derived, never stored on the store's nodes ──
  // The leaf's own ids, or — only while no leaf owns the shared list — the
  // global one (see selectionForLeaf; a brand-new leaf must not borrow another
  // view's selection, #285). Stamped AFTER the layout on purpose: doing it
  // before would make the layout memo depend on the selection and re-derive the
  // whole tree on every click.
  const leafSelection = selectionForLeaf(leafSelections, leafId, activeLeafId, selectedNodeIds);
  const selectionSet = useMemo(() => new Set<string>(leafSelection), [leafSelection]);
  // What RF currently paints for this leaf — the stamp compares against it, so
  // a clear can be pushed as an explicit `selected: false` instead of a node
  // that has no flag at all (RF would keep its internal selection and re-report
  // it forever, #285).
  const lastStampedRef = useRef<readonly FewerNode[] | undefined>(undefined);
  const stampedNodes = useMemo(() => {
    const next = stampSelection(positionedNodes, selectionSet, lastStampedRef.current);
    lastStampedRef.current = next;
    return next;
  }, [positionedNodes, selectionSet]);

  const graphsExists = allNodes.length > 0;

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(stampedNodes);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(visibleEdges);

  useCanvasGraphSync(graphVersion, stampedNodes, visibleEdges, setRfNodes, setRfEdges);
  // A selection change paints new flags on the RF nodes (cheap, copy-on-write).
  // It is deliberately NOT a graphVersion change: that would rebuild everything.
  //
  // This push is deliberately UNGUARDED, and skipping it when "the flags already
  // match" is NOT safe: the array is also how React Flow's internals get resynced
  // after it reports its own changes (a re-measure carries a `measured` the store
  // copy has already settled). Skipping it let React Flow re-report the same
  // change forever — each report re-rendering the canvas, 50 nested updates,
  // "Maximum update depth exceeded" on a single card click. The cheapness lives
  // upstream instead: the store only hands out a new node array when a card
  // actually changed size or moved (see applyDimensionChanges / applyPositionChanges).
  useEffect(() => {
    markLoop("push:nodes");
    setRfNodes(stampedNodes);
  }, [stampedNodes, setRfNodes]);
  useEffect(() => {
    markLoop("render:canvas");
  });
  useCanvasDashClock(can("edgeMotion", tier), vs.edgeAnimated, vs.edgeAnimatedSelectedOnly);
  useCanvasDirectionRemeasure(vs.direction);

  const updateNodeInternals = useUpdateNodeInternals();
  useCanvasCollapsedInternals(vs.collapsedFolderIds, updateNodeInternals);
  const { fitView, zoomIn, zoomOut, screenToFlowPosition, setViewport, getViewport, getEdges } = useReactFlow();
  // User-requested re-flows (direction change, Organize) re-fit the view — see
  // useCanvasInitialFit, which reuses the same bounds computation (#286).
  const reflowVersion = useGraphStore((s) => s.reflowVersion);
  const reflowTarget = useGraphStore((s) => s.reflowTarget);
  useCanvasInitialFit(positionedNodes, containerRef, setViewport, reflowVersion, reflowTarget, leafId);
  useCanvasZoomToNode(isActive ? zoomToNode : null, isActive ? useGraphStore.getState().zoomToNodeIds : null, fitView, setZoomToNodeIds);
  const mini = useCanvasMinimap({ themeColors, isDark, leafId });

  const { seedOnFirstDrag, effectiveRecordDragMoves } = useCanvasDragRecording({
    leafId, positionedNodes, seedNodePositions, setNodePositionForLeaf, recordDragMoves,
  });
  const { baseRef: boxSelectBaseRef, onPointerDownCapture: boxSelectOnPointerDown, onPointerUp: boxSelectOnPointerUp, onPointerCancel: boxSelectOnPointerCancel } = useCanvasBoxSelect({ selectedNodeIds, setRfNodes });
  const handleNodesChange = useCanvasNodeChangeHandler({ onNodesChange, fitView, recordResize, boxSelectBaseRef, leafId, collapsedIds: vs.collapsedFolderIds, onBeforePositionCommit: seedOnFirstDrag });
  const { onDrop, onDragOver } = useCanvasDrop({ screenToFlowPosition, addStandaloneNode, toast });
  // Activation belongs to input, not to selection echoes: a pointer landing in
  // this canvas makes it the active view before React Flow reports anything.
  // Without this, a card click in a background canvas relied on its selection
  // report to flip `activeLeafId`, and that report is now (deliberately) a
  // silent state sync — see setSelectionForLeaf (#285).
  //
  // The same ref tells useCanvasSelection whether RF's report can carry user
  // intent at all: only a live pointer gesture may change the store's selection,
  // because RF's subscription re-emits its own bookkeeping on every node push
  // (those echoes lag a frame and oscillated the selection, #285).
  const pointerActiveRef = useRef(false);
  const onPointerDownCapture = useCallback((e: React.PointerEvent) => {
    pointerActiveRef.current = true;
    if (leafId) useGraphStore.getState().setActiveLeaf(leafId);
    boxSelectOnPointerDown(e);
  }, [leafId, boxSelectOnPointerDown]);
  const onPointerUp = useCallback(() => {
    pointerActiveRef.current = false;
    boxSelectOnPointerUp();
  }, [boxSelectOnPointerUp]);
  const onPointerCancel = useCallback(() => {
    pointerActiveRef.current = false;
    boxSelectOnPointerCancel();
  }, [boxSelectOnPointerCancel]);
  useCanvasCtrlWheelPan(containerRef, mini.scrollAction === "zoom");

  const animation = useEdgeAnimationOpts(can("edgeMotion", tier), vs.edgeAnimated, vs.edgeAnimatedSelectedOnly, edgeAnimatedStrokeStyle, vs.edgeStrokeStyle);

  // Edge handling (selection tracking + highlight rebuild + static dash) lives
  // in useCanvasEdges so CanvasInner stays declarative. Effects/callbacks read
  // live store state to avoid unstable reference deps.
  const { handleEdgesChange, dashArray, selectedEdgeIdsRef } = useCanvasEdges({
    onEdgesChange, setRfEdges, graphVersion, selectionVersion, allNodes, allEdges, visibleEdges,
    themeColors, vs, hiddenIds: effectiveHiddenIds, animation, leafId, isActive,
  });

  const { onSelectionChange, onNodeClick, onNodeDoubleClick, fitToSelection, selectAll, seedSelectionForDrag, endSelectionDrag } = useCanvasSelection({
    setSelectedNodeIds, boxSelectBaseRef, selectedEdgeIdsRef, fitView, leafId, pointerActiveRef,
  });

  // Drag handlers come after the selection hook: a drag seeds the store's
  // selection before React Flow's own select reports, so the canvas's next push
  // cannot paint the dragged cards unselected and bounce the selection back
  // (#281).
  const dragHandlers = useCanvasNodeDrag(effectiveRecordDragMoves, seedSelectionForDrag, endSelectionDrag);

  const defaultEdgeOptions = useMemo(
    () => ({
      type: edgeTypeFor(vs.edgeStyle),
      animated: can("edgeMotion", tier) && vs.edgeAnimated && !vs.edgeAnimatedSelectedOnly,
      style: { stroke: themeColors.edge, strokeWidth: vs.edgeWidth, ...(dashArray ? { strokeDasharray: dashArray } : {}) },
      zIndex: 0,
    }),
    [vs.edgeStyle, tier, vs.edgeAnimated, vs.edgeAnimatedSelectedOnly, themeColors.edge, vs.edgeWidth, dashArray],
  );

  const { onConnect, onConnectEnd } = useCanvasConnect({
    connectNodes, setRfEdges, edgeStyle: vs.edgeStyle, screenToFlowPosition, toast,
  });

  const onDelete = useCanvasDelete({
    deleteNodes,
    deleteEdges: (ids: string[]) => useGraphStore.getState().deleteEdges(ids),
    toast,
  });

  const {
    canvasMenu, lastClickedEdgeId, closeMenu,
    onPaneClick, onEdgeContextMenu, onPaneContextMenu,
    onSelectionContextMenu, onNodeContextMenu, onMouseMove,
  } = useCanvasInteractionHandlers({ setRenamingId, leafId, screenToFlowPosition });

  const hiddenChipStyle = useCanvasHiddenChip();

  const visibleIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes]);
  // Hover ring as a Set, built once per ring change instead of scanned by every
  // card and child row (see GraphViewScope.hoverIds).
  const hoverIds = useMemo(() => new Set<string>(hoverHighlightIds), [hoverHighlightIds]);
  // The cards read only these two fields from the scope (CustomNode), but they
  // read them through a context — and a drag rewrites `positions` on every frame.
  // Carrying the resolved object whole meant a new context value every frame, so
  // a drag re-rendered EVERY mounted card; with it pinned to the fields cards
  // actually use, a drag frame re-renders the dragged card alone (#281).
  const scopeResolved = useMemo(
    () => ({ ...vs, positions: undefined }),
    [
      vs.showFiles, vs.minimapHidden, vs.edgeStyle, vs.edgeAnimated, vs.edgeAnimatedSelectedOnly,
      vs.edgeStrokeStyle, vs.edgeWidth, vs.direction, vs.hiddenIds, vs.collapsedFolderIds,
    ],
  );
  const scope = useMemo(
    () => ({
      leafId: leafId ?? "primary",
      isActive: leafId ? leafId === activeLeafId : true,
      direction: vs.direction,
      resolved: scopeResolved,
      visibleIds,
      hoverIds,
    }),
    [leafId, activeLeafId, vs.direction, scopeResolved, visibleIds, hoverIds],
  );
  return (
    <GraphViewProvider value={scope}>
    <div ref={containerRef} className={cn("relative h-full w-full select-none", allNodes.length > PERF_NODE_LIMIT && "gm-perf")} style={{ background: "var(--fewer-background-gradient, var(--fewer-background))" }} onDrop={onDrop} onDragOver={onDragOver}
      onPointerDownCapture={onPointerDownCapture}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onContextMenu={(e) => e.preventDefault()}>
      <ReactFlow
        nodes={rfNodes} edges={rfEdges} nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange as import("@xyflow/react").OnNodesChange}
        onEdgesChange={handleEdgesChange as import("@xyflow/react").OnEdgesChange}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd as import("@xyflow/react").OnConnectEnd}
        onPaneClick={onPaneClick}
        onNodeDragStart={dragHandlers.onNodeDragStart} onNodeDragStop={dragHandlers.onNodeDragStop}
        onSelectionDragStart={dragHandlers.onSelectionDragStart} onSelectionDragStop={dragHandlers.onSelectionDragStop}
        onSelectionChange={onSelectionChange}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onDelete={onDelete}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onSelectionContextMenu={onSelectionContextMenu}
        onMouseMove={onMouseMove}
        deleteKeyCode={null}
        nodesDraggable nodesConnectable elementsSelectable
        onlyRenderVisibleElements
        zoomOnScroll={mini.scrollAction === "zoom"}
        panOnScroll={mini.scrollAction === "pan"}
        panOnScrollMode={PanOnScrollMode.Vertical}
        zoomActivationKeyCode={mini.scrollAction === "pan" ? "Control" : null}
        panActivationKeyCode={mini.scrollAction === "zoom" ? "Control" : null}
        fitViewOptions={FIT_VIEW_OPTIONS}
        minZoom={0.15} maxZoom={3}
        defaultEdgeOptions={defaultEdgeOptions}
        elevateNodesOnSelect
        proOptions={PRO_OPTIONS}
        className="bg-transparent h-full w-full"
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} color={themeColors.bgDot} className="transition-colors" />
        {mini.showMiniMap && (
          <MiniMap position={mini.rfMiniMapPosition} style={mini.minimapStyle} pannable zoomable nodeColor={mini.nodeColor} nodeStrokeColor={mini.nodeStrokeColor} nodeStrokeWidth={2} nodeBorderRadius={4} ariaLabel="Mini map" />
        )}
        <CanvasZoomControls zoomIn={zoomIn} zoomOut={zoomOut} fitView={fitView} fitToSelection={fitToSelection} />
        <CanvasOverlays
          loading={loading}
          rfNodesCount={rfNodes.length}
          graphsExists={graphsExists}
          vs={vs}
          leafId={leafId}
          onOpenImport={onOpenImport}
          onLoadSample={onLoadSample}
          hiddenCount={hiddenCount}
          hiddenChipStyle={hiddenChipStyle}
        />
      </ReactFlow>

      {canvasMenu && (
        <CanvasContextMenu
          menu={canvasMenu}
          lastClickedEdgeId={lastClickedEdgeId}
          vs={vs}
          leafId={leafId}
          canvasAddChildEnabled={can("canvasAddChild", tier)}
          hiddenCount={hiddenCount}
          allNodes={allNodes}
          selectAll={selectAll}
          close={closeMenu}
        />
      )}
      {primary && <KeyboardShortcuts />}
    </div>
    </GraphViewProvider>
  );
}

interface GraphCanvasProps {
  onOpenImport: () => void;
  onLoadSample: () => void;
  /** Primary viewport gets keyboard shortcuts; secondary viewports skip them. */
  primary?: boolean;
  /** Leaf id for per-view minimap visibility tracking. */
  leafId?: string;
}

export function GraphCanvas({ onOpenImport, onLoadSample, primary = true, leafId }: GraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner onOpenImport={onOpenImport} onLoadSample={onLoadSample} primary={primary} leafId={leafId} />
    </ReactFlowProvider>
  );
}
