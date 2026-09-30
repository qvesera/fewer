import type { Metadata } from "next";
import { AppShell } from "./AppShell";

export const metadata: Metadata = {
  title: "fewer | Interactive Directory Graph Visualizer",
  description:
    "Transform your file system navigation into an art form. Interactive graph-based directory visualization with React Flow, custom tree auto-layout, 7 export formats, keyboard-first navigation, custom themes, and real file system integration.",
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
