// Build-time flag for the desktop static export (T-092/T-104). Dependency-free
// on purpose: localContent.ts pulls node:fs/promises and must stay server-only,
// but MarketingLayout also renders inside client components (gallery) — this
// module keeps both graphs legal. Next inlines process.env.DESKTOP_EXPORT into
// server bundles at build time; client bundles see undefined (false), which is
// correct — the shell never loads the marketing pages this gates chrome for.
export function isDesktopExport(): boolean {
  return Boolean(process.env.DESKTOP_EXPORT);
}
