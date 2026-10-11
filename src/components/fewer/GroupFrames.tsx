"use client";

// Canvas group frames (T-125): the gray box a group draws behind its member
// cards, with the title strip above it. Rendered through ViewportPortal so the
// layer lives in flow coordinates (it pans/zooms with the canvas) and stays out
// of `nodes` entirely — layout, search, stats and export never see it.
//
// Only the header strip takes pointer events: the gray area itself is inert, so
// dragging, selecting and right-clicking cards inside a group behave exactly as
// they do outside one.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ViewportPortal, useViewport } from "@xyflow/react";
import { Boxes, ChevronDown, ChevronRight, StickyNote, X } from "lucide-react";
import { useGraphStore } from "@/store/graphStore";
import { useGraphViewScope } from "@/hooks/use-graph-view-context";
import { COLLAPSED_PILL_HEIGHT, COLLAPSED_PILL_WIDTH, GROUP_HEADER_HEIGHT, GROUP_PADDING, GROUP_HANDLES, cardsInsideBox, groupBounds, groupPill, handleAxes, handleOrigin, minScaleFor, normalizeGroupColor, nodeRenderedSize, scaleFactorFor, scaleMemberPositions, type GroupHandleId } from "@/lib/fewer/groups";
import type { Group } from "@/lib/fewer/groups";
import type { FewerNode } from "@/lib/fewer/types";
import { TAG_FALLBACK_COLOR } from "@/lib/fewer/tags";
import { HexColorInput, HexColorPicker } from "react-colorful";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Textarea } from "@/components/ui/textarea";
import { plural } from "@/lib/fewer/plural";

/** Screen pixels before a header press becomes a move (a click still selects). */
const DRAG_THRESHOLD = 3;

/** Resize handles render only on a selected, expanded frame. */
const HANDLE_CURSORS: Record<GroupHandleId, string> = {
  nw: "cursor-nwse-resize", n: "cursor-ns-resize", ne: "cursor-nesw-resize", e: "cursor-ew-resize",
  se: "cursor-nwse-resize", s: "cursor-ns-resize", sw: "cursor-nesw-resize", w: "cursor-ew-resize",
};

/** Corner squares straddle the border; edge bars sit centered on their side. */
function handleStyle(id: GroupHandleId): React.CSSProperties {
  const sq = 10, half = sq / 2;
  const bar = 16, barHalf = bar / 2, thin = 6, thinHalf = thin / 2;
  switch (id) {
    case "nw": return { left: -half, top: -half, width: sq, height: sq };
    case "ne": return { right: -half, top: -half, width: sq, height: sq };
    case "se": return { right: -half, bottom: -half, width: sq, height: sq };
    case "sw": return { left: -half, bottom: -half, width: sq, height: sq };
    case "n": return { left: "50%", top: -thinHalf, width: bar, height: thin, marginLeft: -barHalf };
    case "s": return { left: "50%", bottom: -thinHalf, width: bar, height: thin, marginLeft: -barHalf };
    case "e": return { right: -thinHalf, top: "50%", width: thin, height: bar, marginTop: -barHalf };
    case "w": return { left: -thinHalf, top: "50%", width: thin, height: bar, marginTop: -barHalf };
  }
}

/** A live frame gesture (move or resize-scale). One pointer, one gesture —
 *  module scope keeps the keyboard listener (in each frame) aware of it
 *  without prop drilling. */
type FrameGesture = {
  mode: "move" | "scale";
  groupId: string;
  pointerId: number;
  startScreen: { x: number; y: number };
  /** Member positions when the gesture began — the restore point for Escape
   *  and the absolute base for every frame's target positions (no drift). */
  startPositions: Map<string, { x: number; y: number }>;
  /** Scale only: the frame box and the fixed origin captured on press. */
  startBox?: { width: number; height: number };
  origin?: { x: number; y: number };
  axes?: { x: boolean; y: boolean };
  moved: boolean;
  cancelled: boolean;
};
// Module-level slot for the one live gesture. Wrapped in accessors so event
// handlers mutate it through a function call (the linter forbids reassigning an
// outer-scope variable from inside a component's handlers, and a function call
// sidesteps that while keeping the exact same single-slot semantics).
let activeGesture: FrameGesture | null = null;
const gestureRef = {
  get: (): FrameGesture | null => activeGesture,
  set: (g: FrameGesture | null) => { activeGesture = g; },
};

/**
 * All group frames for one canvas.
 *
 * `nodes` is the canvas's PAINTED array (`positionedNodes` from GraphCanvas:
 * derived layout + per-view positions + collapsed-pill geometry) — the frame
 * must measure exactly what this canvas paints, or the box disagrees with the
 * cards in any view that derives its own layout (T-138, the last sizing bug:
 * reading shared store nodes here made Organize detach frames from clusters).
 *
 * `leafId` is the RAW canvas prop, deliberately NOT the scope's normalized
 * label (scope.leafId falls back to "primary"): the primary canvas renders from
 * viewSettings[undefined] (the defaults), and a gesture keyed on "primary"
 * would write a map nothing paints from. This matches the leafId the card-drag
 * path routes on.
 */
export function GroupFrames({ leafId, nodes }: { leafId?: string; nodes: FewerNode[] }): ReactNode {
  const groups = useGraphStore((s) => s.groups) ?? [];
  const { visibleIds } = useGraphViewScope();

  if (groups.length === 0) return null;
  return (
    <ViewportPortal>
      <div className="pointer-events-none absolute left-0 top-0 h-0 w-0">
        {groups.map((group) => (
          <GroupFrame
            key={group.id}
            group={group}
            nodes={nodes}
            visible={visibleIds}
            leafId={leafId}
          />
        ))}
      </div>
    </ViewportPortal>
  );
}

/** One group's frame. Exported for tests: GroupFrames renders it inside a
 *  ViewportPortal, which needs a mounted <ReactFlow> that a unit test has no
 *  reason to build. */
export function GroupFrame({
  group,
  nodes,
  visible,
  leafId,
}: {
  group: Group;
  /** The canvas's PAINTED nodes (derived layout + per-view positions + pill
   *  geometry). Bounds, gesture start positions and the scale origin all read
   *  exactly what this canvas paints (T-138). */
  nodes: FewerNode[];
  /** Ids this view paints. The box hugs these; a collapsed group anchors on all. */
  visible: ReadonlySet<string>;
  /** The owning canvas, for routing gesture writes to the per-view map. */
  leafId?: string;
}): ReactNode {
  const [editing, setEditing] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  // Header hover rings the member cards (T-134/T-141): the box communicates
  // ownership without needing to enclose every member.
  const [hovered, setHovered] = useState(false);
  // The picker reports every intermediate colour while dragging; we preview it
  // locally and commit on onChangeEnd so one drag stays ONE history entry
  // (setGroupColor records a `groups` op each call).
  const [draft, setDraft] = useState<string>(group.color ?? "");
  const isSelected = useGraphStore((s) => s.selectedGroupIds.includes(group.id));
  // Live viewport: the gestures convert screen deltas to flow coordinates with
  // it (a drag or scale must land where the pointer is at any zoom/pan).
  const { x: vpX, y: vpY, zoom } = useViewport();

  // The painted array only contains VISIBLE members — but a collapsed group's
  // pill must anchor on every member (collapse is what hides them, and
  // visible-only bounds would delete the pill's own handle). So the collapsed
  // anchor reads the store's full list, with this leaf's position map overlaid
  // where one exists, so hidden members keep their per-view coords (T-138).
  const allNodes = useGraphStore((s) => s.nodes);
  const leafPositions = useGraphStore((s) => (leafId ? s.viewSettings[leafId]?.positions : undefined));
  const anchorNodes = useMemo(() => {
    if (!group.collapsed) return nodes;
    const members = new Set(group.memberIds);
    return allNodes.map((n) => {
      const p = members.has(n.id) ? leafPositions?.[n.id] : undefined;
      return p ? { ...n, position: p } : n;
    });
  }, [group.collapsed, group.memberIds, allNodes, leafPositions, nodes]);

  // Group keyboard (T-135) — one listener per mounted frame, every handler
  // reads live state, so with several groups the first one to act wins and the
  // rest no-op. Escape cancels a live move (restore, no history) or clears the
  // selection; Delete ungroups every selected group. An editable target keeps
  // its own Escape/typing (rename input, note editor).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const act = useGraphStore.getState();
      if (e.key === "Escape") {
        const g = gestureRef.get();
        if (g && g.moved && !g.cancelled) {
          // Restore IS the Escape result for a live drag: positions snap back
          // where THIS canvas painted them, nothing is recorded, the selection
          // stays. Same routing as the gesture writes (per-view map vs shared).
          // (`act` here is already the state snapshot, not a getter.)
          const s = act;
          if (leafId) {
            // startPositions is a Map — spread it; Object.entries() on a Map is [].
            s.setNodePositionsBatch(leafId, [...g.startPositions].map(([id, pos]) => ({ id, pos })));
          } else {
            s.setGroupMemberPositions(g.groupId, Object.fromEntries(g.startPositions));
          }
          g.cancelled = true;
          return;
        }
        if (act.selectedGroupIds.length > 0) act.setSelectedGroupIds([]);
        return;
      }
      if (e.key === "Delete" && act.selectedGroupIds.length > 0) {
        e.preventDefault();
        for (const id of act.selectedGroupIds) act.removeGroup(id);
        act.setSelectedGroupIds([]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [group.id, leafId]);

  const visibleCount = group.memberIds.filter((id) => visible.has(id)).length;
  const hiddenCount = group.memberIds.length - visibleCount;
  // Expanded: frame the visible members only, so a group of hidden cards is an
  // empty box (T-134 edge case) — and drawing nothing at all when none is
  // visible. Collapsed: anchor the pill on EVERY member, because collapse is
  // what hides them — visible-only bounds would delete the pill's own handle.
  const visibleBounds = groupBounds(nodes, group.memberIds, GROUP_PADDING, visible);
  const allBounds = group.collapsed ? groupBounds(anchorNodes, group.memberIds) : null;
  const anchor = group.collapsed ? (allBounds ?? visibleBounds) : visibleBounds;
  // Every member gone (deleted, or the graph changed under it): nothing to draw.
  const box = anchor && (group.collapsed ? groupPill(anchor) : anchor);
  // Non-members fully inside the box, offered by the group menu so membership
  // and box can agree again (T-141). Primitives as deps: a drag re-render
  // rebuilds `box`, but only a geometry or node change should recompute this.
  const insideIds = useMemo(
    () => (box ? cardsInsideBox(nodes, box, group.memberIds, visible) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- box identity churns per render; its primitives are the real inputs
    [nodes, group.memberIds, visible, box?.x, box?.y, box?.width, box?.height],
  );
  if (!box) return null;

  // Colored frames tint border + fill + header from the same hex; the default
  // stays slate so a plain group reads exactly as it did before colors existed.
  const accent = group.color ?? TAG_FALLBACK_COLOR;
  const tinted = Boolean(group.color);
  const frameStyle = tinted
    ? { borderColor: accent, background: `${accent}14` }
    : undefined;
  // Collapsed: min-width is the FLOOR — the rendered width is content-driven
  // (w-max on the header), so a long name widens the pill instead of truncating
  // inside a static 240px (T-142).
  const headerStyle = tinted
    ? {
        height: group.collapsed ? COLLAPSED_PILL_HEIGHT : GROUP_HEADER_HEIGHT,
        minWidth: group.collapsed ? COLLAPSED_PILL_WIDTH : undefined,
        borderColor: `${accent}55`,
        background: `${accent}22`,
      }
    : {
        height: group.collapsed ? COLLAPSED_PILL_HEIGHT : GROUP_HEADER_HEIGHT,
        minWidth: group.collapsed ? COLLAPSED_PILL_WIDTH : undefined,
      };

  const act = () => useGraphStore.getState();

  // ── Select, move, resize-scale (T-135/T-136) ──
  // The frame isn't a React Flow node, so its gestures are hand-rolled: a
  // header press selects (shift toggles) and drags every member; a handle press
  // scales the arrangement around the handle's origin (cards keep their size).
  // Both record ONE move-positions op on release, and both compute targets from
  // the captured start — never incremented — so a lost pointermove or a mid-
  // gesture re-render cannot drift the cluster.
  const screenToFlow = (sx: number, sy: number) => ({ x: (sx - vpX) / zoom, y: (sy - vpY) / zoom });

  /** Write member positions where THIS canvas reads them: the per-view map when
   *  the leaf owns one (seeding it first, the way a card drag does), shared
   *  nodes otherwise. The old shared-only write slid the frame away from the
   *  cards the moment a view had its own map — the cards stayed painted from
   *  the map while only the invisible shared coords moved (T-137). */
  const writeMemberPositions = (positions: Record<string, { x: number; y: number }>) => {
    const s = act();
    if (leafId) {
      if (!s.viewSettings[leafId]?.positions) {
        // First gesture in this view: seed the map from what this canvas paints
        // so the cards that aren't moving keep their rendered spots.
        const seed: Record<string, { x: number; y: number }> = {};
        for (const n of nodes) seed[n.id] = { x: n.position.x, y: n.position.y };
        s.seedNodePositions(leafId, seed);
      }
      s.setNodePositionsBatch(leafId, Object.entries(positions).map(([id, pos]) => ({ id, pos })));
      return;
    }
    s.setGroupMemberPositions(group.id, positions);
  };

  const startGesture = (
    e: React.PointerEvent<HTMLElement>,
    mode: "move" | "scale",
    extra: Pick<FrameGesture, "startBox" | "origin" | "axes"> = {},
  ) => {
    const startPositions = new Map<string, { x: number; y: number }>();
    const members = new Set(group.memberIds);
    // Effective positions: the painted array IS what this canvas shows, so the
    // members' start coords are their painted ones (T-138).
    for (const n of nodes) {
      if (!members.has(n.id)) continue;
      startPositions.set(n.id, { x: n.position.x, y: n.position.y });
    }
    gestureRef.set({
      mode,
      groupId: group.id,
      pointerId: e.pointerId,
      startScreen: { x: e.clientX, y: e.clientY },
      startPositions,
      moved: false,
      cancelled: false,
      ...extra,
    });
    // Deliberately NO pointer capture here: capturing on pointerdown retargets
    // the whole pointer sequence — including the synthesized click — to the
    // header, which killed every button inside it (chevron, note, ×) in a real
    // browser. Capture is taken on the first move past the threshold instead,
    // so a plain click never captures and the buttons keep working (T-137).
  };

  const onHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // right-click stays the context menu's
    // Keep this off the pane (T-133 clears selection there) and off React Flow.
    e.stopPropagation();
    const state = act();
    const selected = state.selectedGroupIds;
    const next = e.shiftKey
      ? selected.includes(group.id)
        ? selected.filter((id) => id !== group.id)
        : [...selected, group.id]
      : selected.length === 1 && selected[0] === group.id
        ? selected
        : [group.id];
    state.setSelectedGroupIds(next);
    startGesture(e, "move");
  };

  const onHandlePointerDown = (id: GroupHandleId) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const current = groupBounds(nodes, group.memberIds, GROUP_PADDING, visible);
    if (!current) return; // nothing rendered → nothing to scale
    startGesture(e, "scale", {
      startBox: { width: current.width, height: current.height },
      origin: handleOrigin(id, current),
      axes: handleAxes(id),
    });
    // A handle is ~10 flow px — a few SCREEN px once zoomed out — so the
    // pointer leaves it within one mousemove, and uncaptured moves past it go
    // to the pane: a threshold-deferred capture would kill the gesture before
    // it ever crossed the threshold (T-137: "the transform controls don't
    // work"). Handles have no child controls, so capturing on press is safe —
    // the header defers it only because its buttons need the click.
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onFramePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const g = gestureRef.get();
    if (!g || g.groupId !== group.id || g.pointerId !== e.pointerId || g.cancelled) return;
    const dx = e.clientX - g.startScreen.x;
    const dy = e.clientY - g.startScreen.y;
    if (!g.moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      g.moved = true;
      // Capture only now: a plain click never captures (so the header's
      // buttons keep their click), while a real drag keeps receiving move/up
      // wherever the pointer goes (T-137).
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    if (g.mode === "move") {
      const positions: Record<string, { x: number; y: number }> = {};
      for (const [id, p] of g.startPositions) positions[id] = { x: p.x + dx / zoom, y: p.y + dy / zoom };
      writeMemberPositions(positions);
      return;
    }
    // Resize-by-scale (T-136): the axis factors come from the pointer's
    // distance to the fixed origin now vs at press; Shift locks uniform.
    const cur = screenToFlow(e.clientX, e.clientY);
    const start = screenToFlow(g.startScreen.x, g.startScreen.y);
    const mins = minScaleFor({ x: 0, y: 0, ...g.startBox! });
    let sx = g.axes!.x ? scaleFactorFor(cur.x, g.origin!.x, start.x, mins.x) : 1;
    let sy = g.axes!.y ? scaleFactorFor(cur.y, g.origin!.y, start.y, mins.y) : 1;
    if (e.shiftKey) {
      const s = g.axes!.x && g.axes!.y ? Math.max(sx, sy) : sx !== 1 ? sx : sy;
      sx = Math.max(s, mins.x);
      sy = Math.max(s, mins.y);
    }
    writeMemberPositions(scaleMemberPositions(g.startPositions, g.origin!, sx, sy));
  };

  const onFramePointerEnd = (e: React.PointerEvent<HTMLElement>) => {
    const g = gestureRef.get();
    if (!g || g.groupId !== group.id || g.pointerId !== e.pointerId) return;
    gestureRef.set(null);
    try { e.currentTarget.releasePointerCapture?.(e.pointerId); } catch { /* pointer already gone */ }
    if (!g.moved || g.cancelled) return; // a click is a selection, not a gesture
    // One history entry for the whole gesture, exactly like a card drag stop —
    // tagged with the leaf when the gesture wrote the per-view map, so undo
    // restores that map instead of the shared positions it never touched.
    const state = act();
    const members = new Set(group.memberIds);
    const leafPos = leafId ? state.viewSettings[leafId]?.positions : undefined;
    const moves = (state.nodes ?? [])
      .filter((n) => members.has(n.id))
      .flatMap((n) => {
        const from = g.startPositions.get(n.id);
        const to = leafPos?.[n.id] ?? { x: n.position.x, y: n.position.y };
        return from ? [{ nodeId: n.id, from, to }] : [];
      });
    state.recordDragMoves(moves, leafId);
    if (leafId) state._persistLayout();
  };

  /**
   * Open a layer (popover) from a Radix menu item. The menu closes on the same
   * pointer sequence that fired onSelect, so opening synchronously makes the new
   * layer see that press as an OUTSIDE press and close immediately — the menu
   * item looks like it does nothing. Deferring one frame lets the layer mount
   * after the sequence has finished.
   */
  const openAfterMenu = (open: () => void) => requestAnimationFrame(open);

  // Commit only when the draft normalizes to a real colour: typing "#12" and
  // closing must keep the previous colour rather than store junk (the validator
  // is the same one the snapshot uses on load).
  const commitDraft = () => {
    const valid = normalizeGroupColor(draft);
    if (valid && valid !== group.color) act().setGroupColor(group.id, valid);
  };
  const pickerColor = normalizeGroupColor(draft) ?? group.color ?? TAG_FALLBACK_COLOR;

  return (
    <div
      className="pointer-events-none absolute"
      style={
        // Collapsed: width is CONTENT-DRIVEN (T-142) — max-content off the
        // header, with the header's own min-width as the floor. box.width stays
        // the anchor geometry (groupPill) for anything that needs a box.
        group.collapsed
          ? { left: box.x, top: box.y, width: "max-content", height: box.height }
          : { left: box.x, top: box.y, width: box.width, height: box.height }
      }
      data-group-id={group.id}
      data-selected={isSelected ? "true" : undefined}
    >
      {/* The gray area — inert, so cards inside it stay draggable/selectable.
          Collapsed there is no area: the pill itself IS the frame (T-139), and
          a second coincident box under it doubles the selection outline. */}
      {!group.collapsed && (
        <div
          className={`${tinted ? "absolute inset-0 rounded-2xl border" : "absolute inset-0 rounded-2xl border border-border/50 bg-muted/35"}${isSelected ? " gm-selected-ring" : ""}`}
          style={frameStyle}
        />
      )}

      {/* Member outlines (T-141): hovering or selecting the frame rings each
          member card — the box says "which cards are mine" without needing to
          enclose them, which explicit membership makes impossible to promise. */}
      {(isSelected || hovered) && !group.collapsed && (
        <>
          {nodes
            .filter((n) => group.memberIds.includes(n.id) && visible.has(n.id))
            .map((n) => {
              const { w, h } = nodeRenderedSize(n);
              return (
                <div
                  key={n.id}
                  data-group-member-ring={n.id}
                  className="pointer-events-none absolute gm-selected-ring rounded-xl"
                  style={{ left: n.position.x - box.x, top: n.position.y - box.y, width: w, height: h }}
                />
              );
            })}
        </>
      )}

      {/* Right-click the header for the group menu; the body stays out of the way.
          Collapsed, this pill IS the whole frame — the same design language as a
          collapsed folder card (T-139): rounded-xl shell, backdrop blur, node
          shadow, theme tokens, icon tile and a stat sub-line. It sizes to its
          CONTENT (a long name widens it; COLLAPSED_PILL_WIDTH is only the floor
          — T-142), so the header is in-flow here, not absolutely stretched. */}
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            data-group-header={group.id}
            data-pill-shell={group.collapsed ? "" : undefined}
            // Grab affordance: the header moves the whole cluster, the title
            // text keeps its own cursor-text.
            className={
              group.collapsed
                ? `pointer-events-auto nodrag nopan relative flex h-full w-max cursor-grab items-center gap-1.5 rounded-xl border px-2 backdrop-blur-xl shadow-node-folder active:cursor-grabbing${tinted ? "" : " bg-fewer-group-bg border-fewer-group-border"}${isSelected ? " gm-selected-ring" : ""}`
                : tinted
                  ? `pointer-events-auto nodrag nopan absolute left-0 right-0 top-0 flex cursor-grab items-center gap-1 rounded-t-2xl border-b px-2 active:cursor-grabbing${isSelected ? " gm-selected-ring" : ""}`
                  : `pointer-events-auto nodrag nopan absolute left-0 right-0 top-0 flex cursor-grab items-center gap-1 rounded-t-2xl border-b border-border/40 bg-muted/70 px-2 active:cursor-grabbing${isSelected ? " gm-selected-ring" : ""}`
            }
            style={headerStyle}
            onPointerDown={onHeaderPointerDown}
            onPointerMove={onFramePointerMove}
            onPointerUp={onFramePointerEnd}
            onPointerCancel={onFramePointerEnd}
            onPointerEnter={() => setHovered(true)}
            onPointerLeave={() => setHovered(false)}
          >
        <button
          type="button"
          onClick={() => useGraphStore.getState().toggleGroupCollapsed(group.id)}
          title={group.collapsed ? "Expand group" : "Collapse group"}
          aria-label={group.collapsed ? "Expand group" : "Collapse group"}
          className={
            group.collapsed
              ? "flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-fewer-group-subtle-text transition-colors hover:bg-fewer-group-subtle-text/10"
              : "flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
          }
        >
          {group.collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>

        {group.collapsed && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-fewer-group-icon/10 text-fewer-group-icon">
            <Boxes className="h-4 w-4" />
          </span>
        )}

        {editing ? (
          <input
            autoFocus
            defaultValue={group.title}
            aria-label="Group title"
            // The frame is selected by the very click that opened the editor,
            // so an input ring stacks on the selection ring — a double-ring bug
            // (T-142). The selection outline IS the focus indicator here; the
            // input only rings when the frame itself is not selected.
            className={`min-w-0 flex-1 rounded-md bg-transparent px-1 font-semibold outline-none${isSelected ? "" : " ring-1 ring-primary/60"}${group.collapsed ? " text-sm text-fewer-group-text" : " text-xs text-foreground"}`}
            onBlur={(e) => {
              useGraphStore.getState().renameGroup(group.id, e.target.value);
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setEditing(false);
            }}
          />
        ) : (
          // The title carries the note on hover — the group's own annotation.
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                role="button"
                tabIndex={0}
                title="Rename group"
                onDoubleClick={() => setEditing(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setEditing(true);
                  }
                }}
                // outline-none: a mouse click that focuses the span must not
                // draw a second ring beside the frame's selection ring (the
                // reported bug, T-142); focus-visible keeps one for keyboard.
                // Collapsed, the span is pure content — no flex/truncate — so
                // the pill hugs the real name and long titles widen it (T-142).
                className={
                  group.collapsed
                    ? "cursor-text whitespace-nowrap rounded-sm text-sm font-semibold text-fewer-group-text outline-none focus-visible:ring-1 focus-visible:ring-primary/60"
                    : "min-w-0 flex-1 cursor-text truncate px-1 text-xs font-semibold text-foreground outline-none focus-visible:ring-1 focus-visible:ring-primary/60"
                }
              >
                {group.title}
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs whitespace-pre-wrap text-left">
              {group.note || "No note yet — click the note icon to add one"}
            </TooltipContent>
          </Tooltip>
        )}

        {/* Stat line: the collapsed pill shows the plain total — every member is
            hidden BY the collapse, so "0 of 2 members" read as a bug (T-139).
            "Members", not "cards": a re-flow can park non-member cards inside
            the box, and only members belong to the group (T-141). */}
        {group.collapsed ? (
          <span className="shrink-0 text-[10px] uppercase tracking-wider text-fewer-group-subtle-text">
            {plural(group.memberIds.length, "member")}
          </span>
        ) : (
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {hiddenCount > 0 ? `${visibleCount} of ${plural(group.memberIds.length, "member")}` : plural(group.memberIds.length, "member")}
          </span>
        )}

        <Popover open={noteOpen} onOpenChange={setNoteOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              title={group.note ? "Edit note" : "Add a note"}
              aria-label={group.note ? "Edit note" : "Add a note"}
              className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
            >
              <StickyNote className={group.note ? "h-3.5 w-3.5 text-foreground/70" : "h-3.5 w-3.5"} />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-2" align="end">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Note</div>
            <Textarea
              defaultValue={group.note}
              placeholder="What should you remember about this group?"
              rows={4}
              aria-label="Group note"
              onBlur={(e) => useGraphStore.getState().setGroupNote(group.id, e.target.value)}
            />
          </PopoverContent>
        </Popover>

        <button
          type="button"
          onClick={() => useGraphStore.getState().removeGroup(group.id)}
          title="Ungroup (undo with Ctrl+Z)"
          aria-label="Ungroup"
          className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <X className="h-3.5 w-3.5" />
        </button>
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent
          className="w-52"
          // The Color… item opens a popover; without this the menu's focus
          // restore steals it back to the canvas on close.
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <ContextMenuItem onSelect={() => setEditing(true)}>Rename…</ContextMenuItem>
          <ContextMenuItem onSelect={() => openAfterMenu(() => setNoteOpen(true))}>
            Edit Note…
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() =>
              openAfterMenu(() => {
                setDraft(group.color ?? "");
                setColorOpen(true);
              })
            }
          >
            Color…
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => act().toggleGroupCollapsed(group.id)}>
            {group.collapsed ? "Expand" : "Collapse"}
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() =>
              // setSelectedNodeIds (not a raw setState): it bumps selectionVersion
              // — the canvas lens stamps `selected` flags from that list — and
              // mirrors into the active leaf's selection. A raw write left the
              // stamp invalid, so nothing lit up.
              useGraphStore.getState().setSelectedNodeIds([...group.memberIds])
            }
          >
            Select Members
          </ContextMenuItem>
          {/* A re-flow parked these cards fully inside the box but outside the
              membership — offer to adopt them so box and membership agree
              (one `groups` op, one undo step). */}
          {insideIds.length > 0 && (
            <ContextMenuItem
              onSelect={() => act().setGroupMembers(group.id, [...group.memberIds, ...insideIds])}
            >
              Include {plural(insideIds.length, "card")} inside
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
          <ContextMenuItem
            onSelect={() => act().removeGroup(group.id)}
            className="text-destructive focus:bg-red-500/10"
          >
            Ungroup
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* Color picker: portalled to <body>, so it renders 1:1 in screen space
          instead of scaling with the canvas (the frame lives in flow coords). */}
      <Popover
        open={colorOpen}
        onOpenChange={(open) => {
          setColorOpen(open);
          if (!open) commitDraft();
        }}
      >
        {/* Radix Popper positions from an anchor. This popover is opened by a
            menu item, so it has no trigger to serve as one — without this it
            never got a position and the picker was unusable. The invisible div
            sits exactly over the title bar. */}
        <PopoverAnchor asChild>
          <div
            className="pointer-events-none absolute left-0 top-0"
            style={{ width: box.width, height: GROUP_HEADER_HEIGHT }}
          />
        </PopoverAnchor>
        <PopoverContent
          align="start"
          className="w-64 space-y-2 p-3"
          // Opened from a menu item: the press that dismissed the menu arrives
          // as an outside-press/focus on the fresh layer and Radix closes it in
          // the same frame — the menu item looked like it did nothing. Keep it
          // open until Escape or Done.
          onPointerDownOutside={(e) => e.preventDefault()}
          onFocusOutside={(e) => e.preventDefault()}
        >
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Group color</div>
          <div className="overflow-hidden rounded-md">
            <HexColorPicker
              color={pickerColor}
              onChange={(c) => setDraft(c)}
              onChangeEnd={(c) => {
                setDraft(c);
                const valid = normalizeGroupColor(c);
                if (valid) act().setGroupColor(group.id, valid);
              }}
              aria-label="Group color"
              style={{ width: "100%", height: 140 }}
            />
          </div>
          <HexColorInput
            color={pickerColor}
            onChange={(c) => setDraft(c)}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitDraft();
            }}
            prefixed
            aria-label="Group color hex value"
            className="w-full rounded-md border border-border bg-background px-2 py-1 font-mono text-xs text-foreground outline-none focus:ring-1 focus:ring-primary/60"
          />
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                setDraft("");
                act().setGroupColor(group.id, undefined);
              }}
              className="rounded-md border border-border/60 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              Reset to default
            </button>
            <button
              type="button"
              onClick={() => setColorOpen(false)}
              className="rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Done
            </button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Resize handles (T-136): selected, expanded frames only. Each is its
          own pointer target — dragging one scales the arrangement around the
          handle's origin (cards keep their size). */}
      {isSelected && !group.collapsed &&
        GROUP_HANDLES.map((h) => (
          <div
            key={h}
            data-group-handle={h}
            className={`pointer-events-auto nodrag nopan absolute rounded-[3px] border border-border/70 bg-background shadow-sm ${HANDLE_CURSORS[h]}`}
            style={handleStyle(h)}
            onPointerDown={onHandlePointerDown(h)}
            onPointerMove={onFramePointerMove}
            onPointerUp={onFramePointerEnd}
            onPointerCancel={onFramePointerEnd}
          />
        ))}
    </div>
  );
}
