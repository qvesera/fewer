// Compress a folder into an archive card and extract one back into a folder.
// The graph decides the shape; Export Changes replays it on disk.
import type { FewerNode, FewerEdge } from "@/lib/fewer/types";
import { ancestorChainOf, getDescendants, parentMapOf } from "@/lib/fewer/validation";
import { compressedName, extractedName } from "@/lib/fewer/archiveToggle";
import { applySearchHighlight } from "../../searchHighlight";

type Result = { ok: boolean; reason?: string; name?: string };

/** The name a card shows on disk: `label.ext` for files, `label` for folders. */
function fullName(node: FewerNode): string {
  const ext = node.data.extension;
  return ext ? `${node.data.label}.${ext}` : node.data.label;
}

export function buildArchiveToggleMethods(_set: any, get: any) {
  /**
   * Flip one card between folder and archive.
   *
   * `toArchive` is the whole difference: compress sets `isArchive` and appends
   * `.zip`, extract clears it and strips the archive extension. The subtree
   * moves with the card, so every descendant path is rebased in the same
   * history entry.
   */
  const toggle = (id: string, toArchive: boolean): Result => {
    const { nodes, edges, searchQuery } = get();
    const node = nodes.find((n: FewerNode) => n.id === id);
    if (!node) return { ok: false, reason: "That card is gone." };
    if (node.data.type !== "folder") {
      return { ok: false, reason: "Only a folder can become an archive." };
    }
    if (toArchive && node.data.isArchive) {
      return { ok: false, reason: "This card is already an archive." };
    }
    if (!toArchive && !node.data.isArchive) {
      return { ok: false, reason: "This card is not an archive." };
    }

    // An archive is one file: a card inside one only exists in the graph.
    // The script cannot rewrite a nested archive member, so make the user
    // extract the outer archive first.
    const parentMap = parentMapOf(edges);
    if (ancestorChainOf(id, parentMap).some((a: string) => nodes.find((n: FewerNode) => n.id === a)?.data.isArchive)) {
      return { ok: false, reason: "This card lives inside an archive — extract that archive first." };
    }

    const descendantIds: string[] = getDescendants(id, edges);
    if (toArchive && descendantIds.some((d) => nodes.find((n: FewerNode) => n.id === d)?.data.isArchive)) {
      return { ok: false, reason: "The folder holds an archive card — extract it first." };
    }

    const currentFull = fullName(node);
    const nextFull = toArchive ? compressedName(currentFull) : extractedName(currentFull);
    if (!nextFull) {
      return { ok: false, reason: "This archive has no extension to name the folder after." };
    }

    const parentEdge = edges.find((e: FewerEdge) => e.target === id);
    const parent = parentEdge ? nodes.find((n: FewerNode) => n.id === parentEdge.source) : null;
    const siblingIds = parentEdge
      ? edges.filter((e: FewerEdge) => e.source === parentEdge.source && e.target !== id).map((e: FewerEdge) => e.target)
      : nodes.filter((n: FewerNode) => !edges.some((e: FewerEdge) => e.target === n.id) && n.id !== id).map((n: FewerNode) => n.id);
    const clash = siblingIds.some((sid: string) => {
      const sibling = nodes.find((n: FewerNode) => n.id === sid);
      return !!sibling && fullName(sibling).toLowerCase() === nextFull.toLowerCase();
    });
    if (clash) return { ok: false, reason: `"${nextFull}" already exists here.` };

    const oldPrefix = node.data.path;
    const newPrefix = parent ? `${parent.data.path}/${nextFull}` : nextFull;
    const changed = [id, ...descendantIds];
    const nextPath = (nid: string, path: string) =>
      nid === id ? newPrefix : path.startsWith(oldPrefix) ? path.replace(oldPrefix, newPrefix) : path;

    const nextNodes = nodes.map((n: FewerNode) => {
      if (n.id === id) {
        return {
          ...n,
          data: {
            ...n.data,
            label: nextFull,
            path: newPrefix,
            // `undefined` rather than false: snapshots stay lean and the flag
            // means "is an archive", not "was one".
            isArchive: toArchive ? true : undefined,
          },
        };
      }
      if (descendantIds.includes(n.id) && n.data.path.startsWith(oldPrefix)) {
        return { ...n, data: { ...n.data, path: n.data.path.replace(oldPrefix, newPrefix) } };
      }
      return n;
    });

    const paths = changed
      .map((nid) => {
        const before = nodes.find((n: FewerNode) => n.id === nid)?.data.path;
        if (before === undefined) return null;
        return { nodeId: nid, from: before, to: nextPath(nid, before) };
      })
      .filter((p): p is { nodeId: string; from: string; to: string } => p !== null);

    get().pushOp({
      type: "archive-toggle",
      nodeId: id,
      wasArchive: !!node.data.isArchive,
      willArchive: toArchive,
      wasLabel: node.data.label,
      willLabel: nextFull,
      paths,
    });
    _set({
      nodes: applySearchHighlight(nextNodes, searchQuery, get().categoryFilter),
      graphVersion: get().graphVersion + 1,
    });
    return { ok: true, name: nextFull };
  };

  return {
    compressFolder: (id: string) => toggle(id, true),
    extractArchive: (id: string) => toggle(id, false),
  };
}
