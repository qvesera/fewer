import type { Metadata } from "next";
import { AppShell } from "./AppShell";

export const metadata: Metadata = {
  title: "fewer | Interactive Directory Graph Visualizer",
  description:
    "Explore any directory as an interactive graph — organise and group cards, keyboard-first navigation, custom themes, real file system integration, and 8 export formats (SVG, PNG, JSON, CSV, DOT, script, tree, .fwr).",
};

/**
 * The interactive app. Served at `/app` (app.fewer.directory/app).
 *
 * The shell is client-only (see `AppShell.tsx` for why — SSR produced a tree
 * the client's first render could not match, #283). The marketing pages are
 * unaffected.
 */
export default function AppPage() {
  return <AppShell />;
}
