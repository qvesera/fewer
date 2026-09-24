import type { FewerNode } from "./types";
import { fuzzyMatch } from "./stats";

/**
 * Pure model for the search panel (src/components/fewer/SearchPanel.tsx).
 *
 * The panel's filtering, result ordering, keyboard decision table and view
 * selection live here so they can be unit-tested without a DOM. The store
 * wiring, focus handling and rendering stay in the component.
 *
 * `fuzzyMatch` is reused from stats.ts — the panel used to inline the same
 * ranking twice (for the compared pair) and the same slice limit four times.
 */

/** How many results the panel renders and lets the keyboard reach. */
export const SEARCH_RESULT_LIMIT = 50;

/**
 * Match-quality rank for ordering: exact label beats a label prefix, which
 * beats an in-order fuzzy match anywhere in the label; everything else is the
 * catch-all rank. Compared case-insensitively.
 */
export function labelMatchRank(label: string, query: string): number {
  const q = query.toLowerCase();
  const l = label.toLowerCase();
  if (l === q) return 0;
  if (l.startsWith(q)) return 1;
  return fuzzyMatch(query, label) ? 2 : 3;
}

/**
 * Order two results: better label match first, then files before folders, then
 * alphabetically by label.
 */
export function compareSearchResults(a: FewerNode, b: FewerNode, query: string): number {
  const rankA = labelMatchRank(a.data.label, query);
  const rankB = labelMatchRank(b.data.label, query);
  if (rankA !== rankB) return rankA - rankB;

  // Files before folders
  if (a.data.type !== b.data.type) return a.data.type === "file" ? -1 : 1;

  return a.data.label.toLowerCase().localeCompare(b.data.label.toLowerCase());
}

/**
 * Category filter predicate: an active filter keeps every folder (so a file's
 * container is still reachable) plus the files whose category is listed.
 */
export function matchesCategoryFilter(node: FewerNode, categoryFilter: string[]): boolean {
  return (
    !categoryFilter.length ||
    node.data.type === "folder" ||
    categoryFilter.includes(node.data.category!)
  );
}

/**
 * Query predicate: an empty query matches everything; otherwise the query must
 * fuzzily match the label or the path, or appear in the extension.
 */
export function matchesQuery(node: FewerNode, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    fuzzyMatch(query, node.data.label) ||
    fuzzyMatch(query, node.data.path) ||
    (node.data.extension ?? "").toLowerCase().includes(q)
  );
}

/**
 * The panel's result list: category- and query-filtered, then ordered by
 * `compareSearchResults`. Filtering into a new array means the in-place sort
 * never touches the store's node list.
 */
export function searchNodes(nodes: FewerNode[], query: string, categoryFilter: string[]): FewerNode[] {
  return nodes
    .filter((n) => matchesCategoryFilter(n, categoryFilter) && matchesQuery(n, query))
    .sort((a, b) => compareSearchResults(a, b, query));
}

/** The results the panel actually renders, and the only ones the keyboard can
 *  reach — both use the same cap. */
export function visibleMatches<T>(matches: T[]): T[] {
  return matches.slice(0, SEARCH_RESULT_LIMIT);
}

/**
 * Next active index for the arrow keys. Down is clamped to the last visible
 * result; with no results the clamp floor is 0 rather than -1 (pre-existing
 * behaviour, pinned by tests). Up never goes below 0.
 */
export function nextActiveIndex(prev: number, resultCount: number, direction: "down" | "up"): number {
  if (direction === "up") return Math.max(prev - 1, 0);
  const maxIndex = resultCount - 1;
  return Math.min(prev + 1, maxIndex >= 0 ? maxIndex : 0);
}

export type SearchKeyAction =
  | { type: "none" }
  | { type: "close" }
  | { type: "move"; next: number }
  | { type: "open"; index: number }
  | { type: "commit" };

/**
 * What a keypress means while the panel is open. An active result makes Enter
 * open it; with no active result a non-blank query commits the search instead.
 * Escape and Enter-without-commit do not preventDefault; the arrow keys and
 * opening a result do (the caller applies that).
 */
export function searchKeyAction(
  key: string,
  ctx: { activeIndex: number; resultCount: number; canCommit: boolean },
): SearchKeyAction {
  if (key === "Escape") return { type: "close" };
  if (key === "ArrowDown") {
    return { type: "move", next: nextActiveIndex(ctx.activeIndex, ctx.resultCount, "down") };
  }
  if (key === "ArrowUp") {
    return { type: "move", next: nextActiveIndex(ctx.activeIndex, ctx.resultCount, "up") };
  }
  if (key === "Enter") {
    if (ctx.activeIndex >= 0) return { type: "open", index: ctx.activeIndex };
    if (ctx.canCommit) return { type: "commit" };
  }
  return { type: "none" };
}

export type SearchPanelView = "history" | "prompt" | "empty" | "results";

/**
 * Which body the results container shows: recent searches or the start prompt
 * when there is nothing to search for yet, otherwise the no-matches notice or
 * the result list.
 */
export function searchPanelView(opts: {
  hasQuery: boolean;
  categoryFilterCount: number;
  historyCount: number;
  matchCount: number;
}): SearchPanelView {
  if (!opts.hasQuery && opts.categoryFilterCount === 0) {
    return opts.historyCount > 0 ? "history" : "prompt";
  }
  return opts.matchCount === 0 ? "empty" : "results";
}
