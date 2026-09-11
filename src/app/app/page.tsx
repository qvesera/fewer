import type { Metadata } from "next";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FewerApp } from "@/components/fewer";

export const metadata: Metadata = {
  title: "fewer | Interactive Directory Graph Visualizer",
  description:
    "Transform your file system navigation into an art form. Interactive graph-based directory visualization with React Flow, Dagre auto-layout, 7 export formats, keyboard-first navigation, custom themes, and real file system integration.",
};

/**
 * The interactive app. Served at `/app` (app.fewer.directory/app).
 *
 * TooltipProvider at the page level (stable mount point — never re-renders)
 * prevents Radix tooltip context cascading on every FewerApp re-render.
 */
export default function AppPage() {
  return (
    <TooltipProvider delayDuration={0}>
      <FewerApp />
    </TooltipProvider>
  );
}
