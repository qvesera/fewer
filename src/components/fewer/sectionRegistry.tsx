/**
 * Single source of truth for sidebar section metadata.
 * Used by Sidebar (docked in sidebar) and DockArea (docked as column) so both
 * render from the same catalog. Availability is checked at render time —
 * columns show an "unavailable" empty state instead of vanishing.
 */
"use client";

import {
  HardDrive,
  FolderOpen,
  SlidersHorizontal,
  Spline,
  EyeOff,
  Tag as TagIcon,
  Layers,
} from "lucide-react";
import type { AreaEditor } from "@/lib/fewer/panelLayout";

export interface SectionMeta {
  id: AreaEditor;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Check availability against live store state snapshot. */
  available: (s: Record<string, any>) => boolean;
}

export const SECTION_CATALOG: SectionMeta[] = [
  {
    id: "file",
    title: "File & Actions",
    icon: HardDrive,
    available: () => true,
  },
  {
    id: "directories",
    title: "Your Directories",
    icon: FolderOpen,
    available: (s) => !!s.user,
  },
  {
    id: "layout",
    title: "Layout",
    icon: SlidersHorizontal,
    available: () => true,
  },
  {
    id: "edges",
    title: "Edges & Style",
    icon: Spline,
    available: () => true,
  },
  {
    id: "hidden",
    title: "Hidden Cards",
    icon: EyeOff,
    available: (s) => s.hiddenIds.length > 0,
  },
  {
    id: "tags",
    title: "Tags",
    icon: TagIcon,
    available: (s) => s.nodes.length > 0,
  },
  {
    id: "analytics",
    title: "Graph Analytics",
    icon: Layers,
    available: (s) => s.advancedModeEnabled && s.nodes.length > 0,
  },
];

/** Section ids that are always "in sidebar" — too core to dock. */
export const NON_DOCKABLE_SECTIONS: Set<string> = new Set();

export function sectionMetaById(id: AreaEditor): SectionMeta | undefined {
  return SECTION_CATALOG.find((s) => s.id === id);
}

