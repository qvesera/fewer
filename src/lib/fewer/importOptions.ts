/** How the walk treats symbolic links. Only the local-path walk can detect them. */
export type SymlinkMode = "skip" | "leaf" | "follow";

import type { ImportOrigin } from "./importFlow";

/** Every tunable key of ImportOptions. */
export type OptionKey = keyof ImportOptions;

/**
 * Options for importing a directory from the file system.
 * These control how deep to scan, what to include, and how to filter.
 */
export interface ImportOptions {
  /** Maximum depth to recurse into subdirectories (1 = top level only, 0 = unlimited). */
  maxDepth: number;
  /** Include hidden files/folders (those starting with a dot). */
  includeHidden: boolean;
  /** Include common build/dependency directories (node_modules, .git, dist, build). */
  includeVendored: boolean;
  /** Skip folders that have no children (don't create nodes for empty directories). */
  skipEmptyFolders: boolean;
  /** Import files as nodes (not just folders). When false, only the directory structure is imported. */
  includeFiles: boolean;
  /** Only import files matching these extensions (empty = all files). e.g. ["ts", "tsx", "js"]. */
  extensions: string[];
  /** Whether file extensions should be case-sensitive. */
  caseSensitiveExtensions: boolean;
  /** Display depth: hide nodes deeper than this on the canvas (0 = unlimited). */
  displayMaxDepth: number;
  /**
   * Symlink handling: "skip" drops them (pre-change behavior), "leaf" imports
   * the link itself with target metadata but no content, "follow" recurses into
   * the target with a cycle guard. Browser folder picks cannot detect symlinks,
   * so only the local-path walk honors this.
   */
  symlinks: SymlinkMode;
  /**
   * Expand archives (.zip/.tar/.tar.gz/...) found inside the imported folder
   * so their listings appear in the graph. Off by default: it multiplies node
   * count, so it is an explicit opt-in (advanced options only).
   */
  expandArchives: boolean;
}

export const DEFAULT_IMPORT_OPTIONS: ImportOptions = {
  maxDepth: 6,
  includeHidden: false,
  includeVendored: false,
  skipEmptyFolders: true,
  includeFiles: true,
  extensions: [],
  caseSensitiveExtensions: false,
  displayMaxDepth: 6,
  symlinks: "leaf",
  expandArchives: false,
};

/** Directories that are typically vendored/generated and skipped by default. */
export const VENDORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".svn",
  ".hg",
  "dist",
  "build",
  "out",
  ".next",
  ".cache",
  ".turbo",
  "coverage",
  "__pycache__",
  ".pytest_cache",
  "vendor",
  "target",
  ".gradle",
  ".maven",
]);

/**
 * The scoping key: an origin, plus which payload the file origin carries.
 * The file origin has two payloads with genuinely different needs — a pasted
 * file is exact content, an archive is a real filesystem listing — so origin
 * alone is not enough to decide what may filter.
 */
export type OptionScope = "folder" | "file:text" | "file:archive" | "url" | "cloud";

/** Every scope, for iteration (tests, and any UI that renders per scope). */
export const OPTION_SCOPES: readonly OptionScope[] = [
  "folder",
  "file:text",
  "file:archive",
  "url",
  "cloud",
];

/** Minimal source shape the scope decision needs. `OriginSource` satisfies it. */
interface ScopeSource {
  origin: ImportOrigin;
  kind?: "text" | "archive";
}

/** Map a source to its option scope. */
export function optionScopeFor(source: ScopeSource): OptionScope {
  if (source.origin === "file") return source.kind === "archive" ? "file:archive" : "file:text";
  return source.origin;
}

/**
 * Which options actually DO something for each scope. Everything not listed is
 * irrelevant there, and `scopeOptionsToOrigin` forces it to its no-op value — so
 * a scan concept can never silently filter a file the user pasted, and a
 * preference saved for one scope cannot leak into another.
 *
 * The layers behind this:
 *
 *  - **scan** (hidden / vendored / depth / extensions / empty + the symlink and
 *    nested-archive switches): what Fewer looks AT. Only meaningful where Fewer
 *    enumerates a filesystem — the folder walk, and the archive/url/cloud
 *    listings, which genuinely contain `node_modules` and dotfiles.
 *  - **display** (includeFiles, displayMaxDepth): after import; every scope.
 *
 * `symlinks` is consumed only by the server-side disk walk (`localTree.ts`) and
 * `expandArchives` only by the folder walkers, so both are folder-only: showing
 * them elsewhere offered a control that could not do anything.
 */
export const RELEVANT_OPTIONS: Record<OptionScope, readonly OptionKey[]> = {
  folder: [
    "maxDepth",
    "includeHidden",
    "includeVendored",
    "skipEmptyFolders",
    "extensions",
    "caseSensitiveExtensions",
    "symlinks",
    "expandArchives",
    "includeFiles",
    "displayMaxDepth",
  ],
  // A pasted or uploaded file is imported exactly as given: only the
  // dependency-folders filter and the display settings apply to it.
  "file:text": ["includeVendored", "includeFiles", "displayMaxDepth"],
  // An archive listing IS a filesystem — the scan filters earn their keep
  // here — but symlinks and nested-archive expansion are not consulted by
  // the archive readers (they sniff magic bytes and list the tar/zip table).
  "file:archive": [
    "maxDepth",
    "includeHidden",
    "includeVendored",
    "skipEmptyFolders",
    "extensions",
    "caseSensitiveExtensions",
    "includeFiles",
    "displayMaxDepth",
  ],
  url: [
    "maxDepth",
    "includeHidden",
    "includeVendored",
    "skipEmptyFolders",
    "extensions",
    "caseSensitiveExtensions",
    "includeFiles",
    "displayMaxDepth",
  ],
  cloud: [
    "maxDepth",
    "includeHidden",
    "includeVendored",
    "skipEmptyFolders",
    "extensions",
    "caseSensitiveExtensions",
    "includeFiles",
    "displayMaxDepth",
  ],
};

/**
 * The value a key reads when it must have NO effect for a scope. Not "the
 * default" — the neutral: never filter, never walk, never expand. For an
 * irrelevant key the neutral is the opposite of the default where they differ:
 * includeHidden neutralises to true (never drop a dotfile the user gave us)
 * and maxDepth to 0 (never truncate).
 */
const NO_OP_OPTIONS: Record<OptionKey, ImportOptions[OptionKey]> = {
  maxDepth: 0,
  includeHidden: true,
  includeVendored: true,
  skipEmptyFolders: false,
  includeFiles: true,
  extensions: [],
  caseSensitiveExtensions: false,
  displayMaxDepth: 0,
  symlinks: "leaf",
  expandArchives: false,
};

/**
 * Force every option that cannot act on this source's scope to its no-op value.
 *
 * This is what makes "irrelevant" mean *no effect* rather than merely "not
 * rendered": the panel reads `RELEVANT_OPTIONS` to decide what to show, and the
 * dispatcher reads this to decide what to apply — one constant, two consumers,
 * so the UI and the behavior cannot drift.
 *
 * Placed once in `runImport`, so every origin inherits it without per-action
 * edits.
 */
export function scopeOptionsToOrigin(
  options: ImportOptions,
  source: ScopeSource,
): ImportOptions {
  const relevant = new Set(RELEVANT_OPTIONS[optionScopeFor(source)]);
  // Typed as a loose Record for the write: TS narrows an indexed write on an
  // interface to the intersection of its property types (never, here), so the
  // copy is widened first and cast back on return.
  const scoped = { ...options } as Record<OptionKey, ImportOptions[OptionKey]>;
  for (const key of Object.keys(NO_OP_OPTIONS) as OptionKey[]) {
    if (!relevant.has(key)) scoped[key] = NO_OP_OPTIONS[key];
  }
  return scoped as ImportOptions;
}
