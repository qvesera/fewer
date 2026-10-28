import { Handle, type NodeProps } from "@xyflow/react";
import { useGraphViewDirection } from "@/hooks/use-graph-view-context";
import { getHandlePositions } from "@/lib/fewer/nodeDisplay";
import type { FewerNode } from "@/lib/fewer/types";

/**
 * The collapsed group's NODE (T-180): a transparent body carrying the four
 * handles React Flow anchors edges to, so a collapsed group's connections are
 * ordinary edges — same renderer, style, dash and width as every folder→file
 * edge, instead of a separately drawn stub layer.
 *
 * The visible pill shell stays `GroupFrame`'s, at the same rect: this body
 * takes NO pointer events, so the shell keeps its gesture, menus and context
 * menu — and the shell is clamped to the node box, so the handles sit exactly
 * on its visible edge.
 */
export function GroupPillNode({ id, data }: NodeProps<FewerNode>) {
  const direction = useGraphViewDirection();
  const { source, target } = getHandlePositions(direction);
  const groupId = typeof data.groupId === "string" ? data.groupId : "";
  return (
    <div data-pill-node={groupId} data-pill-node-id={id} className="pointer-events-none h-full w-full">
      <Handle
        type="target"
        position={target}
        id={`target-${target}`}
        isConnectable={false}
        className="!h-2 !w-2 !rounded-full !border-2 !border-white/60 !bg-fewer-handle opacity-0"
      />
      <Handle
        type="source"
        position={source}
        id={`source-${source}`}
        isConnectable={false}
        className="!h-2 !w-2 !rounded-full !border-2 !border-white/60 !bg-fewer-handle opacity-0"
      />
    </div>
  );
}
