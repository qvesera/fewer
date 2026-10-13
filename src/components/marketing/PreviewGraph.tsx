import type { CSSProperties } from "react";
import { FileText, Folder } from "lucide-react";
import {
  PREVIEW_CANVAS,
  PREVIEW_NODES,
  nodeBox,
  previewEdgePaths,
  type PreviewNode,
} from "@/lib/fewer/marketingPreview";

/**
 * The demo graph, rendered from the shared preview tree (T-150). Cards are
 * positioned in percentages of the same box the edge <svg> uses as its viewBox,
 * so the two stay locked together at any width; strokes are non-scaling so the
 * bezier edges keep their 1.5px weight.
 *
 * Below 520px the box holds that minimum and the wrapper scrolls, the way the
 * real canvas pans: shrinking further would only produce truncated card names.
 * Folder cards list their first few children inline, like the app does, so a
 * folder reads as a folder and not as an empty box.
 *
 * Not a client component on purpose: the lift on hover is pure CSS (.mk-card),
 * so this renders on the server and still works inside client parents.
 */
export function PreviewGraph({
  nodes = PREVIEW_NODES,
  accent,
  className,
}: {
  nodes?: PreviewNode[];
  accent?: string;
  className?: string;
}) {
  const style: CSSProperties & Record<string, string> = {
    aspectRatio: `${PREVIEW_CANVAS.w} / ${PREVIEW_CANVAS.h}`,
  };
  if (accent) style["--mk-accent"] = accent;

  const pct = (value: number, total: number) => `${(value / total) * 100}%`;

  return (
    <div
      className={`overflow-x-auto ${className ?? ""}`}
      tabIndex={0}
      role="region"
      aria-label="Sample project graph"
    >
      <div className="relative min-w-[520px]" style={style}>
        <svg
          viewBox={`0 0 ${PREVIEW_CANVAS.w} ${PREVIEW_CANVAS.h}`}
          className="absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          {previewEdgePaths(nodes).map((edge) => (
            <path
              key={`${edge.from}-${edge.to}`}
              d={edge.d}
              fill="none"
              strokeWidth={1.5}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              style={{ stroke: "var(--mk-accent, var(--fewer-edge))" }}
            />
          ))}
        </svg>

        {nodes.map((node) => {
          const box = nodeBox(node);
          const isFolder = node.kind === "folder";
          const kids = isFolder ? nodes.filter((n) => n.parent === node.id) : [];
          const label = (
            <span
              className="truncate font-mono text-[11px] font-medium"
              style={{ color: isFolder ? "var(--fewer-folder-text)" : "var(--fewer-file-text)" }}
            >
              {node.label}
              {isFolder ? "/" : ""}
            </span>
          );
          const icon = isFolder ? (
            <Folder
              className="h-3.5 w-3.5 shrink-0"
              style={{ color: "var(--fewer-folder-icon)" }}
              aria-hidden="true"
            />
          ) : (
            <FileText
              className="h-3.5 w-3.5 shrink-0"
              style={{ color: "var(--fewer-file-icon)" }}
              aria-hidden="true"
            />
          );

          return (
            <div
              key={node.id}
              className={
                isFolder
                  ? "mk-card absolute flex flex-col justify-center gap-1 overflow-hidden rounded-xl border px-2"
                  : "mk-card absolute flex items-center gap-1.5 overflow-hidden rounded-xl border px-2"
              }
              style={{
                left: pct(box.x, PREVIEW_CANVAS.w),
                top: pct(box.y, PREVIEW_CANVAS.h),
                width: pct(box.w, PREVIEW_CANVAS.w),
                height: pct(box.h, PREVIEW_CANVAS.h),
                background: isFolder ? "var(--fewer-folder-bg)" : "var(--fewer-file-bg)",
                borderColor: isFolder ? "var(--fewer-folder-border)" : "var(--fewer-file-border)",
              }}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                {icon}
                {label}
              </span>

              {kids.length > 0 && (
                <span className="grid gap-0.5 self-stretch">
                  {kids.slice(0, 3).map((kid) => (
                    <span
                      key={kid.id}
                      className="truncate rounded border px-1 font-mono text-[8px] leading-[1.5]"
                      style={{
                        background: "var(--fewer-file-bg)",
                        borderColor: "var(--fewer-file-border)",
                        color: "var(--fewer-file-subtle-text)",
                      }}
                    >
                      {kid.label}
                    </span>
                  ))}
                  {kids.length > 3 && (
                    <span
                      className="truncate font-mono text-[8px] leading-[1.5]"
                      style={{ color: "var(--fewer-folder-subtle-text)" }}
                    >
                      +{kids.length - 3} more
                    </span>
                  )}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
