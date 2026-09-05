"use client";

import { useGraphStore } from "@/store/graphStore";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { X, ChevronDown } from "lucide-react";
import { AREA_EDITOR_LABELS, type AreaEditor, type PanelArea } from "@/lib/fewer/panelLayout";
import { SECTION_CATALOG, NON_DOCKABLE_SECTIONS, sectionMetaById } from "./sectionRegistry";

export function DockAreaHeader({ area }: { area: PanelArea }) {
  const joinArea = useGraphStore((s) => s.joinArea);
  const setAreaEditor = useGraphStore((s) => s.setAreaEditor);

  const isGraph = area.editor === "graph";
  const meta = sectionMetaById(area.editor);

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border/20 shrink-0">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 justify-between gap-1 h-7 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground px-1.5"
          >
            <span className="truncate text-left">
              {isGraph ? AREA_EDITOR_LABELS.graph : meta?.title ?? area.editor}
            </span>
            <ChevronDown className="h-3 w-3 shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Editor Type
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setAreaEditor(area.id, "graph")}
            className="text-xs cursor-pointer"
            disabled={isGraph}
          >
            {AREA_EDITOR_LABELS.graph}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {SECTION_CATALOG.filter((s) => !NON_DOCKABLE_SECTIONS.has(s.id)).map((s) => (
            <DropdownMenuItem
              key={s.id}
              onClick={() => setAreaEditor(area.id, s.id)}
              className="text-xs cursor-pointer"
              disabled={area.editor === s.id}
            >
              {s.title}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
        onClick={() => joinArea(area.id)}
        title="Close area"
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}