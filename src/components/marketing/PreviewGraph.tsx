"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ChevronRight, FileText, Folder } from "lucide-react";
import { CATEGORY_ICON, formatSize } from "@/lib/fewer/nodeVisuals";
import {
  PREVIEW_FILE,
  PREVIEW_FOLDER,
  PREVIEW_MIN_WIDTH,
  previewLayout,
  nodeBox,
  nodeFileName,
  previewChildren,
  previewEdgePaths,
  previewPaths,
  type PreviewNode,
} from "@/lib/fewer/marketingPreview";

/**
 * The demo graph (T-150). These are the product's cards, not a stylised
 * miniature: same dimensions (240x200 / 220x58), same shell classes, same
 * tokens, same icon set, same `N items` footer and `.ext · size` sub-line,
 * reusing the app's own .gm-node-hover / .shadow-node-* utilities so hover
 * behaves the way it does on the canvas.
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
 * The hotspot overlay (T-150 follow-up): cards accept an `onActivate` and a
 * dim/active state so the playground can highlight a subtree and quiet the
 * rest, and exactly one card wears the feature the callout is telling as a
 * small tag in its own corner. Inside the card, so it scales with the box like
 * the rest of the text - and never a dozen markers competing for the eye.
 */

/** Brightness of one card in the demo, driven by the active hotspot. */
type NodeState = "active" | "dim" | "idle";

const NODE_STATE_CLASS: Record<NodeState, string> = {
  active: "mk-node-active",
  dim: "mk-node-dim",
  idle: "",
};

/** The one marker on the demo canvas: the feature the callout is telling. */
const TAG_CLASS =
  "truncate rounded-full bg-primary px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase leading-none tracking-[0.12em] text-primary-foreground";

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
  const Icon = isFolder ? Folder : CATEGORY_ICON[child.category ?? "text"];
  return (
    <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs">
      <Icon
        className="h-3.5 w-3.5 shrink-0"
        style={{ color: isFolder ? "var(--fewer-folder-icon)" : "var(--fewer-file-icon)" }}
        aria-hidden="true"
      />
      <span className="truncate" style={{ color: "var(--fewer-text)" }}>
        {nodeFileName(child)}
      </span>
      <span
        className="ml-auto shrink-0 tabular-nums text-[10px]"
        style={{ color: "var(--fewer-text-subtle)" }}
      >
        {isFolder ? `${childCount} ${childCount === 1 ? "item" : "items"}` : formatSize(child.size ?? 0)}
      </span>
      <ChevronRight
        className="h-3 w-3 shrink-0 opacity-60"
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
  paths,
  counts,
  state,
  tag,
  onActivate,
}: {
  node: PreviewNode;
  nodes: PreviewNode[];
  path: string;
  paths: Record<string, string>;
  counts: Record<string, number>;
  state: NodeState;
  /** The active feature, when this card is the one it is anchored to. */
  tag?: { id: string; label: string } | null;
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
        {tag && (
          <span data-mk-tag={tag.id} className={`${TAG_CLASS} max-w-[60%]`} aria-hidden="true">
            {tag.label}
          </span>
        )}
      </div>
      <HandleDots />
    </div>
  );
}

function FileCard({
  node,
  path,
  state,
  tag,
  onActivate,
}: {
  node: PreviewNode;
  path: string;
  state: NodeState;
  /** The active feature, when this card is the one it is anchored to. */
  tag?: { id: string; label: string } | null;
  onActivate?: (via: "hover" | "click") => void;
}) {
  const box = nodeBox(node);
  const Icon = CATEGORY_ICON[node.category ?? "text"] ?? FileText;
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
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span
          className="truncate text-sm font-semibold"
          style={{ color: "var(--fewer-file-text)" }}
          title={path}
        >
          {nodeFileName(node)}
        </span>
        <div
          className="flex items-center gap-2 text-[10px] uppercase tracking-wider"
          style={{ color: "var(--fewer-file-subtle-text)" }}
        >
          <span className="shrink-0">{node.extension ? `.${node.extension}` : "file"}</span>
          {node.size ? (
            <>
              <span className="opacity-50">·</span>
              <span className="shrink-0">{formatSize(node.size)}</span>
            </>
          ) : null}
        </div>
      </div>
      {tag && (
        <span
          data-mk-tag={tag.id}
          className={`${TAG_CLASS} absolute bottom-1.5 right-1.5 max-w-[calc(100%-1rem)]`}
          aria-hidden="true"
        >
          {tag.label}
        </span>
      )}
      <HandleDots />
    </div>
  );
}

export function PreviewGraph({
  shyness = 1,
  accent,
  className,
  activeTag,
  activeIds,
  dimOthers = false,
  onActivateNode,
}: {
  /** The Crown Shyness dial the callout holds; 1 is the default layout. */
  shyness?: number;
  accent?: string;
  className?: string;
  /**
   * The feature the callout is telling, with the card it is anchored to: that
   * one card wears the tag, and only that one.
   */
  activeTag?: { id: string; nodeId: string; label: string } | null;
  /** Node ids (anchors + descendants) to keep bright while dimmed. */
  activeIds?: string[] | null;
  /** Dim everything that is not in `activeIds`. Off = plain demo graph. */
  dimOthers?: boolean;
  onActivateNode?: (nodeId: string, via: "hover" | "click") => void;
}) {
  const { nodes, canvas } = useMemo(() => previewLayout(shyness), [shyness]);
  const { ref, zoom } = useFitZoom(canvas.w);

  const style: CSSProperties & Record<string, string> = {};
  if (accent) style["--mk-accent"] = accent;

  const paths = previewPaths(nodes);
  const counts: Record<string, number> = {};
  for (const node of nodes) if (node.parent) counts[node.parent] = (counts[node.parent] ?? 0) + 1;

  const active = new Set(dimOthers ? (activeIds ?? []) : []);
  const stateOf = (id: string): NodeState =>
    !dimOthers ? "idle" : active.has(id) ? "active" : "dim";

  return (
    <div
      ref={ref}
      className={`overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className ?? ""}`}
      tabIndex={0}
      role="region"
      aria-label="Sample project graph"
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
              const quiet = dimOthers && !active.has(edge.from) && !active.has(edge.to);
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
                paths={paths}
                counts={counts}
                state={stateOf(node.id)}
                tag={activeTag?.nodeId === node.id ? activeTag : null}
                onActivate={(via) => onActivateNode?.(node.id, via)}
              />
            ) : (
              <FileCard
                key={node.id}
                node={node}
                path={paths[node.id] ?? node.label}
                state={stateOf(node.id)}
                tag={activeTag?.nodeId === node.id ? activeTag : null}
                onActivate={(via) => onActivateNode?.(node.id, via)}
              />
            ),
          )}
        </div>
      </div>
    </div>
  );
}
