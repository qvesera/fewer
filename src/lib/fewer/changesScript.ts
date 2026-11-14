import type { FewerNode } from "./types";
import { rootLabelOf, stripRoot, type BaselineEntry } from "./importBaseline";
import { BASH_APPLY, BASH_CHECKS, BASH_PREAMBLE } from "./changesScriptBash";

/** What the replay would do, in one line of prose. */
export interface ChangesSummary {
  /** Entries whose path changed (a rename and/or a move). */
  renamed: number;
  /** Folders, files and links that did not exist in the import. */
  created: number;
  /** Entries removed in the graph. */
  deleted: number;
  /** Created entries that replay as a copy of an existing one. */
  copied: number;
  /** Total operations the script performs. */
  total: number;
}

export interface ChangesScriptResult {
  /** The complete bash program. */
  script: string;
  summary: ChangesSummary;
  /** Things the script could not express (skipped paths, conflicts). */
  warnings: string[];
}

/** One entry of the graph, as the plan sees it: paths relative to the root. */
interface Entry {
  id: string;
  path: string;
  type: "folder" | "file";
  symlink?: string;
  /** Id of the entry this one was duplicated from, so a copy can replay as `cp`. */
  copyOf?: string;
}

/** A rename and/or a move: same id, different path. */
interface Move {
  id: string;
  from: string;
  to: string;
}

interface Copy {
  from: string;
  to: string;
}

interface Link {
  path: string;
  target: string;
}

export interface ChangesPlan {
  rootName: string;
  baselineCount: number;
  /** Moves in stage order (deepest source first). */
  moves: Move[];
  /** Indices into `moves`, in commit order (parents first). */
  commitOrder: number[];
  mkdirs: string[];
  touches: string[];
  links: Link[];
  copies: Copy[];
  preDeletes: string[];
  deletes: string[];
  fingerprint: string[];
  warnings: string[];
}

/** Paths the script must never touch: parent escapes, absolute paths, newlines. */
function isSafePath(path: string): boolean {
  if (!path) return false;
  if (path.includes("\n") || path.includes("\r")) return false;
  if (path.startsWith("/")) return false;
  return !path.split("/").some((segment) => segment === "..");
}

/**
 * Drop the moves an ancestor's move already implies: when a folder moves,
 * everything under it travels with it, so only the folder is moved.
 */
function reduceMoves(moves: Move[]): Move[] {
  const kept: Move[] = [];
  for (const move of [...moves].sort((a, b) => a.from.length - b.from.length)) {
    const implied = kept.some(
      (ancestor) =>
        move.from.startsWith(`${ancestor.from}/`) &&
        move.to.startsWith(`${ancestor.to}/`) &&
        move.from.slice(ancestor.from.length) === move.to.slice(ancestor.to.length),
    );
    if (!implied) kept.push(move);
  }
  return kept;
}

/**
 * Map a baseline path into the space the moves create, so a deletion or a copy
 * source still points at the right file after its folder was renamed.
 */
function makeRemapper(moves: Move[]): (path: string) => string {
  const sorted = [...moves].sort((a, b) => b.from.length - a.from.length);
  return (path) => {
    for (const move of sorted) {
      if (path === move.from) return move.to;
      if (path.startsWith(`${move.from}/`)) return move.to + path.slice(move.from.length);
    }
    return path;
  };
}

function currentEntries(nodes: FewerNode[], root: string | null): Entry[] {
  const out: Entry[] = [];
  for (const node of nodes) {
    const type = node.data?.type;
    if (type !== "file" && type !== "folder") continue;
    const absolute = node.data.path || node.data.label || "";
    if (!absolute) continue;
    const path = stripRoot(absolute, root).replace(/^\/+/, "");
    if (!path) continue;
    const entry: Entry = { id: node.id, path, type };
    const link = node.data.symlink?.target;
    if (typeof link === "string" && link) entry.symlink = link;
    const copyOf = node.data.copyOf;
    if (typeof copyOf === "string" && copyOf) entry.copyOf = copyOf;
    out.push(entry);
  }
  return out;
}

function baselineEntries(baseline: BaselineEntry[], root: string | null): Entry[] {
  const out: Entry[] = [];
  for (const entry of baseline) {
    const path = stripRoot(entry.path, root).replace(/^\/+/, "");
    if (!path) continue;
    out.push({ id: entry.id, path, type: entry.type, symlink: entry.symlink });
  }
  return out;
}

/** Evenly spread sample of baseline paths that must still be on disk. */
function pickFingerprint(entries: Entry[], limit = 8): string[] {
  if (entries.length === 0) return [];
  const step = Math.max(1, Math.ceil(entries.length / limit));
  const out: string[] = [];
  for (let i = 0; i < entries.length && out.length < limit; i += step) {
    out.push(entries[i].path);
  }
  return out;
}
/**
 * Diff the import baseline against the current graph.
 *
 * Pure: no store, no DOM. The result is a plan the bash template renders.
 */
export function planChanges(
  baseline: BaselineEntry[],
  nodes: FewerNode[],
  includeDeletions = false,
): ChangesPlan {
  const warnings: string[] = [];
  const rootName = rootLabelOf(nodes) ?? "";
  const baseRoot = baseline.find((entry) => entry.isRoot)?.path ?? null;
  const current = currentEntries(nodes, rootName);
  const base = baselineEntries(baseline, baseRoot);

  const baseById = new Map(base.map((entry) => [entry.id, entry]));
  const idMatched = new Set<string>();
  for (const entry of current) if (baseById.has(entry.id)) idMatched.add(entry.id);
  const baseByPath = new Map(base.map((entry) => [entry.path, entry]));

  const matched = new Set<string>();
  const rawMoves: Move[] = [];
  const creates: Entry[] = [];
  const relinks: Link[] = [];

  for (const entry of current) {
    const counterpart = baseById.get(entry.id);
    if (counterpart) {
      matched.add(counterpart.id);
      if (counterpart.path !== entry.path) {
        rawMoves.push({ id: entry.id, from: counterpart.path, to: entry.path });
      } else if (counterpart.symlink !== entry.symlink && entry.symlink) {
        relinks.push({ path: entry.path, target: entry.symlink });
      }
      continue;
    }
    // Same path, different id: the entry was deleted and recreated. The disk
    // already holds the right thing, so there is nothing to do.
    const samePath = baseByPath.get(entry.path);
    if (samePath && !idMatched.has(samePath.id) && samePath.type === entry.type) {
      matched.add(samePath.id);
      continue;
    }
    creates.push(entry);
  }

  const deleted = base.filter((entry) => !matched.has(entry.id));
  let moves = reduceMoves(rawMoves);
  const remap = makeRemapper(moves);

  // ── deletions ───────────────────────────────────────────────────────────
  const deletedTop = deleted.filter(
    (entry) => !deleted.some((other) => other !== entry && entry.path.startsWith(`${other.path}/`)),
  );
  const moveDests = new Set(moves.map((move) => move.to));
  const preDeletes: string[] = [];
  const deletes: string[] = [];
  const blockedMoves = new Set<string>();
  const notReplayed: string[] = [];

  for (const entry of deletedTop) {
    if (moveDests.has(entry.path)) {
      // Something has to move into the space this entry occupies.
      if (includeDeletions) {
        preDeletes.push(entry.path);
      } else {
        blockedMoves.add(entry.path);
        warnings.push(
          `Skipped the move into "${entry.path}": that path was deleted in the graph, and deletions are off.`,
        );
      }
      continue;
    }
    if (!includeDeletions) {
      notReplayed.push(entry.path);
      continue;
    }
    deletes.push(remap(entry.path));
  }
  if (notReplayed.length > 0) {
    const shown = notReplayed.slice(0, 5).join(", ");
    const more = notReplayed.length > 5 ? `, +${notReplayed.length - 5} more` : "";
    warnings.push(
      `Not replayed: ${notReplayed.length} deletion(s) (${shown}${more}). Turn deletions on to include them.`,
    );
  }
  if (blockedMoves.size > 0) {
    moves = moves.filter((move) => !blockedMoves.has(move.to));
    moveDests.clear();
    for (const move of moves) moveDests.add(move.to);
  }

  // ── creations ───────────────────────────────────────────────────────────
  const baseIds = new Set(base.map((entry) => entry.id));
  const currentById = new Map(current.map((entry) => [entry.id, entry]));
  const deletedIds = new Set(deleted.map((entry) => entry.id));
  const mkdirs: string[] = [];
  const touches: string[] = [];
  const links: Link[] = [...relinks];
  const copies: Copy[] = [];
  const covered: string[] = [];

  for (const entry of [...creates].sort((a, b) => a.path.length - b.path.length)) {
    if (covered.some((prefix) => entry.path === prefix || entry.path.startsWith(`${prefix}/`))) {
      continue; // already copied as part of a copied folder
    }
    if (!isSafePath(entry.path)) {
      warnings.push(`Skipped "${entry.path}": the path is not safe to write from a script.`);
      continue;
    }
    if (moveDests.has(entry.path)) {
      warnings.push(`Skipped "${entry.path}": a moved entry takes that path.`);
      continue;
    }
    if (entry.symlink) {
      links.push({ path: entry.path, target: entry.symlink });
      continue;
    }
    const source = entry.copyOf ? currentById.get(entry.copyOf) : undefined;
    if (source && baseIds.has(source.id) && !deletedIds.has(source.id)) {
      copies.push({ from: source.path, to: entry.path });
      covered.push(entry.path);
      continue;
    }
    if (entry.type === "folder") {
      mkdirs.push(entry.path);
      continue;
    }
    touches.push(entry.path);
  }

  // ── moves ───────────────────────────────────────────────────────────────
  const safeMoves = moves.filter((move) => {
    if (isSafePath(move.from) && isSafePath(move.to)) return true;
    warnings.push(`Skipped the move "${move.from}" → "${move.to}": the path is not safe.`);
    return false;
  });
  const safeDeletes = deletes.filter((path) => {
    if (isSafePath(path)) return true;
    warnings.push(`Skipped the deletion of "${path}": the path is not safe.`);
    return false;
  });

  const commitOrder = [...safeMoves].sort((a, b) => a.to.length - b.to.length);
  const stageOrder = [...safeMoves].sort((a, b) => b.from.length - a.from.length);
  const stageIndex = new Map(stageOrder.map((move, index) => [move.id, index]));
  // The commit order is expressed as indices into the stage order, so both
  // loops in the script address the same pair.
  const commitSequence = commitOrder.map((move) => stageIndex.get(move.id) ?? 0);

  const movedIds = new Set(safeMoves.map((move) => move.id));
  const stable = base.filter((entry) => !movedIds.has(entry.id) && !deletedIds.has(entry.id));
  const fingerprint = pickFingerprint(stable).filter(isSafePath);

  return {
    rootName,
    baselineCount: baseline.length,
    moves: stageOrder,
    commitOrder: commitSequence,
    mkdirs: mkdirs.sort((a, b) => a.length - b.length),
    touches: touches.sort(),
    links,
    copies,
    preDeletes,
    deletes: safeDeletes.sort((a, b) => b.length - a.length),
    fingerprint,
    warnings,
  };
}

/** Single-quote a value for bash. */
function shq(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function shArray(values: string[]): string {
  return values.map(shq).join(" ");
}

/** The plan as the shell arrays the template expects. */
function renderPlan(plan: ChangesPlan): string {
  return [
    `MOVES=(${shArray(plan.moves.flatMap((move) => [move.from, move.to]))})`,
    `COMMIT_ORDER=(${plan.commitOrder.join(" ")})`,
    `MKDIRS=(${shArray(plan.mkdirs)})`,
    `TOUCHES=(${shArray(plan.touches)})`,
    `LINKS=(${shArray(plan.links.flatMap((link) => [link.path, link.target]))})`,
    `COPIES=(${shArray(plan.copies.flatMap((copy) => [copy.from, copy.to]))})`,
    `PRE_DELETES=(${shArray(plan.preDeletes)})`,
    `DELETE_PATHS=(${shArray(plan.deletes)})`,
    `FINGERPRINT=(${shArray(plan.fingerprint)})`,
    `N_MOVES=${plan.moves.length}`,
    `N_MKDIRS=${plan.mkdirs.length}`,
    `N_TOUCHES=${plan.touches.length}`,
    `N_LINKS=${plan.links.length}`,
    `N_COPIES=${plan.copies.length}`,
    `N_PRE_DELETES=${plan.preDeletes.length}`,
    `N_DELETES=${plan.deletes.length}`,
    `N_FINGERPRINT=${plan.fingerprint.length}`,
    `FINGERPRINT_MIN=${Math.ceil(plan.fingerprint.length / 2)}`,
  ].join("\n");
}

function summaryLine(summary: ChangesSummary): string {
  const parts: string[] = [];
  if (summary.renamed) parts.push(`${summary.renamed} renamed or moved`);
  if (summary.created) parts.push(`${summary.created} created`);
  if (summary.copied) parts.push(`(${summary.copied} copied)`);
  if (summary.deleted) parts.push(`${summary.deleted} deleted`);
  return parts.length ? parts.join(", ") : "nothing to change";
}

/**
 * Build the bash script that replays the graph's edits onto a folder.
 *
 * The script is data-driven: the diff becomes shell arrays, and the program
 * (in `changesScriptBash.ts`) does the checks, the prompting and the applying.
 */
export function buildChangesScript(args: {
  baseline: BaselineEntry[];
  nodes: FewerNode[];
  includeDeletions?: boolean;
  includeBranding?: boolean;
  generatedAt?: string;
  fileName?: string;
}): ChangesScriptResult {
  const includeDeletions = args.includeDeletions ?? false;
  const includeBranding = args.includeBranding ?? true;
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const plan = planChanges(args.baseline, args.nodes, includeDeletions);

  const summary: ChangesSummary = {
    renamed: plan.moves.length,
    created: plan.mkdirs.length + plan.touches.length + plan.links.length + plan.copies.length,
    deleted: plan.deletes.length + plan.preDeletes.length,
    copied: plan.copies.length,
    total:
      plan.moves.length +
      plan.mkdirs.length +
      plan.touches.length +
      plan.links.length +
      plan.copies.length +
      plan.deletes.length +
      plan.preDeletes.length,
  };

  const branding = includeBranding ? ["# Created with fewer"] : [];
  const header = [...branding, `# ${summaryLine(summary)}`].join("\n");

  const preamble = BASH_PREAMBLE.replace("# __SUMMARY__", header)
    .replaceAll("__BASELINE__", String(plan.baselineCount))
    .replaceAll("__ROOT__", plan.rootName.replace(/'/g, `'\\''`))
    .replaceAll("__DATE__", generatedAt)
    .replaceAll("__CHANGES__", String(summary.total))
    .replaceAll("__DELETES__", String(summary.deleted))
    .replaceAll("__FILE__", args.fileName ?? "fewer-changes.sh");

  const script = [
    preamble,
    BASH_CHECKS.replace("__PLAN__", renderPlan(plan)),
    BASH_APPLY,
  ].join("");

  return { script, summary, warnings: plan.warnings };
}
