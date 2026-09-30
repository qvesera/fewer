"use client";

import dynamic from "next/dynamic";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * The interactive app shell.
 *
 * `FewerApp` is loaded with `ssr: false` on purpose (see `page.tsx`): its first
 * client render is structurally different from anything the server could send —
 * the canvas tree, the drag layer and every dialog are themselves
 * `dynamic(…, { ssr: false })`, the workspace is restored from localStorage in an
 * effect, and auth/profile resolve after mount. Server-rendering the shell
 * therefore produced attributes React could not match, and the mismatch landed
 * on Radix's `useId` output (the navbar's file-type filter trigger) — "A tree
 * hydrated but some attributes of the server rendered HTML didn't match", after
 * which React re-rendered the navbar instead of patching it (#283). Radix ids
 * are per-browser-session values with no server-side meaning, so they have no
 * business in server markup.
 *
 * TooltipProvider stays here as the stable mount point — it never re-renders, so
 * Radix tooltip context does not cascade on every FewerApp re-render.
 */
const FewerApp = dynamic(() => import("@/components/fewer").then((m) => m.FewerApp), {
  ssr: false,
  loading: () => <div className="min-h-dvh w-screen bg-background" />,
});

export function AppShell() {
  return (
    <TooltipProvider delayDuration={0}>
      <FewerApp />
    </TooltipProvider>
  );
}
