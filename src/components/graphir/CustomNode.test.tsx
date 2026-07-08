"use client";
import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { GraphirNode } from "@/lib/graphir/types";

function TestNodeImpl({ id, data, selected }: NodeProps<GraphirNode>) {
  const isHorizontal = false;
  const source = isHorizontal ? Position.Right : Position.Bottom;
  const target = isHorizontal ? Position.Left : Position.Top;
  return (
    <div className="rounded-lg border-2 border-orange-400 bg-orange-500/20 p-2 min-w-[100px]">
      <Handle type="target" position={target} isConnectable />
      <span className="text-sm">{data.label}</span>
      <Handle type="source" position={source} isConnectable />
    </div>
  );
}
export const TestNode = memo(TestNodeImpl);
