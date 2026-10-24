#!/usr/bin/env bash
# Static export for the desktop shell (T-092).
#
# `output: "export"` cannot serve route handlers or middleware, so the
# server-only trees are moved aside for the build and restored afterwards:
#   middleware.ts            session refresh + host routing (needs a server)
#   src/app/api             REST routes (saved graphs, share, cloud, watch…)
#   src/app/auth/callback   Supabase OAuth callback (desktop auth is the
#                           offline Ed25519 license, not a redirect flow)
# The desktop app talks to the OS through the host bridge instead (nativeShell.ts),
# and persists to the local library (localLibrary.ts).
set -euo pipefail

cd "$(dirname "$0")/.."

DISABLED_PATHS=(
  "middleware.ts"
  "src/app/api"
  "src/app/auth/callback"
  "src/app/blog"
)

TEMP_DIR=$(mktemp -d)
restore() {
  echo "Restoring disabled files..."
  for path in "${DISABLED_PATHS[@]}"; do
    base=$(basename "$path")
    if [[ -e "$TEMP_DIR/$base" ]]; then
      mv "$TEMP_DIR/$base" "$path"
    fi
  done
  rm -rf "$TEMP_DIR"
}
trap restore EXIT

echo "Disabling server-only paths for static export:"
for path in "${DISABLED_PATHS[@]}"; do
  if [[ -e "$path" ]]; then
    echo "  - $path"
    mv "$path" "$TEMP_DIR/"
  fi
done

echo "Building static export (output: 'export')..."
DESKTOP_EXPORT=1 bun next build

echo "Static export complete: out/"

# Standalone scope (T-104): blogs are web-only marketing — strip them from the
# desktop export (the pages also 404 via localContent; this removes the files).
rm -rf out/blog
echo "Stripped out/blog from the desktop export"
