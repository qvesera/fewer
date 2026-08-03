"use client";

import { useMemo, useCallback } from "react";
import { useGraphStore } from "@/store/graphStore";

interface CustomMiniMapProps {
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  size?: number;
}

/**
 * A lightweight minimap that reads node positions directly from the store,
 * independent of React Flow's viewport culling.
 * This allows onlyRenderVisibleElements=true while keeping the minimap usable.
 */
export function CustomMiniMap({
  position = "bottom-right",
  size = 160,
}: CustomMiniMapProps) {
  const nodes = useGraphStore((s) => s.nodes);

  // Compute bounds of all nodes
  const { minX, minY, maxX, maxY, scale } = useMemo(() => {
    if (nodes.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0, scale: 1 };

    const xs = nodes.map((n) => n.position.x);
    const ys = nodes.map((n) => n.position.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs) + 300; // account for node width
    const maxY = Math.max(...ys) + 120; // account for node height
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const padding = 20;
    const scale = Math.min((size - padding * 2) / rangeX, (size - padding * 2) / rangeY, 1);

    return { minX, minY, maxX, maxY, scale };
  }, [nodes, size]);

  // Position classes
  const posClass = useMemo(() => {
    switch (position) {
      case "top-left": return "top-2 left-2";
      case "top-right": return "top-2 right-2";
      case "bottom-left": return "bottom-2 left-2";
      case "bottom-right": return "bottom-2 right-2";
    }
  }, [position]);

  if (nodes.length === 0) return null;

  return (
    <div
      className={`absolute ${posClass} z-10 pointer-events-none`}
      style={{
        width: size,
        height: size,
        backgroundColor: "rgba(15, 23, 42, 0.6)",
        borderRadius: "12px",
        border: "1px solid rgba(148, 163, 184, 0.2)",
        overflow: "hidden",
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="opacity-70"
      >
        {nodes.map((node) => {
          const x = 20 + (node.position.x - minX) * scale;
          const y = 20 + (node.position.y - minY) * scale;
          const w = Math.max(3, (node.style?.width as number ?? 220) * scale);
          const h = Math.max(2, (node.data.type === "folder" ? 60 : 20) * scale);
          const isFolder = node.data.type === "folder";
          return (
            <rect
              key={node.id}
              x={x}
              y={y}
              width={w}
              height={h}
              rx={2}
              fill={isFolder ? "rgba(249, 115, 22, 0.7)" : "rgba(168, 85, 247, 0.7)"}
              stroke={isFolder ? "rgba(249, 115, 22, 0.9)" : "rgba(168, 85, 247, 0.9)"}
              strokeWidth={1}
            />
          );
        })}
      </svg>
    </div>
  );
}