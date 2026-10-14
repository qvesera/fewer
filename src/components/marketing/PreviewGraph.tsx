"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ChevronRight, FileText, Folder } from "lucide-react";
import {
  PREVIEW_FILE,
  PREVIEW_FOLDER,
  PREVIEW_MIN_WIDTH,
  previewLayout,
  nodeBox,
  previewChildren,
  previewEdgePaths,
  previewPaths,
  type PreviewNode,
} from "@/lib/fewer/marketingPreview";

/**
 * The demo graph (T-150, reworked T-151). These are the product's cards, not
 * a stylised miniature: same dimensions (240x200 / 220x58), same shell classes,
 * same tokens, same `N items` footer, reusing the app's own .gm-node-hover /
 * .shadow-node-* utilities so hover behaves the way it does on the canvas.
 *
 * The graph IS the feature catalogue: a folder card per rail group, a file
 * card per feature, card id = feature id (see marketingPreview.ts for why).
 * A feature card's sub-line names its group the way a real card's sub-line
 * carries metadata - these cards are features, so `.ext · size` would be
 * invented file data and the one honest thing to print is where the card
 * lives.
 *
 * The whole box is laid out in the product's pixel space and then `zoom`ed to
 * fit its container, so every proportion (and the text) scales together the
 * way the canvas does when you zoom out. Below PREVIEW_MIN_WIDTH the box stops
 * shrinking and the wrapper scrolls, because shrinking further would only
 * produce unreadable card names.
 *
 * The positions come from previewLayout(shyness), so the Crown Shyness dial in
 * the callout is a real control: moving it re-flows the demo tree on the
 * canvas, with the product's own curve, and the box grows to fit the result.
 *
 * Edges march with the canvas's animated-edge look (2px, dashed, `mk-edge-flow`
 * in globals.css); prefers-reduced-motion stops the march and leaves the dashes,
 * same as the app.
 *
 * The active marker: the card whose feature the callout is telling wears the
 * product's own active outline (mk-node-active) at all times - there is no
 * second marker, because the card's name already IS the feature. Once the
 * reader engages, everything else dims, and the ring is what stays readable.
 */

/** Brightness of one card in the demo, driven by the active feature. */
type NodeState = "active" | "dim" | "idle";

const NODE_STATE_CLASS: Record<NodeState, string> = {
  active: "mk-node-active",
  dim: "mk-node-dim",
  idle: "",
};

/** Design-space -> container fit. Caps at 1:1; never blows the cards up. */
function useFitZoom(designWidth: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? designWidth;
      setZoom(Math.min(1, Math.max(PREVIEW_MIN_WIDTH / designWidth, width / designWidth)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [designWidth]);

  return { ref, zoom };
}

function cardVars(kind: "folder" | "file"): CSSProperties {
  return kind === "folder"
    ? {
        background: "var(--fewer-folder-bg-gradient, var(--fewer-folder-bg))",
        borderColor: "var(--fewer-folder-border)",
      }
    : {
        background: "var(--fewer-file-bg-gradient, var(--fewer-file-bg))",
        borderColor: "var(--fewer-file-border)",
      };
}

/** The connectable dots the real cards carry on their left/right edges. */
function HandleDots() {
  return (
    <>
      {(["left", "right"] as const).map((side) => (
        <span
          key={side}
          aria-hidden="true"
          className="absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full border-2"
          style={{
            ...(side === "left" ? { left: -4 } : { right: -4 }),
            borderColor: "rgba(255, 255, 255, 0.6)",
            background: "var(--fewer-handle)",
          }}
        />
      ))}
    </>
  );
}

/** A child row inside a folder card — the app's ChildEntry, minus its menus. */
function ChildRow({ child, childCount }: { child: PreviewNode; childCount: number }) {
  const isFolder = child.kind === "folder";
  const Icon = isFolder ? Folder : FileText;
  return (
    <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs">
      <Icon
        className="h-3.5 w-3.5 shrink-0"
        style={{ color: isFolder ? "var(--fewer-folder-icon)" : "var(--fewer-file-icon)" }}
        aria-hidden="true"
      />
      <span className="truncate" style={{ color: "var(--fewer-text)" }}>
        {child.label}
      </span>
      {isFolder && (
        <span
          className="ml-auto shrink-0 tabular-nums text-[10px]"
          style={{ color: "var(--fewer-text-subtle)" }}
        >
          {childCount} {childCount === 1 ? "item" : "items"}
        </span>
      )}
      <ChevronRight
        className={`h-3 w-3 shrink-0 opacity-60 ${isFolder ? "" : "ml-auto"}`}
        style={{ color: "var(--fewer-text-subtle)" }}
        aria-hidden="true"
      />
    </div>
  );
}

function FolderCard({
  node,
  nodes,
  path,
  counts,
  state,
  onActivate,
}: {
  node: PreviewNode;
  nodes: PreviewNode[];
  path: string;
  counts: Record<string, number>;
  state: NodeState;
  onActivate?: (via: "hover" | "click") => void;
}) {
  const kids = previewChildren(node.id, nodes);
  const box = nodeBox(node);
  return (
    <div
      data-mk-node={node.id}
      onPointerEnter={() => onActivate?.("hover")}
      onClick={() => onActivate?.("click")}
      className={`gm-node-hover absolute flex flex-col overflow-hidden rounded-2xl border backdrop-blur-xl shadow-node-folder ${NODE_STATE_CLASS[state]}`}
      style={{
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        ...cardVars("folder"),
      }}
    >
      <div
        className="flex items-center gap-2 border-b px-3 py-2"
        style={{ borderColor: "var(--fewer-folder-border)", background: "var(--fewer-folder-bg)" }}
      >
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
          style={{ background: "var(--fewer-folder-bg)", color: "var(--fewer-folder-icon)" }}
        >
          <Folder className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <span
            className="truncate text-sm font-semibold"
            style={{ color: "var(--fewer-folder-text)" }}
            title={path}
          >
            {node.label}
          </span>
          <span
            className="truncate text-[10px]"
            style={{ color: "var(--fewer-folder-subtle-text)" }}
            title={path}
          >
            {path}
          </span>
        </div>
        <ChevronRight
          className="h-4 w-4 shrink-0 rotate-90"
          style={{ color: "var(--fewer-folder-subtle-text)" }}
          aria-hidden="true"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden p-1.5">
        {kids.length === 0 ? (
          <div
            className="px-2 py-3 text-center text-xs"
            style={{ color: "var(--fewer-text-subtle)" }}
          >
            Empty folder
          </div>
        ) : (
          kids.map((kid) => (
            <ChildRow key={kid.id} child={kid} childCount={counts[kid.id] ?? 0} />
          ))
        )}
      </div>

      <div
        className="flex items-center justify-between border-t px-3 py-1.5 text-[10px] uppercase tracking-wider"
        style={{
          borderColor: "var(--fewer-folder-border)",
          background: "var(--fewer-folder-bg)",
          color: "var(--fewer-folder-subtle-text)",
        }}
      >
        <span className="shrink-0">
          {kids.length} {kids.length === 1 ? "item" : "items"}
        </span>
      </div>
      <HandleDots />
    </div>
  );
}

function FileCard({
  node,
  path,
  group,
  state,
  onActivate,
}: {
  node: PreviewNode;
  path: string;
  /** The parent group's label: the one honest sub-line a feature card has. */
  group?: string;
  state: NodeState;
  onActivate?: (via: "hover" | "click") => void;
}) {
  const box = nodeBox(node);
  return (
    <div
      data-mk-node={node.id}
      onPointerEnter={() => onActivate?.("hover")}
      onClick={() => onActivate?.("click")}
      className={`gm-node-hover absolute flex items-center gap-3 rounded-xl border backdrop-blur-xl shadow-node-file ${NODE_STATE_CLASS[state]}`}
      style={{
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        ...cardVars("file"),
      }}
    >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{ color: "var(--fewer-file-icon)" }}
      >
        <FileText className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span
          className="truncate text-sm font-semibold"
          style={{ color: "var(--fewer-file-text)" }}
          title={path}
        >
          {node.label}
        </span>
        {group && (
          <span
            className="truncate text-[10px] uppercase tracking-wider"
            style={{ color: "var(--fewer-file-subtle-text)" }}
            title={path}
          >
            {group}
          </span>
        )}
      </div>
      <HandleDots />
    </div>
  );
}

export function PreviewGraph({
  shyness = 1,
  accent,
  className,
  activeId,
  dimOthers = false,
  onActivateNode,
}: {
  /** The Crown Shyness dial the callout holds; 1 is the default layout. */
  shyness?: number;
  accent?: string;
  className?: string;
  /**
   * The feature the callout is telling: that card wears the active ring at
   * all times - even before the reader engages - so the inspector and the
   * canvas never disagree about what is on screen. One id, one card.
   */
  activeId?: string | null;
  /** Dim everything that is not `activeId`. Off = plain, whole demo graph. */
  dimOthers?: boolean;
  onActivateNode?: (nodeId: string, via: "hover" | "click") => void;
}) {
  const { nodes, canvas } = useMemo(() => previewLayout(shyness), [shyness]);
  const { ref, zoom } = useFitZoom(canvas.w);

  const style: CSSProperties & Record<string, string> = {};
  if (accent) style["--mk-accent"] = accent;

  const paths = previewPaths(nodes);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const counts: Record<string, number> = {};
  for (const node of nodes) if (node.parent) counts[node.parent] = (counts[node.parent] ?? 0) + 1;

  const stateOf = (id: string): NodeState =>
    id === activeId ? "active" : dimOthers ? "dim" : "idle";

  return (
    <div
      ref={ref}
      className={`overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className ?? ""}`}
      tabIndex={0}
      role="region"
      aria-label="Feature index"
    >
      <div
        data-mk-canvas
        className="relative mx-auto"
        style={{
          ...style,
          width: canvas.w * zoom,
          height: canvas.h * zoom,
        }}
      >
        {/* Cards and edges live in the product's pixel space and are scaled by
            CSS zoom, exactly as the canvas scales on zoom out. */}
        <div
          className="absolute left-0 top-0"
          style={{
            width: canvas.w,
            height: canvas.h,
            zoom,
          }}
        >
          <svg
            viewBox={`0 0 ${canvas.w} ${canvas.h}`}
            className="absolute inset-0 h-full w-full"
            aria-hidden="true"
          >
            {previewEdgePaths(nodes).map((edge) => {
              const quiet =
                dimOthers && edge.from !== activeId && edge.to !== activeId;
              return (
                <path
                  key={`${edge.from}-${edge.to}`}
                  className={`mk-edge-flow${quiet ? " mk-node-dim" : ""}`}
                  d={edge.d}
                  fill="none"
                  strokeWidth={2}
                  strokeLinecap="round"
                  style={{ stroke: "var(--mk-accent, var(--fewer-edge))" }}
                />
              );
            })}
          </svg>

          {nodes.map((node) =>
            node.kind === "folder" ? (
              <FolderCard
                key={node.id}
                node={node}
                nodes={nodes}
                path={paths[node.id] ?? node.label}
                counts={counts}
                state={stateOf(node.id)}
                onActivate={(via) => onActivateNode?.(node.id, via)}
              />
            ) : (
              <FileCard
                key={node.id}
                node={node}
                path={paths[node.id] ?? node.label}
                group={node.parent ? byId.get(node.parent)?.label : undefined}
                state={stateOf(node.id)}
                onActivate={(via) => onActivateNode?.(node.id, via)}
              />
            ),
          )}
        </div>
      </div>
    </div>
  );
}
