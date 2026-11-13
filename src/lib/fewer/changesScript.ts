import type { FewerNode } from "./types";
import { rootLabelOf, stripRoot, type BaselineEntry } from "./importBaseline";
import { BASH_APPLY, BASH_ARCHIVE_SECTION, BASH_CHECKS, BASH_PREAMBLE } from "./changesScriptBash";
import { BASH_ARCHIVE_APPLY, BASH_ARCHIVE_CHECKS, BASH_ARCHIVE_PREAMBLE } from "./changesScriptArchiveBash";
import { BASH_ARCHIVE_ENGINE } from "./changesScriptArchiveEngine";
import { ARCHIVE_PYTHON_PROGRAM } from "./changesScriptArchivePython";

/**
 * What the replay would do, in one line of prose.
 */
export interface ChangesSummary {
  /** Entries whose path changed (a rename and/or a move). */
  renamed: number;
  /** Folders, files and links that did not exist in the import. */
  created: number;
  /** Entries removed in the graph. */
  deleted: number;
  /** Created entries that replay as a copy of an existing one. */
  copied: number;
  /** Changes made inside an archive (the archive itself is edited in place). */
  inArchives: number;
  /** Total operations the script performs. */
  total: number;
}

export interface ChangesScriptResult {
  /** The complete bash program. */
  script: string;
  summary: ChangesSummary;
  /** Things the script could not express (skipped paths, conflicts). */
  warnings: string[];
  /** "folder" replays onto a directory; "archive" replays inside an archive. */
  target: "folder" | "archive";
  /** Changes that live inside an archive and cannot be replayed onto a folder. */
  skippedInArchives: number;
}

/** One entry of the graph, as the plan sees it: paths relative to the root. */
interface Entry {
  id: string;
  path: string;
  type: "folder" | "file";
  symlink?: string;
  /** Id of the entry this one was duplicated from, so a copy can replay as `cp`. */
  copyOf?: string;
  /** True for an archive card (the archive file itself). */
  isArchive?: boolean;
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

/** One archive inside a folder, and the edits to make inside it. */
export interface ArchivePlan {
  /** The archive file, relative to the folder root ("Logos.zip"). */
  archive: string;
  /** Renames and moves inside the archive, relative to the archive root. */
  moves: { from: string; to: string }[];
  /** Entries to delete from the archive. */
  deletes: string[];
  /** Entries to add to the archive. */
  adds: { path: string; kind: "file" | "dir" }[];
  /** Entries to copy inside the archive. */
  copies: { from: string; to: string }[];
}

export interface ChangesPlan {
  /** The folder the replay runs in, or the archive file it replays into. */
  rootName: string;
  baselineCount: number;
  /** "folder" replays onto a directory; "archive" replays inside an archive. */
  target: "folder" | "archive";
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
  /** Changes that live inside an archive and cannot be replayed onto a folder. */
  skippedInArchives: number;
  /** Per-archive edits: an archive is a real file, so its entries are edited in place. */
  archivePlans: ArchivePlan[];
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
    if (node.data.isArchive) entry.isArchive = true;
    out.push(entry);
  }
  return out;
}

function baselineEntries(baseline: BaselineEntry[], root: string | null): Entry[] {
  const out: Entry[] = [];
  for (const entry of baseline) {
    const path = stripRoot(entry.path, root).replace(/^\/+/, "");
    if (!path) continue;
    const item: Entry = { id: entry.id, path, type: entry.type, symlink: entry.symlink };
    if (entry.isArchive) item.isArchive = true;
    out.push(item);
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

  // ── what are we replaying onto? ─────────────────────────────────────────
  // An archive import's root IS the archive (`backup.zip`); a folder import's
  // root is the directory. A zip expanded INSIDE a folder is a card in that
  // folder — the zip is one file, so the entries inside it are not files on
  // disk and cannot be replayed there.
  const baselineRoot = baseline.find((entry) => entry.isRoot);
  const target: "folder" | "archive" = baselineRoot?.isArchive ? "archive" : "folder";

  // The current graph's root name (what the card is called now) and the
  // imported one (what the folder or archive file was called then). Each side
  // is stripped against its own root, so renaming the root card does not make
  // every child look like it moved.
  const currentRoot = rootLabelOf(nodes) ?? "";
  const baseRoot = baselineRoot?.path ?? null;
  const current = currentEntries(nodes, currentRoot);
  const base = baselineEntries(baseline, baseRoot);

  // The folder the script runs in, or the archive file it replays into.
  const rootName = target === "archive" ? (baselineRoot?.path ?? "") : currentRoot;

  // Archives that live INSIDE the folder (a zip expanded during the import):
  // the zip is one file on disk, so its members are not files and a change to
  // one of them cannot be replayed onto the folder. The zip card itself is a
  // real file, so it stays in scope.
  const archivePaths = new Set<string>();
  for (const entry of base) if (entry.isArchive) archivePaths.add(entry.path);
  for (const entry of current) if (entry.isArchive) archivePaths.add(entry.path);
  archivePaths.delete("");

  const insideArchive = (path: string) =>
    [...archivePaths].some((prefix) => path.startsWith(`${prefix}/`));

  const baseById = new Map(base.map((entry) => [entry.id, entry]));
  const idMatched = new Set<string>();
  for (const entry of current) if (baseById.has(entry.id)) idMatched.add(entry.id);
  const baseByPath = new Map(base.map((entry) => [entry.path, entry]));

  const matched = new Set<string>();
  const rawMoves: Move[] = [];
  const creates: Entry[] = [];
  const relinks: Link[] = [];

  // The diff runs over everything, archive members included: a change to a
  // member is a change the user made, and it has to be *reported* as skipped
  // rather than quietly dropped.
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

  // ── the archives inside the folder ───────────────────────────────────────
  // An archive inside the folder is a REAL FILE: `Logos.zip` sits on disk
  // next to everything else. So an edit to one of its entries is not lost —
  // it becomes an edit of the zip itself, applied in place with 7-Zip.
  //
  // Archives are keyed by their card id, not by their path: a zip that was
  // renamed in the graph is still the same archive, and its members keep
  // their paths *inside* it either way.
  interface ArchiveRef {
    id: string;
    /** The archive's path in the import ("Logos.zip"). */
    basePath: string;
    /** The archive's path now ("Logos.zip", or its new name). */
    currentPath: string | null;
  }
  const archives = new Map<string, ArchiveRef>();
  for (const entry of base) {
    if (!entry.isArchive) continue;
    archives.set(entry.id, { id: entry.id, basePath: entry.path, currentPath: null });
  }
  for (const entry of current) {
    const ref = archives.get(entry.id);
    if (ref) ref.currentPath = entry.path;
  }
  // An archive that is gone from the graph (the zip was deleted) is not worth
  // editing — the file itself is on its way out.
  const goneArchives = new Set(
    [...archives.values()].filter((ref) => ref.currentPath === null).map((ref) => ref.id),
  );

  /** The archive a baseline path belongs to, and the path inside it. */
  const archiveOfBase = (path: string): { ref: ArchiveRef; inside: string } | null => {
    let best: ArchiveRef | null = null;
    for (const ref of archives.values()) {
      if (!path.startsWith(`${ref.basePath}/`)) continue;
      if (!best || ref.basePath.length > best.basePath.length) best = ref;
    }
    if (!best) return null;
    return { ref: best, inside: path.slice(best.basePath.length + 1) };
  };

  /** The archive a current path belongs to, and the path inside it. */
  const archiveOfCurrent = (path: string): { ref: ArchiveRef; inside: string } | null => {
    let best: { ref: ArchiveRef; currentPath: string } | null = null;
    for (const ref of archives.values()) {
      if (ref.currentPath === null) continue;
      if (!path.startsWith(`${ref.currentPath}/`)) continue;
      if (!best || ref.currentPath.length > best.currentPath.length) {
        best = { ref, currentPath: ref.currentPath };
      }
    }
    if (!best) return null;
    return { ref: best.ref, inside: path.slice(best.currentPath.length + 1) };
  };

  // ── where each change belongs ───────────────────────────────────────────
  // A change inside an archive is an edit OF that archive; everything else is
  // an edit of the folder. The two are replayed by different tools (7-Zip for
  // the archive, mv/rm/cp for the folder), so they are planned separately.
  const skippedInArchives: string[] = [];
  const archivePlans = new Map<string, ArchivePlan>();
  const planFor = (archive: string): ArchivePlan => {
    let plan = archivePlans.get(archive);
    if (!plan) {
      plan = { archive, moves: [], deletes: [], adds: [], copies: [] };
      archivePlans.set(archive, plan);
    }
    return plan;
  };

  let moves = reduceMoves(
    rawMoves.filter((move) => {
      const from = archiveOfBase(move.from);
      const to = archiveOfCurrent(move.to);
      if (!from && !to) return true; // a plain move in the folder
      if (from && to && from.ref.id === to.ref.id && !goneArchives.has(from.ref.id)) {
        // A rename inside an archive: the archive itself is edited in place.
        planFor(to.ref.currentPath!).moves.push({ from: from.inside, to: to.inside });
        return false;
      }
      // Moved in or out of an archive: the bytes have to cross the archive
      // boundary, which no simple rename can do.
      skippedInArchives.push(`${move.from} → ${move.to}`);
      warnings.push(
        `Skipped "${move.from}": moving an entry in or out of an archive is not something a script can do.`,
      );
      return false;
    }),
  );
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
    const owner = archiveOfBase(entry.path);
    if (owner) {
      // A deletion inside an archive: the archive is edited in place.
      if (!goneArchives.has(owner.ref.id)) {
        planFor(owner.ref.currentPath!).deletes.push(owner.inside);
      }
      continue;
    }
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
    const owner = archiveOfCurrent(entry.path);
    if (owner) {
      // A new entry inside an archive: the archive is edited in place.
      if (!goneArchives.has(owner.ref.id)) {
        const plan = planFor(owner.ref.currentPath!);
        if (entry.type === "folder") plan.adds.push({ path: owner.inside, kind: "dir" });
        else plan.adds.push({ path: owner.inside, kind: "file" });
      }
      continue;
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

  if (skippedInArchives.length > 0) {
    const shown = skippedInArchives.slice(0, 3).join(", ");
    const more = skippedInArchives.length > 3 ? `, +${skippedInArchives.length - 3} more` : "";
    warnings.push(
      `Skipped ${skippedInArchives.length} change(s) that cross an archive boundary (${shown}${more}) — a script cannot move entries in or out of an archive.`,
    );
  }

  const movedIds = new Set(safeMoves.map((move) => move.id));
  // The fingerprint must only sample paths that really exist on disk: an
  // archive member never does, and sampling one would fail the folder check
  // on a folder that is perfectly fine.
  const stable = base.filter(
    (entry) =>
      !movedIds.has(entry.id) && !deletedIds.has(entry.id) && !archiveOfBase(entry.path),
  );
  const fingerprint = pickFingerprint(stable).filter(isSafePath);

  // The archives that really have work to do, in a stable order.
  const archivePlansList = [...archivePlans.values()]
    .filter(
      (plan) =>
        plan.moves.length > 0 || plan.deletes.length > 0 || plan.adds.length > 0 || plan.copies.length > 0,
    )
    .sort((a, b) => a.archive.localeCompare(b.archive));

  return {
    rootName,
    target,
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
    skippedInArchives: skippedInArchives.length,
    archivePlans: archivePlansList,
    warnings,
  };
}

/** Single-quote a value for bash. */
function shq(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Single-quote a value for bash's `$'…'` form, where a tab and a newline can
 * be written as escapes — the archive plan rows are tab separated, and a raw
 * newline inside a quoted string would end the line.
 */
function shqEscaped(value: string): string {
  return `$'${value
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\t/g, "\\t")
    .replace(/\n/g, "\\n")}'`;
}

function shArray(values: string[]): string {
  return values.map(shq).join(" ");
}

/**
 * The plan for one archive, as the tab-separated rows the script reads:
 *
 *   MOVE<TAB>from<TAB>to<TAB>temp    phase 1: rename the source aside
 *   COMMIT<TAB>temp<TAB>to           phase 2: put it where it belongs
 *   DELETE<TAB>path
 *   ADDFILE<TAB>path
 *   ADDDIR<TAB>path
 *
 * The paths are relative to the archive's own root ("Logos/Logo.eps"), which
 * is what 7-Zip addresses.
 */
function renderArchivePlanRows(plan: ArchivePlan): string[] {
  const rows: string[] = [];
  // Phase 1: every source is renamed aside, deepest source first.
  const stageOrder = [...plan.moves].sort((a, b) => b.from.length - a.from.length);
  const tempNames = new Map<string, string>();
  stageOrder.forEach((move, index) => {
    const temp = `.fewer-tmp-${index}`;
    tempNames.set(`${move.from}\n${move.to}`, temp);
    rows.push(`MOVE\t${move.from}\t${move.to}\t${temp}`);
  });
  // Phase 2: each temporary name goes to its destination, parents first.
  const commitOrder = [...plan.moves].sort((a, b) => a.to.length - b.to.length);
  for (const move of commitOrder) {
    rows.push(`COMMIT\t${tempNames.get(`${move.from}\n${move.to}`)}\t${move.to}`);
  }
  for (const path of plan.deletes) rows.push(`DELETE\t${path}`);
  for (const add of plan.adds) {
    rows.push(`${add.kind === "dir" ? "ADDDIR" : "ADDFILE"}\t${add.path}`);
  }
  return rows;
}

/** The plan as the shell arrays the folder template expects. */
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

/**
 * The plan as the shell arrays the ARCHIVE template expects.
 *
 * A zip holds entries, not directories, so a new folder is added as an empty
 * directory entry and a new file as an empty file — and a copy is taken out
 * of the archive first, so it keeps its bytes.
 */
function renderArchivePlan(plan: ChangesPlan): string {
  const adds = [
    ...plan.mkdirs,
    ...plan.touches,
    ...plan.copies.map((copy) => copy.to),
  ].sort();
  // `plan.moves` is in stage order (deepest source first) and `commitOrder`
  // holds the indices into it, in commit order (parents first). The script
  // stages each source to ".fewer-tmp-<index>" and then commits it, so it
  // needs both lists — and the index that links them.
  const stageFrom = plan.moves.map((move) => move.from);
  const moveTo = plan.moves.map((move) => move.to);
  const commitTo = plan.commitOrder.map((index) => plan.moves[index]?.to ?? "");
  return [
    `STAGE_FROM=(${shArray(stageFrom)})`,
    `MOVE_TO=(${shArray(moveTo)})`,
    `COMMIT_TO=(${shArray(commitTo)})`,
    `COMMIT_IDX=(${plan.commitOrder.join(" ")})`,
    `ADDS=(${shArray(adds)})`,
    `ADD_DIRS=(${shArray(plan.mkdirs)})`,
    `ADD_FILES=(${shArray(plan.touches)})`,
    `ADD_COPIES=(${shArray(plan.copies.flatMap((copy) => [copy.from, copy.to]))})`,
    `PRE_DELETES=(${shArray(plan.preDeletes)})`,
    `DELETE_PATHS=(${shArray(plan.deletes)})`,
    `FINGERPRINT=(${shArray(plan.fingerprint)})`,
    `N_MOVES=${plan.moves.length}`,
    `N_ADDS=${adds.length}`,
    `N_ADD_DIRS=${plan.mkdirs.length}`,
    `N_ADD_FILES=${plan.touches.length}`,
    `N_ADD_COPIES=${plan.copies.length}`,
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
  if (summary.inArchives) parts.push(`${summary.inArchives} inside an archive`);
  return parts.length ? parts.join(", ") : "nothing to change";
}

/**
 * The plan's warnings as comment lines, so the script itself explains what it
 * will not do. Without this the one sentence that says "your changes are
 * inside a zip" lives only in a toast, and the file on disk looks like it
 * simply forgot the work.
 */
function renderNotes(warnings: string[]): string {
  if (warnings.length === 0) return "";
  const lines = warnings.map((warning) => `# - ${warning}`);
  return ["#", "# Notes:", ...lines, ""].join("\n");
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

  // The changes inside archives count as changes: the archive is a file in the
  // folder, and the script edits it.
  const archiveOps = plan.archivePlans.reduce(
    (sum, archive) =>
      sum + archive.moves.length + archive.deletes.length + archive.adds.length + archive.copies.length,
    0,
  );

  const summary: ChangesSummary = {
    renamed: plan.moves.length,
    created: plan.mkdirs.length + plan.touches.length + plan.links.length + plan.copies.length,
    deleted: plan.deletes.length + plan.preDeletes.length,
    copied: plan.copies.length,
    inArchives: archiveOps,
    total:
      plan.moves.length +
      plan.mkdirs.length +
      plan.touches.length +
      plan.links.length +
      plan.copies.length +
      plan.deletes.length +
      plan.preDeletes.length +
      archiveOps,
  };

  const branding = includeBranding ? ["# Created with fewer"] : [];
  const header = [...branding, `# ${summaryLine(summary)}`].join("\n");
  const notes = renderNotes(plan.warnings);

  if (plan.target === "archive") {
    // The archive is the target: one file, replayed with 7-Zip. Its card in
    // the graph is the archive file itself, so its path IS the file name.
    const archiveName = plan.rootName.replace(/'/g, `'\\''`);
    const preamble = BASH_ARCHIVE_PREAMBLE.replace("# __SUMMARY__", () => header)
      .replaceAll("__ROOT__", () => archiveName)
      .replaceAll("__DATE__", () => generatedAt)
      .replaceAll("__CHANGES__", () => String(summary.total))
      .replaceAll("__DELETES__", () => String(summary.deleted))
      .replaceAll("__FILE__", () => args.fileName ?? "fewer-changes.sh")
      .replace("__NOTES__", () => notes)
      // The Python fallback travels with the script, so the file the user runs
      // needs nothing beside it.
      .replace("__PYTHON__", () => ARCHIVE_PYTHON_PROGRAM);

    const script = [
      preamble,
      BASH_ARCHIVE_CHECKS.replace("__PLAN__", () => renderArchivePlan(plan)),
      BASH_ARCHIVE_APPLY,
    ].join("");

    return {
      script,
      summary,
      warnings: plan.warnings,
      target: "archive",
      skippedInArchives: plan.skippedInArchives,
    };
  }

  const preamble = BASH_PREAMBLE.replace("# __SUMMARY__", () => header)
    .replaceAll("__BASELINE__", () => String(plan.baselineCount))
    .replaceAll("__ROOT__", () => plan.rootName.replace(/'/g, `'\\''`))
    .replaceAll("__DATE__", () => generatedAt)
    .replaceAll("__CHANGES__", () => String(summary.total))
    .replaceAll("__DELETES__", () => String(summary.deleted))
    .replaceAll("__FILE__", () => args.fileName ?? "fewer-changes.sh")
    .replace("__NOTES__", () => notes)
    .replaceAll("__NOTES_COUNT__", () => String(plan.skippedInArchives));

  // The archives in this folder: each one gets a plan, and the engine that
  // applies it travels with the script.
  const archiveNames = plan.archivePlans.map((archive) => archive.archive);
  const archiveRows = plan.archivePlans.map((archive) =>
    renderArchivePlanRows(archive).join("\n"),
  );
  const archiveSection = plan.archivePlans
    .map(
      (archive, index) =>
        `ARCHIVE_NAMES[${index}]=${shq(archive.archive)}\n` +
        `ARCHIVE_ROWS[${index}]=${shqEscaped(archiveRows[index])}`,
    )
    .join("\n");

  const checks = BASH_CHECKS.replace("__PLAN__", () => renderPlan(plan))
    .replaceAll("__ARCHIVE_COUNT__", () => String(plan.archivePlans.length))
    .replace("__ARCHIVE_PLANS__", () => archiveSection);

  // The archive engine (7-Zip, or Python when 7-Zip is missing) and the
  // program that goes with it travel with the script ONLY when the plan
  // actually has archive work: a folder without archives needs nothing but
  // bash, and saying so keeps the script honest.
  const hasArchiveWork = plan.archivePlans.length > 0;
  const engine = hasArchiveWork
    ? BASH_ARCHIVE_ENGINE.replace("__PYTHON__", () => ARCHIVE_PYTHON_PROGRAM)
    : "";
  const archiveApply = hasArchiveWork ? BASH_ARCHIVE_SECTION : "";

  const script = [
    preamble,
    engine,
    checks,
    BASH_APPLY,
    archiveApply,
  ].join("");

  return {
    script,
    summary,
    warnings: plan.warnings,
    target: "folder",
    skippedInArchives: plan.skippedInArchives,
  };
}
